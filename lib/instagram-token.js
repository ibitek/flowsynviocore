import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export function tokenKey(env){
 const key=Buffer.from(String(env.INSTAGRAM_TOKEN_ENCRYPTION_KEY||''),'base64url');
 if(key.length!==32)throw Object.assign(Error('Instagram encryption configuration is invalid.'),{code:'TOKEN_KEY_INVALID'});
 return key;
}
export function sealToken(token,env){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',tokenKey(env),iv);
 return {access_token_ciphertext:Buffer.concat([cipher.update(token,'utf8'),cipher.final()]).toString('base64url'),access_token_iv:iv.toString('base64url'),access_token_tag:cipher.getAuthTag().toString('base64url')};
}
export function openToken(row,env){
 const cipher=createDecipheriv('aes-256-gcm',tokenKey(env),Buffer.from(row.access_token_iv,'base64url'));
 cipher.setAuthTag(Buffer.from(row.access_token_tag,'base64url'));
 return Buffer.concat([cipher.update(Buffer.from(row.access_token_ciphertext,'base64url')),cipher.final()]).toString('utf8');
}
export async function requestToken({token,secret,refresh=false,fetchImpl=fetch}){
 const url=new URL('https://graph.instagram.com/'+(refresh?'refresh_access_token':'access_token'));
 url.searchParams.set('grant_type',refresh?'ig_refresh_token':'ig_exchange_token');
 url.searchParams.set('access_token',token);
 if(!refresh)url.searchParams.set('client_secret',secret);
 let response;
 try{response=await fetchImpl(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(Error('Instagram token service unavailable.'),{code:'TOKEN_NETWORK'});}
 const data=await response.json().catch(()=>({}));
 if(!response.ok||typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)||data.expires_in<86400){
  throw Object.assign(Error('Instagram token exchange failed. Reconnect the account.'),{code:'TOKEN_EXCHANGE_FAILED',metaCode:Number.isInteger(data.error?.code)?data.error.code:null});
 }
 return {token:data.access_token,expiresAt:new Date(Date.now()+data.expires_in*1000).toISOString()};
}
export async function refreshConnection(sb,row,env,fetchImpl=fetch){
 const expiry=Date.parse(row.token_expires_at);
 if(!Number.isFinite(expiry)||expiry<=Date.now())throw Object.assign(Error('Reconnect Instagram: the previous token has expired or has no confirmed expiry.'),{code:'TOKEN_EXPIRED'});
 if(expiry-Date.now()>7*86400000)return row;
 const updated=await requestToken({token:openToken(row,env),refresh:true,fetchImpl});
 const patch={...sealToken(updated.token,env),token_expires_at:updated.expiresAt,updated_at:new Date().toISOString()};
 const saved=await sb.from('instagram_connections').update(patch).eq('id',row.id).eq('status','active').eq('access_token_ciphertext',row.access_token_ciphertext).select('*').maybeSingle();
 if(saved.error)throw Object.assign(Error('Token refresh could not be saved.'),{code:'TOKEN_SAVE_FAILED'});
 if(saved.data)return saved.data;
 const latest=await sb.from('instagram_connections').select('*').eq('id',row.id).eq('status','active').maybeSingle();
 if(latest.error||!latest.data)throw Object.assign(Error('Instagram was disconnected.'),{code:'CONNECTION_INACTIVE'});
 return latest.data;
}
