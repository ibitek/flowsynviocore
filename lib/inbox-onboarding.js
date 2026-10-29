import {randomUUID,createHash} from 'node:crypto';
import {resolveTxt} from 'node:dns/promises';
import {postmark,hookUrl} from './postmark.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const freeDomains=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.uk','icloud.com','me.com','aol.com','proton.me','protonmail.com','wp.pl','o2.pl','onet.pl','interia.pl','poczta.fm','gazeta.pl','yandex.com']);
export function parseBusinessAddress(value){
 const email=String(value||'').trim().toLowerCase();
 if(email.length>254||!/^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9.-]+$/.test(email))return null;
 const [local,domain]=email.split('@');
 if(!local||!domain||!domain.includes('.')||domain.split('.').some(label=>!label||label.length>63||label.startsWith('-')||label.endsWith('-'))||!/[a-z]{2,}$/.test(domain))return null;
 if(freeDomains.has(domain)||domain.endsWith('.resend.app'))return {error:'Use a domain your company owns. Free email domains are not supported.'};
 return {email,domain};
}
export function relativeDnsHost(name,zone){
 const full=String(name||'').replace(/\.$/,''),suffix='.'+zone.toLowerCase();
 if(full.toLowerCase()===zone.toLowerCase())return '@';
 return full.toLowerCase().endsWith(suffix)?full.slice(0,-suffix.length):full;
}
export function createInboxOnboardingHandlers({createClient,fetchImpl=fetch,environment=process.env,resolveTxtImpl=resolveTxt}){
 async function context(request){
  const token=(request.headers.get('authorization')||'').match(/^Bearer (.+)$/)?.[1];if(!token)return {error:json({error:'Sign in again.'},401)};
  const missing=['SUPABASE_URL','SUPABASE_SECRET_KEY','POSTMARK_ACCOUNT_TOKEN'].filter(k=>!environment[k]);if(missing.length)return {error:json({error:'Missing server settings: '+missing.join(', ')+'. Add them in Vercel Production and redeploy.'},503)};
  const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await sb.auth.getUser(token);if(auth.error||!auth.data?.user)return {error:json({error:'Your session has expired.'},401)};
  const member=await sb.from('organization_members').select('organization_id,role').eq('user_id',auth.data.user.id).eq('role','admin').limit(1).maybeSingle();
  if(member.error||!member.data)return {error:json({error:'Only an administrator can configure the inbox.'},403)};
  const wallet=await sb.from('organization_wallets').select('balance_micro_usd,metering_hold,unlocked_at').eq('organization_id',member.data.organization_id).maybeSingle();
  if(wallet.error||!wallet.data||Number(wallet.data.balance_micro_usd)<=0||!wallet.data.unlocked_at||wallet.data.metering_hold)return {error:json({error:'This workspace is paused. Open Wallet.'},402)};
  return {sb,org:member.data.organization_id,user:auth.data.user};
 }

 const account=(path,method='GET',body)=>postmark(path,{token:environment.POSTMARK_ACCOUNT_TOKEN,account:true,method,body,fetchImpl});
 async function stored(sb,org,domain){const r=await sb.from('postmark_inbox_setups').select('*').eq('organization_id',org).eq('domain_name',domain).maybeSingle();if(r.error)throw Error('Run inbox_management_migration.sql in Supabase first.');return r.data;}
 async function save(sb,org,domain,values){const r=await sb.from('postmark_inbox_setups').update(values).eq('organization_id',org).eq('domain_name',domain).select('*').single();if(r.error)throw Error('Could not save Postmark setup. Refresh before retrying.');return r.data;}
 async function listFind(path,key,predicate){
  for(let offset=0;offset<10000;offset+=100){const data=await account(path+'?count=100&offset='+offset);const found=(data[key]||[]).filter(predicate);if(found.length>1)throw Error('Multiple matching provider resources. Ask the platform owner to reconcile them.');if(found[0])return found[0];if(offset+100>=data.TotalCount)return null;}
  throw Error('Provider resource listing is too large. Contact the platform owner.');
 }
 function publicSetup(row,domain){
  const records=[{type:'TXT',name:'_synvio-verification.'+row.domain_name,value:'synvio='+row.ownership_token,status:row.ownership_verified_at?'verified':'pending'}];
  const host=domain?.DKIMPendingHost||domain?.DKIMHost,value=domain?.DKIMPendingTextValue||domain?.DKIMTextValue;
  if(host&&value)records.push({type:'TXT',name:host,value,status:domain.DKIMVerified?'verified':'pending'});
  if(domain?.ReturnPathDomain&&domain?.ReturnPathDomainCNAMEValue)records.push({type:'CNAME',name:domain.ReturnPathDomain,value:domain.ReturnPathDomainCNAMEValue,status:domain.ReturnPathDomainVerified?'verified':'pending'});
  return {email:row.email_address,domain:row.domain_name,name:row.inbox_name,senderName:row.sender_name,state:row.state,records:records.map(r=>({...r,host:relativeDnsHost(r.name,row.domain_name)})),forwardingAddress:row.inbound_address||null,ready:row.state==='connected',testSubject:'Synvio connection test '+row.test_token,receivingStatus:row.inbound_verified_at?'verified':'pending'};
 }
 async function domainFor(row){return row.domain_id?account('/domains/'+row.domain_id):null;}
 async function GET(request){try{
  const ctx=await context(request);if(ctx.error)return ctx.error;
  const found=await ctx.sb.from('postmark_inbox_setups').select('*').eq('organization_id',ctx.org).order('created_at');
  if(found.error)throw Error('Run inbox_management_migration.sql in Supabase first.');
  const rows=found.data||[],wanted=new URL(request.url).searchParams.get('domain');
  const row=wanted?rows.find(r=>r.domain_name===wanted&&r.state!=='disconnected'):rows.find(r=>r.state!=='disconnected');
  const old=await ctx.sb.from('inboxes').select('id,email_address,name,status').eq('organization_id',ctx.org).neq('status','disconnected');
  if(old.error)throw Error('Could not load existing inboxes.');
  const legacy=(old.data||[]).filter(i=>!rows.some(r=>r.email_address===i.email_address&&r.state!=='disconnected'));
  return json({connections:rows.map(r=>({domain:r.domain_name,email:r.email_address,name:r.inbox_name,state:r.state})),legacy,setup:row?publicSetup(row,await domainFor(row)):null});
 }catch(e){return json({error:e.message},e.status||503);}}
 async function POST(request){
  let ctx,domainName,leased=false;
  try{
   ctx=await context(request);if(ctx.error)return ctx.error;
   const raw=await request.text();if(raw.length>4096)return json({error:'Request is too large.'},413);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid request.'},400)}
   if(!['start','verify','disconnect','disconnect_legacy'].includes(body.action))return json({error:'Invalid operation.'},400);
   if(body.action==='disconnect_legacy'){
    if(typeof body.inboxId!=='string'||!/^[-a-f0-9]{36}$/i.test(body.inboxId))return json({error:'Invalid inbox.'},400);
    const old=await ctx.sb.from('inboxes').select('id,email_address').eq('id',body.inboxId).eq('organization_id',ctx.org).maybeSingle();
    if(old.error||!old.data)return json({error:'Inbox not found.'},404);
    const setups=await ctx.sb.from('postmark_inbox_setups').select('domain_name,state').eq('organization_id',ctx.org).eq('email_address',old.data.email_address).neq('state','disconnected');
    if(setups.error)throw Error('Could not inspect inbox.');if(setups.data?.length)return json({error:'Remove its Postmark connection instead.'},409);
    const updated=await ctx.sb.from('inboxes').update({status:'disconnected'}).eq('id',body.inboxId).eq('organization_id',ctx.org);if(updated.error)throw Error('Could not disconnect inbox.');
    return json({ok:true,message:'Old inbox disconnected. Ticket history has been preserved.'});
   }
   domainName=body.action==='start'?parseBusinessAddress(body.email)?.domain:String(body.domain||'').toLowerCase();
   if(!domainName)return json({error:'Select a domain or enter a valid company address.'},400);
   let row=await stored(ctx.sb,ctx.org,domainName);
   if(body.action==='disconnect'){
    const removed=await ctx.sb.rpc('disconnect_postmark_inbox',{p_org:ctx.org,p_domain:domainName});
    if(removed.error)return json({error:'Could not remove this connection. It may be busy; refresh and try again.'},409);
    return json({ok:true,message:'Connection removed from active inboxes. History is retained. Disable forwarding at your email provider.'});
   }
   if(body.action==='start'){
    const address=parseBusinessAddress(body.email),name=String(body.name||'').trim(),sender=String(body.senderName||'').trim();
    if(!address||address.error)return json({error:address?.error||'Enter a valid business email.'},400);
    if(!name||!sender||name.length>120||sender.length>120||/[\r\n<>]/.test(sender))return json({error:'Enter an inbox name and sender name (up to 120 characters).'},400);
    if(!body.acknowledgeMx)return json({error:'Confirm that only your support mailbox will be forwarded.'},400);
    if(row&&row.state!=='disconnected'&&row.email_address!==address.email)return json({error:'This domain already has an active address. Remove that connection first, then add the new address.'},409);
    if(!row){
     const inserted=await ctx.sb.from('postmark_inbox_setups').insert({organization_id:ctx.org,domain_name:address.domain,email_address:address.email,inbox_name:name,sender_name:sender}).select('*').single();
     if(inserted.error)return json({error:inserted.error.code==='23505'?'This domain or workspace already has a setup. Refresh the page or contact its administrator.':'Could not reserve this domain.'},409);row=inserted.data;
    }
   }
   if(!row)return json({error:'Choose your support address first.'},409);
   if(body.action==='verify'&&row.state==='disconnected')return json({error:'This connection was removed. Add the address again to reconnect.'},409);
   const lease=await ctx.sb.rpc('claim_postmark_setup',{p_org:ctx.org,p_domain:domainName});if(lease.error)throw Error('Could not lock setup.');if(!lease.data)return json({error:'Setup is already running. Refresh its status shortly.'},409);leased=true;
   row=await stored(ctx.sb,ctx.org,domainName);
   if(body.action==='verify'&&row.state==='disconnected')return json({error:'Connection was removed. Add it again first.'},409);
   if(body.action==='start'&&row.state==='disconnected'){
    row=await save(ctx.sb,ctx.org,domainName,{email_address:parseBusinessAddress(body.email).email,inbox_name:String(body.name).trim(),sender_name:String(body.senderName).trim(),state:'dns_pending',inbound_verified_at:null,inbox_id:null,test_token:randomUUID().replaceAll('-','')});
   }
   // Reconcile exact names on retry, including a provider success followed by a DB/network failure.
   if(!row.domain_id){let domain=await listFind('/domains','Domains',d=>d.Name?.toLowerCase()===row.domain_name);if(!domain)domain=await account('/domains','POST',{Name:row.domain_name,ReturnPathDomain:'pm-bounces.'+row.domain_name});row=await save(ctx.sb,ctx.org,domainName,{domain_id:domain.ID});}
   let domain=await domainFor(row);
   if(body.action==='verify'){
    const txt=await resolveTxtImpl('_synvio-verification.'+row.domain_name).catch(()=>[]);
    if(!txt.some(parts=>parts.join('')==='synvio='+row.ownership_token))return json({setup:publicSetup(row,domain),message:'Add the Synvio ownership TXT record before connecting this domain.'});
    await account('/domains/'+row.domain_id+'/verifyDkim','PUT');await account('/domains/'+row.domain_id+'/verifyReturnPath','PUT');domain=await domainFor(row);
    if(!domain.DKIMVerified||!domain.ReturnPathDomainVerified)return json({setup:publicSetup(row,domain),message:'Postmark has not verified all sending records yet. Wait for DNS propagation and retry.'});
    row=await save(ctx.sb,ctx.org,domainName,{ownership_verified_at:new Date().toISOString()});
    // Do not create billable/limited servers until workspace ownership is proved.
    const name='Synvio '+createHash('sha256').update(ctx.org+':'+domainName).digest('hex').slice(0,32);
    let server=row.server_id?await account('/servers/'+row.server_id):await listFind('/servers','Servers',s=>s.Name===name);
    const webhook=hookUrl(ctx.org,environment);
    if(!server)server=await account('/servers','POST',{Name:name,Color:'Turquoise',DeliveryType:'Live',InboundHookUrl:webhook,RawEmailEnabled:false,TrackOpens:false,TrackLinks:'None'});
    if(server.Name!==name&&!(row.server_id&&server.Name==='Synvio '+ctx.org))throw Error('Postmark server identity mismatch.');
    row=await save(ctx.sb,ctx.org,domainName,{server_id:server.ID,inbound_address:server.InboundAddress||server.InboundHash+'@inbound.postmarkapp.com'});
    if(server.InboundHookUrl!==webhook)await account('/servers/'+server.ID,'PUT',{InboundHookUrl:webhook});
    if(row.inbound_verified_at){const activated=await ctx.sb.rpc('activate_postmark_inbox',{p_org:ctx.org,p_domain:domainName});if(activated.error)throw Error('Could not activate the inbox.');row=await stored(ctx.sb,ctx.org,domainName);}
    else row=await save(ctx.sb,ctx.org,domainName,{state:'forwarding_pending'});
   }
   return json({setup:publicSetup(row,domain),message:row.state==='connected'?'Inbox connected.':row.inbound_address?'Forward only this support address, then send the connection test to your support address and refresh.':'Add the records shown, then click Verify DNS.'});
  }catch(e){return json({error:e.message},e.status||503)}finally{if(leased){try{await ctx.sb.from('postmark_inbox_setups').update({provisioning_until:null}).eq('organization_id',ctx.org).eq('domain_name',domainName);}catch{/* Lease expires automatically if release fails. */}}}
 }
 return {GET,POST};
}
