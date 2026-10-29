const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function createPrivacyHandler({createClient,environment=process.env}){
 return async request=>{
  if(request.method!=='POST')return json({error:'Use POST.'},405);
  try{
   if(Number(request.headers.get('content-length')||0)>20000)return json({error:'Request too large.'},413);
   const raw=await request.text();if(raw.length>20000)return json({error:'Request too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
   const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
   if(!token)return json({error:'Sign in first.'},401);
   const auth=await sb.auth.getUser(token);if(auth.error||!auth.data?.user)return json({error:'Session expired.'},401);
   const actor=auth.data.user.id,org=body.orgId;if(!uuid(org))return json({error:'Select a company.'},400);
   const member=await sb.from('organization_members').select('role').eq('organization_id',org).eq('user_id',actor).maybeSingle();
   if(member.error)return json({error:'Permissions unavailable.'},503);
   if(member.data?.role!=='admin')return json({error:'Administrator access required.'},403);
   const args={p_org:org,p_actor:actor};let result;
   if(body.action==='search')result=await sb.rpc('privacy_search_v33',{...args,p_query:String(body.query||'').slice(0,101)});
   else if(body.action==='preview'){
    const flow=body.flowIds||[],mail=body.mailIds||[];
    if(!Array.isArray(flow)||!Array.isArray(mail)||![...flow,...mail].every(uuid))return json({error:'Invalid selection.'},400);
    result=await sb.rpc('privacy_preview_v33',{...args,p_flow:[...new Set(flow)],p_mail:[...new Set(mail)],p_all:body.all===true});
   }else if(body.action==='erase'){
    if(body.confirm!=='DELETE'||!uuid(body.requestId))return json({error:'Review the preview and type DELETE.'},400);
    result=await sb.rpc('privacy_erase_v33',{...args,p_request:body.requestId});
   }else if(body.action==='pending'){
    result=await sb.from('privacy_erasure_jobs_v33').select('id,status,created_at').eq('organization_id',org).eq('actor_id',actor).eq('status','storage_pending');
   }else return json({error:'Unknown operation.'},400);
   if(result.error){
    const allowed=['Administrator required','Enter 2 to 100 characters','Select up to 100 conversations','Selection unavailable','No conversations selected','Preview unavailable','Preview expired','Data changed. Preview again','Work in progress. Finish or reconcile pending operations before erasure'];
    const message=allowed.includes(result.error.message)?result.error.message:'Data operation unavailable. Check that both v33 migrations are installed.';
    return json({error:message},409);
   }
   if(body.action==='erase'&&result.data.status==='storage_pending'){
    // This durable list survives interruption; retry the same request to finish object deletion.
    const job=await sb.from('privacy_erasure_jobs_v33').select('storage_paths').eq('id',body.requestId).eq('organization_id',org).eq('actor_id',actor).single();
    if(job.error)throw Error('STORAGE_QUEUE');
    let paths=job.data.storage_paths;const started=Date.now();
    while(paths.length&&Date.now()-started<180000){
     const batch=paths.slice(0,100);const removed=await sb.storage.from('message-attachments').remove(batch);
     if(removed.error)return json({data:{...result.data,status:'storage_pending',remaining:paths.length}});
     paths=paths.slice(batch.length);
     const saved=await sb.from('privacy_erasure_jobs_v33').update({storage_paths:paths,status:paths.length?'storage_pending':'complete',completed_at:paths.length?null:new Date().toISOString()}).eq('id',body.requestId).eq('organization_id',org).eq('actor_id',actor);
     if(saved.error)throw Error('STORAGE_QUEUE');
    }
    result.data={...result.data,status:paths.length?'storage_pending':'complete',remaining:paths.length};
   }
   return json({data:result.data});
  }catch{return json({error:'Operation interrupted. Refresh the deletion panel to check pending storage cleanup.'},503);}
 };
}
