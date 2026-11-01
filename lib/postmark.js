import {createHmac,timingSafeEqual} from 'node:crypto';

export class PostmarkError extends Error {
  constructor(message,status=503,uncertain=false){super(message);this.status=status;this.uncertain=uncertain;}
}
export async function postmark(path,{token,account=false,method='GET',body,fetchImpl=fetch}={}){
  if(!token)throw new PostmarkError('Postmark credentials are missing. Ask the platform owner to check Vercel.');
  let response;
  try {response=await fetchImpl('https://api.postmarkapp.com'+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',[account?'X-Postmark-Account-Token':'X-Postmark-Server-Token']:token},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});}
  catch {throw new PostmarkError('Postmark did not confirm the request. Refresh status before trying again.',503,method!=='GET');}
  const data=await response.json().catch(()=>null);
  if(response.status>=500||!data)throw new PostmarkError('Postmark is temporarily unavailable. The request may have been processed.',503,method!=='GET');
  if(!response.ok||data.ErrorCode){
    const message=response.status===401?'Postmark rejected the API token. Check its type and permissions.':response.status===429?'Postmark rate limit reached. Wait and retry.':/limit|maximum/i.test(data.Message||'')?'Your Postmark account limit was reached. Check its domains, servers and message allowance.':/pending|approved|test mode|recipient/i.test(data.Message||'')?'Postmark restricted this action. Check account approval, test-mode recipients and sending allowance.':'Postmark rejected the request. Check domain verification and account configuration.';
    throw new PostmarkError(message,response.status===429?429:502);
  }
  return data;
}
export function hookPassword(org,environment=process.env){
  const secret=environment.POSTMARK_WEBHOOK_SECRET||environment.POSTMARK_ACCOUNT_TOKEN;
  if(!secret)throw new PostmarkError('Postmark account token is missing.');
  return createHmac('sha256',secret).update('synvio-postmark-inbound-v1:'+org).digest('hex');
}
export function hookUrl(org,environment=process.env){
  const url=new URL(environment.SYNVIO_PUBLIC_APP_URL||'');
  if(url.protocol!=='https:'||url.username||url.password)throw new PostmarkError('Set SYNVIO_PUBLIC_APP_URL to the HTTPS application address.');
  url.pathname='/api/resend-inbound';url.search='';url.hash='';
  url.username=org;url.password=hookPassword(org,environment);return url.href;
}
export function authenticatedHook(request,environment=process.env){
  const value=request.headers.get('authorization')||'';
  if(!value.startsWith('Basic '))return null;
  const decoded=Buffer.from(value.slice(6),'base64').toString();
  const colon=decoded.indexOf(':');const org=decoded.slice(0,colon),password=decoded.slice(colon+1);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org))return null;
  const expected=Buffer.from(hookPassword(org,environment)),actual=Buffer.from(password);
  return actual.length===expected.length&&timingSafeEqual(actual,expected)?org:null;
}
export async function companyServer(sb,org,email,environment=process.env,fetchImpl=fetch){
  const setup=await sb.from('postmark_inbox_setups').select('server_id,state,email_address').eq('organization_id',org).eq('email_address',email).single();
  if(setup.error||!setup.data?.server_id||setup.data.state!=='connected')throw new PostmarkError('Connect your Postmark inbox in Inbox setup first.',409);
  const server=await postmark('/servers/'+setup.data.server_id,{token:environment.POSTMARK_ACCOUNT_TOKEN,account:true,fetchImpl});
  if(!server.ApiTokens?.[0])throw new PostmarkError('The Postmark server has no active API token.');
  return {token:server.ApiTokens[0],email:setup.data.email_address};
}
export async function sendEmail(options,{token=process.env.POSTMARK_SERVER_TOKEN,fetchImpl=fetch}={}){
  const headers=Object.entries(options.headers||{}).map(([Name,Value])=>({Name,Value}));
  const data=await postmark('/email',{token,method:'POST',fetchImpl,body:{From:options.from,To:Array.isArray(options.to)?options.to.join(','):options.to,Subject:options.subject,TextBody:options.text,MessageStream:'outbound',TrackOpens:false,TrackLinks:'None',...(options.replyTo?{ReplyTo:options.replyTo}:{}),...(headers.length?{Headers:headers}:{}),...(options.attachments?.length?{Attachments:options.attachments}:{}),...(options.metadata?{Metadata:options.metadata}:{})}});
  if(!data.MessageID)throw new PostmarkError('Postmark did not confirm a message ID. Do not resend automatically.',503,true);
  return {data:{id:data.MessageID},error:null};
}
