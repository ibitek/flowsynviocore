import {createHash} from 'node:crypto';
export class BillingError extends Error{constructor(message,status=503,code='AI_UNAVAILABLE'){super(message);this.status=status;this.code=code;}}
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function requestKey(body,request){
 const key=request.headers.get('idempotency-key')||body.requestId;
 if(typeof key!=='string'||!/^[-a-zA-Z0-9_:]{8,160}$/.test(key))throw new BillingError('Send a stable requestId or Idempotency-Key. Reuse it when retrying the same action.',400,'REQUEST_ID_REQUIRED');
 return key;
}
export async function billedAI({sb,org,actor,ticket=null,operation,key,payload,fetchImpl=fetch,environment=process.env}){
 const model='gpt-4.1-mini';
 const {data:active,error:gateError}=await sb.rpc('synvio_wallet_active',{p_org:org});
 if(gateError)throw new BillingError('Wallet verification unavailable.');
 if(!active)throw new BillingError('Payment required. An admin must unlock and fund this workspace.',402,'PAYMENT_REQUIRED');
 const fingerprint=digest({actor,ticket,operation,payload});
 // A response lost between server and browser is replayed, never regenerated.
 const existing=await sb.from('ai_billing_requests').select('id,fingerprint,state,result,actor_id').eq('organization_id',org).eq('request_key',key).maybeSingle();
 if(existing.error)throw new BillingError('Billing migration is required.');
 if(existing.data){
  if(existing.data.fingerprint!==fingerprint||existing.data.actor_id!==actor)throw new BillingError('This request ID belongs to a different action. Start a new action.',409,'IDEMPOTENCY_CONFLICT');
  if(existing.data.state==='completed')return existing.data.result;
  throw new BillingError(existing.data.state==='released'?'The provider rejected this action. Start a new action to retry.':'This action is processing or awaiting reconciliation. Do not submit it under a new ID.',409,existing.data.state==='released'?'PROVIDER_REJECTED':'REQUEST_PENDING');
 }
 const headers={Authorization:'Bearer '+environment.OPENAI_API_KEY,'Content-Type':'application/json'};
 let count;
 try{
  const response=await fetchImpl('https://api.openai.com/v1/responses/input_tokens',{method:'POST',headers,signal:AbortSignal.timeout(20000),body:JSON.stringify({model,input:payload.input,instructions:payload.instructions})});
  if(!response.ok)throw Error('count unavailable');count=(await response.json()).input_tokens;
 }catch{throw new BillingError('Could not verify the token budget. No generation was started.',503,'TOKEN_COUNT_UNAVAILABLE');}
 if(!Number.isSafeInteger(count)||count<0)throw new BillingError('Invalid token estimate; generation stopped.');
 const schemaBound=Buffer.byteLength(JSON.stringify(payload.text||{}),'utf8');
 const bound=Math.ceil(count*1.05)+schemaBound+128;
 let output=Math.min(payload.max_output_tokens||900,1200);
 // Reserve standard input rates even if OpenAI later reports a cache discount.
 const cap=150000;
 output=Math.min(output,Math.floor((cap-bound*6.4)/25.6));
 if(output<350)throw new BillingError('This request exceeds the $0.15 safety budget. Shorten the question, select fewer files, or create a reviewed continuation.',413,'CONTEXT_BUDGET_EXCEEDED');
 const reserve=Math.ceil(bound*6.4+output*25.6);
 const claim=await sb.rpc('reserve_ai_call',{p_org:org,p_actor:actor,p_ticket:ticket,p_operation:operation,p_key:key,p_fingerprint:fingerprint,p_reserve:reserve});
 if(claim.error)throw new BillingError(claim.error.message,/credit|Payment/i.test(claim.error.message)?402:409,'RESERVATION_FAILED');
 if(!claim.data.claimed){if(claim.data.state==='completed')return claim.data.result;throw new BillingError('The same request is already processing.',409,'REQUEST_PENDING');}
 const id=claim.data.id;
 const start=await sb.rpc('start_ai_call',{p_id:id});
 if(start.error||start.data!==true)throw new BillingError('Request reserved but not started. Reuse this request ID; administrator review may be needed.',503,'REQUEST_PENDING');
 let response,result;
 try{
  response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{...headers,'X-Client-Request-Id':id},signal:AbortSignal.timeout(45000),body:JSON.stringify({...payload,model,store:false,max_output_tokens:output})});
  if(!response.ok){
   if(response.status>=400&&response.status<500){const released=await sb.rpc('release_ai_call',{p_id:id,p_rejected:true});if(released.error)throw Error('Reservation release failed');throw new BillingError('The provider rejected the action. Credit reservation was released.',response.status===429?429:502,'PROVIDER_REJECTED');}
   throw Error('Unknown provider outcome');
  }
  result=await response.json();
  const settled=await sb.rpc('settle_ai_call',{p_id:id,p_result:result});
  if(settled.error)throw Error('Settlement failed');
  return settled.data;
 }catch(error){
  if(error instanceof BillingError)throw error;
  await sb.from('ai_billing_requests').update({state:'uncertain',...(result?{result,provider_response_id:result.id||null}:{})}).eq('id',id).neq('state','completed');
  console.warn('AI request requires reconciliation',{requestId:id,responseId:result?.id||null});
  throw new BillingError('Provider delivery or billing is uncertain. Credit remains reserved for review. Reuse the same request ID; do not submit this action again.',503,'RECONCILIATION_REQUIRED');
 }
}
