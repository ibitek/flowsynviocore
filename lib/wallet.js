import {recommendPlan} from './plan-advice.js';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function walletForUser(sb,userId){
 const member=await sb.from('organization_members').select('organization_id,role,organizations(id,name,slug)').eq('user_id',userId).limit(1).maybeSingle();
 if(member.error||!member.data)return {error:'Workspace membership unavailable.',status:403};
 const wallet=await sb.from('organization_wallets').select('balance_micro_usd,metering_hold,created_at,unlocked_at').eq('organization_id',member.data.organization_id).maybeSingle();
 if(wallet.error||!wallet.data)return {error:'Wallet unavailable. Run wallet_migration.sql.',status:503};
 const access=await sb.rpc('synvio_wallet_active',{p_org:member.data.organization_id});
 return {organizationId:member.data.organization_id,organization:member.data.organizations,role:member.data.role,balanceMicroUsd:Number(wallet.data.balance_micro_usd),unlocked:!!wallet.data.unlocked_at,meteringHold:wallet.data.metering_hold,active:!access.error&&access.data===true};
}
export function createWalletHandler({createClient,environment=process.env}){return async function GET(request){
 const token=(request.headers.get('authorization')||'').match(/^Bearer (.+)$/)?.[1];
 if(!token)return reply({error:'Sign in first.'},401);
 if(!environment.SUPABASE_URL||!environment.SUPABASE_SECRET_KEY)return reply({error:'Server configuration is incomplete.'},503);
 const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await sb.auth.getUser(token);if(auth.error||!auth.data?.user)return reply({error:'Sign in again.'},401);
 const wallet=await walletForUser(sb,auth.data.user.id);if(wallet.error)return reply({error:wallet.error},wallet.status);
 if(wallet.role!=='admin')return reply({ok:true,...wallet});
 const month=new URL(request.url).searchParams.get('month')||new Date().toISOString().slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return reply({error:'Invalid month.'},400);
 const [ledger,monthly]=await Promise.all([
  sb.from('wallet_transactions').select('id,kind,amount_micro_usd,balance_after_micro_usd,ticket_id,usage_event_id,note,created_at').eq('organization_id',wallet.organizationId).order('created_at',{ascending:false}).limit(100),
  sb.rpc('synvio_wallet_monthly',{p_org:wallet.organizationId,p_month:month+'-01'})
 ]);
 if(ledger.error||monthly.error)return reply({error:'Wallet activity unavailable.'},503);
 const eventIds=[...new Set((ledger.data||[]).map(row=>row.usage_event_id).filter(Boolean))];
 let usageById=new Map();
 if(eventIds.length){
  const usage=await sb.from('copilot_usage_events').select('id,input_tokens,output_tokens').in('id',eventIds).eq('organization_id',wallet.organizationId);
  if(usage.error)return reply({error:'Wallet token activity unavailable.'},503);
  usageById=new Map((usage.data||[]).map(row=>[row.id,row]));
 }
 const ticketIds=[...new Set((ledger.data||[]).map(row=>row.ticket_id).filter(Boolean))];
 const ticketNumbers=ticketIds.length?await sb.from('tickets').select('id,ticket_number').eq('organization_id',wallet.organizationId).in('id',ticketIds):{data:[]};
 if(ticketNumbers.error)return reply({error:'Ticket numbers unavailable.'},503);
 const numberById=new Map((ticketNumbers.data||[]).map(t=>[t.id,t.ticket_number]));
 const reservations=await sb.from('continuation_summary_jobs').select('reserved_micro_usd').eq('organization_id',wallet.organizationId).eq('state','pending');
 if(reservations.error)return reply({error:'Pending summary accounting unavailable. Apply the V14 migration.'},503);
 const pendingReservedMicroUsd=(reservations.data||[]).reduce((n,j)=>n+Number(j.reserved_micro_usd||0),0);
 const transactions=(ledger.data||[]).map(({usage_event_id,...row})=>{
  const usage=usageById.get(usage_event_id);
  return {...row,ticketNumber:numberById.get(row.ticket_id)||null,inputTokens:usage?.input_tokens??null,outputTokens:usage?.output_tokens??null};
 });
 const [overview,plans,subscription,keys,settings,macros]=await Promise.all([
  sb.rpc('billing_overview',{p_org:wallet.organizationId}),
  sb.from('billing_plans').select('*').eq('active',true).order('id'),
  sb.from('billing_subscriptions').select('*').eq('organization_id',wallet.organizationId).order('starts_at',{ascending:false}).limit(1).maybeSingle(),
  sb.from('synvio_api_keys').select('id,name,prefix,revoked_at,created_at').eq('organization_id',wallet.organizationId).order('created_at',{ascending:false}).limit(50),
  sb.from('organization_ai_settings').select('draft_prompt,employee_prompt').eq('organization_id',wallet.organizationId).maybeSingle(),
  sb.from('support_macros').select('id,name,instructions').eq('organization_id',wallet.organizationId).eq('active',true).order('id').limit(50)
 ]);
 if([overview,plans,subscription,keys,settings,macros].some(v=>v.error))return reply({error:'Billing overview unavailable. Apply hybrid_billing_migration.sql.'},503);
 return reply({ok:true,...wallet,pendingReservedMicroUsd:pendingReservedMicroUsd+Number(overview.data.reservedMicroUsd||0),month,monthly:monthly.data||{chargedMicroUsd:0,actions:0,tickets:0},transactions,advice:recommendPlan(overview.data,plans.data||[]),subscription:subscription.data,keys:keys.data,aiSettings:settings.data,macros:macros.data,testMode:true});
};}
