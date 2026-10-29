import {authenticatedHook} from './postmark.js';
import {BUCKET,MAX_FILES,MAX_TOTAL,fileMetadata,validateBytes,stableAttachmentId} from './attachments.js';

export function normalizeInbound(data){
 const headers={};for(const h of data.Headers||[])if(h.Name)headers[h.Name.toLowerCase()]=String(h.Value||'');
 const recipients=[...(data.ToFull||[]),...(data.CcFull||[])].map(x=>String(x.Email||'').toLowerCase());
 const sender=String(data.FromFull?.Email||data.From||'').trim().toLowerCase();
 return {headers,recipients,sender,id:String(data.MessageID||''),subject:String(data.Subject||'(No subject)'),text:String(data.TextBody||'').trim()||String(data.HtmlBody||'').replace(/<[^>]*>/g,' ').trim()||'(No readable text)',date:Number.isFinite(Date.parse(data.Date))?new Date(data.Date).toISOString():new Date().toISOString()};
}
export async function storePostmarkAttachments(sb,org,ticket,message,attachments=[]){
 let total=0;
 for(const [index,item] of attachments.entries()){
  const key=String(index),id=stableAttachmentId(org,message,key);
  const existing=await sb.from('message_attachments').select('status').eq('id',id).maybeSingle();if(existing.error)throw Error('Attachment lookup failed.');
  total+=Number(item.ContentLength)||0;
  if(['ready','rejected'].includes(existing.data?.status))continue;
  let metadata,reason,bytes;
  try{metadata=fileMetadata(item.Name,Number(item.ContentLength));if(index>=MAX_FILES||total>MAX_TOTAL)throw Error('Attachment count or total size limit exceeded.');
   if(typeof item.Content!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.Content))throw Error('Invalid attachment encoding.');
   bytes=Buffer.from(item.Content,'base64');if(bytes.length!==metadata.file_size)throw Error('Attachment size mismatch.');validateBytes(bytes,metadata.mime_type);
  }catch(e){reason=e.message;}
  const path=`${org}/${ticket}/${id}/${encodeURIComponent(metadata?.filename||'attachment')}`;
  const saved=await sb.from('message_attachments').upsert({id,organization_id:org,ticket_id:ticket,message_id:message,provider_attachment_id:key,filename:metadata?.filename||String(item.Name||'attachment').slice(0,180),file_size:Math.max(0,Number(item.ContentLength)||0),mime_type:metadata?.mime_type||'application/octet-stream',storage_path:path,status:reason?'rejected':'uploading',error_message:reason||null,content_disposition:'attachment'},{onConflict:'id'});if(saved.error)throw Error('Attachment metadata storage failed.');
  if(reason)continue;
  const upload=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:metadata.mime_type,upsert:true});if(upload.error)throw Error('Attachment storage failed. Postmark should retry the webhook.');
  const ready=await sb.from('message_attachments').update({status:'ready',error_message:null}).eq('id',id);if(ready.error)throw Error('Could not finalize attachment.');
 }
}
export function createPostmarkInbound({createClient,environment=process.env}){return async function POST(request){
 try{
  const org=authenticatedHook(request,environment);if(!org)return Response.json({error:'Unauthorized webhook.'},{status:401});
  // Vercel itself limits function request size. Keep a separate parser cap as well.
  if(Number(request.headers.get('content-length'))>4400000)return Response.json({error:'Payload too large.'},{status:413});
  const raw=await request.text();if(Buffer.byteLength(raw)>4400000)return Response.json({error:'Payload too large.'},{status:413});
  let data;try{data=JSON.parse(raw)}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
  if(data.RecordType&&data.RecordType!=='Inbound')return Response.json({ignored:true});
  const mail=normalizeInbound(data);
  if(!mail.id||mail.id.length>200||!mail.sender.includes('@')||!Array.isArray(data.Attachments||[]))return Response.json({error:'Invalid inbound email.'},{status:400});
  const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const setup=await sb.from('postmark_inbox_setups').select('*').eq('organization_id',org).eq('inbound_address',String(data.OriginalRecipient||'').toLowerCase()).maybeSingle();
  if(!setup.error&&(!setup.data||setup.data.state==='disconnected'))return Response.json({ignored:true,reason:'Connection removed or unknown route.'});
  if(setup.error||!setup.data?.ownership_verified_at||!setup.data?.server_id)return Response.json({error:'Verify inbox setup first.'},{status:503});
  const row=setup.data;
  // Never ingest a whole personal mailbox: retain only the explicitly configured recipient.
  // Manual forwarding that rewrites To is deliberately not accepted.
  if(!mail.recipients.includes(row.email_address))return Response.json({ignored:true,reason:'Recipient is not the configured support address.'});
  if(String(data.OriginalRecipient||'').toLowerCase()!==row.inbound_address?.toLowerCase())return Response.json({error:'Inbound route mismatch.'},{status:422});
  if(row.state==='dns_pending')return Response.json({error:'Verify the connection in Inbox setup first.'},{status:503});
  if(row.state!=='connected'){
   if(mail.subject!=='Synvio connection test '+row.test_token)return Response.json({error:'Send the connection test shown in Inbox setup first.'},{status:503});
   const proof=await sb.from('postmark_inbox_setups').update({inbound_verified_at:new Date().toISOString()}).eq('organization_id',org).eq('domain_name',row.domain_name).neq('state','disconnected');if(proof.error)throw Error('Could not save receiving test.');
   const active=await sb.rpc('activate_postmark_inbox',{p_org:org,p_domain:row.domain_name});if(active.error)throw Error('Could not activate inbox.');row.inbox_id=active.data;
  }
  const metadata={postmark_email_id:mail.id,postmark_server_id:row.server_id,attachments:(data.Attachments||[]).map((x,i)=>({id:String(i),filename:x.Name,size:x.ContentLength,content_type:x.ContentType}))};
  const ingest=await sb.rpc('ingest_postmark_email',{p_inbox_id:row.inbox_id,p_postmark_email_id:mail.id,p_internet_message_id:mail.headers['message-id']||null,p_subject:mail.subject,p_sender_name:String(data.FromName||data.FromFull?.Name||'').slice(0,200),p_sender_email:mail.sender,p_recipient_email:row.email_address,p_body_text:mail.text,p_body_html:data.HtmlBody||null,p_received_at:mail.date,p_headers:mail.headers,p_metadata:metadata});
  if(ingest.error)throw Error('Database ingest failed.');
  const message=await sb.from('messages').select('id').eq('organization_id',org).eq('provider','postmark').eq('external_id',mail.id).single();if(message.error)throw Error('Ingested message unavailable.');
  await storePostmarkAttachments(sb,org,ingest.data.ticket_id,message.data.id,data.Attachments||[]);
  return Response.json({ok:true,result:ingest.data});
 }catch{return Response.json({error:'Inbound processing failed. Retry delivery from Postmark Activity.'},{status:503});}
};}
