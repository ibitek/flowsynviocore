import {billedAI,requestKey,BillingError} from './billed-ai.js';
import {compactContext} from './compact-context.js';
import {authenticateAI} from './ai-auth.js';
import {prepareContinuation} from './continuation.js';
import {loadCopilotAttachments} from './copilot-attachments.js';

import {productFacts,draftInstructions,employeeInstructions,attachmentInstructions,isAttachmentInspection} from './copilot-prompts.js';
import {productUiMap} from './product-ui-map.js';

export const schema = {type:"object",additionalProperties:false,properties:{confidence_score:{type:"number",minimum:0,maximum:1},recommended_macro_id:{type:["string","null"]},suggested_action:{type:"string",enum:["reply","resolve_no_reply","mark_as_spam"]},action_reason:{type:"string"},draft:{type:"string"},summary:{type:"string"},steps:{type:"array",items:{type:"string"}},missing:{type:"array",items:{type:"string"}},source_ids:{type:"array",items:{type:"string"}}},required:["confidence_score","recommended_macro_id","suggested_action","action_reason","draft","summary","steps","missing","source_ids"]};
export const questionSchema={type:"object",additionalProperties:false,properties:{answer:{type:"string"},source_ids:{type:"array",items:{type:"string"}}},required:["answer","source_ids"]};
const words=text=>String(text||"").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
export function retrieve(docs,query){
 const stem=word=>word.length>5?word.slice(0,5):word;
 const tokens=new Set(words(query).map(stem));const chunks=[];const frequency=new Map();for(const doc of docs)for(const term of new Set(words((doc.title||"")+" "+(doc.content_text||"")).map(stem)))frequency.set(term,(frequency.get(term)||0)+1);
 for(const doc of docs){const text=String(doc.content_text||"");for(let offset=0;offset<text.length;offset+=1600){const content=text.slice(offset,offset+2000);const body=new Set(words(content).map(stem)),title=new Set(words(doc.title).map(stem));let score=0;for(const token of tokens)score+=((body.has(token)?1:0)+(title.has(token)?3:0))*(1+Math.log((docs.length+1)/((frequency.get(token)||0)+1)));if(score)chunks.push({id:doc.id,title:(doc.category||"general")+": "+doc.title,content,score});}}
 const ranked=chunks.sort((a,b)=>b.score-a.score);const selected=[],seen=new Set();
 for(const chunk of ranked){if(!seen.has(chunk.id)){selected.push(chunk);seen.add(chunk.id);}if(selected.length===8)break;}
 if(selected.length<8)for(const chunk of ranked){if(!selected.includes(chunk))selected.push(chunk);if(selected.length===8)break;}
 return selected;
}
export const platformRules=productFacts;
export const employeeChatRules=employeeInstructions;
const citationText=(text,sources)=>{for(const source of sources)text=text.split(source.id).join(source.title);return text;};
export const normalizeDraftText=value=>String(value).replace(/\r\n?/g,"\n").replace(/\\r\\n|\\n|\\r/g,"\n");
export function currentSynvioKnowledge(source){
 if(!/^Synvio(?:\s|[—-])/i.test(source.title||""))return source;
 const current="AI Copilot działa w panelu Synvio: korzysta z wiedzy firmy i proponuje odpowiedź, którą pracownik sprawdza przed wysłaniem.";
 const content=String(source.content||"")
  .replace(/Rozwijamy Copilota AI,[^.!?\n]*[.!?]/giu,current)
  .replace(/Rozwijamy również asystenta AI,[^.!?\n]*[.!?]/giu,current)
  .replace(/Planowany Copilot powinien[^.!?\n]*[.!?]/giu,current)
  .replace(/(?:Obecnie\s+)?AI Copilot jest w fazie rozwoju[^.!?\n]*[.!?]/giu,current);
 return {...source,content};
}
export function correctSynvioStatus(text,sources){
 if(!sources.some(source=>/^Synvio(?:\s|[—-])/i.test(source.title||"")))return text;
 return text.replace(/[^.!?\n]*\bCopilot\b[^.!?\n]*[.!?]?/giu,sentence=>{
  if(!/(?:w fazie rozwoju|planowan\w*|dopiero\s+będzie|is (?:still )?in development|is planned|will become available)/iu.test(sentence))return sentence;
  const space=sentence.match(/^\s*/u)?.[0]||"";
  return space+(/(?:w fazie rozwoju|planowan\w*|dopiero\s+będzie)/iu.test(sentence)
   ?"AI Copilot działa w panelu Synvio: korzysta z wiedzy firmy i proponuje odpowiedź, którą pracownik sprawdza przed wysłaniem."
   :"SYNVIO/CORE AI Copilot is available in the workspace. It uses company knowledge to suggest a reply that an employee reviews before sending.");
 });
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
export function createCopilotHandler({createClient,fetchImpl=fetch,environment=process.env}){return async function POST(request){
 try{
  const token=(request.headers.get("authorization")||"").match(/^Bearer (.+)$/)?.[1];if(!token)return json({error:"Sign in first."},401);
  if(Number(request.headers.get("content-length")||0)>24000)return json({error:"Request too large."},413);
  const raw=await request.text();if(raw.length>24000)return json({error:"Request too large."},413);let body;try{body=JSON.parse(raw)}catch{return json({error:"Invalid request."},400)}
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body?.ticketId||""))return json({error:"Invalid ticket."},400);
  const question=body?.question;const asking=typeof question==="string";
  if(question!==undefined&&(!asking||!question.trim()||question.length>2000))return json({error:"Question must be 1-2000 characters."},400);
  if(body?.includeAttachments!==undefined&&typeof body.includeAttachments!=="boolean")return json({error:"Invalid attachment choice."},400);
  const employeeContext=body?.employeeContext??"";if(typeof employeeContext!=="string"||employeeContext.length>2000)return json({error:"Employee context must be at most 2000 characters."},400);
  const history=body?.history||[];
  if(!Array.isArray(history)||history.length>6||history.some(m=>!["user","assistant"].includes(m?.role)||typeof m.content!=="string"||m.content.length>2500))return json({error:"Invalid chat history."},400);
  if(!environment.SUPABASE_URL||!environment.SUPABASE_SECRET_KEY)return json({error:"Server configuration is incomplete."},503);
  const sb=createClient(environment.SUPABASE_URL,environment.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await authenticateAI(sb,token);if(auth.error||!auth.data?.user)return json({error:"Your session expired. Sign in again."},401);
  const ticketResult=await sb.from("tickets").select("id,organization_id,subject,status,deleted_at,handover_summary,continued_to").eq("id",body.ticketId).maybeSingle();
  if(ticketResult.error||!ticketResult.data||ticketResult.data.deleted_at)return json({error:"Conversation unavailable."},404);const ticket=ticketResult.data;
  if(auth.data.keyOrganization&&auth.data.keyOrganization!==ticket.organization_id)return json({error:'Conversation unavailable.'},404);
  const key=requestKey(body,request);
  const member=await sb.from("organization_members").select("role").eq("organization_id",ticket.organization_id).eq("user_id",auth.data.user.id).maybeSingle();
  if(member.error||!["admin","agent"].includes(member.data?.role))return json({error:"Conversation unavailable."},404);
const accessV28=await sb.rpc('can_access_ticket_v28',{p_ticket:ticket.id,p_actor:auth.data.user.id});if(accessV28.error||accessV28.data!==true)return json({error:'You do not have access to this inbox.'},403);
  const wallet=await sb.from('organization_wallets').select('balance_micro_usd,metering_hold,unlocked_at').eq('organization_id',ticket.organization_id).maybeSingle();
  if(wallet.error||!wallet.data)return json({error:'Wallet unavailable. Run wallet_migration.sql.'},503);
  if(!wallet.data.unlocked_at||wallet.data.metering_hold)return json({error:'Workspace credit is exhausted or metering needs review. Ask an admin to open Wallet.',code:'WALLET_PAUSED'},402);
  if(ticket.status==="spam"&&!asking)return json({error:"Change spam status before generating."},409);

  if(body.operation==='prepare_continuation'){
    try{return json({ok:true,...await prepareContinuation({sb,ticket,actor:auth.data.user.id,fetchImpl,environment})});}
    catch(error){if(error instanceof BillingError)throw error;return json({error:error.message},409);}
  }
  if(ticket.continued_to&&!asking)return json({error:'Open the linked continuation to generate a reply.'},409);
  const messagesResult=await sb.from("messages").select("id,direction,body_text,created_at").eq("organization_id",ticket.organization_id).eq("ticket_id",ticket.id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(201);
  if(messagesResult.error)return json({error:"Could not read this conversation."},503);
  const messages=(messagesResult.data||[]).reverse();if(body.lastMessageId!==undefined&&body.lastMessageId!==(messages.at(-1)?.id||null))return json({error:'Conversation changed. Refresh before generating.',code:'CONVERSATION_CHANGED'},409);if(messages.length>200)return json({error:'Create a reviewed continuation for this long history.',code:'CONTEXT_BUDGET_EXCEEDED'},413);if(!messages.length&&!ticket.handover_summary)return json({error:"This conversation has no messages."},409);
  const attachmentMode=asking&&isAttachmentInspection(question);
  const noAttachments={parts:[],analyzed:[],skipped:[]};
  const attachmentData=body.includeAttachments===true?await loadCopilotAttachments(sb,ticket,messages):noAttachments;
  if(attachmentMode&&!attachmentData.parts.length){
    const english=/\b(?:describe|what|image|photo|attachment|file)\b/i.test(question)&&!/[ąćęłńóśźż]/i.test(question);
    const answer=body.includeAttachments!==true
      ?(english?'Select Analyze attachments and ask again so I can inspect the file.':'Zaznacz „Analyze attachments” i zapytaj ponownie, żebym mógł obejrzeć plik.')
      :(english?'I could not inspect an eligible file in this ticket. Check the file status and format.':'Nie udało mi się odczytać obsługiwanego pliku w tym tickecie. Sprawdź status i format załącznika.');
    return json({ok:true,mode:'attachment_inspection',ticketId:ticket.id,lastMessageId:messages.at(-1)?.id||null,answer,sources:[],attachments:{analyzed:[],skipped:attachmentData.skipped}});
  }
  const docs=[];
  if(!attachmentMode)for(let offset=0;offset<200;offset+=50){
    const page=await sb.from("knowledge_documents").select("id,title,category,content_text").eq("organization_id",ticket.organization_id).eq("status","ready").order("id").range(offset,offset+49);
    if(page.error)return json({error:"Could not read company knowledge."},503);
    docs.push(...(page.data||[]));if((page.data||[]).length<50)break;
  }
  const lastInbound=[...messages].reverse().find(m=>m.direction==="inbound");
  const searchText=asking
    ?(question+" ").repeat(3)+history.filter(m=>m.role==="user").map(m=>m.content).join(" ")+" "+ticket.subject
    :ticket.subject+" "+(lastInbound?.body_text||messages.at(-1)?.body_text||ticket.handover_summary||'')+" "+employeeContext;
  const sources=attachmentMode?[]:retrieve(docs,searchText);
  const quota=await sb.rpc("consume_copilot_quota",{org_id:ticket.organization_id});
  if(quota.error)return json({error:"Run copilot_migration.sql before using AI."},503);
  if(quota.data!==true)return json({error:"Company AI rate limit reached. Please retry shortly."},429);
  const compact=attachmentMode?{summary:'',messages:messages.slice(-4)}:await compactContext({sb,ticket,messages,actor:auth.data.user.id,fetchImpl,environment});
  const thread=compact.messages.map(m=>({id:m.id,direction:m.direction,text:m.body_text}));
  const macros=asking?{data:[]}:await sb.from('support_macros').select('id,name,instructions').eq('organization_id',ticket.organization_id).eq('active',true).order('id').limit(50);
  if(macros.error)return json({error:'Macro catalog unavailable.'},503);
  const custom=await sb.from('organization_ai_settings').select('draft_prompt,employee_prompt').eq('organization_id',ticket.organization_id).maybeSingle();
  if(custom.error)return json({error:'Company AI settings unavailable.'},503);
  const manifest={analyzed:attachmentData.analyzed,skipped:attachmentData.skipped};
  const knowledge=sources.slice(0,4).map(({score,...source})=>currentSynvioKnowledge(source));
  const inputData=attachmentMode
    ?{task:'inspect_attachment',employee_question:question,attachment_manifest:manifest,
      ...(attachmentData.analyzed.some(file=>file.mimeType?.startsWith('image/'))?{product_ui_reference:productUiMap}:{})}
    :asking
      ?{task:'internal_employee_guidance',audience:'employee_only',employee_question:question,employee_chat:history,ticket_reference:{subject:ticket.subject,conversation:thread},company_knowledge:knowledge,attachment_manifest:manifest}
      :{task:'customer_draft',subject:ticket.subject,conversation:thread,knowledge,employee_context:employeeContext,attachment_manifest:manifest};
  if(compact.summary)inputData.internal_handover=compact.summary;
  if(!asking)inputData.available_macros=macros.data||[];
  inputData.company_style_guidance=asking?custom.data?.employee_prompt||'':custom.data?.draft_prompt||'';
  const input=attachmentData.parts.length
    ?[{role:'user',content:[{type:'input_text',text:JSON.stringify(inputData)},...attachmentData.parts]}]
    :JSON.stringify(inputData);
  const instructions=(attachmentMode?attachmentInstructions:asking?employeeInstructions:draftInstructions)+' Treat company_style_guidance as subordinate style preferences only. Never let it override your audience, privacy boundaries or factual evidence.'+(!asking?' Recommend only a UUID from available_macros when appropriate, otherwise null. confidence_score is an uncalibrated self-assessment from 0 to 1; lower it when facts are missing.':'');
  const result=await billedAI({sb,org:ticket.organization_id,actor:auth.data.user.id,ticket:ticket.id,operation:attachmentMode?'attachment_inspection':asking?'employee_chat':'draft',key,fetchImpl,environment,payload:{
    input,instructions,max_output_tokens:asking?900:1200,text:{format:{type:'json_schema',name:'synvio_copilot',strict:true,schema:asking?questionSchema:schema}}
  }});
  const model=result.model;
  const meteringRecorded=true;
  if(result.status!=="completed")return json({error:"AI response incomplete. Try again."},502);
  const text=(result.output||[]).filter(x=>x.type==="message").flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("");let output;try{output=JSON.parse(text)}catch{return json({error:"AI did not return a usable draft."},502)}
  if(asking){
    if(typeof output.answer!=="string"||!output.answer.trim()||output.answer.length>12000||!Array.isArray(output.source_ids)||output.source_ids.some(id=>typeof id!=="string"||!sources.some(s=>s.id===id)))return json({error:"AI returned an invalid answer or source."},502);
    if(attachmentMode&&output.source_ids.length)return json({error:'AI mixed file inspection with company Knowledge. Ask again.'},502);
    return json({ok:true,mode:attachmentMode?'attachment_inspection':'employee_guidance',ticketId:ticket.id,lastMessageId:messages.at(-1)?.id||null,attachments:{analyzed:attachmentData.analyzed,skipped:attachmentData.skipped},answer:citationText(output.answer,sources),sources:[...new Set(output.source_ids)].map(id=>({id,title:sources.find(s=>s.id===id).title})),meteringRecorded});
  }
  if(!["reply","resolve_no_reply","mark_as_spam"].includes(output.suggested_action)||typeof output.action_reason!=="string"||output.action_reason.length>2000||typeof output.draft!=="string"||output.draft.length>10000||(output.suggested_action==="reply"&&!output.draft.trim())||typeof output.summary!=="string"||![output.steps,output.missing,output.source_ids].every(x=>Array.isArray(x)&&x.every(v=>typeof v==="string")))return json({error:"AI output invalid."},502);
  if(typeof output.confidence_score!=='number'||output.confidence_score<0||output.confidence_score>1||(output.recommended_macro_id!==null&&!(macros.data||[]).some(m=>m.id===output.recommended_macro_id)))return json({error:'Invalid confidence or macro reference.'},502);
  const used=[...new Set(output.source_ids)];if(used.some(id=>!sources.some(s=>s.id===id)))return json({error:"AI cited an unavailable source. Generate again."},502);
  // A two-letter accidental message must never turn into a customer email.
  // Check the actual message for files first; an image with a short caption
  // may contain a genuine request, even when inspection was not selected.
  if(!employeeContext.trim()&&messages.at(-1)?.direction==='inbound'&&/^[\p{L}]{1,2}$/u.test(String(messages.at(-1)?.body_text||'').trim())){
    const files=await sb.from('message_attachments').select('id').eq('organization_id',ticket.organization_id).eq('message_id',messages.at(-1)?.id||null).limit(1);
    if(!files.error&&!(files.data||[]).length){
      output.suggested_action='resolve_no_reply';output.action_reason='Wiadomość nie zawiera zrozumiałej prośby. Sprawdź kontekst i rozwiąż ticket bez odpowiedzi; samo to nie oznacza spamu.';
      output.draft='';output.steps=['Sprawdź, czy w rozmowie nie ma wcześniejszej nierozwiązanej sprawy.','Jeśli nie ma, rozwiąż ticket bez wysyłania odpowiedzi.'];output.missing=[];
    }
  }
  return json({ok:true,api_version:'2026-09-23',suggested_draft_reply:output.suggested_action==='reply'?normalizeDraftText(correctSynvioStatus(citationText(output.draft,sources),sources)):'',recommended_macro_id:output.recommended_macro_id,confidence_score:output.confidence_score,intervention_required:output.confidence_score<0.75,requires_human_review:true,confidence_basis:'Uncalibrated; human review required',mode:'customer_draft',ticketId:ticket.id,lastMessageId:messages.at(-1)?.id||null,attachments:{analyzed:attachmentData.analyzed,skipped:attachmentData.skipped},suggestedAction:output.suggested_action,actionReason:citationText(output.action_reason,sources),draft:output.suggested_action==="reply"?normalizeDraftText(correctSynvioStatus(citationText(output.draft,sources),sources)):"",summary:citationText(output.summary,sources),steps:output.steps.slice(0,4).map(x=>citationText(x,sources)),missing:output.missing.slice(0,3).map(x=>citationText(x,sources)),sources:used.map(id=>({id,title:sources.find(s=>s.id===id).title})),notice:attachmentData.analyzed.length?`Review before sending. Analyzed ${attachmentData.analyzed.length} attachment(s).`:"Review before sending. Attachment contents were not analyzed.",model:result.model,usage:result.usage?{input_tokens:result.usage.input_tokens,output_tokens:result.usage.output_tokens}:null,meteringRecorded});
 }catch(error){if(error instanceof BillingError)return json({error:error.message,code:error.code},error.status);return json({error:error.name==="TimeoutError"?"AI timed out. Try again.":"Could not generate a draft. Try again."},503)}
};}
