const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>value===undefined?undefined:structuredClone(value);

// Rebase only edits made on this page. Arrays are atomic so additions/removals
// to an authorization list never silently override another window's changes.
export function mergeConfigDraft(base,draft,latest) {
  const conflicts=[];
  function merge(old,local,remote,path=[]) {
    if(equal(local,old))return copy(remote);
    if(equal(remote,old)||equal(local,remote))return copy(local);
    if(object(local)&&object(remote)&&(old===undefined||object(old))){
      const result={};
      for(const key of new Set([...Object.keys(old??{}),...Object.keys(local),...Object.keys(remote)])){
        if(['__proto__','constructor','prototype'].includes(key))continue;
        const value=merge(old?.[key],local[key],remote[key],[...path,key]);
        if(value!==undefined)result[key]=value;
      }
      return result;
    }
    conflicts.push({path,local:copy(local),saved:copy(remote)});
    return copy(local);
  }
  return {draft:merge(base,draft,latest),conflicts};
}

export function resolveConfigConflicts(result,choices) {
  const draft=copy(result.draft);
  result.conflicts.forEach((conflict,index)=>{
    if(!['local','saved'].includes(choices[index]))throw Error('请选择每个冲突设置使用哪个版本。');
    let target=draft;
    for(const key of conflict.path.slice(0,-1))target=target[key]??={};
    const key=conflict.path.at(-1),value=conflict[choices[index]];
    if(value===undefined)delete target[key];else target[key]=copy(value);
  });
  return draft;
}

const normalized=value=>String(value??'').replaceAll('\\','/').replace(/\/+$/,'').toLowerCase();
export const sameReaderSelection=(left,right)=>normalized(left?.dbPath)===normalized(right?.dbPath)&&normalized(left?.myWxid)===normalized(right?.myWxid);
export function mergeReaderDraft(previous,draft,latest) {
  const local=draft??{dbPath:previous?.dbPath??'',myWxid:previous?.myWxid??'',decryptKey:''};
  const edited=!sameReaderSelection(previous,local)||!!local.decryptKey;
  if(!edited||sameReaderSelection(local,latest)&&!local.decryptKey){
    return {draft:{dbPath:latest.dbPath??'',myWxid:latest.myWxid??'',decryptKey:''},conflict:false};
  }
  return {draft:copy(local),conflict:!sameReaderSelection(previous,latest)&&!sameReaderSelection(local,latest)};
}
