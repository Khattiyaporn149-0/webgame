// minimap.js — toggleFullScreenMap, updateMiniMapDisplay
import { CONST, state } from './core.js';
import { MISSION_SPOTS_DATA, INTERACTABLE_OBJECTS } from './interactions.js';

let isFull = false;

function qs(id){ return document.getElementById(id); }

export function toggleFullScreenMap(){
  if (state.isMeetingActive) return;
  const overlay = qs('map-overlay');
  if (!overlay) return;

  isFull = !isFull;
  overlay.classList.toggle('fullscreen', isFull);

  // hide noisy UI in fullscreen
  const vo = qs('vision-overlay');
  const log = qs('log-container');
  const mission = qs('mission-status-container');
  const hint = qs('interaction-hint');
  if (isFull){
    if (vo) vo.style.display = 'none';
    if (log) log.style.opacity = '0';
    if (mission) mission.style.opacity = '0';
    if (hint) hint.style.display = 'none';
  } else {
    if (vo) vo.style.display = 'block';
    if (log) log.style.opacity = '1';
    if (mission) mission.style.opacity = '1';
  }

  updateMiniMapDisplay();
}

export function updateMiniMapDisplay(){
  const overlay = qs('map-overlay');
  const content = qs('minimap-content');
  const dotPlayer = qs('minimap-player-dot');
  if (!overlay || !content || !dotPlayer) return;

  const playerCenterX = state.playerX + state.playerW/2;
  const playerCenterY = state.playerY + state.playerH/2;

  let scale, overlaySize;
  let offsetX = 0, offsetY = 0;

  if (isFull){
    overlaySize = Math.floor(window.innerHeight * 0.8);
    scale = overlaySize / CONST.CONTAINER_WIDTH;
  } else {
    overlaySize = CONST.MINIMAP_SIZE_PIXELS;
    scale = CONST.FOCUSED_MAP_SCALE;
  }

  const scaledPlayerX = playerCenterX * scale;
  const scaledPlayerY = playerCenterY * scale;
  offsetX = overlaySize/2 - scaledPlayerX;
  offsetY = overlaySize/2 - scaledPlayerY;

  // clamp map so it doesn't move out of circle container
  const mapW = CONST.CONTAINER_WIDTH * scale;
  const mapH = CONST.CONTAINER_HEIGHT * scale;
  const maxOffsetLeft = overlaySize - mapW;
  offsetX = Math.min(0, Math.max(maxOffsetLeft, offsetX));
  const maxOffsetTop = overlaySize - mapH;
  offsetY = Math.min(0, Math.max(maxOffsetTop, offsetY));

  content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  // place player dot
  dotPlayer.style.left = `${playerCenterX}px`;
  dotPlayer.style.top  = `${playerCenterY}px`;
  // apply color by selected character
  try {
    if (state.playerColor) dotPlayer.style.backgroundColor = state.playerColor;
  } catch {}

  // keep dots visually same size (inverse-scale)
  const inv = 1/scale;
  const dotT = `translate(-50%, -50%) scale(${inv})`;
  dotPlayer.style.transform = dotT;

  // mission dots
  const dots = {
    'mission-guest': qs('minimap-guest-dot'),
    'mission-heist': qs('minimap-heist-dot'),
    'mission-meeting': qs('minimap-meeting-dot'),
  };
  MISSION_SPOTS_DATA.forEach(spot => {
    const d = dots[spot.id];
    if (!d) return;
    d.style.left = `${spot.x + spot.width/2}px`;
    d.style.top  = `${spot.y + spot.height/2}px`;
    d.style.transform = dotT;
  });

  // ===== Task dots for current wave (Visitor only) =====
  try {
    const contentEl = qs('minimap-content');
    if (contentEl && state.myRole === 'Visitor'){
      // สร้าง container ถ้ายังไม่มี
      let container = contentEl.querySelector('#minimap-task-dots');
      if (!container){ container = document.createElement('div'); container.id = 'minimap-task-dots'; contentEl.appendChild(container); }

      // ทำ map ของ element ตามชื่อ task
      const existing = new Map();
      for (const el of Array.from(container.children)){
        existing.set(el.dataset.mg, el);
      }

      const needed = new Set();
      for (const mg of (state.myUnlockedTasks || [])){
        if (state.myCompletedTasks?.includes(mg)) continue; // ไม่ต้องโชว์ถ้าทำเสร็จแล้ว
        needed.add(mg);
        let el = existing.get(mg);
        if (!el){
          el = document.createElement('div');
          el.className = 'minimap-mission-dot';
          el.style.background = '#ffdd00';
          el.style.boxShadow = '0 0 6px rgba(255,221,0,.9)';
          el.dataset.mg = mg;
          container.appendChild(el);
        }
        const obj = INTERACTABLE_OBJECTS.find(o => o.mg === mg);
        if (obj){
          const r = (o=>{ let {x,y,width:w,height:h}=o; if (w<0){x+=w;w=-w;} if(h<0){y+=h;h=-h;} return {x,y,w,h}; })(obj);
          el.style.left = `${r.x + r.w/2}px`;
          el.style.top  = `${r.y + r.h/2}px`;
          el.style.transform = dotT;
          el.title = `Task: ${mg}`;
          el.style.display = 'block';
        }
      }

      // ซ่อน/ลบที่ไม่ต้องใช้
      for (const [mg, el] of existing.entries()){
        if (!needed.has(mg)) el.style.display = 'none';
      }
    }
  } catch {}
}
