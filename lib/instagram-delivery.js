import {openToken,refreshConnection,sealToken} from './instagram-token.js';
import {createHash} from 'node:crypto';

export const problem=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
export function checked(result,code='STORAGE_FAILED'){
 if(result.error)throw problem(code,{dbCode:result.error.code});
 return result.data;
}
export async function mark(sb,key,patch){checked(await sb.from('instagram_message_deliveries').update({...patch,updated_at:new Date().toISOString()}).eq('event_key',key),'DELIVERY_SAVE_FAILED');}
export async function sendOnce({sb,connection,conversation,recipient,body,key,state='ai',actor=null,environment,fetchImpl=fetch}){
 const existing=checked(await sb.from('instagram_message_deliveries').select('*').eq('event_key',key).maybeSingle());
 if(existing?.status==='sent'){
  if(existing.reply_text!==body||existing.conversation_id!==conversation.id)throw problem('REPLY_CHANGED');
  return {sent:true,replayed:true};
 }
 const locked=checked(await sb.rpc('instagram_send_lock_v33',{p_conversation:conversation.id,p_state:state,p_actor:actor}));
 if(!locked)throw problem('CONVERSATION_CHANGED');
 try{
  const prior=checked(await sb.from('instagram_message_deliveries').select('*').eq('event_key',key).maybeSingle());
  if(prior?.status==='sent')return {sent:true,replayed:true};
  if(['sending','uncertain'].includes(prior?.status))throw problem('SEND_UNCERTAIN');
  if(prior?.reply_text&&prior.reply_text!==body)throw problem('REPLY_CHANGED');
  const active=await refreshConnection(sb,connection,environment,fetchImpl);
  checked(await sb.from('instagram_message_deliveries').upsert({event_key:key,conversation_id:conversation.id,reply_text:body,status:'sending',updated_at:new Date().toISOString()},{onConflict:'event_key'}));
  let response;
  try{
   response=await fetchImpl('https://graph.instagram.com/v26.0/'+encodeURIComponent(active.instagram_account_id)+'/messages',{method:'POST',headers:{authorization:'Bearer '+openToken(active,environment),'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({recipient:{id:recipient},message:{text:body}})});
  }catch{
   await mark(sb,key,{status:'uncertain',failure_code:'SEND_UNCERTAIN'});
   throw problem('SEND_UNCERTAIN');
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const metaCode=Number.isInteger(data.error?.code)?data.error.code:null;
   // 5xx may have an unknown delivery outcome: never blindly duplicate a DM.
   const code=response.status>=500?'SEND_UNCERTAIN':metaCode===190?'TOKEN_REJECTED':'META_SEND_REJECTED';
   await mark(sb,key,{status:code==='SEND_UNCERTAIN'?'uncertain':'failed',failure_code:code,meta_error_code:metaCode});
   throw problem(code,{metaCode});
  }
  if(typeof data.message_id!=='string'){await mark(sb,key,{status:'uncertain',failure_code:'SEND_UNCERTAIN'});throw problem('SEND_UNCERTAIN');}
  await mark(sb,key,{status:'sent',remote_message_id:data.message_id,failure_code:null});
  return {sent:true};
 }finally{await sb.from('flow_conversations').update({send_lock_until:null}).eq('id',conversation.id);}
}
export async function visitorProfile(connection,sender,environment,fetchImpl){
 try{
  const response=await fetchImpl('https://graph.instagram.com/v26.0/'+encodeURIComponent(sender)+'?fields=name,username,profile_pic',{headers:{authorization:'Bearer '+openToken(connection,environment)},signal:AbortSignal.timeout(7000)});
  if(!response.ok)return {};
  const data=await response.json();
  return {instagram_username:/^[a-zA-Z0-9._]{1,30}$/.test(data.username||'')?data.username:null,instagram_profile_picture_url:/^https:\/\//.test(data.profile_pic||'')?data.profile_pic:null};
 }catch{return {};}
}
export async function conversationFor(sb,{bot,connection,event,receipt,environment,fetchImpl}){
 if(receipt.conversation_id){
  const row=checked(await sb.from('flow_conversations').select('*').eq('id',receipt.conversation_id).eq('bot_id',bot.id).maybeSingle());
  if(!row)throw problem('CONVERSATION_REMOVED');
  return {row,created:receipt.created_ticket};
 }
 const visitor=createHash('sha256').update(event.accountId+'\u0000'+event.senderId).digest('hex');
 const find=async()=>checked(await sb.from('flow_conversations').select('*').eq('bot_id',bot.id).eq('channel','instagram').eq('external_user_hash',visitor).neq('state','resolved').order('created_at',{ascending:false}).limit(1).maybeSingle());
 let row=await find();
 if(row?.auto_close_at&&Date.parse(row.auto_close_at)<=Date.now()){
  checked(await sb.rpc('flow_close_due_v33',{p_conversation:row.id}));row=await find();
 }
 if(row)return {row,created:false};
 const token=sealToken(event.senderId,environment),profile=await visitorProfile(connection,event.senderId,environment,fetchImpl);
 const result=await sb.from('flow_conversations').insert({bot_id:bot.id,secret_hash:'instagram',origin:'instagram',preview:false,state:'ai',channel:'instagram',external_user_hash:visitor,external_user_ciphertext:token.access_token_ciphertext,external_user_iv:token.access_token_iv,external_user_tag:token.access_token_tag,instagram_connection_id:connection.id,...profile,expires_at:new Date(Date.now()+30*86400000).toISOString()}).select('*').single();
 if(!result.error)return {row:result.data,created:true};
 if(result.error.code==='23505'){row=await find();if(row)return {row,created:false};}
 throw problem('CONVERSATION_CREATE_FAILED',{dbCode:result.error.code});
}
