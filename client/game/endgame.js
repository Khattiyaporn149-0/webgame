// endgame.js — minimal, self-contained end screen overlay
// Safe to import dynamically; no external CSS/HTML dependencies
// เพิ่มใหม่: โมดูลหน้าจบเกม — 2025-10-13 21:14:26 +07:00
// ปรับดีไซน์: พื้นหลังดำ ตัวอักษรใหญ่ และบังคับกลับ Lobby อัตโนมัติ — 2025-10-13 21:45:00 +07:00

function ensureOverlay(detail = {}) {
  if (document.getElementById('endgame-overlay')) return;

  const el = document.createElement('div');
  el.id = 'endgame-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999', 'display:flex',
    'align-items:center', 'justify-content:center', 'background:#000',
    'color:#fff', 'font-family:"Bai Jamjuree",system-ui,Segoe UI,Inter,sans-serif', 'text-align:center'
  ].join(';');

  // Compute texts
  const isThief = (detail?.outcome === 'thief_win');
  const titleText = isThief ? (detail?.title || 'MISSION COMPLETE!') : (detail?.title || 'MISSION COMPLETE!');
  const teamText  = isThief ? 'หัวขโมย' : 'ผู้เยี่ยมชม';
  // Map reason code -> Thai text; desc (ถ้ามี) จะ override
  const reasonMap = {
    missions_complete: 'ภารกิจสำเร็จครบ 100%',
    heist_success: 'ปล้นสำเร็จ!',
    heist_detected: 'เกิดเหตุโจรกรรม',
  };
  const reasonText = (detail?.desc && String(detail.desc))
    || reasonMap[String(detail?.reason || '')]
    || (detail?.reason || 'เกมจบแล้ว');

  // Character image (current player image if exists)
  let charSrc = '';
  try { const p = document.getElementById('player'); if (p?.src) charSrc = p.src; } catch {}
  if (!charSrc) charSrc = 'assets/images/idle_1.png';

  el.innerHTML = `
    <div id="eg-wrap" style="max-width:920px;padding:24px;">
      <div style="font-size:74px;font-weight:900;letter-spacing:2px;margin:0 0 6px;">${titleText}</div>
      <div style="font-size:28px;font-weight:900;margin-bottom:6px;color:${isThief ? '#ff3333' : '#00ffa6'};text-shadow:0 0 12px ${isThief ? 'rgba(255,60,60,0.6)' : 'rgba(0,255,166,0.5)'};">${teamText}</div>
      <div style="font-size:24px;opacity:.95;margin-bottom:22px;">${reasonText}</div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;margin:22px 0 14px;">
        <div style="position:relative;width:320px;height:320px;display:grid;place-items:center;">
          <img src="${charSrc}" alt="character" style="width:260px;height:260px;image-rendering:pixelated;filter:drop-shadow(0 20px 40px rgba(0,0,0,.65));"/>
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:360px;height:60px;border-radius:50%;background:radial-gradient(ellipse at center, rgba(255,0,100,.25) 0%, rgba(0,0,0,0) 70%);filter:blur(2px);"></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;">
          <button id="eg-now" type="button" style="padding:12px 18px;border:0;border-radius:12px;font-weight:900;background:#ffd866;color:#0b1324;cursor:pointer;">กลับ Lobby ทันที</button>
          <span id="eg-count" style="opacity:.9;font-size:18px;">กำลังกลับไป Lobby ใน 5 วินาที...</span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);

  // redirect handling
  const redirectTo = String(detail?.redirectTo || 'lobby.html');
  const delayMs = Number.isFinite(+detail?.delayMs) ? +detail.delayMs : 15000;
  const goExit  = () => { try { location.href = redirectTo; } catch { /* no-op */ } };
  const nowBtn  = document.getElementById('eg-now');
  const counter = document.getElementById('eg-count');
  nowBtn?.addEventListener('click', goExit);
  try {
    let left = Math.max(0, Math.round(delayMs/1000));
    const tick = () => {
      if (!counter) return;
      counter.textContent = `กำลังกลับไป Lobby ใน ${left} วินาที...`;
      left -= 1; if (left < 0) return; setTimeout(tick, 1000);
    };
    setTimeout(tick, 0);
  } catch {}
  try { setTimeout(goExit, delayMs); } catch {}
  try { document.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key==='Escape') goExit(); }, { once:true }); } catch {}
}

export function showEnd(detail) {
  try { ensureOverlay(detail); } catch (e) { console.error('End overlay failed', e); }
}

export default showEnd;

// Optional: react if someone dispatches the event before/after dynamic import
try {
  window.addEventListener('game:end', (e) => showEnd(e?.detail || {}));
} catch {}
