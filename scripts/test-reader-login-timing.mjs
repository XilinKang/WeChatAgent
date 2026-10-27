import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

test('a logged-in account reuses verified credentials; missing/invalid credentials request a restart before capture',async t=>{
  const root=path.resolve(import.meta.dirname,'..'),bundled=path.join(root,'state/runtime/python/python.exe');
  const python=fs.existsSync(bundled)?bundled:process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  if(spawnSync(python,['-c','import sys; print(sys.version_info.major)'],{windowsHide:true,timeout:10000,encoding:'utf8'}).stdout?.trim()!=='3'){t.skip('Python 3 runtime is not installed');return;}
  const code=String.raw`
import importlib.util,pathlib,ctypes
spec=importlib.util.spec_from_file_location('reader_setup',pathlib.Path('scripts/reader_setup.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original_capture=m.capture_key
m.progress=lambda message: None
m.discover_accounts=lambda selected:[dict(dbPath='C:/fixture/wxid_a',myWxid='wxid_a',ready=True)]
m.credential=lambda value,protect=False:'userdpapi:Zml4dHVyZQ==' if protect else value
captures=[]
m.capture_key=lambda *args:captures.append(args) or 'a'*64
m.verify_database=lambda *args:True
request=dict(dbPath='C:/fixture/wxid_a',myWxid='wxid_a',autoKey=True,wechatExecutable='fixture.exe',requireLoginRestart=True)
assert m.connect(dict(request,decryptKey='a'*64))['ok'];assert not captures
for stored in ['', 'invalid-fixture-key']:
 def verify(account,key):
  if key.startswith('invalid'):raise m.SetupError('READER_KEY_INVALID')
 m.verify_database=verify
 try:m.connect(dict(request,decryptKey=stored))
 except m.SetupError as e:assert str(e)=='READER_LOGIN_RESTART_REQUIRED'
 else:raise AssertionError('capture must not start after login')
 assert not captures
assert m.connect(dict(request,requireLoginRestart=False,decryptKey=''))['ok'];assert len(captures)==1
events=[]
m.progress=lambda message:events.append('ready' if '已准备好' in message else 'preparing')
m.verify_database=lambda *args:True
class Library:
 def InitializeHook(self,pid):events.append('initialize');return True
 def PollKeyData(self,buffer,size):
  events.append('poll');ctypes.memmove(buffer,b'a'*64+b'\x00',65);return True
 def CleanupHook(self):events.append('cleanup');return True
 def GetLastErrorMsg(self):return b''
 def GetStatusMessage(self,*args):return False
assert original_capture('fixture.exe','C:/fixture',pids=lambda _: [123],library=Library())=='a'*64
assert events.index('initialize')<events.index('ready')<events.index('poll');assert events[-1]=='cleanup'
print('Existing credentials and login timing verified')
`;
  const result=await promisify(execFile)(python,['-B','-c',code],{cwd:root,windowsHide:true});assert.match(result.stdout,/verified/);
});

const source=fs.readFileSync(new URL('../public/console/console.js',import.meta.url),'utf8');
test('the guided reconnect waits for confirmed recovery and reopening before starting reader capture',async()=>{
  let options;const calls=[],state={roleDrafts:new Map()},nodes={'#job-panel':{hidden:true}};
  const start=source.indexOf('async function restartReaderConnection('),end=source.indexOf('async function persistReader(',start);
  const run=vm.runInNewContext(source.slice(start,end)+'\nrestartReaderConnection',{
    state,configDirty:()=>false,toast(){},openProcessRecovery:async value=>{options=value;},
    api:async(route,body)=>{calls.push(body.action);return {state:'running'};},modal(){},refreshStatus(){},closeModal(){},paintReaderSetup(){},paintJob(){},
    $:selector=>nodes[selector],pollJob:async()=>{calls.push('wait-open');state.job={state:'succeeded'};},
    saveReader:async auto=>{assert.equal(auto,true);assert.equal(state.readerRecovering,false);calls.push('connect');}
  });
  await run();assert.deepEqual(calls,[]);assert.equal(options.repairWeChat,true);
  await options.onRecovered();assert.deepEqual(calls,['wechat-open','wait-open','connect']);
});
