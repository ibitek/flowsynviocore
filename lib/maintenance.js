import {createHash,timingSafeEqual} from 'node:crypto';
import {refreshConnection} from './instagram-token.js';
import {checked} from './instagram-delivery.js';
const digest=s=>createHash('sha256').update(s).digest();
export function createMaintenance({createClient,environment=process.env,fetchImpl=fetch,logger=console.info}){
 return async request=>{
  if(request.method!=='GET')return new Response(null,{status:405});
  const secret=environment.CRON_SECRET;
  if(!secret||secret.length<16)return Response.json({error:'Maintenance is not configured'},{status:503});
  if(!timingSafeEqual(digest(request.headers.get('authorization')||''),digest('Bearer '+secret)))return new Response(null,{status:401});
  const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
   const closed=checked(await sb.rpc('flow_close_due_v33',{p_conversation:null}));
   const due=checked(await sb.from('instagram_connections').select('*').eq('status','active').is('disconnected_at',null).lte('token_expires_at',new Date(Date.now()+7*86400000).toISOString()).order('token_expires_at').limit(100));
   let refreshed=0,failed=0;
   // Bounded concurrency keeps the daily Hobby job under its function duration.
   for(let i=0;i<due.length;i+=10)await Promise.all(due.slice(i,i+10).map(async row=>{
    try{await refreshConnection(sb,row,environment,fetchImpl);refreshed++;}
    catch(e){failed++;logger({component:'instagram_maintenance',reason:e.code||'TOKEN_REFRESH_FAILED'});}
   }));
   logger({component:'maintenance',version:'33',closed,refreshed,failed});
   return Response.json({closed,refreshed,failed},{status:failed?503:200,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({error:'Maintenance storage unavailable'},{status:503});}
 };
}
