// debug.js — overlay + hotkeys (F3/F4/Backquote)
import { state } from './core.js';

let SHOW_BOXES = false;
let SHOW_HITBOX = false;
const MAX_FPS = 30;
let lastDraw = 0;

function ctxAndView(){
  const canvas = document.getElementById('debug-overlay');
  if (!canvas) return {};
  const ctx = canvas.getContext('2d');
  const W = window.innerWidth, H = window.innerHeight;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const viewLeft = Math.max(0, -state.containerX);
  const viewTop  = Math.max(0, -state.containerY);
  const viewRight  = Math.min(viewLeft + W, 8192);
  const viewBottom = Math.min(viewTop  + H, 8192);

  return { canvas, ctx, W, H, viewLeft, viewTop, viewRight, viewBottom };
}

export function installDebugHotkeys(){
  document.addEventListener('keydown', (e) => {
    if (e.code === 'F3'){ SHOW_BOXES = !SHOW_BOXES; }
    if (e.code === 'F4'){ SHOW_HITBOX = !SHOW_HITBOX; }
    if (e.code === 'Backquote'){
      const any = SHOW_BOXES || SHOW_HITBOX;
      SHOW_BOXES = !any; SHOW_HITBOX = false;
    }
  });
}

export function renderDebugOverlayIfNeeded(){
  const now = performance.now();
  if (now - lastDraw < 1000/MAX_FPS) return;
  lastDraw = now;

  const any = SHOW_BOXES || SHOW_HITBOX;
  const { ctx, canvas, W, H, viewLeft, viewTop, viewRight, viewBottom } = ctxAndView();
  if (!canvas || !ctx){ return; }

  ctx.clearRect(0,0,W,H);
  if (!any) return;

  // collision rects
  if (SHOW_BOXES && state.collisionObjects?.length){
    ctx.strokeStyle = 'rgba(255,165,0,0.85)';
    ctx.lineWidth = 2;
    for (const r of state.collisionObjects){
      const rx2 = r.x + r.w, ry2 = r.y + r.h;
      if (r.x > viewRight || rx2 < viewLeft || r.y > viewBottom || ry2 < viewTop) continue;
      ctx.strokeRect(r.x - viewLeft, r.y - viewTop, r.w, r.h);
    }
  }

  // player footbox
  if (SHOW_HITBOX){
    const pw = state.playerW, ph = state.playerH;
    const hitW = pw * 0.5, hitH = ph * 0.25;
    const offX = (pw - hitW)/2, offY = ph - hitH;
    const x = state.playerX + offX - viewLeft;
    const y = state.playerY + offY - viewTop;
    ctx.strokeStyle = 'rgba(0,200,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, hitW, hitH);
  }
}
