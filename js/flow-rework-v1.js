(() => {
  'use strict';
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function inline(node,text){
    const re=/(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;let start=0,m;
    while((m=re.exec(text))){node.append(document.createTextNode(text.slice(start,m.index)));const n=el(m[2]?'strong':m[3]?'code':'a','',m[2]||m[3]||m[4]);if(m[5]){n.href=m[5];n.target='_blank';n.rel='noopener noreferrer';}node.append(n);start=re.lastIndex;}
    node.append(document.createTextNode(text.slice(start)));
  }
  function copyButton(text,label='Copy'){
    const b=el('button','copy-button',label);b.type='button';
    b.onclick=async()=>{try{await navigator.clipboard.writeText(text);b.textContent='Copied';}catch{b.textContent='Select text to copy';}setTimeout(()=>b.textContent=label,1800);};return b;
  }
  function prose(node,text){
    let list=null;
    for(const line of text.split('\n')){
      if(!line.trim()){list=null;continue;}
      const li=line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
      if(li){if(!list){list=el('ul');node.append(list);}const item=el('li');inline(item,li[1]);list.append(item);}
      else{list=null;const h=line.match(/^#{1,4}\s+(.+)/),p=el(h?'h4':'p');inline(p,h?h[1]:line);node.append(p);}
    }
  }
  window.SynvioFlowUI={message(log,role,text){
    text=String(text||'No answer was returned. Please try again.');
    const item=el('article','assistant-message '+(role==='user'?'from-user':'from-assistant'));
    item.append(el('span','message-author',role==='user'?'You':'Flow Assistant'));
    const parts=text.split(/```([^\n`]*)\n([\s\S]*?)```/g);
    for(let i=0;i<parts.length;i+=3){
      prose(item,parts[i]);
      if(i+2<parts.length){const box=el('div','code-block'),head=el('div','code-heading'),pre=el('pre'),code=el('code','',parts[i+2].replace(/\n$/,''));head.append(el('span','',parts[i+1].trim()||'Text'),copyButton(code.textContent));pre.append(code);box.append(head,pre);item.append(box);}
    }
    if(role!=='user')item.append(copyButton(text,'Copy answer'));
    log.append(item);log.scrollTop=log.scrollHeight;
  }};
  if(window.SynvioFlowWidget){
    window.SynvioInstagramPreview=class extends window.SynvioFlowWidget{
      constructor(options){super({...options,config:{...options.config,format:'inline',width:440,height:560,motion:'none',responsive:{},logo:'',subtitle:'Instagram · preview',greeting:options.config.greeting}});}
      render(){
        super.render();this.host.classList.add('instagram-preview');this.host.dataset.theme=document.documentElement.dataset.theme||'dark';
        const style=document.createElement('style');
        style.textContent=`
          :host{display:block;width:100%;height:100%;font-family:Arial,sans-serif}
          .chat{position:relative!important;left:0!important;top:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;border:1px solid #34363b!important;border-radius:24px!important;box-shadow:none!important;background:#101114!important;color:#f5f5f5!important;transform:none!important;animation:none!important}
          .head{background:#101114!important;color:#fafafa!important;padding:18px;border-color:#292a30!important}
          .head>span{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:linear-gradient(35deg,#ffb947,#e8318c,#7453e8);color:white;font-size:18px}
          .head .name{font-weight:600}.head small{font-weight:400;color:#a8a8ae}
          .log{padding:20px 16px}.bubble{background:#292a30!important;color:#fafafa!important;border:0;border-radius:18px!important;padding:12px 15px;max-width:86%;width:fit-content;font-size:14px;line-height:1.55}
          .bubble.user{background:#643de2!important;color:white!important;margin-left:auto}
          .entry{background:#191a1f!important;color:white!important;border:1px solid #36373d!important;border-radius:26px;margin:10px;padding:8px 12px}
          .entry input{color:white!important}.send{background:transparent!important;color:#b7a0ff!important;font-weight:600}
          .launch,.scrim,.move,.quick,.cards,.powered,#end-chat,#close,.who,.contact-option,.contact-form{display:none!important}
          .status{color:#aaa!important}
          :host([data-theme=light]) .chat,:host([data-theme=light]) .head{background:white!important;color:#17171b!important;border-color:#ddd!important}
          :host([data-theme=light]) .bubble:not(.user){background:#efeff2!important;color:#17171b!important}
          :host([data-theme=light]) .entry{background:white!important;border-color:#ddd!important}
          :host([data-theme=light]) .entry input{color:#17171b!important}
          :host([data-theme=light]) .send{color:#633bd6!important}
        `;
        this.root.append(style);
        const symbol=this.root.querySelector('.head>span');if(symbol)symbol.textContent='◎';
        const input=this.root.querySelector('.entry input');if(input)input.placeholder='Message…';
      }
    };
  }
  const icon='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
  document.querySelectorAll('.sidebar-bottom a').forEach(a=>{const label=a.textContent.replace(/^[^A-Za-z]+/,'').replace(/\s*↗$/,'');a.replaceChildren();a.insertAdjacentHTML('afterbegin',icon);a.append(el('span','',label));});
})();
