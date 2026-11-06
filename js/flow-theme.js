(() => {
  const key='synvio-theme';
  function set(theme){
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    try{localStorage.setItem(key,theme);localStorage.setItem('synvio-flow-theme',theme);}catch{}
    document.querySelectorAll('#theme-toggle,[data-theme-toggle]').forEach(b=>{b.textContent=theme==='dark'?'Light mode':'Dark mode';b.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');});
  }
  let theme='dark';try{theme=localStorage.getItem(key)||localStorage.getItem('synvio-flow-theme')||'dark';}catch{}
  set(theme==='light'?'light':'dark');
  document.addEventListener('DOMContentLoaded',()=>{
    let b=document.querySelector('#theme-toggle,[data-theme-toggle]');
    if(!b){b=document.createElement('button');b.id='theme-toggle';b.type='button';document.querySelector('.sidebar-bottom')?.append(b);}
    b.onclick=()=>set(document.documentElement.dataset.theme==='dark'?'light':'dark');
    set(document.documentElement.dataset.theme);
  });
})();
