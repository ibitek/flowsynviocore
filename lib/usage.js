import {PRICING} from './usage-pricing.js';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function createUsageHandler({createClient,environment=process.env}){
  return async function GET(request){
    const token=(request.headers.get('authorization')||'').match(/^Bearer (.+)$/)?.[1];
    if(!token)return reply({error:'Sign in first.'},401);
    const url=new URL(request.url),orgId=url.searchParams.get('orgId'),month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
    if(!uuid.test(orgId||'')||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return reply({error:'Invalid organization or month.'},400);
    if(!environment.SUPABASE_URL||!environment.SUPABASE_SECRET_KEY)return reply({error:'Server configuration is incomplete.'},503);
    const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const auth=await sb.auth.getUser(token);
    if(auth.error||!auth.data?.user)return reply({error:'Sign in again.'},401);
    const membership=await sb.from('organization_members').select('role').eq('organization_id',orgId).eq('user_id',auth.data.user.id).maybeSingle();
    if(membership.error||membership.data?.role!=='admin')return reply({error:'Admin access required.'},403);
    const begin=new Date(`${month}-01T00:00:00.000Z`),end=new Date(begin);
    if(Number.isNaN(begin.getTime()))return reply({error:'Invalid month.'},400);
    end.setUTCMonth(end.getUTCMonth()+1);
    const events=[];let truncated=false;
    for(let offset=0;offset<10000;offset+=1000){
      const page=await sb.from('copilot_usage_events')
        .select('ticket_id,operation,model,input_tokens,output_tokens,estimated_price_micro_usd,metering_status,created_at')
        .eq('organization_id',orgId).gte('created_at',begin.toISOString()).lt('created_at',end.toISOString())
        .order('created_at',{ascending:false}).range(offset,offset+999);
      if(page.error)return reply({error:'Usage data unavailable. Run usage_metering_migration.sql before viewing this page.'},503);
      events.push(...(page.data||[]));
      if((page.data||[]).length<1000)break;
      if(offset===9000)truncated=true;
    }
    const tickets=new Map();let priceMicroUsd=0,inputTokens=0,outputTokens=0,unpricedCalls=0;
    for(const event of events){
      const amount=Number(event.estimated_price_micro_usd);
      if(event.metering_status==='priced'&&Number.isSafeInteger(amount)&&amount>=0)priceMicroUsd+=amount;
      else unpricedCalls++;
      inputTokens+=Number(event.input_tokens)||0;outputTokens+=Number(event.output_tokens)||0;
      const item=tickets.get(event.ticket_id)||{ticketId:event.ticket_id,calls:0,priceMicroUsd:0};
      item.calls++;if(event.metering_status==='priced'&&Number.isSafeInteger(amount)&&amount>=0)item.priceMicroUsd+=amount;
      tickets.set(event.ticket_id,item);
    }
    return reply({ok:true,month,pricing:PRICING,totals:{calls:events.length,tickets:tickets.size,inputTokens,outputTokens,priceMicroUsd,unpricedCalls,truncated},
      tickets:[...tickets.values()].sort((a,b)=>b.priceMicroUsd-a.priceMicroUsd).slice(0,20)});
  };
}
