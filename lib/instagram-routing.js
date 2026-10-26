import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {billedAI} from './billed-ai.js';
import {answerText,payloadFor,requestsHuman,teamAvailable,unavailableReply,channelText,handoffNotice} from './flow.js';
import {decryptInstagramToken} from './instagram-oauth.js';

const text=value=>String(value??'').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const MAX_TEXT=3000;

function key(environment){
 const raw=text(environment.INSTAGRAM_TOKEN_ENCRYPTION_KEY);let value;
 try{value=Buffer.from(raw,'base64url');}catch{throw Error('Instagram encryption key is invalid.');}
 if(value.length!==32)throw Error('Instagram encryption key is invalid.');
 return value;
}
function encrypt(value,master){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master,iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {ciphertext:data.toString('base64url'),iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};
}
function decrypt(record,master){
 const decipher=createDecipheriv('aes-256-gcm',master,Buffer.from(record.iv,'base64url'));
 decipher.setAuthTag(Buffer.from(record.tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
function hours(config){return config.teamOnline!==false&&teamAvailable(config);}
function remoteId(accountId,senderId){return hash(accountId+'\u0000'+senderId);}
function apiUrl(accountId){return 'https://graph.instagram.com/v26.0/'+encodeURIComponent(accountId)+'/messages';}

async function send({connection,recipient,text:body,environment,fetchImpl=fetch}){
 if(!connection.access_token_ciphertext||!connection.access_token_iv||!connection.access_token_tag)throw Error('Instagram connection is inactive.');
 const token=decryptInstagramToken({ciphertext:connection.access_token_ciphertext,iv:connection.access_token_iv,tag:connection.access_token_tag},key(environment));
 const response=await fetchImpl(apiUrl(connection.instagram_account_id),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({recipient:{id:recipient},message:{text:body}})});
 if(!response.ok)throw Error('Instagram send failed.');
 const result=await response.json().catch(()=>null);
 return typeof result?.message_id==='string'?result.message_id:null;
}

async function loadConnection(sb,accountId){
 const row=await sb.from('instagram_connections').select('*').eq('instagram_account_id',accountId).eq('status','active').is('disconnected_at',null).maybeSingle();
 if(row.error)throw Error('Instagram connection lookup failed.');
 return row.data||null;
}
async function getConversation(sb,{bot,connection,event,environment}){
 const visitorHash=remoteId(event.accountId,event.senderId);
 const existing=await sb.from('flow_conversations').select('*').eq('bot_id',bot.id).eq('channel','instagram').eq('external_user_hash',visitorHash).neq('state','resolved').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(existing.error)throw Error('Instagram conversation lookup failed.');
 if(existing.data)return existing.data;
 const secured=encrypt(event.senderId,key(environment));
 const expiresAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
 const created=await sb.from('flow_conversations').insert({bot_id:bot.id,secret_hash:'instagram',origin:'instagram',preview:false,state:'ai',channel:'instagram',external_user_hash:visitorHash,external_user_ciphertext:secured.ciphertext,external_user_iv:secured.iv,external_user_tag:secured.tag,instagram_connection_id:connection.id,expires_at:expiresAt}).select('*').single();
 if(!created.error)return created.data;
 // A concurrent webhook may have created the same conversation.
 const raced=await sb.from('flow_conversations').select('*').eq('bot_id',bot.id).eq('channel','instagram').eq('external_user_hash',visitorHash).neq('state','resolved').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(raced.error||!raced.data)throw Error('Instagram conversation could not be created.');
 return raced.data;
}

async function claimInbound(sb,event){
 const inserted=await sb.from('instagram_message_deliveries').insert({event_key:event.eventKey,account_id:event.accountId,message_id:event.messageId,status:'received'}).select('event_key,status').maybeSingle();
 if(!inserted.error&&inserted.data)return {new:true};
 const old=await sb.from('instagram_message_deliveries').select('status').eq('event_key',event.eventKey).maybeSingle();
 if(old.error||!old.data)throw Error('Instagram delivery storage unavailable.');
 return {new:false,status:old.data.status};
}
async function mark(sb,eventKey,patch){
 const result=await sb.from('instagram_message_deliveries').update({...patch,updated_at:new Date().toISOString()}).eq('event_key',eventKey);
 if(result.error)throw Error('Instagram delivery state unavailable.');
}
async function confirmHandoff({sb,connection,conversation,event,requestKey,environment,fetchImpl}){
 const notice=handoffNotice(event.text);
 await send({connection,recipient:event.senderId,text:notice,environment,fetchImpl});
 const saved=await sb.from('flow_messages').insert({conversation_id:conversation.id,role:'assistant',content:notice,request_key:requestKey});
 if(saved.error&&saved.error.code!=='23505')throw Error('Instagram handoff confirmation could not be stored.');
}

export async function routeInstagramMessages({sb,messages,environment=process.env,fetchImpl=fetch,logger=console.info}){
 let accepted=0,duplicates=0,ignored=0,failed=0;
 for(const event of messages){
  try{
   if(!event.text||event.isEcho||!event.senderId||!event.messageId){ignored++;continue;}
   const claim=await claimInbound(sb,event);
   if(!claim.new){duplicates++;continue;}
   const connection=await loadConnection(sb,event.accountId);
   if(!connection){await mark(sb,event.eventKey,{status:'unmapped'});ignored++;continue;}
   const botResult=await sb.from('flow_bots').select('*').eq('id',connection.flow_bot_id).eq('organization_id',connection.organization_id).is('deleted_at',null).maybeSingle();
   const bot=botResult.data;
   if(botResult.error||!bot||!bot.published||bot.live?.channel!=='instagram'){await mark(sb,event.eventKey,{status:'inactive'});ignored++;continue;}
   const conversation=await getConversation(sb,{bot,connection,event,environment});
   // Meta message IDs may be long. Flow's billing trigger also uses request_key
   // as a fingerprint with a 200-character limit, so use the already verified
   // fixed-length event hash for every internal idempotency key.
   const inboundKey='ig:'+event.eventKey,replyKey='ig-reply:'+event.eventKey;
   const stored=await sb.from('flow_messages').insert({conversation_id:conversation.id,role:'user',content:event.text,request_key:inboundKey});
   if(stored.error){
    // Only an actual unique-key collision is a harmless delivery retry. A
    // billing/storage failure must surface as failed rather than being hidden
    // as a duplicate message.
    if(stored.error.code==='23505'){await mark(sb,event.eventKey,{status:'duplicate_message'});duplicates++;continue;}
    throw Error('Instagram inbound message could not be stored.');
   }
   await mark(sb,event.eventKey,{status:'stored',conversation_id:conversation.id});
   const cfg=bot.live;
   const liveHandoff=bot.connected&&cfg.mode!=='ai'&&hours(cfg);
   if(['waiting','human'].includes(conversation.state)){
    await mark(sb,event.eventKey,{status:'queued',conversation_id:conversation.id});accepted++;continue;
   }
   if((cfg.mode==='human'||requestsHuman(event.text,cfg.handoffWords))&&liveHandoff){
    const handed=await sb.rpc('flow_handoff',{p_conversation:conversation.id,p_key:inboundKey});
    if(handed.error)throw Error('Instagram handoff failed.');
    await confirmHandoff({sb,connection,conversation,event,requestKey:replyKey,environment,fetchImpl});
    await mark(sb,event.eventKey,{status:'queued',conversation_id:conversation.id});accepted++;continue;
   }
   if(cfg.mode==='human'||requestsHuman(event.text,cfg.handoffWords)){
    const responseText=unavailableReply(cfg,event.text);
    await send({connection,recipient:event.senderId,text:responseText,environment,fetchImpl});
    const saved=await sb.from('flow_messages').insert({conversation_id:conversation.id,role:'assistant',content:responseText,request_key:replyKey});
    if(saved.error)throw Error('Instagram fallback reply could not be stored.');
    await mark(sb,event.eventKey,{status:'sent',conversation_id:conversation.id});accepted++;continue;
   }
   const historyResult=await sb.from('flow_messages').select('role,content,created_at').eq('conversation_id',conversation.id).order('created_at',{ascending:false}).limit(8);
   if(historyResult.error)throw Error('Instagram history unavailable.');
   const job={config:{...cfg,mode:liveHandoff?'hybrid':'ai'},history:(historyResult.data||[]).reverse(),user_text:event.text};
   const response=await billedAI({sb,org:bot.organization_id,actor:bot.created_by,operation:'flow_chat',key:'instagram:'+conversation.id+':'+event.eventKey,payload:payloadFor(job),environment,fetchImpl});
   const reply=channelText(answerText(response),MAX_TEXT);
   if(!reply||reply==='[[SYNVIO_HANDOFF_REQUIRED]]'){
    if(reply==='[[SYNVIO_HANDOFF_REQUIRED]]'&&liveHandoff){
     const handed=await sb.rpc('flow_handoff',{p_conversation:conversation.id,p_key:inboundKey});
     if(handed.error)throw Error('Instagram handoff failed.');
     await confirmHandoff({sb,connection,conversation,event,requestKey:replyKey,environment,fetchImpl});
     await mark(sb,event.eventKey,{status:'queued',conversation_id:conversation.id});accepted++;continue;
    }
    throw Error('Instagram AI reply is unavailable.');
   }
   await mark(sb,event.eventKey,{status:'sending',conversation_id:conversation.id});
   const remoteMessageId=await send({connection,recipient:event.senderId,text:reply,environment,fetchImpl});
   const saved=await sb.from('flow_messages').insert({conversation_id:conversation.id,role:'assistant',content:reply,request_key:replyKey});
   if(saved.error)throw Error('Instagram reply could not be recorded.');
   await mark(sb,event.eventKey,{status:'sent',conversation_id:conversation.id,remote_message_id:remoteMessageId});accepted++;
  }catch(error){failed++;try{await mark(sb,event.eventKey,{status:'failed'});}catch{};}
 }
 try{logger({component:'instagram_routing',accepted,duplicates,ignored,failed});}catch{}
 return {accepted,duplicates,ignored,failed};
}

export async function sendInstagramConversationReply({sb,conversation,text:body,requestKey,environment=process.env,fetchImpl=fetch}){
 if(conversation.channel!=='instagram')return {sent:false};
 const deliveryKey='agent:'+conversation.id+':'+requestKey;
 const claim=await sb.from('instagram_message_deliveries').insert({event_key:deliveryKey,status:'sending',conversation_id:conversation.id}).select('status').maybeSingle();
 if(claim.error){const previous=await sb.from('instagram_message_deliveries').select('status').eq('event_key',deliveryKey).maybeSingle();if(previous.error)throw Error('Instagram delivery storage unavailable.');if(previous.data?.status==='sent')return {sent:true,replayed:true};await sb.from('instagram_message_deliveries').update({status:'sending',updated_at:new Date().toISOString()}).eq('event_key',deliveryKey);}
 const connection=await sb.from('instagram_connections').select('*').eq('id',conversation.instagram_connection_id).eq('status','active').maybeSingle();
 if(connection.error||!connection.data)throw Error('Instagram connection is unavailable.');
 const recipient=decrypt({ciphertext:conversation.external_user_ciphertext,iv:conversation.external_user_iv,tag:conversation.external_user_tag},key(environment));
 const remoteMessageId=await send({connection:connection.data,recipient,text:body,environment,fetchImpl});
 await mark(sb,deliveryKey,{status:'sent',remote_message_id:remoteMessageId,conversation_id:conversation.id});
 return {sent:true};
}
