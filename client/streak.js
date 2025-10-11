// 7-Day Streak modal (independent of app.js)
import { rtdb, ref, onValue } from './firebase.js';
(function(){
  const STREAK_LEN = 7;
  const CLAIM_KEY = 'streak';
  const LAST_TS_KEY = 'streakLastClaimTs';

  // Use Firebase server time for real-time accuracy (resists device clock skew)
  let serverOffsetMs = 0;
  try {
    onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
      const off = Number(snap.val());
      if (!Number.isNaN(off)) serverOffsetMs = off;
    });
  } catch {}

  function now(){ return Date.now() + serverOffsetMs; }
  function canClaim(){ const last = +localStorage.getItem(LAST_TS_KEY) || 0; return (now() - last) >= 24*60*60*1000; }
  function readDay(){ return Math.max(0, Math.min(STREAK_LEN, +(localStorage.getItem(CLAIM_KEY)||0))); }
  function writeDay(d){ localStorage.setItem(CLAIM_KEY, String(d)); }
  function markClaimed(){ localStorage.setItem(LAST_TS_KEY, String(now())); }

  function ensureModal(){
    let modal = document.getElementById('streakModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'streakModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden','true');
      modal.innerHTML = `
        <div class="streak-dialog">
          <div class="streak-head">
            <h3>Daily Login Streak</h3>
            <button class="x" id="closeStreak">✕</button>
          </div>
          <div class="streak-body">
            <div id="streakGrid" class="streak-grid"></div>
            <div class="streak-note">Claim once every 24 hours. Complete 7 days to receive a bonus.</div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e)=>{ if (e.target===modal) close(); });
      modal.querySelector('#closeStreak').addEventListener('click', close);
    }
    return modal;
  }

  function render(){
    const grid = document.getElementById('streakGrid');
    if (!grid) return;
    const d = readDay();
    const eligible = canClaim();
    const cells = [];
    for (let i=1;i<=STREAK_LEN;i++){
      const status = (i <= d) ? 'claimed' : (i === d+1 ? (eligible?'available':'locked') : 'locked');
      const btn = (status==='available') ? `<button class="claim" data-day="${i}">Claim</button>` : '';
      cells.push(`
        <div class="streak-card ${status}">
          <div class="day">Day ${i}</div>
          <div class="reward">+${i*10} Coins</div>
          ${status==='claimed' ? '<div class="tag">Claimed</div>' : btn}
        </div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('button.claim').forEach(b=> b.addEventListener('click', onClaim));
  }

  function onClaim(){
    if (!canClaim()) { window.showToast && showToast('Come back after 24h','warning'); return; }
    let d = readDay();
    if (d >= STREAK_LEN) d = 0; // safety
    d += 1; writeDay(d); markClaimed();
    if (d === STREAK_LEN) {
      window.showToast && showToast('🎉 7-Day Streak complete! Bonus awarded!','success');
      writeDay(0);
    } else {
      window.showToast && showToast(`✅ Claimed Day ${d}. See you tomorrow!`,'success');
    }
    try { const label = document.querySelector('.rail-btn.calendar .label'); if (label) label.textContent = `${readDay()} Day(s)`; } catch {}
    render();
  }

  function open(){ const m = ensureModal(); render(); m.setAttribute('aria-hidden','false'); m.classList.add('show'); }
  function close(){ const m = document.getElementById('streakModal'); if (m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); } }

  // bind calendar buttons robustly (handle duplicates, override previous handlers)
  function bindAllCalendarButtons(){
    const nodes = document.querySelectorAll('.rail-btn.calendar');
    if (!nodes || nodes.length === 0) return;
    nodes.forEach((btn) => {
      if (btn.dataset.streakBound === '1') return;
      btn.dataset.streakBound = '1';
      // Clear legacy onclick if any
      try { btn.onclick = null; } catch {}
      // Capture-phase to suppress earlier listeners
      btn.addEventListener('click', (e)=>{
        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
        try { e.preventDefault && e.preventDefault(); } catch {}
        open();
      }, true);
    });
  }
  
  // bind timer buttons similarly to open streak modal
  function bindAllTimerButtons(){
    const nodes = document.querySelectorAll('.rail-btn.timer');
    if (!nodes || nodes.length === 0) return;
    nodes.forEach((btn) => {
      if (btn.dataset.streakTimerBound === '1') return;
      btn.dataset.streakTimerBound = '1';
      try { btn.onclick = null; } catch {}
      btn.addEventListener('click', (e)=>{
        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
        try { e.preventDefault && e.preventDefault(); } catch {}
        // Show toast with time left to next claim instead of opening modal
        const last = +localStorage.getItem('streakLastClaimTs') || 0;
        const next = last ? (last + 24*60*60*1000) : 0;
        const left = next ? (next - Date.now()) : 0;
        if (left <= 0) {
          window.showToast && showToast('Ready to claim in Streak!', 'info');
        } else {
          window.showToast && showToast(`Next claim in ${fmtTime(left)}`, 'info');
        }
      }, true);
    });
  }

  // countdown label on the timer button to next claim
  function fmtTime(ms){
    ms = Math.max(0, ms|0);
    const s = Math.floor(ms/1000);
    const h = String(Math.floor(s/3600)).padStart(2,'0');
    const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const sec = String(s%60).padStart(2,'0');
    return `${h}:${m}:${sec}`;
  }
  function updateTimerCountdown(){
    const label = document.getElementById('countdown');
    const last = +localStorage.getItem('streakLastClaimTs') || 0;
    const next = last ? (last + 24*60*60*1000) : 0;
    const left = next ? (next - Date.now()) : 0;
    if (!label) return;
    if (left <= 0) label.textContent = 'Ready';
    else label.textContent = fmtTime(left);
  }

  function initBindings(){
    bindAllCalendarButtons();
    bindAllTimerButtons();
    updateTimerCountdown();
    setInterval(updateTimerCountdown, 1000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') initBindings();
  else document.addEventListener('DOMContentLoaded', initBindings, { once: true });
})();
