// minigames.js — iframe overlay + registry bridge
// Registry lives at client/src/minigames/registry.json (page is in public/)
const REG_PATH = '../src/minigames/registry.json';
let regCache = null;
let modal, frame, fill, closing = false;
let pending = null; // { obj, key, difficulty, onComplete, onCancel, openedAt }
let completedOnce = false; // one-time completion guard per open

async function loadReg(){
  if (regCache) return regCache;
  try { const r = await fetch(REG_PATH, { cache:'no-store' }); regCache = await r.json(); }
  catch { regCache = {}; }
  return regCache;
}
function urlFor(key){
  const k = (key||'overworld').toLowerCase();
  const reg = regCache || {};
  const raw = reg[k] || reg.overworld;
  if (raw) {
    // normalize: add '../src/' if it's a relative path into the repo
    const isAbs = /^(https?:)?\//.test(raw) || raw.startsWith('..');
    return isAbs ? raw : `../src/${raw}`;
  }
  // Fallback to the default world in src
  return `../src/minigames/dodge-square/world.html?game=${encodeURIComponent(k)}`;
}

function ensureOverlay(){
  if (modal) return;
  modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="position:fixed; inset:0; display:flex; flex-direction:column;">
      <button id="mgCloseTop" title="Close" style="position:absolute; top:10px; right:12px; z-index:10002; background:#ff4d4d; color:#fff; border:0; width:40px; height:40px; border-radius:50%; font-size:20px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.5); transition:all .2s ease">✖</button>
      <iframe id="mgFrame" title="Minigame" src="about:blank" style="flex:1; width:100%; border:0; background:transparent" allow="autoplay; fullscreen"></iframe>
    </div>`;
  document.body.appendChild(modal);
  frame = modal.querySelector('#mgFrame');
  fill  = null;
  modal.querySelector('#mgCloseTop')?.addEventListener('click', closeMini);

  // Keyboard guard: prevent Space/Enter from closing via focused close button
  try {
    const closeBtn = modal.querySelector('#mgCloseTop');
    if (closeBtn) closeBtn.setAttribute('tabindex','-1');
    if (frame) frame.setAttribute('tabindex','-1');
    modal.addEventListener('keydown', (ev) => {
      const k = ev.key || ev.code;
      const isSpace = (k === ' ' || k === 'Space' || k === 'Spacebar');
      const isEnter = (k === 'Enter');
      const ae = document.activeElement;
      const iframeFocused = (ae === frame);
      if ((isSpace || isEnter) && !iframeFocused) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    frame?.addEventListener('load', () => { try { frame?.focus?.({ preventScroll:true }); } catch {} });
  } catch {}

  window.addEventListener('message', onMsg);

  // Stronger global guard: while modal is visible, block Space/Enter unless iframe has focus
  try {
    document.addEventListener('keydown', (ev) => {
      if (!modal || modal.style.display !== 'flex') return;
      const k = ev.key || ev.code;
      const isSpace = (k === ' ' || k === 'Space' || k === 'Spacebar');
      const isEnter = (k === 'Enter');
      if (!(isSpace || isEnter)) return;
      const ae = document.activeElement;
      const iframeFocused = (ae === frame);
      if (!iframeFocused) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch {}
}
// Progress UI removed for consistency across all minigames overlays
function setProgress(p){ /* no-op */ }

export async function openMinigameForObject(obj, { onComplete, onCancel } = {}){
  if (!obj?.mg) return;
  ensureOverlay();
  await loadReg();

  const key = (obj.mg.key || obj.mg).toLowerCase?.() || String(obj.mg).toLowerCase();
  const difficulty = obj.mg.difficulty || 'normal';
  try {
    const now = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
  pending = { obj, key, difficulty, onComplete, onCancel, openedAt: now };
  } catch {
    pending = { obj, key, difficulty, onComplete };
  }
  completedOnce = false; // reset guard when opening
  closing = false;

  try { frame.src = urlFor(key); } catch {}
  modal.style.display = 'flex';
  setProgress(0);
  try { frame?.focus?.({ preventScroll:true }); } catch {}
  try { setTimeout(()=>{ try { frame?.focus?.({ preventScroll:true }); } catch {} }, 0); } catch {}
}
export function closeMini(){
  if (closing) return; closing = true;
  try { frame?.contentWindow?.postMessage?.({ type:'mg:abort' }, '*'); } catch {}
  modal.style.display = 'none';
  try { frame.src = 'about:blank'; } catch {}
  setProgress(0);
  pending = null;
  setTimeout(()=> closing=false, 150);
}
function onMsg(e){
  const d = e.data || {};
  if (!d || typeof d !== 'object') return;
  if (e.source !== frame?.contentWindow) return;

  if (d.type === 'mg:ready'){ setProgress(0); }
  else if (d.type === 'mg:progress'){
    setProgress(+d.percent||0);
    // Do not auto-close on progress; wait for explicit mg:complete
  }
  else if (d.type === 'mg:complete'){
    // Ignore too-fast completes (likely accidental close/keypress)
    try {
      const now = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
      const openedAt = Number(pending?.openedAt||0);
      const elapsed = openedAt ? (now - openedAt) : Number.POSITIVE_INFINITY;
      if (elapsed < 1000) return;
    } catch {}
    if (completedOnce) return; // prevent duplicate firing
    completedOnce = true;
    try { setProgress(100); } catch {}
    try { pending?.onComplete?.(pending.obj); } catch {}
    setTimeout(()=> closeMini(), 300);
  }
  else if (d.type === 'mg:cancel'){
    try { pending?.onCancel?.(pending.obj); } catch {}
    closeMini();
  }
}
