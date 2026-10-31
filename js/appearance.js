(() => {
  const root=document.documentElement, key='synvio-appearance-v1';
  const defaults={theme:'dark',motion:true};
  const normalize=value=>({theme:value?.theme==='light'?'light':'dark',motion:value?.motion!==false});
  let settings={...defaults};
  try{settings=normalize(JSON.parse(localStorage.getItem(key)));}catch{}
  function apply(){
    root.dataset.theme=settings.theme;
    root.dataset.motion=settings.motion?'on':'off';
    root.style.colorScheme=settings.theme;
    if(document.readyState!=='loading')sync();
  }
  function save(){try{localStorage.setItem(key,JSON.stringify(settings));}catch{}apply();}
  function sync(){
    document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===settings.theme)));
    const motion=document.getElementById('appearance-motion');if(motion)motion.checked=settings.motion;
  }
  apply();
  window.addEventListener('storage',event=>{if(event.key===key){try{settings=normalize(JSON.parse(event.newValue));apply();}catch{}}});
  function init(){
    const dialog=document.createElement('dialog');dialog.id='appearance-dialog';dialog.className='workspace-dialog';
    dialog.setAttribute('aria-labelledby','appearance-title');
    dialog.innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">Your workspace</span><h2 id="appearance-title">Appearance</h2></div><button class="icon-button" type="button" data-close-appearance aria-label="Close appearance settings">×</button></div>
      <p class="dialog-copy">Choose a look that feels comfortable. This preference stays on this browser.</p>
      <div class="theme-options" role="group" aria-label="Color theme"><button type="button" class="theme-option" data-theme-choice="dark"><span class="theme-swatch swatch-dark" aria-hidden="true"><i></i><i></i></span><strong>Dark</strong><span>Our signature look</span></button><button type="button" class="theme-option" data-theme-choice="light"><span class="theme-swatch swatch-light" aria-hidden="true"><i></i><i></i></span><strong>Light</strong><span>Clear and airy</span></button></div>
      <label class="motion-control"><span><strong>Subtle animations</strong><small>Gentle highlights and hover effects</small></span><input id="appearance-motion" type="checkbox" role="switch"></label>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close-appearance]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    document.addEventListener('click',event=>{const trigger=event.target.closest('[data-open-appearance]');if(trigger&&!dialog.open){sync();dialog.showModal();}});
    dialog.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{settings.theme=button.dataset.themeChoice;save();}));
    document.getElementById('appearance-motion').addEventListener('change',event=>{settings.motion=event.target.checked;save();});
    // A small fallback remains available on mobile, where the inbox sidebar is hidden.
    const fallback=document.createElement('button');fallback.type='button';fallback.className='appearance-shortcut';fallback.dataset.openAppearance='';fallback.textContent='Appearance';fallback.setAttribute('aria-haspopup','dialog');
    if(document.querySelector('.sidebar'))fallback.classList.add('mobile-appearance');
    document.body.append(fallback);sync();
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0, pending=null;
    document.addEventListener('pointermove',event=>{
      if(event.pointerType==='touch'||!settings.motion||media.matches)return;
      const target=event.target.closest('.admin-card,.knowledge-list-card,.knowledge-editor-card,.message-card,.message-file,.setup-card,.invite-card,.ticket-row,.knowledge-row,.txt-dropzone');
      if(!target)return;pending={target,x:event.clientX,y:event.clientY};
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;const {target,x,y}=pending;if(!target.isConnected)return;const r=target.getBoundingClientRect();target.style.setProperty('--glow-x',`${x-r.left}px`);target.style.setProperty('--glow-y',`${y-r.top}px`);});
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
