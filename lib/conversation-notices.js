// Templates use the database conversation number, never a visitor-provided ID.
const clean=value=>String(value??'').trim();
export function ticketNumber(conversation){const n=clean(conversation?.number);return /^\d{1,19}$/.test(n)?n:null;}
const polish=text=>/[ąćęłńóśźż]|\b(czesc|prosze|numer|ticketu|zgloszeni\w*|przekaz|zespol\w*)\b/i.test(String(text||''));
export function asksTicketNumber(text){const t=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');return /(?:numer|nr\.?|number|id|reference).{0,35}(?:ticket|zgloszeni|spraw|conversation|case)|(?:ticket|zgloszeni|spraw|conversation|case).{0,35}(?:numer|number|\bid\b|reference)/i.test(t);}
export function noticeConfig(input={}){return {ticketIntroEnabled:input.ticketIntroEnabled!==false,ticketIntroTemplate:clean(input.ticketIntroTemplate).slice(0,700),handoffTemplate:clean(input.handoffTemplate).slice(0,700)};}
export function conversationNotice(kind,config,conversation,languageText=''){
 const number=ticketNumber(conversation),pl=polish(languageText),settings=noticeConfig(config);
 if(kind==='intro'&&(!settings.ticketIntroEnabled||!number))return '';
 const defaults={intro:pl?'Cześć! Numer Twojego zgłoszenia to #{ticket_number}. W czym mogę pomóc?':'Hi! Your ticket number is #{ticket_number}. How can I help?',handoff:pl?'Rozmowa została przekazana do zespołu. Numer Twojego zgłoszenia: #{ticket_number}. Pracownik odpowie tutaj.':'Your conversation has been transferred to the team. Your ticket number is #{ticket_number}. A team member will reply here.',number:pl?'Numer Twojego zgłoszenia to #{ticket_number}.':'Your ticket number is #{ticket_number}.'};
 if(!number)return kind==='handoff'?(pl?'Rozmowa została przekazana do zespołu. Pracownik odpowie tutaj.':'Your conversation has been transferred to the team. A team member will reply here.'):(pl?'Numer zgłoszenia jest chwilowo niedostępny.':'The ticket number is temporarily unavailable.');
 let template=(kind==='intro'?settings.ticketIntroTemplate:kind==='handoff'?settings.handoffTemplate:'')||defaults[kind];
 if(!template)return '';
 if(!template.includes('{ticket_number}'))template+=' '+defaults.number;
 return template.replaceAll('{ticket_number}',number).replaceAll('{assistant_name}',clean(config.name)||'Synvio').slice(0,1000);
}
export async function saveConversationNotice(sb,conversation,kind,content){
 if(!content)return;
 const result=await sb.from('flow_messages').insert({conversation_id:conversation.id,role:'assistant',content,request_key:'notice:'+kind+':'+conversation.id});
 if(result.error&&result.error.code!=='23505')throw Object.assign(Error('Conversation notice could not be saved.'),{code:result.error.code});
}
