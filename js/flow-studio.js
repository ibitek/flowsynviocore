(()=>{
 const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)],sb=window.synvioSupabase;
 let bots=[],bot=null,c={},widget=null,testWidget=null,dirty=false;
 const notice=t=>$('#notice').textContent=t;
 async function call(body){const {data}=await sb.auth.getSession();if(!data.session){location.href='/login.html?next=/';throw Error('Sign in first.');}let response;
  try{response=await fetch('/api/flow',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});}catch{throw Object.assign(Error('Connection lost. Retry the same action.'),{code:'NETWORK'});}
  const r=await response.json();if(!response.ok)throw Object.assign(Error(r.error||'Request failed'),{code:r.code});return r;
 }
 const action=(name,extra={})=>call({action:name,botId:bot?.id,revision:bot?.revision,...extra});
 async function guarded(fn){notice('');try{await fn();}catch(e){notice(e.message);}}
 function dirtyState(){dirty=true;$('#save-state').textContent='Unsaved changes';}
 function fill(){c=structuredClone(bot.draft);dirty=false;$('#secret-box').hidden=true;$('#secret').value='';$('#save-state').textContent='Draft saved';all('[data-config]').forEach(x=>{if(x.type==='checkbox')x.checked=!!c[x.dataset.config];else x.value=c[x.dataset.config]??'';});$('#cards').value=(c.cards||[]).map(x=>x.title+' | '+x.text).join('\n');
  $('#connection-state').textContent=bot.connected?'Connected to your company':'Not connected';$('#connect').textContent=bot.connected?'Disconnect':'Connect Workspace';
  all('[data-config="mode"] option').forEach(x=>x.disabled=x.value!=='ai'&&!bot.connected);$('#live-state').textContent=bot.published?'Live · published version':'Offline';
  const target=c.format==='inline'?' data-target="#synvio-chat"':'';
  $('#embed').value=(c.format==='inline'?'<div id="synvio-chat"></div>\n':'')+`<script src="${location.origin}/js/flow-widget.js" data-bot="${bot.id}"${target} defer><\/script>`;
  widget?.destroy();widget=new SynvioFlowWidget({mount:$('#stage'),config:c,designer:true,onMove:cfg=>{c={...cfg};dirtyState();for(const key of ['wx','wy','lx','ly'])$('[data-config="'+key+'"]').value=c[key];},call:async()=>{throw Error('Use Test bot above for a real conversation.');}});outputs();
 }
 function outputs(){all('[data-output]').forEach(x=>x.textContent=Math.round(c[x.dataset.output])+' px');}
 async function load(id){const r=await call({action:'list'});if(r.role!=='admin')throw Error('Only administrators can edit bots. Open Workspace chats to answer visitors.');bots=r.bots;
  if(!bots.length){const created=await call({action:'create'});bots=[created.bot];}
  $('#bots').replaceChildren(...bots.map(b=>new Option(b.name,b.id)));bot=bots.find(b=>b.id===id)||bots[0];$('#bots').value=bot.id;fill();
 }
 async function save(){const r=await action('save',{config:c});bot=r.bot;fill();notice('Draft saved. Publish when ready to update the live bot.');}
 all('[data-config]').forEach(x=>x.addEventListener('input',()=>{c[x.dataset.config]=x.type==='checkbox'?x.checked:['range','number'].includes(x.type)?Number(x.value):x.value;dirtyState();widget?.update(c);outputs();}));
 $('#cards').oninput=()=>{c.cards=$('#cards').value.split('\n').filter(Boolean).slice(0,6).map(x=>{const [title,...rest]=x.split('|');return {title:title.trim(),text:rest.join('|').trim()};});dirtyState();widget.update(c);};
 all('[data-page]').forEach(b=>b.onclick=()=>{all('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.page);all('[data-page]').forEach(n=>n.classList.toggle('selected',n===b));$('#title').textContent=b.textContent.slice(2);if(b.dataset.page==='publish')guarded(keys);widget?.position();});
 all('[data-tab]').forEach(b=>b.onclick=()=>{all('[data-options]').forEach(p=>p.hidden=p.dataset.options!==b.dataset.tab);all('[data-tab]').forEach(n=>n.classList.toggle('selected',n===b));});
 $('#bots').onchange=()=>guarded(async()=>{if(dirty&&!confirm('Discard unsaved changes?')){$('#bots').value=bot.id;return;}await load($('#bots').value);});
 $('#create').onclick=()=>guarded(async()=>{if(dirty&&!confirm('Discard unsaved changes?'))return;const r=await call({action:'create'});await load(r.bot.id);});
 $('#save').onclick=()=>guarded(save);
 $('#test').onclick=()=>guarded(async()=>{if(dirty)await save();testWidget?.destroy();$('#test-dialog').showModal();testWidget=new SynvioFlowWidget({mount:$('#test-stage'),config:{...bot.draft,wx:50,wy:0},designer:true,call:data=>action(data.action,{...data,preview:true})});});
 all('[data-close]').forEach(b=>b.onclick=()=>{document.getElementById(b.dataset.close).close();if(b.dataset.close==='test-dialog'){testWidget?.destroy();testWidget=null;}});
 $('#connect').onclick=()=>guarded(async()=>{if(dirty)await save();const r=await action('connect',{connected:!bot.connected});bot=r.bot;fill();});
 $('#publish').onclick=()=>guarded(async()=>{if(dirty)throw Error('Save the draft first, then publish.');const r=await action('publish');bot=r.bot;fill();notice('Published. New conversations use this version.');});
 $('#offline').onclick=()=>guarded(async()=>{const r=await action('offline');bot=r.bot;fill();notice('Assistant is offline.');});
 $('#copy-embed').onclick=()=>guarded(async()=>{await navigator.clipboard.writeText($('#embed').value);notice('Embed code copied.');});
 async function keys(){const r=await action('keys');$('#keys').replaceChildren();for(const key of r.keys){const row=document.createElement('div');row.className='key-row';const text=document.createElement('span');text.textContent=key.name+' · '+key.prefix+'…'+(key.revoked_at?' · revoked':'');row.append(text);if(!key.revoked_at){const b=document.createElement('button');b.textContent='Revoke';b.onclick=()=>guarded(async()=>{await action('revoke',{keyId:key.id});await keys();});row.append(b);}$('#keys').append(row);}}
 $('#new-key').onclick=()=>guarded(async()=>{const r=await action('key',{name:'Server integration'});$('#secret-box').hidden=false;$('#secret').value=r.secret;await keys();});
 $('#help').onclick=()=>$('#help-dialog').showModal();let helpRequest=null;
 $('#help-form').onsubmit=e=>{e.preventDefault();guarded(async()=>{const b=$('#help-form button');b.disabled=true;try{if(!helpRequest)helpRequest={text:$('#help-text').value,requestId:crypto.randomUUID()};const r=await action('assistant',helpRequest);const p=document.createElement('p');p.textContent=r.reply;$('#help-log').append(p);helpRequest=null;$('#help-text').value='';}finally{b.disabled=false;}});};
 $('#logout').onclick=async()=>{await sb.auth.signOut();location.href='/login.html?next=/';};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 guarded(async()=>{if(!sb)throw Error('Authentication is not configured.');await load(new URLSearchParams(location.search).get('bot'));});
})();
