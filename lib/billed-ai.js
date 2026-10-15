import {createHash} from 'node:crypto';
import {aiRoute,providerRequest,normalizeResponse} from './byok.js';
export class BillingError extends Error{constructor(message,status=503,code='AI_UNAVAILABLE'){super(message);this.status=status;this.code=code;}}
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function requestKey(body,request){const key=request.headers.get('idempotency-key')||body.requestId;if(typeof key!=='string'||!/^[-a-zA-Z0-9_:]{8,160}$/.test(key))throw new BillingError('Send a stable requestId or Idempotency-Key.',400,'REQUEST_ID_REQUIRED');return key;}
const value=r=>{if(r.error)throw new BillingError('Billing operation failed. Check balance or plan limits.',/credit|Payment|limit/i.test(r.error.message)?402:503,'BILLING_FAILED');return r.data;};
export async function billedAI({sb,org,actor,ticket=null,operation,key,payload,fetchImpl=fetch,environment=process.env}){
 const fingerprint=digest({actor,ticket,operation,payload});
 // Replay before balance/key checks. Never regenerate a request already sent with another key/provider.
 for(const table of ['ai_billing_requests','billing_events_v25']){
  const r=await sb.from(table).select('*').eq('organization_id',org).eq(table==='ai_billing_requests'?'request_key':'event_key',key).maybeSingle();
  if(r.error)throw new BillingError('Billing migration is required.');
  if(r.data){if(r.data.fingerprint!==fingerprint||r.data.actor_id!==actor)throw new BillingError('Request ID belongs to another action.',409,'IDEMPOTENCY_CONFLICT');if(r.data.state==='completed')return r.data.result;throw new BillingError(r.data.state==='released'?'The provider rejected this action. Start a new action.':'This request is pending review. Reuse its request ID; do not resend.',409,r.data.state==='released'?'PROVIDER_REJECTED':'REQUEST_PENDING');}
 }
 let route;try{route=await aiRoute(sb,org,environment);}catch{throw new BillingError('AI configuration unavailable. Check BYOK settings and the server encryption key.');}
 if(payload.tools?.length&&(!route.byok||route.provider!=='openai'))throw new BillingError('Web search requires enabled OpenAI BYOK with a compatible model. Disable web search or change the organization provider.',400,'SEARCH_REQUIRES_OPENAI_BYOK');
 let reserve=0,output=Math.min(payload.max_output_tokens||900,1200);
 if(!route.byok){
  let count;try{const r=await fetchImpl('https://api.openai.com/v1/responses/input_tokens',{method:'POST',headers:{Authorization:'Bearer '+route.key,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model:route.model,input:payload.input,instructions:payload.instructions})});if(!r.ok)throw Error();count=(await r.json()).input_tokens;}catch{throw new BillingError('Could not verify the token budget. No generation started.',503,'TOKEN_COUNT_UNAVAILABLE');}
  if(!Number.isSafeInteger(count)||count<0)throw new BillingError('Invalid token estimate.');
  const bound=Math.ceil(count*1.05)+Buffer.byteLength(JSON.stringify(payload.text||{}),'utf8')+128;
  output=Math.min(output,Math.floor((150000-bound*4)/16));if(output<350)throw new BillingError('This request exceeds the $0.15 AI safety budget. Shorten context.',413,'CONTEXT_BUDGET_EXCEEDED');reserve=Math.ceil(bound*4+output*16);
 }else if(Buffer.byteLength(JSON.stringify(payload))>2000000)throw new BillingError('BYOK payload too large.',413,'CONTEXT_BUDGET_EXCEEDED');
 let req;try{req=providerRequest(route,{...payload,max_output_tokens:output});}catch(e){throw new BillingError(e.message,400,'UNSUPPORTED_INPUT');}
 const claim=value(await sb.rpc('billing_reserve_v25',{p_org:org,p_key:key,p_fingerprint:fingerprint,p_kind:'ai',p_amount:reserve,p_actor:actor,p_reference:ticket||key,p_details:{operation,provider:route.provider,model:route.model,byok:route.byok,multiplier:route.byok?0:10}}));
 if(!claim.claimed){if(claim.state==='completed')return claim.result;throw new BillingError('This action is pending.',409,'REQUEST_PENDING');}
 let result;
 try{
  const response=await fetchImpl(req.url,{method:'POST',headers:{...req.headers,'X-Client-Request-Id':claim.id},signal:AbortSignal.timeout(45000),body:JSON.stringify(req.body)});
  if(!response.ok){if(response.status>=400&&response.status<500&&response.status!==408){value(await sb.rpc('billing_settle_v25',{p_org:org,p_key:key,p_amount:0,p_release:true,p_details:{providerStatus:response.status}}));throw new BillingError('Provider rejected the request. Check your key, model and provider balance. No SYNVIO/CORE AI charge.',response.status===429?429:502,'PROVIDER_REJECTED');}throw Error('Unknown outcome');}
  result=normalizeResponse(route.provider,await response.json());
  if(!route.byok&&!/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(result.model||''))throw Error('Unexpected provider model');
  const input=result.usage?.input_tokens,out=result.usage?.output_tokens,cached=result.usage?.input_tokens_details?.cached_tokens||0;
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(out)||out<0||!Number.isSafeInteger(cached)||cached<0||cached>input||!result.id)throw Error('Usage unavailable');
  const actual=route.byok?0:Math.round((input-cached)*4+cached+out*16),amount=Math.min(reserve,actual);
  const settled=value(await sb.rpc('billing_settle_v25',{p_org:org,p_key:key,p_amount:amount,p_result:result,p_details:{inputTokens:input,outputTokens:out,cachedTokens:cached,providerResponseId:result.id,webSearchCalls:(result.output||[]).filter(x=>x.type==='web_search_call').length,uncappedMicroUsd:actual,providerCostMicroUsd:route.byok?null:actual/10}}));
  if(actual>reserve)await sb.from('organization_wallets').update({metering_hold:true}).eq('organization_id',org);
  return settled.result;
 }catch(e){
  if(e instanceof BillingError&&e.code==='PROVIDER_REJECTED')throw e;
  await sb.from('billing_events_v25').update({state:'uncertain',...(result?{result}:{})}).eq('organization_id',org).eq('event_key',key).eq('state','reserved');
  throw new BillingError('Provider delivery is uncertain. Do not resend with a new ID. The owner must reconcile this request; BYOK is never switched to SYNVIO/CORE AI.',503,'RECONCILIATION_REQUIRED');
 }
}
