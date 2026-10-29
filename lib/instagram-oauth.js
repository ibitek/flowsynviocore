import {requestToken,sealToken} from './instagram-token.js';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const corsJson=(body,status,origin)=>Response.json(body,{status,headers:{'cache-control':'no-store','access-control-allow-origin':origin,'access-control-allow-headers':'authorization, content-type','vary':'origin'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const tokenFrom=request=>(request.headers.get('authorization')||'').match(/^Bearer (.+)$/)?.[1]||'';
const safeUrl=(value,name)=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error();return url;}catch{throw fail(name+' must be an HTTPS URL.',503);}};
const b64url=value=>Buffer.from(value).toString('base64url');
const fromB64=value=>Buffer.from(value,'base64url');
const equal=(a,b)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};

function stateSecret(environment){
 const value=String(environment.INSTAGRAM_OAUTH_STATE_SECRET||'');
 if(value.length<32)throw fail('Instagram OAuth state secret is not configured.',503);
 return value;
}
function encryptionKey(environment){
 const raw=String(environment.INSTAGRAM_TOKEN_ENCRYPTION_KEY||'');let key;
 try{key=Buffer.from(raw,'base64url');}catch{throw fail('Instagram token encryption key is invalid.',503);}
 if(key.length!==32)throw fail('Instagram token encryption key must be a 32-byte base64url value.',503);
 return key;
}
function signedState(payload,secret){const encoded=b64url(JSON.stringify(payload));const signature=createHmac('sha256',secret).update(encoded).digest('base64url');return encoded+'.'+signature;}
function readState(value,secret){const [encoded,signature,...extra]=String(value||'').split('.');if(!encoded||!signature||extra.length||!equal(createHmac('sha256',secret).update(encoded).digest('base64url'),signature))throw fail('Instagram connection link is invalid or expired.',400);let parsed;try{parsed=JSON.parse(fromB64(encoded).toString('utf8'));}catch{throw fail('Instagram connection link is invalid or expired.',400);}if(!parsed||parsed.v!==1||!uuid(parsed.org)||!uuid(parsed.user)||!uuid(parsed.bot)||typeof parsed.nonce!=='string'||!/^[A-Za-z0-9_-]{32,96}$/.test(parsed.nonce)||!Number.isSafeInteger(parsed.exp)||parsed.exp<Date.now()||parsed.exp>Date.now()+15*60*1000)throw fail('Instagram connection link is invalid or expired.',400);return parsed;}
function encrypt(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return {ciphertext:encrypted.toString('base64url'),iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};}
// Kept exported for a local cryptographic round-trip test; decrypted tokens are never logged or returned.
export function decryptInstagramToken(record,key){const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64url'));decipher.setAuthTag(Buffer.from(record.tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64url')),decipher.final()]).toString('utf8');}
async function authenticate(request,sb){const token=tokenFrom(request);if(!token)throw fail('Sign in first.',401);const auth=await sb.auth.getUser(token);if(auth.error||!auth.data?.user)throw fail('Sign in again.',401);const member=await sb.from('organization_members').select('organization_id,role').eq('user_id',auth.data.user.id).order('organization_id').limit(1).maybeSingle();if(member.error||!member.data)throw fail('Workspace membership unavailable.',403);if(member.data.role!=='admin')throw fail('Administrator sign-in required.',403);return {userId:auth.data.user.id,organizationId:member.data.organization_id};}
function environmentUrls(environment){return {authorize:safeUrl(environment.INSTAGRAM_OAUTH_AUTHORIZE_URL,'INSTAGRAM_OAUTH_AUTHORIZE_URL'),token:safeUrl(environment.INSTAGRAM_OAUTH_TOKEN_URL,'INSTAGRAM_OAUTH_TOKEN_URL'),profile:safeUrl(environment.INSTAGRAM_OAUTH_PROFILE_URL,'INSTAGRAM_OAUTH_PROFILE_URL'),redirect:safeUrl(environment.INSTAGRAM_OAUTH_REDIRECT_URI,'INSTAGRAM_OAUTH_REDIRECT_URI'),flow:safeUrl(environment.FLOW_PUBLIC_URL||'https://flow.synviocore.xyz/','FLOW_PUBLIC_URL')};}
function requiredEnvironment(environment){if(!environment.SUPABASE_URL||!environment.SUPABASE_SECRET_KEY)throw fail('Server configuration is incomplete.',503);if(!String(environment.INSTAGRAM_OAUTH_CLIENT_ID||'').trim()||!String(environment.INSTAGRAM_OAUTH_CLIENT_SECRET||'').trim())throw fail('Instagram OAuth client credentials are not configured.',503);return {...environmentUrls(environment),stateSecret:stateSecret(environment),key:encryptionKey(environment)};}
async function fetchJson(fetchImpl,url,options){let response;try{response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(15000)});}catch{throw fail('Instagram could not be reached. Start the connection again.',502);}let body;try{body=await response.json();}catch{throw fail('Instagram returned an invalid response. Start the connection again.',502);}if(!response.ok)throw fail('Instagram authorization was rejected. Start the connection again.',400);return body;}
function resultRedirect(flow,status,botId=null){const target=new URL(flow);target.searchParams.set('instagram',status);if(uuid(botId))target.searchParams.set('bot',botId);return Response.redirect(target,302);}
async function subscribeAccount(fetchImpl,accessToken,environment){
 // Account-level subscription is separate from callback verification. Without it Meta
 // verifies the URL but has no instruction to deliver this account's DM events to us.
 const version=/^v\d+\.\d+$/.test(String(environment.INSTAGRAM_GRAPH_API_VERSION||''))?environment.INSTAGRAM_GRAPH_API_VERSION:'v26.0';
 const url='https://graph.instagram.com/'+version+'/me/subscribed_apps';
 let response;try{response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams({access_token:accessToken,subscribed_fields:'messages'}),signal:AbortSignal.timeout(20000)});}catch{throw fail('Instagram message subscription could not be created. Start the connection again.',502);}
 let body;try{body=await response.json();}catch{throw fail('Instagram returned an invalid message subscription response.',502);}
 if(!response.ok||body?.success!==true)throw fail('Instagram message subscription was rejected. Check messaging permissions, then reconnect the account.',400);
}

