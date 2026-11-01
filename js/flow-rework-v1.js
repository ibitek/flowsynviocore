(() => {
  const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const icons = {
    conversation: icon('M5 6.5h14v9H9l-4 3v-12Z'), knowledge: icon('M6 4h12v16H6zM9 8h6M9 12h6'),
    design: icon('M12 3l8 9-8 9-8-9 8-9Z'), trees: icon('M12 4v16M12 8h6M12 14H6'),
    capabilities: icon('M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13'),
    connect: icon('M9 15l6-6M7 17H5a3 3 0 0 1 0-6h3M17 7h2a3 3 0 0 1 0 6h-3'),
    publish: icon('M12 20V4M7 9l5-5 5 5')
  };
  let pending = false;
  function addStyles(){
    if(document.querySelector('link[data-flow-rework-v2]')) return;
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='/assets/flow-rework-v2.css?v=2'; l.dataset.flowReworkV2='true'; document.head.append(l);
  }
  function copyButton(target){
    if(!target || target.dataset.copyReady) return;
    const b=document.createElement('button'); b.type='button'; b.className='flow-copy-button'; b.textContent='Copy';
    b.onclick=async()=>{ try { await navigator.clipboard.writeText(target.value||target.textContent||''); b.textContent='Copied'; setTimeout(()=>b.textContent='Copy',1200); } catch { b.textContent='Copy manually'; } };
    target.after(b); target.dataset.copyReady='true';
  }
  function mount(){
    if(pending) return;
    pending=true;
    const run=()=>{
      pending=false; addStyles();
      document.querySelectorAll('#nav button[data-page]:not([data-flow-icon-ready])').forEach(button=>{
        const page=button.dataset.page; const title=button.dataset.title||button.textContent.replace(/[\p{So}\p{Sk}]/gu,'').trim();
        button.dataset.title=title;
        const label=button.querySelector('[data-nav-label]')||button.querySelector('span:last-child');
        if(!button.querySelector('.flow-nav-icon')) button.insertAdjacentHTML('afterbegin',`<span class="flow-nav-icon">${icons[page]||icon('M12 5v14M5 12h14')}</span>`);
        if(label) label.textContent=title; else if(!button.querySelector('span:last-child')) { const s=document.createElement('span'); s.textContent=title; button.append(s); }
        button.setAttribute('aria-label',title); button.dataset.flowIconReady='true';
      });
      document.querySelectorAll('input[type=range]:not([data-flow-range-ready])').forEach(i=>{ i.setAttribute('aria-valuetext',i.value); i.dataset.flowRangeReady='true'; });
      document.querySelectorAll('textarea,pre').forEach(t=>{ if(/embed|redirect|url|script/i.test(t.id+' '+t.className+' '+(t.value||t.textContent))) copyButton(t); });
    };
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(run); else setTimeout(run,0);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
  // The studio is a single static document. Observing the whole DOM caused a
  // feedback loop with the app's own renderers and could freeze the browser.
  // Run a couple of delayed passes instead so late-loaded controls still get
  // the visual treatment without keeping a hot observer alive forever.
  setTimeout(mount, 250);
  setTimeout(mount, 900);
})();
