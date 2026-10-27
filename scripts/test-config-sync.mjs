import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {mergeConfigDraft,resolveConfigConflicts,mergeReaderDraft} from '../public/console/config-sync.mjs';
import {createConsole} from './console-server.mjs';

test('refresh rebases a friend draft over new connection settings without mutating either version',()=>{
  const base={runtime:{dshDesktop:''},wechat:{whitelist:{private:[],groups:[]},search:{enabled:false}}};
  const draft=structuredClone(base);draft.wechat.whitelist.private=['123'];
  const latest=structuredClone(base);latest.runtime.dshDesktop='C:/DSH/DSH.exe';latest.wechat.search.enabled=true;
  const before=JSON.stringify({base,draft,latest}),result=mergeConfigDraft(base,draft,latest);
  assert.equal(result.conflicts.length,0);assert.deepEqual(result.draft.wechat.whitelist.private,['123']);
  assert.equal(result.draft.runtime.dshDesktop,latest.runtime.dshDesktop);assert.equal(result.draft.wechat.search.enabled,true);
  assert.equal(JSON.stringify({base,draft,latest}),before);
});

test('overlapping authorization lists and removed settings require explicit conflict choices',()=>{
  const base={allowed:['1'],settings:{a:1,b:2}},draft={allowed:['1','2'],settings:{b:3}},latest={allowed:['1','3'],settings:{a:4,b:2}};
  const result=mergeConfigDraft(base,draft,latest);
  assert.deepEqual(result.conflicts.map(c=>c.path.join('.')),['allowed','settings.a']);
  assert.throws(()=>resolveConfigConflicts(result,[]));
  assert.deepEqual(resolveConfigConflicts(result,['saved','local']),{allowed:['1','3'],settings:{b:3}});
});

test('saving while typing preserves the new edits made after submission',()=>{
  const submitted={a:1,b:1},current={a:1,b:2},saved={a:1,b:1,serverDefault:true};
  assert.deepEqual(mergeConfigDraft(submitted,current,saved),{draft:{a:1,b:2,serverDefault:true},conflicts:[]});
});

test('reader refresh removes an obsolete form only when it matches the already verified account',()=>{
  const old={dbPath:'',myWxid:''},draft={dbPath:'C:\\data\\wxid_fixture',myWxid:'wxid_fixture',decryptKey:''};
  const latest={dbPath:'C:/data/wxid_fixture',myWxid:'wxid_fixture',verified:true};
  const merged=mergeReaderDraft(old,draft,latest);
  assert.equal(merged.conflict,false);assert.deepEqual(merged.draft,{dbPath:latest.dbPath,myWxid:latest.myWxid,decryptKey:''});
  const other={dbPath:'C:/data/wxid_other',myWxid:'wxid_other'};
  assert.equal(mergeReaderDraft(old,{...draft,decryptKey:'fixture-manual-value'},other).conflict,true);
  assert.equal(mergeReaderDraft(old,{...draft,decryptKey:'fixture-manual-value'},latest).draft.decryptKey,'fixture-manual-value');
});

async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-config-sync-'));
  const config=JSON.parse(fs.readFileSync(new URL('../config/wechatagent.example.json',import.meta.url),'utf8'));
  fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'roles'));
  fs.writeFileSync(path.join(root,'config/wechatagent.json'),JSON.stringify(config));
  for(const name of new Set([config.persona.default,...Object.values(config.persona.chats??{})]))fs.writeFileSync(path.join(root,'roles',name+'.md'),'Synthetic fixture persona.');
  const app=createConsole({root,port:0}),address=await app.start(),base='http://127.0.0.1:'+address.port;
  const info=await fetch(base+'/api/info').then(r=>r.json());
  t.after(async()=>{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));assert(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const api=async(route,body)=>{const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'x-console-token':info.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result;};
  return {api,initial:await api('/api/config')};
}
const source=fs.readFileSync(new URL('../public/console/console.js',import.meta.url),'utf8');
function client(initial,api,choose=async result=>result.draft){
  const state={config:initial.config,draft:structuredClone(initial.config),revision:initial.revision,accountScope:initial.accountScope};
  const start=source.indexOf('async function syncProjectSnapshot('),end=source.indexOf('function updateDraftUI()',start);
  const sandbox={state,api,mergeConfigDraft,chooseConflicts:choose,structuredClone,configDirty:()=>JSON.stringify(state.draft)!==JSON.stringify(state.config)};
  const save=vm.runInNewContext(source.slice(start,end)+'\nsaveProjectDraft',sandbox);
  return {state,save};
}

test('the real save flow recovers a 409, preserving both a new DSH path and the unsaved friend',async t=>{
  const f=await fixture(t),ui=client(f.initial,f.api);
  ui.state.draft.wechat.whitelist.private=['123'];
  const other=structuredClone(f.initial.config);other.runtime.dshDesktop='C:/DSH/DeepSeek Harness.exe';
  await f.api('/api/config',{revision:f.initial.revision,config:other});
  assert.equal(await ui.save(),true);
  const saved=await f.api('/api/config');assert.deepEqual(saved.config.wechat.whitelist.private,['123']);
  assert.equal(saved.config.runtime.dshDesktop,other.runtime.dshDesktop);assert.equal(ui.state.revision,saved.revision);
});

test('canceling an overlapping save retains the draft and never overwrites the other window',async t=>{
  const f=await fixture(t),ui=client(f.initial,f.api,async()=>null);
  ui.state.draft.social.min_interval_ms=8000;
  const other=structuredClone(f.initial.config);other.social.min_interval_ms=9000;
  await f.api('/api/config',{revision:f.initial.revision,config:other});
  assert.equal(await ui.save(),false);assert.equal(ui.state.draft.social.min_interval_ms,8000);
  assert.equal((await f.api('/api/config')).config.social.min_interval_ms,9000);
});

test('a page cannot transplant an old account draft into a newly selected account',async t=>{
  const f=await fixture(t),ui=client({...f.initial,accountScope:'fixture-account-a'},f.api);
  ui.state.draft.wechat.whitelist.private=['123'];
  const start=source.indexOf('async function syncProjectSnapshot('),end=source.indexOf('async function saveProjectDraft(',start);
  const sync=vm.runInNewContext(source.slice(start,end)+'\nsyncProjectSnapshot',{state:ui.state,mergeConfigDraft,chooseConflicts:async r=>r.draft,configDirty:()=>true});
  await assert.rejects(sync({...f.initial,accountScope:'fixture-account-b'}),/账号已切换/);
  assert.deepEqual(ui.state.draft.wechat.whitelist.private,['123']);
});