export function createInstagramOAuth({createClient,environment=process.env,fetchImpl=fetch,logger=console.info}){
 const log=(status,meta={})=>{try{logger({component:'instagram_oauth',version:'33',status,...meta});}catch{}};
 return async request=>{
  const url=new URL(request.url),action=url.searchParams.get('instagram');
  try{
   const env=requiredEnvironment(environment);const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   if(action==='connect'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    const actor=await authenticate(request,sb),botId=url.searchParams.get('botId');if(!uuid(botId))throw fail('A valid Flow assistant is required.');
    const bot=await sb.from('flow_bots').select('id').eq('id',botId).eq('organization_id',actor.organizationId).is('deleted_at',null).maybeSingle();if(bot.error||!bot.data)throw fail('Assistant unavailable.',404);
    const nonce=randomBytes(32).toString('base64url'),exp=Date.now()+10*60*1000;
    const stored=await sb.from('instagram_oauth_states').insert({nonce,organization_id:actor.organizationId,user_id:actor.userId,flow_bot_id:botId,expires_at:new Date(exp).toISOString()});if(stored.error)throw fail('Could not start Instagram connection.',503);
    const state=signedState({v:1,nonce,org:actor.organizationId,user:actor.userId,bot:botId,exp},env.stateSecret),authorize=new URL(env.authorize);
    authorize.searchParams.set('client_id',environment.INSTAGRAM_OAUTH_CLIENT_ID);authorize.searchParams.set('redirect_uri',env.redirect.href);authorize.searchParams.set('response_type','code');authorize.searchParams.set('state',state);
    authorize.searchParams.set('scope',String(environment.INSTAGRAM_OAUTH_SCOPES||'instagram_business_basic,instagram_business_manage_messages'));
    log('started');
    if(url.searchParams.get('format')==='json')return Response.json({authorizeUrl:authorize.href},{headers:{'cache-control':'no-store','access-control-allow-origin':env.flow.origin,'access-control-allow-headers':'authorization, content-type','vary':'origin'}});
    return Response.redirect(authorize,302);
   }
   if(action==='callback'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    const denied=url.searchParams.get('error');if(denied){log('denied',{reason:String(denied).slice(0,40)});return resultRedirect(env.flow,'cancelled');}
    const state=readState(url.searchParams.get('state'),env.stateSecret),code=url.searchParams.get('code');if(typeof code!=='string'||code.length<8||code.length>4096)throw fail('Instagram did not return a valid authorization code.',400);
    const consumed=await sb.from('instagram_oauth_states').update({consumed_at:new Date().toISOString()}).eq('nonce',state.nonce).eq('organization_id',state.org).eq('user_id',state.user).eq('flow_bot_id',state.bot).is('consumed_at',null).gt('expires_at',new Date().toISOString()).select('nonce').maybeSingle();if(consumed.error||!consumed.data)throw fail('Instagram connection link was already used or expired. Start again from FLOW.',400);
    const tokenBody=new URLSearchParams({client_id:String(environment.INSTAGRAM_OAUTH_CLIENT_ID),client_secret:String(environment.INSTAGRAM_OAUTH_CLIENT_SECRET),grant_type:'authorization_code',redirect_uri:env.redirect.href,code});
    const token=await fetchJson(fetchImpl,env.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:tokenBody});if(typeof token.access_token!=='string'||token.access_token.length<12||token.access_token.length>4096)throw fail('Instagram did not provide an access token.',502);
    const profileUrl=new URL(env.profile);profileUrl.searchParams.set('fields','id,user_id,username,account_type');profileUrl.searchParams.set('access_token',token.access_token);
    // Meta can expose an app-scoped profile id and the messaging/webhook account id.
    // Prefer the latter whenever the OAuth exchange provides it; otherwise use the
    // profile's user_id before falling back to its legacy id field.
    const profile=await fetchJson(fetchImpl,profileUrl,{headers:{accept:'application/json'}});const accountId=typeof token.user_id==='string'?token.user_id:typeof profile.user_id==='string'?profile.user_id:profile.id;if(typeof accountId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(accountId))throw fail('Instagram did not provide a valid account.',502);
    await subscribeAccount(fetchImpl,token.access_token,environment);
    const longLived=await requestToken({token:token.access_token,secret:environment.INSTAGRAM_OAUTH_CLIENT_SECRET,fetchImpl});const encrypted=sealToken(longLived.token,environment),expiresAt=longLived.expiresAt;
    const saved=await sb.from('instagram_connections').upsert({organization_id:state.org,instagram_account_id:accountId,instagram_username:typeof profile.username==='string'?profile.username.slice(0,80):null,flow_bot_id:state.bot,...encrypted,token_expires_at:expiresAt,status:'active',disconnected_at:null,updated_at:new Date().toISOString()},{onConflict:'organization_id,instagram_account_id'});if(saved.error)throw fail('Instagram connection could not be saved.',503);
    log('connected');return resultRedirect(env.flow,'connected',state.bot);
   }
   const actor=await authenticate(request,sb);
   if(action==='status'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);const botId=url.searchParams.get('botId');if(!uuid(botId))throw fail('A valid Flow assistant is required.');
    const rows=await sb.from('instagram_connections').select('id,instagram_account_id,instagram_username,flow_bot_id,status,token_expires_at,created_at,updated_at').eq('organization_id',actor.organizationId).eq('flow_bot_id',botId).order('created_at',{ascending:false});if(rows.error)throw fail('Instagram status is unavailable.',503);return corsJson({connections:rows.data||[]},200,env.flow.origin);
   }
   if(action==='disconnect'){
    if(request.method!=='POST')return json({error:'Method not allowed'},405);let body;try{body=await request.json();}catch{throw fail('Invalid JSON.');}if(!uuid(body.connectionId))throw fail('Invalid Instagram connection.');
    const changed=await sb.from('instagram_connections').update({status:'disconnected',disconnected_at:new Date().toISOString(),access_token_ciphertext:null,access_token_iv:null,access_token_tag:null,updated_at:new Date().toISOString()}).eq('id',body.connectionId).eq('organization_id',actor.organizationId).eq('status','active').select('id').maybeSingle();if(changed.error||!changed.data)throw fail('Instagram connection was not found.',404);log('disconnected');return corsJson({ok:true},200,env.flow.origin);
   }
   return json({error:'Not found'},404);
  }catch(error){const status=Number.isInteger(error?.status)?error.status:503;log('failed',{status});const body={error:status>=500?'Instagram connection is temporarily unavailable.':error.message.trim()};if(action==='status'||action==='disconnect'){try{return corsJson(body,status,environmentUrls(environment).flow.origin);}catch{}}return json(body,status);}
 };
}
