import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {routeInstagramMessages} from './instagram-routing.js';

const MAX_BYTES=1024*1024,MAX_EVENTS=200;
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store',...(status===503?{'retry-after':'10'}:{})}});
const hash=x=>createHash('sha256').update(x).digest('hex');
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':record(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sameToken=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
class InvalidPayload extends Error{}
class TooLarge extends Error{}

export function verifyInstagramSignature(raw,signature,secret){
 if(typeof secret!=='string'||!secret||!/^sha256=[a-fA-F0-9]{64}$/.test(signature||''))return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
async function readRaw(request){
 if(Number(request.headers.get('content-length'))>MAX_BYTES)throw new TooLarge();
 const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
 const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES){await reader.cancel();throw new TooLarge();}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks,length);
}

// Never retain text, attachment URLs, sender/recipient IDs, postback payloads or raw JSON.
export function instagramMetadata(payload){
 if(!record(payload)||payload.object!=='instagram'||!Array.isArray(payload.entry)||payload.entry.length>MAX_EVENTS)throw new InvalidPayload();
 const events=[];
 for(const entry of payload.entry){
  if(!record(entry)||typeof entry.id!=='string'||!/^\d{1,40}$/.test(entry.id))throw new InvalidPayload();
  for(const field of ['messaging','standby','changes']){
   if(entry[field]===undefined)continue;
   if(!Array.isArray(entry[field]))throw new InvalidPayload();
   for(const event of entry[field]){
    if(!record(event)||events.length>=MAX_EVENTS)throw new InvalidPayload();
    let kind='other';
    if(field==='changes')kind='change';
    else for(const type of ['message','postback','read','delivery','reaction','referral','optin'])if(record(event[type])){kind=type;break;}
    const mid=kind==='message'&&typeof event.message.mid==='string'?event.message.mid:null;
    // Message IDs survive retries and batch regrouping. Other events use canonical content.
    const identity=mid?JSON.stringify([entry.id,field,kind,mid]):JSON.stringify([entry.id,field,kind,canonical(event)]);
    const timestamp=event.timestamp??entry.time;
    const milliseconds=typeof timestamp==='number'&&Number.isFinite(timestamp)?(timestamp<1e12?timestamp*1000:timestamp):null;
    const occurredAt=milliseconds!==null&&milliseconds>=0&&milliseconds<=4102444800000?new Date(milliseconds).toISOString():null;
    events.push({account_id:entry.id,event_key:hash(identity),kind,occurred_at:occurredAt,
     is_echo:event.message?.is_echo===true,has_attachments:Array.isArray(event.message?.attachments)&&event.message.attachments.length>0});
   }
  }
 }
 return events;
}

// This is deliberately separate from instagramMetadata: metadata is retained for every
// webhook, while only verified, customer-authored text messages enter the conversation
// router. Neither raw payloads nor these values are written to application logs.
export function instagramRoutableMessages(payload){
 if(!record(payload)||payload.object!=='instagram'||!Array.isArray(payload.entry)||payload.entry.length>MAX_EVENTS)throw new InvalidPayload();
 const messages=[];
 for(const entry of payload.entry){
  if(!record(entry)||typeof entry.id!=='string'||!/^\d{1,40}$/.test(entry.id))throw new InvalidPayload();
  for(const field of ['messaging','standby','changes']){
   if(entry[field]===undefined)continue;
   if(!Array.isArray(entry[field]))throw new InvalidPayload();
   for(const rawEvent of entry[field]){
    // Instagram Login webhook deliveries use `changes[].value`, whereas the
    // Messenger-compatible delivery uses `messaging[]`. Both represent the
    // same inbound text message and use the same idempotency rules below.
    const event=field==='changes'&&record(rawEvent?.value)?rawEvent.value:rawEvent;
    if(!record(event)||!record(event.message)||typeof event.message.mid!=='string'||typeof event.message.text!=='string')continue;
    const sender=record(event.sender)?event.sender:record(event.from)?event.from:null;
    if(event.message.is_echo===true||!sender||typeof sender.id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(sender.id))continue;
    const body=event.message.text.trim();
    if(!body||body.length>3000||messages.length>=MAX_EVENTS)continue;
    messages.push({accountId:entry.id,senderId:sender.id,messageId:event.message.mid.slice(0,300),eventKey:hash(JSON.stringify([entry.id,field,'message',event.message.mid])),text:body,isEcho:false});
   }
  }
 }
 return messages;
}

export function createInstagramWebhook({createClient,environment=process.env,logger=console.info}){
 const log=(status,counts={})=>{try{logger({component:'instagram_webhook',version:'33.0',status,...counts});}catch{/* Logging must not change durable delivery outcome. */}};
 return async request=>{
  if(!['GET','POST'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, POST'}});
  if(request.method==='GET'){
   const token=environment.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
   if(typeof token!=='string'||!token.trim()){log('configuration_missing');return json({error:'Webhook not configured'},503);}
   const params=new URL(request.url).searchParams;
   if(['hub.mode','hub.verify_token','hub.challenge'].some(k=>params.getAll(k).length!==1)||params.get('hub.mode')!=='subscribe'||!sameToken(params.get('hub.verify_token'),token))return json({error:'Verification denied'},403);
   const challenge=params.get('hub.challenge');if(!challenge||challenge.length>512)return json({error:'Invalid challenge'},400);
   return new Response(challenge,{status:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  const secret=environment.INSTAGRAM_APP_SECRET;
  if(typeof secret!=='string'||!secret.trim()){log('configuration_missing');return json({error:'Webhook not configured'},503);}
  const signature=request.headers.get('x-hub-signature-256');
  if(!/^sha256=[a-fA-F0-9]{64}$/.test(signature||'')){
   log(signature===null?'signature_missing':'signature_malformed',{legacySignaturePresent:request.headers.has('x-hub-signature')});
   return json({error:'Invalid signature'},401);
  }
  let raw;
  try{raw=await readRaw(request);}catch(e){return json({error:e instanceof TooLarge?'Payload too large':'Unreadable payload'},e instanceof TooLarge?413:400);}
  if(!verifyInstagramSignature(raw,signature,secret)){
   log('signature_mismatch',{secretHasOuterWhitespace:secret!==secret.trim(),bodyEmpty:raw.length===0});
   return json({error:'Invalid signature'},401);
  }
  let payload,events,messages;
  try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));events=instagramMetadata(payload);messages=instagramRoutableMessages(payload);}catch{return json({error:'Invalid Instagram payload'},400);}
  if(!events.length){log('empty_delivery');return json({received:true});}
  if(!environment.SUPABASE_URL||!environment.SUPABASE_SECRET_KEY){log('configuration_missing');return json({error:'Webhook storage unavailable'},503);}
  try{
   const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const result=await sb.rpc('receive_instagram_metadata_v29',{p_events:events});
   if(result.error)throw new Error('storage');
   if(!record(result.data)||!Number.isSafeInteger(result.data.inserted)||!Number.isSafeInteger(result.data.duplicates)||!Number.isSafeInteger(result.data.unmapped))throw new Error('storage');
   const routed=messages.length?await routeInstagramMessages({sb,messages,environment,logger}):{accepted:0,duplicates:0,ignored:0,failed:0};
   log('received',{inserted:result.data.inserted,duplicates:result.data.duplicates,unmapped:result.data.unmapped,routed:routed.accepted,routingFailed:routed.failed});
   return routed.failed?json({error:'Delivery processing incomplete; retry required'},503):json({received:true});
  }catch{log('storage_unavailable');return json({error:'Webhook storage unavailable'},503);}
 };
}
