(function(){
  const REGISTRY = {
    overworld: 'minigames/minigames/dodge-square/world.html',
    dodge: 'minigames/minigames/dodge-square/world.html?game=dodge',
    react: 'minigames/minigames/dodge-square/world.html?game=react',
    aim: 'minigames/minigames/dodge-square/world.html?game=aim',
    tap: 'minigames/minigames/dodge-square/world.html?game=tap',
    wires: 'minigames/minigames/dodge-square/world.html?game=wires',
    upload: 'minigames/minigames/dodge-square/world.html?game=upload',
    mix: 'minigames/minigames/dodge-square/world.html?game=mix',
    switch: 'minigames/minigames/dodge-square/world.html?game=switch',
    card: 'minigames/minigames/dodge-square/world.html?game=card',
    timer: 'minigames/minigames/dodge-square/world.html?game=timer',
    align: 'minigames/minigames/dodge-square/world.html?game=align',
    mop: 'minigames/minigames/mop/index.html',
    broom: 'minigames/minigames/mop/index.html'
  };

  const modal = document.getElementById('minigameModal');
  const frame = document.getElementById('minigameFrame');
  const closeBtn = document.getElementById('closeMinigame');
  let pendingInit = null;

  function open(gameKey){
    const key = (gameKey || 'overworld').toLowerCase();
    const url = REGISTRY[key] || REGISTRY.overworld;
    pendingInit = { id:key, game:key, seed: Math.floor(Math.random()*1e9), difficulty: 'normal' };
    try { frame.src = url; } catch {}
    if (modal){ modal.setAttribute('aria-hidden','false'); modal.classList.add('show'); }
  }

  function close(){
    try { frame?.contentWindow?.postMessage?.({ type:'mg:abort' }, '*'); } catch {}
    if (modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
    try { frame.src = 'about:blank'; } catch {}
    updateProgress(0);
  }

  function updateProgress(p){
    const pct = Math.max(0, Math.min(100, (p|0)));
    const fill = document.getElementById('mgProgressFill');
    if (fill) fill.style.width = pct + '%';
  }

  function updateMissionsBadge(){
    try {
      const m = JSON.parse(localStorage.getItem('missions') || '[]');
      const remain = Array.isArray(m) ? m.filter(x=>!x.done).length : 0;
      const badge = document.querySelector('.rail-btn.missions .badge');
      if (badge) badge.textContent = remain > 0 ? String(remain) : '✓';
    } catch {}
  }

  function onMessage(e){
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (!d || typeof d !== 'object' || !d.type) return;
    if (d.type === 'mg:ready'){
      if (pendingInit){
        try { frame.contentWindow.postMessage({ type:'mg:init', ...pendingInit }, '*'); } catch {}
      }
    } else if (d.type === 'mg:progress'){
      updateProgress(Number(d.percent||0));
    } else if (d.type === 'mg:complete'){
      try {
        const list = JSON.parse(localStorage.getItem('missions') || '[]');
        if (Array.isArray(list) && list.length){
          const idx = list.findIndex(x=>!x.done);
          if (idx >= 0){ list[idx].done = true; localStorage.setItem('missions', JSON.stringify(list)); }
        }
      } catch {}
      updateMissionsBadge();
      window.showToast && showToast('✅ Minigame complete!', 'success');
      close();
    } else if (d.type === 'mg:cancel'){
      window.showToast && showToast('⏹️ Minigame closed', 'warning');
      close();
    }
  }

  window.addEventListener('message', onMessage);
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e)=>{ if (e.target === modal) close(); });
  frame?.addEventListener('load', ()=>{});

  function bindBtn(){
    const btn = document.getElementById('btnMinigame');
    if (btn && !btn.dataset.bound){ btn.dataset.bound='1'; btn.addEventListener('click', ()=> open('overworld')); }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') bindBtn();
  else document.addEventListener('DOMContentLoaded', bindBtn, { once:true });

  window.MinigameOverlay = { open, close };
})();
