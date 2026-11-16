(()=>{
 let panel,current,version=0;
 const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 async function request(ctx,action,body){
  const {data}=await ctx.sb.auth.getSession();if(!data.session)throw Error('Sign in first.');
  const url=new URL('https://app.synviocore.xyz/api/integrations/whatsapp/'+action);
  if(!body)url.searchParams.set('botId',ctx.botId);
  const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+data.session.access_token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify({botId:ctx.botId,...body})}:{})});
  const result=await r.json();if(!r.ok)throw Error(result.error||'WhatsApp is unavailable.');return result;
 }
 async function load(ctx,ticket){
  panel.replaceChildren(node('h3','WhatsApp'),node('p','Checking connection…'));
  try{
   const status=await request(ctx,'status');if(ticket!==version)return;
   panel.replaceChildren(node('h3','WhatsApp'));
   const message=node('p');message.setAttribute('role','status');panel.append(message);
   const run=async(button,action)=>{button.disabled=true;message.textContent='Working…';try{await action();if(ticket===version)await load(ctx,ticket);}catch(e){if(ticket===version)message.textContent=e.message;}finally{button.disabled=false;}};
   const button=(label,action)=>{const b=node('button',label);b.type='button';b.onclick=()=>run(b,action);return b;};
   const connection=status.connections[0];
   if(connection){
    message.textContent='Connected: '+(connection.verified_name||'WhatsApp')+' · '+connection.display_phone_number;
    panel.append(node('p',connection.automation==='all'?'AI may answer new conversations automatically.':'Automatic replies are off. New messages go to Inbox; approve AI per conversation.'));
    panel.append(button(connection.automation==='all'?'Turn off automatic replies':'Enable automatic replies',async()=>{
     const all=connection.automation!=='all';if(!confirm(all?'Allow AI to answer ALL new conversations on this number? Use this only for a dedicated support number.':'Turn off automatic replies for new conversations?'))return;
     await request(ctx,'automation',{connectionId:connection.id,automation:all?'all':'manual',confirmed:true});
    }),button('Disconnect',async()=>{if(confirm('Disconnect this number from Synvio?'))await request(ctx,'disconnect',{connectionId:connection.id});}));
   }else{
    message.textContent='No WhatsApp number connected.';
    panel.append(node('p','Use a registered Cloud API number. Your personal WhatsApp account is not moved or changed here.'));
    if(!status.workspaceConnected)panel.append(node('p','Connect Workspace below first. Automatic replies start switched off.'));
    if(status.manualSetup){
     const details=node('details'),summary=node('summary','Administrator setup');details.append(summary,node('p','Use IDs and an access token from the same Meta app. The token is encrypted on the server and is never returned.'));
     const inputs={};for(const [name,label,type] of [['wabaId','WhatsApp account ID','text'],['phoneNumberId','Phone number ID','text'],['token','Access token','password']]){const wrap=node('label',label),input=node('input');input.type=type;input.autocomplete='off';input.maxLength=name==='token'?4096:40;wrap.append(input);details.append(wrap);inputs[name]=input;}
     const connect=button('Connect number',async()=>{const body=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value.trim()]));body.confirmed=true;try{await request(ctx,'connect',body);}finally{inputs.token.value='';}});connect.disabled=!status.workspaceConnected;details.append(connect);panel.append(details);
    }
    panel.append(node('p','Self-service Facebook signup is awaiting Meta provider setup. Administrator setup is for the initial connection.'));
   }
   panel.append(button('Refresh status',async()=>{}),node('p','After connecting, publish this assistant and send a new message from a different WhatsApp account. Standard replies are available for 24 hours after a customer message.'));
  }catch(e){if(ticket===version)panel.replaceChildren(node('h3','WhatsApp'),node('p',e.message));}
 }
 window.SynvioWhatsApp={mount(ctx){
  if(!panel){panel=node('div');panel.id='whatsapp-connection';panel.className='instagram-connection';ctx.parent.before(panel);}
  panel.hidden=!ctx.visible;if(!ctx.visible){current=null;version++;return;}
  if(!ctx.botId||current===ctx.botId)return;current=ctx.botId;void load(ctx,++version);
 }};
})();
