import {billedAI} from './billed-ai.js';
import {answerText,payloadFor,requestsHuman,teamAvailable,unavailableReply,channelText} from './flow.js';
import {openToken} from './instagram-token.js';
import {notice,languageOf,followupChoice} from './conversation-policy.js';
import {checked,problem,mark,sendOnce,conversationFor} from './instagram-delivery.js';

export async function routeInstagramMessages({sb,messages,environment=process.env,fetchImpl=fetch,logger=console.info,ai=billedAI}){
 const counts={accepted:0,duplicates:0,ignored:0,failed:0};
 const started=Date.now();
 for(const event of messages){
  let receipt,c,locked=false,stage='claim',claimed=false;
  try{
   if(!event.text||event.isEcho||!event.senderId||!event.messageId){counts.ignored++;continue;}
   if(Date.now()-started>200000){counts.failed++;break;} // leave remaining events for Meta retry
   receipt=checked(await sb.rpc('instagram_claim_v33',{p_key:event.eventKey,p_account:event.accountId,p_message:event.messageId}));
   if(!receipt.claimed){if(receipt.busy)throw problem('EVENT_BUSY');counts.duplicates++;continue;}
   claimed=true;stage='connection';
   const connection=checked(await sb.from('instagram_connections').select('*').eq('instagram_account_id',event.accountId).eq('status','active').is('disconnected_at',null).maybeSingle());
   if(!connection){await mark(sb,event.eventKey,{status:'unmapped',lease_until:null});counts.ignored++;continue;}
   const bot=checked(await sb.from('flow_bots').select('*').eq('id',connection.flow_bot_id).eq('organization_id',connection.organization_id).is('deleted_at',null).maybeSingle());
   if(!bot?.published||bot.live?.channel!=='instagram'){await mark(sb,event.eventKey,{status:'inactive',lease_until:null});counts.ignored++;continue;}
   stage='conversation';
   const opened=await conversationFor(sb,{bot,connection,event,receipt,environment,fetchImpl});c=opened.row;
   await mark(sb,event.eventKey,{conversation_id:c.id,created_ticket:opened.created});
   locked=checked(await sb.rpc('instagram_work_lock_v33',{p_conversation:c.id,p_key:event.eventKey}));
   if(!locked)throw problem('CONVERSATION_BUSY');
   // Lock acquisition re-reads state after a racing employee takeover.
   c=checked(await sb.from('flow_conversations').select('*').eq('id',c.id).single());
   if(c.state==='resolved'){await mark(sb,event.eventKey,{status:'cancelled',lease_until:null});counts.ignored++;continue;}
   stage='store_inbound';
   const inboundKey='ig:'+event.eventKey,replyKey='ig-reply:'+event.eventKey;
   const stored=await sb.from('flow_messages').insert({conversation_id:c.id,role:'user',content:event.text,request_key:inboundKey});
   if(stored.error&&stored.error.code!=='23505')throw problem('INBOUND_SAVE_FAILED',{dbCode:stored.error.code});
   const cfg={...bot.live,teamOnline:bot.team_online_override===false?false:bot.live.teamOnline};
   const available=bot.connected&&cfg.mode!=='ai'&&teamAvailable(cfg);
   let reply=receipt.reply_text||'',state=receipt.reply_state||'ai',close=receipt.close_ticket===true,awaiting=receipt.awaiting_close===true;
   // Retry a queued handoff notice, but do not create AI replies for human-owned threads.
   if(['waiting','human'].includes(c.state)&&!reply){await mark(sb,event.eventKey,{status:'queued',lease_until:null});counts.accepted++;continue;}
   const history=checked(await sb.from('flow_messages').select('role,content,created_at,request_key').eq('conversation_id',c.id).order('created_at',{ascending:false}).limit(12)).reverse();
   const language=languageOf(event.text,history);
   if(!reply){
    const choice=c.awaiting_close?followupChoice(event.text):null;
    if(choice==='close'){reply=notice('closed',cfg,c.number,'en');close=true;}
    else if(choice==='continue')reply=notice('continue',cfg,c.number,language);
    else if(cfg.mode==='human'||requestsHuman(event.text,cfg.handoffWords)){
     if(available){reply=notice('handoff',cfg,c.number,language);state='waiting';}
     else reply=unavailableReply(cfg,event.text);
    }else{
     stage='ai';
     // Freeze the AI input once. A retry must reuse the exact billing fingerprint.
     let job=receipt.ai_job;
     if(!job){job={config:{...cfg,mode:available?'hybrid':'ai'},history:history.filter(m=>m.request_key!==inboundKey).map(({role,content})=>({role,content})),user_text:event.text};await mark(sb,event.eventKey,{ai_job:job});}
     let attempt=receipt.ai_attempt||0;
     let aiKey='instagram:'+c.id+':'+event.eventKey+':'+attempt;
     const previous=checked(await sb.from('billing_events_v25').select('state').eq('organization_id',bot.organization_id).eq('event_key',aiKey).maybeSingle());
     // Only a definitive provider rejection releases a reservation. An unknown outcome
     // must keep its original key and must never trigger another paid generation.
     if(previous?.state==='released'){attempt++;aiKey='instagram:'+c.id+':'+event.eventKey+':'+attempt;await mark(sb,event.eventKey,{ai_attempt:attempt});}
     const response=await ai({sb,org:bot.organization_id,actor:bot.created_by,operation:'flow_chat',key:aiKey,payload:payloadFor(job),environment,fetchImpl});
     if(response.status!=='completed')throw problem('AI_INCOMPLETE');
     reply=channelText(answerText(response),900);
     if(reply==='[[SYNVIO_HANDOFF_REQUIRED]]'){if(available){state='waiting';reply=notice('handoff',cfg,c.number,language);}else reply=unavailableReply(cfg,event.text);}
     else if(reply==='[[SYNVIO_OFFER_CLOSE]]'){reply=notice('closingQuestion',cfg,c.number,language);awaiting=true;}
     if(!reply)throw problem('AI_EMPTY');
    }
    if(opened.created)reply=notice('opening',cfg,c.number,'en')+'\n\n'+reply;
    await mark(sb,event.eventKey,{reply_text:reply,reply_state:state,close_ticket:close,awaiting_close:awaiting,status:'stored'});
   }
   if(state==='waiting'){
    stage='handoff';
    const latest=checked(await sb.from('flow_bots').select('*').eq('id',bot.id).single());
    if(c.state==='ai'&&(!latest.connected||latest.team_online_override===false||!teamAvailable(latest.live)||latest.live.mode==='ai')){
     reply=unavailableReply({...latest.live,teamOnline:false},event.text);state='ai';await mark(sb,event.eventKey,{reply_text:reply,reply_state:state});
    }else if(c.state==='ai')checked(await sb.rpc('flow_handoff',{p_conversation:c.id,p_key:inboundKey}));
   }
   stage='send';
   await sendOnce({sb,connection,conversation:c,recipient:event.senderId,body:reply,key:replyKey,state,environment,fetchImpl});
   stage='store_reply';
   const saved=await sb.from('flow_messages').insert({conversation_id:c.id,role:'assistant',content:reply,request_key:replyKey});
   if(saved.error&&saved.error.code!=='23505')throw problem('REPLY_SAVE_FAILED',{dbCode:saved.error.code});
   checked(await sb.from('flow_conversations').update({awaiting_close:awaiting,...(close?{state:'resolved',closed_at:new Date().toISOString(),close_reason:'confirmed'}:{})}).eq('id',c.id).eq('state',state));
   await mark(sb,event.eventKey,{status:state==='waiting'?'queued':'sent',lease_until:null,failure_code:null,ai_job:null});counts.accepted++;
  }catch(e){
   const cancelled=e.code==='CONVERSATION_CHANGED'||e.code==='CONVERSATION_REMOVED';
   counts[cancelled?'ignored':'failed']++;
   if(claimed)try{await mark(sb,event.eventKey,{status:cancelled?'cancelled':'failed',lease_until:null,failure_code:String(e.code||'ROUTING_FAILED').slice(0,60),meta_error_code:e.metaCode||null});}catch{}
   try{logger({component:'instagram_routing',version:'33',stage,reason:/^[A-Z0-9_]{1,60}$/.test(e.code||'')?e.code:'ROUTING_FAILED',metaCode:e.metaCode||null,dbCode:/^[A-Z0-9]{5}$/.test(e.dbCode||'')?e.dbCode:null});}catch{}
  }finally{if(locked&&c)await sb.from('flow_conversations').update({automation_lease_until:null,automation_key:null}).eq('id',c.id).eq('automation_key',event.eventKey);}
 }
 try{logger({component:'instagram_routing',version:'33',...counts});}catch{}
 return counts;
}
export async function sendInstagramConversationReply({sb,conversation,text,requestKey,environment=process.env,fetchImpl=fetch}){
 if(conversation.channel!=='instagram')return {sent:false};
 const connection=checked(await sb.from('instagram_connections').select('*').eq('id',conversation.instagram_connection_id).eq('status','active').is('disconnected_at',null).maybeSingle());
 if(!connection)throw problem('CONNECTION_INACTIVE');
 const recipient=openToken({access_token_ciphertext:conversation.external_user_ciphertext,access_token_iv:conversation.external_user_iv,access_token_tag:conversation.external_user_tag},environment);
 return sendOnce({sb,connection,conversation,recipient,body:text,key:'agent:'+conversation.id+':'+requestKey,state:'human',actor:conversation.assigned_to,environment,fetchImpl});
}
