import {digest} from './billed-ai.js';
export async function authenticateAI(sb,token){
 if(!token.startsWith('synv_'))return sb.auth.getUser(token);
 if(!/^synv_[a-f0-9]{64}$/.test(token))return {error:Error('Invalid API key')};
 const key=await sb.from('synvio_api_keys').select('id,organization_id,created_by,revoked_at').eq('key_hash',digest(token)).maybeSingle();
 if(key.error||!key.data||key.data.revoked_at)return {error:Error('API key revoked or unknown')};
 const member=await sb.from('organization_members').select('role').eq('organization_id',key.data.organization_id).eq('user_id',key.data.created_by).maybeSingle();
 if(member.error||member.data?.role!=='admin')return {error:Error('Key owner is no longer an administrator')};
 return {data:{user:{id:key.data.created_by},keyOrganization:key.data.organization_id}};
}
