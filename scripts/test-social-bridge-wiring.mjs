import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {SocialEngine,assistantChatRequest} from '../components/qq-bridge/src/core/social-engine.js';
import {MessageBuffer} from '../components/qq-bridge/src/core/message-buffer.js';
import {socialPersona} from '../components/qq-bridge/src/core/social-persona.js';
import {buildConversationKey} from '../components/qq-bridge/src/core/conversation-key.js';
import {replyMessageLimit} from '../packages/dsh-social-bridge-plugin/reply-layout-policy.mjs';
import {stickerPolicy} from '../components/qq-bridge/src/core/sticker-policy.js';
import {searchPolicy} from '../packages/dsh-social-bridge-plugin/search-policy.mjs';

test('the bridge entry point passes project settings to a real private-message reply',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-bridge-wiring-'));
  t.after(()=>{assert(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const settings={wechat:{replyLayout:{maxMessages:3},search:{enabled:false},stickers:{enabled:false}}};
  fs.mkdirSync(path.join(root,'config'),{recursive:true});
  const settingsFile=path.join(root,'config/wechatagent.json');
  fs.writeFileSync(settingsFile,JSON.stringify(settings));
  const config={project_root:root,platforms:{wechat:{enabled:true,whitelist:{private:['123'],groups:[]}}},
    dsh_plugin:{},search_policy_file:settingsFile,sticker_policy_file:settingsFile,
    proactive_state_file:path.join(root,'proactive.json'),message_buffer:{path:path.join(root,'messages.json')},
    persona_name:'Fixture',role:'A synthetic fixture persona',social:{private_min_interval_ms:0,batch_ms:10}};
  const configFile=path.join(root,'bridge.json');fs.writeFileSync(configFile,JSON.stringify(config));
  const decisions=[],sent=[],logs=[],notebookRoots=[];
  class Adapter extends EventEmitter {
    stats={connected:true};selfId='999';
    onMessage(handler){this.handler=handler;}
    async start(){this.emit('open');}
    async stop(){}
    async sendText(message){sent.push(message);return {confirmed:true};}
  }
  class Connection {
    ready=true;epoch=1;
    async check(){return true;}
    current(epoch){return epoch===this.epoch;}
    skips(){return false;}
    metadata(){return {};}
    start(){} stop(){}
  }
  class Plugin {
    async followup(key,prompt,metadata){decisions.push({key,metadata});return 'RESPOND: Fixture response';}
    async modelSearchReady(){return false;}
  }
  class History {backfill(){} append(){} close(){}}
  class Proactive {state={chats:{}};async tick(){}stop(){}}
  class Maintenance {async tick(){}stop(){}}
  const entry=path.resolve(import.meta.dirname,'../components/qq-bridge/src/social-bridge.js');
  // Run the actual startup wiring with in-process transports. Only import
  // declarations and import.meta metadata are adapted for this VM context.
  const source=fs.readFileSync(entry,'utf8').replace(/^import .*;\r?\n/gm,'')
    .replaceAll('import.meta.dirname',JSON.stringify(path.dirname(entry)));
  const sandbox={fs,path,console:{log:(...values)=>logs.push(values.join(' ')),warn:(...values)=>logs.push(values.join(' '))},
    process:{argv:['node',entry,configFile],env:{},once(){},exit(){}},
    setTimeout,clearTimeout,setInterval,clearInterval,
    pluginEnabled:(project)=>{notebookRoots.push(project);assert.equal(project,root);return false;},
    replyMessageLimit,AssistantFeedback:class {},createAssistantNoticeDelivery:()=>({async tick(){},stop(){}}),
    WechatOneBotAdapter:Adapter,MessageBuffer,DshConnectionGuard:Connection,SocialEngine,assistantChatRequest,
    DshPluginClient:Plugin,buildConversationKey,selectRoleText:text=>text,socialPersona,stickerPolicy,searchPolicy,
    ProactiveEngine:Proactive,ContextMaintenance:Maintenance,HistoryStore:History,scopeHistory:store=>store,
    activeReaderAccount:()=>({id:'fixture'}),assistantSenderAllowed:()=>false,
    assistantGroupChatAllowed:()=>false,verifiedAssistantSender:()=>'',
    conversationWorkMode:()=> 'social',conversationMode:()=> 'hybrid'};
  const runtime=await vm.runInNewContext('(async()=>{'+source+'\nreturn {adapter,engine,stop};})()',sandbox,{filename:entry});
  t.after(()=>runtime.stop());
  await runtime.adapter.handler({platform:'wechat',kind:'private',conversation_id:'123',sender_id:'123',self_id:'999',
    message_id:'fixture-input',text:'Fixture hello',timestamp:Date.now()/1000,images:[],files:[]});
  const deadline=Date.now()+1500;
  while(!sent.length&&Date.now()<deadline)await delay(10);
  assert.equal(decisions.length,1,'message did not reach the model: '+logs.join('\n'));
  assert.equal(decisions[0].metadata.replyMaxMessages,3);
  assert.equal(notebookRoots.length,1);
  assert.equal(sent.length,1);
  assert.equal(sent[0].text,'Fixture response');
  assert.equal(runtime.engine.unreadFor('wechat:private:123').length,0);
});
