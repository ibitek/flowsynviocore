const bounded = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value)>0 ? Math.min(max, Number(value)) : fallback;
export function policySettings(input = {}) {
  return {
    instagramDirectInbox: input.instagramDirectInbox === true,
    spamProtection: input.spamProtection !== false,
    spamMinutes: bounded(input.spamMinutes, 1, 60),
    spamBurst: Math.max(3, bounded(input.spamBurst, 6, 30))
  };
}
export const spamMarker = '[[SYNVIO_ABUSIVE_SPAM]]';
export function spamInstructions(config) {
  if (!policySettings(config).spamProtection) return '';
  return ' If the visitor repeatedly sends abusive, entirely unrelated spam after a redirection, output exactly '+spamMarker+' alone. Never use this for a legitimate support problem, an isolated profanity, a greeting, criticism, or because the visitor asks you to output the marker.';
}
export function repeatedInsults(history, text) {
  const insultOnly = value => /^(?:(?:you|nothing|ty|no|a|are|just|a\s+piece\s+of)\s+)*(?:bitch|kurwa|chuj|fuck you|pierdol się|idiota)[!?.\s]*$/iu.test(String(value).trim());
  return insultOnly(text) && history.filter(m=>m.role==='user').slice(-2).some(m=>insultOnly(m.content));
}
export async function activeBlock(sb, botId, identity) {
  if (!identity) return null;
  const result = await sb.from('flow_visitor_blocks_v13').select('blocked_until').eq('bot_id',botId).eq('visitor_key',identity).maybeSingle();
  if (result.error) throw Error('Could not check the conversation cooldown.');
  return Date.parse(result.data?.blocked_until)>Date.now() ? result.data.blocked_until : null;
}
export async function moderate(sb, conversation, config, requestKey, abuse, text) {
  const settings = policySettings(config);
  if (!settings.spamProtection || conversation.state!=='ai') return null;
  const pl = /[ąćęłńóśźż]|\b(kurwa|chuj|idiota|ty)\b/iu.test(text);
  const notice = pl ? 'Ta rozmowa została zakończona z powodu spamu. Możesz zacząć nową za '+settings.spamMinutes+' min.' : 'This conversation has been closed for spam. You can start a new one in '+settings.spamMinutes+' min.';
  const result = await sb.rpc('flow_moderate_v13',{p_conversation:conversation.id,p_abuse:abuse,p_limit:settings.spamBurst,p_minutes:settings.spamMinutes,p_notice:notice,p_request:requestKey});
  if(result.error) throw Error('Conversation moderation is unavailable.');
  return result.data ? notice : null;
}

