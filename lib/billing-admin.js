import {randomBytes} from 'node:crypto';
import {digest} from './billed-ai.js';
import {walletForUser} from './wallet.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export function createBillingAdminHandler({createClient,environment=process.env}){return async request=>{
 try{
  const raw=await request.text();if(raw.length>16000)return json({error:'Request too large.'},413);
  const body=JSON.parse(raw),token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await sb.auth.getUser(token);if(auth.error||!auth.data?.user)return json({error:'Sign in again.'},401);
  const wallet=await walletForUser(sb,auth.data.user.id);if(wallet.error)return json({error:wallet.error},wallet.status);
  if(wallet.role!=='admin')return json({error:'Administrator required.'},403);
  if(!wallet.unlocked&&body.action!=='revoke_key'&&!(body.action==='set_overage'&&body.enabled===false))return json({error:'Unlock this workspace with a minimum $2 deposit or plan.'},402);
  const org=wallet.organizationId,actor=auth.data.user.id;
  if(body.action==='create_key'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>80)return json({error:'Enter a name (1–80 characters).'},400);
   const secret='synv_'+randomBytes(32).toString('hex');
   const result=await sb.from('synvio_api_keys').insert({organization_id:org,created_by:actor,name:body.name.trim(),prefix:secret.slice(0,13),key_hash:digest(secret)}).select('id,name,prefix').single();
   if(result.error)throw result.error;return json({ok:true,key:result.data,secret});
  }
  if(body.action==='revoke_key'){
   const result=await sb.from('synvio_api_keys').update({revoked_at:new Date().toISOString()}).eq('id',body.id).eq('organization_id',org);
   if(result.error)throw result.error;return json({ok:true});
  }
  if(body.action==='save_prompts'){
   if([body.draft_prompt,body.employee_prompt].some(v=>typeof v!=='string'||v.length>3000))return json({error:'Each prompt must be at most 3000 characters.'},400);
   const result=await sb.from('organization_ai_settings').upsert({organization_id:org,draft_prompt:body.draft_prompt,employee_prompt:body.employee_prompt,updated_at:new Date().toISOString()});
   if(result.error)throw result.error;return json({ok:true});
  }
  if(body.action==='add_macro'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>120||typeof body.instructions!=='string'||!body.instructions.trim()||body.instructions.length>2000)return json({error:'Macro name and instructions are required (120 / 2000 characters maximum).'},400);
   const result=await sb.from('support_macros').insert({organization_id:org,name:body.name.trim(),instructions:body.instructions.trim()});if(result.error)throw result.error;return json({ok:true});
  }
  if(body.action==='remove_macro'){
   const result=await sb.from('support_macros').update({active:false}).eq('id',body.id).eq('organization_id',org);if(result.error)throw result.error;return json({ok:true});
  }
  if(body.action==='purchase_plan'){
   const result=await sb.rpc('purchase_synvio_plan',{p_org:org,p_actor:actor,p_plan:body.planId,p_request:body.requestId,p_expected_seats:body.seats});
   if(result.error)return json({error:result.error.message},409);return json({ok:true,subscription:result.data});
  }
  if(body.action==='set_overage'){
   if(typeof body.enabled!=='boolean')return json({error:'Explicit PAYG choice required.'},400);
   const result=await sb.from('billing_subscriptions').update({overage_enabled:body.enabled}).eq('id',body.id).eq('organization_id',org);
   if(result.error)throw result.error;return json({ok:true});
  }
  return json({error:'Unknown action.'},400);
 }catch{return json({error:'Billing action failed. Refresh and check the details.'},503);}
};}
