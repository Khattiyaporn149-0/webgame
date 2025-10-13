// collision.js — loadCollisionData, checkCollision
import { CONST, state } from './core.js';

export async function loadCollisionData(){
  const out = [];

  // Try SVG
  try {
    const res = await fetch('assets/maps/collision.svg', { cache:'no-store' });
    if (res.ok){
      const txt = await res.text();
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      const svg = doc.documentElement;

      let baseW = CONST.CONTAINER_WIDTH, baseH = CONST.CONTAINER_HEIGHT;
      const vb = svg.getAttribute('viewBox');
      if (vb){
        const [,, w,h] = vb.split(/\s+/).map(Number);
        baseW = w || baseW; baseH = h || baseH;
      } else {
        const wAttr = parseFloat((svg.getAttribute('width')||'').replace('px',''));
        const hAttr = parseFloat((svg.getAttribute('height')||'').replace('px',''));
        if (!Number.isNaN(wAttr) && wAttr>0) baseW = wAttr;
        if (!Number.isNaN(hAttr) && hAttr>0) baseH = hAttr;
      }
      const sx = CONST.CONTAINER_WIDTH/baseW, sy = CONST.CONTAINER_HEIGHT/baseH;

      for (const r of Array.from(doc.getElementsByTagName('rect'))){
        const x=+r.getAttribute('x')||0, y=+r.getAttribute('y')||0;
        const w=+r.getAttribute('width')||0, h=+r.getAttribute('height')||0;
        if (w>0 && h>0) out.push({ x:x*sx, y:y*sy, w:w*sx, h:h*sy, type:'rect' });
      }
      state.collisionObjects = out;
      console.log(`➕ Loaded ${out.length} collision rectangles from SVG`);
      return;
    }
  } catch(e){ console.warn('SVG collision load failed:', e); }

  // Fallback JSON
  try {
    const res = await fetch('assets/maps/collision.json', { cache:'no-store' });
    if (res.ok){
      const data = await res.json();
      const rects = Array.isArray(data) ? data : (Array.isArray(data.rects) ? data.rects : []);
      state.collisionObjects = rects
        .map(o=>({ x:+o.x||0, y:+o.y||0, w:+o.w||0, h:+o.h||0, type:'rect' }))
        .filter(o=>o.w>0 && o.h>0);
      console.log(`➕ Loaded ${state.collisionObjects.length} collision rectangles from JSON`);
      return;
    }
  } catch(e){ console.warn('JSON collision load failed:', e); }

  console.warn('No collision data found (SVG/JSON). Running without collisions.');
  state.collisionObjects = [];
}

export function checkCollision(nextX, nextY, playerW, playerH){
  const cols = state.collisionObjects;
  if (!cols?.length) return false;

  // foot-box hitbox (แคบและเตี้ย)
  const hitW = playerW * 0.2;
  const hitH = playerH * 0.2;
  const offsetX = (playerW - hitW) / 2;
  const offsetY = (playerH - hitH);

  const left = nextX + offsetX;
  const top = nextY + offsetY;
  const right = left + hitW;
  const bottom = top + hitH;

  for (const r of cols){
    const rx2 = r.x + r.w, ry2 = r.y + r.h;
    if (left < rx2 && right > r.x && top < ry2 && bottom > r.y) return true;
  }
  return false;
}
