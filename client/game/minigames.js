// minigames.js — iframe overlay + registry bridge
const REG_PATH = 'minigames/registry.json';
let regCache = null;
let modal, frame, fill, closing = false;
let pending = null; // { obj, key, difficulty, onComplete }

async function loadReg(){
  if (regCache) return regCache;
  try { const r = await fetch(REG_PATH, { cache:'no-store' }); regCache = await r.json(); }
  catch { regCache = {}; }
  return regCache;
}
function urlFor(key){
  const k = (key||'overworld').toLowerCase();
  const reg = regCache || {};
  return reg[k] || reg.overworld || (`minigames/dodge-square/world.html?game=${encodeURIComponent(k)}`);
}

function ensureOverlay(){
  if (modal) return;
  modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="position:fixed; inset:0; display:flex; flex-direction:column;">
      <button id="mgCloseTop" title="Close" style="position:absolute; top:10px; right:12px; z-index:2; background:#ff4d4d; color:#fff; border:0; width:32px; height:32px; border-radius:50%; font-weight:800; cursor:pointer">✖</button>
      <div style="height:6px; background:rgba(11,19,36,.9)"><div id="mgFill" style="height:100%; width:0%; background:#2b64ff"></div></div>
      <iframe id="mgFrame" title="Minigame" src="about:blank" style="flex:1; width:100%; border:0; background:#000" allow="autoplay; fullscreen"></iframe>
    </div>`;
  document.body.appendChild(modal);
  frame = modal.querySelector('#mgFrame');
  fill  = modal.querySelector('#mgFill');
  modal.querySelector('#mgCloseTop')?.addEventListener('click', closeMini);

  window.addEventListener('message', onMsg);
}
function setProgress(p){ if (fill) fill.style.width = `${Math.max(0, Math.min(100, p|0))}%`; }

export async function openMinigameForObject(obj, { onComplete } = {}){
  if (!obj?.mg) return;
  ensureOverlay();
  await loadReg();

  const key = (obj.mg.key || obj.mg).toLowerCase?.() || String(obj.mg).toLowerCase();
  const difficulty = obj.mg.difficulty || 'normal';
  pending = { obj, key, difficulty, onComplete };

  try { frame.src = urlFor(key); } catch {}
  modal.style.display = 'flex';
  setProgress(0);
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
    if ((+d.percent||0) >= 100 && !closing) setTimeout(()=> closeMini(), 800);
  }
  else if (d.type === 'mg:complete'){
    try { setProgress(100); } catch {}
    try { pending?.onComplete?.(pending.obj); } catch {}
    setTimeout(()=> closeMini(), 300);
  }
  else if (d.type === 'mg:cancel'){ closeMini(); }
}
