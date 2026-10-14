import {encryptKey} from './byok.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const get=r=>{if(r.error)throw Error('Database unavailable. Apply V25 migration.');return r.data;};
export function createBillingV25({createClient,environment=process.env}){return async request=>{try{
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return json({error:'Sign in first.'},401);
 const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),auth=await sb.auth.getUser(token);
 if(auth.error||!auth.data?.user)return json({error:'Sign in again.'},401);
 const member=get(await sb.from('organization_members').select('organization_id,role').eq('user_id',auth.data.user.id).limit(1).maybeSingle());
 if(member?.role!=='admin')return json({error:'Administrator required.'},403);const org=member.organization_id;
 if(request.method==='POST'){
  const raw=await request.text();if(raw.length>6000)return json({error:'Request too large.'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
  if(b.action==='save_byok'){
   if(!['openai','deepseek','anthropic'].includes(b.provider)||typeof b.model!=='string'||!/^[-a-zA-Z0-9._:]{1,100}$/.test(b.model)||typeof b.key!=='string'||b.key.trim().length<16||b.key.length>2000||!/^\S+$/.test(b.key.trim()))return json({error:'Choose provider, model ID and a valid API key.'},400);
   let encrypted;try{encrypted=encryptKey(b.key.trim(),org,environment);}catch{return json({error:'Ask the owner to configure BYOK_ENCRYPTION_KEY on both projects.'},503);}
   get(await sb.from('byok_settings').upsert({organization_id:org,provider:b.provider,model:b.model,encrypted_key:encrypted,key_suffix:b.key.trim().slice(-4),enabled:true,updated_at:new Date().toISOString()}));return json({ok:true});
  }
  if(b.action==='use_synvio'){get(await sb.from('byok_settings').update({enabled:false}).eq('organization_id',org));return json({ok:true});}
  if(b.action==='remove_byok'){get(await sb.from('byok_settings').delete().eq('organization_id',org));return json({ok:true});}
  if(b.action==='set_overage'){if(typeof b.enabled!=='boolean')return json({error:'Explicit choice required.'},400);get(await sb.from('billing_subscriptions').update({overage_enabled:b.enabled}).eq('id',b.id).eq('organization_id',org));return json({ok:true});}
  return json({error:'Unknown action.'},400);
 }
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);
 const u=new URL(request.url),page=Number(u.searchParams.get('page')||0),kind=u.searchParams.get('kind')||'';
 if(!Number.isSafeInteger(page)||page<0||page>100000||kind&&!['ai','email_in','email_out','chat_in','chat_out','other_in','other_out','handoff'].includes(kind))return json({error:'Invalid history filter.'},400);
 let history=sb.from('billing_events_v25').select('id,event_key,kind,reference,state,reserved,cash,bonus,included,amount,details,created_at').eq('organization_id',org);
 if(kind)history=history.eq('kind',kind);
 const month=u.searchParams.get('month');if(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({error:'Invalid month.'},400);const next=new Date(month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);history=history.gte('created_at',month+'-01T00:00:00Z').lt('created_at',next.toISOString());}
 const results=await Promise.all([
 sb.from('organization_wallets').select('balance_micro_usd,ai_bonus_micro_usd,unlocked_at,metering_hold').eq('organization_id',org).single(),
 sb.from('byok_settings').select('provider,model,key_suffix,enabled,updated_at').eq('organization_id',org).maybeSingle(),
 sb.from('billing_subscriptions').select('*').eq('organization_id',org).order('starts_at',{ascending:false}).limit(1).maybeSingle(),
 history.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+49),
 sb.rpc('billing_summary_v25',{p_org:org}),
 sb.from('wallet_deposits').select('event_id,amount_micro_usd,bonus_micro_usd,source,created_at').eq('organization_id',org).order('created_at',{ascending:false}).range(page*50,page*50+49),
 sb.from('plan_receipts_v25').select('event_id,seats,amount,source,subscription_id').eq('organization_id',org).order('event_id').range(page*50,page*50+49)
 ]);
 const [wallet,byok,subscription,events,summary,deposits,planReceipts]=results.map(get);
 return json({wallet,byok,subscription,events,summary,deposits,planReceipts,page,testMode:true});
 }catch{return json({error:'Billing unavailable. Check V25 migration and server configuration.'},503);}};}
