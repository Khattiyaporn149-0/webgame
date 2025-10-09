// Missions modal (daily objectives) — independent module
(function(){
  const MISSIONS_KEY = 'missions';
  const MISSION_DATE_KEY = 'missionDate';
  const BASE = [
    { id: 1, text: 'Play 2 matches', reward: '+50 Coins', done: false },
    { id: 2, text: 'Win 1 game', reward: '+1 Token', done: false },
    { id: 3, text: 'Login today', reward: '+10 Coins', done: false },
  ];

  function today(){ return new Date().toDateString(); }
  function read(){ try { return JSON.parse(localStorage.getItem(MISSIONS_KEY) || 'null'); } catch { return null; } }
  function write(data){ localStorage.setItem(MISSIONS_KEY, JSON.stringify(data)); }
  function loadDaily(){
    const d = localStorage.getItem(MISSION_DATE_KEY);
    const saved = read();
    if (d !== today() || !Array.isArray(saved)) {
      const fresh = BASE.map(m => ({...m, done: false}));
      write(fresh);
      localStorage.setItem(MISSION_DATE_KEY, today());
      return fresh;
    }
    return saved;
  }
  function updateBadge(){
    try {
      const m = read() || [];
      const remain = m.filter(x => !x.done).length;
      const badge = document.querySelector('.rail-btn.missions .badge');
      if (badge) badge.textContent = remain > 0 ? String(remain) : '✓';
    } catch {}
  }

  function ensureModal(){
    let modal = document.getElementById('missionsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'missionsModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden','true');
      modal.innerHTML = `
        <div class="missions-dialog">
          <div class="missions-head">
            <h3>Daily Missions</h3>
            <button class="x" id="closeMissions">✕</button>
          </div>
          <div class="missions-body">
            <div id="missionsProgress" class="missions-progress"></div>
            <div id="missionsGrid" class="mission-grid"></div>
            <div class="missions-note">Resets daily. Complete all for extra rewards!</div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e)=>{ if (e.target===modal) close(); });
      modal.querySelector('#closeMissions').addEventListener('click', close);
    }
    return modal;
  }

  function render(){
    const list = loadDaily();
    const grid = document.getElementById('missionsGrid');
    const prog = document.getElementById('missionsProgress');
    if (!grid) return;
    const done = list.filter(x=>x.done).length;
    const total = list.length;
    if (prog) {
      const pct = Math.round((done/Math.max(1,total))*100);
      prog.innerHTML = `<div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="label">${done}/${total} completed</div>`;
    }
    grid.innerHTML = list.map(m => `
      <div class="mission-card ${m.done?'done':''}">
        <div class="text">${m.text}</div>
        <div class="reward">${m.reward}</div>
        ${m.done ? '<div class="tag">Done</div>' : `<button class="do" data-id="${m.id}">Complete</button>`}
      </div>
    `).join('');
    grid.querySelectorAll('button.do').forEach(b => b.addEventListener('click', onComplete));
  }

  function onComplete(e){
    const id = Number(e.currentTarget.dataset.id);
    const list = loadDaily();
    const target = list.find(x=>x.id===id);
    if (!target || target.done) return;
    target.done = true;
    write(list);
    updateBadge();
    window.showToast && showToast('Mission completed!', 'success');
    render();
  }

  function open(){ ensureModal(); render(); const m = document.getElementById('missionsModal'); m.setAttribute('aria-hidden','false'); m.classList.add('show'); }
  function close(){ const m = document.getElementById('missionsModal'); if (m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); } }

  function bind(){
    const nodes = document.querySelectorAll('.rail-btn.missions');
    if (!nodes.length) return;
    nodes.forEach((btn)=>{
      if (btn.dataset.missionsBound==='1') return;
      btn.dataset.missionsBound='1';
      try { btn.onclick = null; } catch {}
      btn.addEventListener('click', (e)=>{
        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
        try { e.preventDefault && e.preventDefault(); } catch {}
        open();
      }, true);
    });
  }

  function init(){ updateBadge(); bind(); }
  if (document.readyState==='complete' || document.readyState==='interactive') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();

