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
    // ทำให้แมพเล็กลงเพื่อให้พอดีในวงกลม (ลด padding/border)
    const maxDimension = Math.max(CONST.CONTAINER_WIDTH, CONST.CONTAINER_HEIGHT);
    scale = (overlaySize * 0.75) / maxDimension; // ลด 25% เพื่อ padding
  } else {
    overlaySize = CONST.MINIMAP_SIZE_PIXELS;
    scale = CONST.FOCUSED_MAP_SCALE;
  }

  const scaledPlayerX = playerCenterX * scale;
  const scaledPlayerY = playerCenterY * scale;
  
  if (isFull){
    // สำหรับโหมดเต็มจอ: center แมพให้อยู่กึ่งกลางวงกลม
    const mapW = CONST.CONTAINER_WIDTH * scale;
    const mapH = CONST.CONTAINER_HEIGHT * scale;
    offsetX = (overlaySize - mapW) / 2;
    offsetY = (overlaySize - mapH) / 2 - 20; // เลื่อนขึ้นด้านบนนิดหน่อย
  } else {
    // สำหรับโหมดปกติ: track ตามผู้เล่น
    offsetX = overlaySize/2 - scaledPlayerX;
    offsetY = overlaySize/2 - scaledPlayerY;
    
    // clamp map so it doesn't move out of circle container
    const mapW = CONST.CONTAINER_WIDTH * scale;
    const mapH = CONST.CONTAINER_HEIGHT * scale;
    const maxOffsetLeft = overlaySize - mapW;
    offsetX = Math.min(0, Math.max(maxOffsetLeft, offsetX));
    const maxOffsetTop = overlaySize - mapH;
    offsetY = Math.min(0, Math.max(maxOffsetTop, offsetY));
  }

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
    // Per request: hide static mission dots on minimap; use only dynamic task dots
    d.style.display = 'none';
  });

  // ===== Task dots for current wave (Visitor only) =====
  try {
    const contentEl = qs('minimap-content');
    if (contentEl && state.myRole === 'Visitor'){
        console.debug('[minimap] Visitor - rendering task dots', { 
          unlocked: state.myUnlockedTasks?.length, 
          completed: state.myCompletedTasks?.length 
        });
      
      // สร้าง container ถ้ายังไม่มี
      let container = contentEl.querySelector('#minimap-task-dots');
      if (!container){ container = document.createElement('div'); container.id = 'minimap-task-dots'; contentEl.appendChild(container); }

      // ทำ map ของ element ตามชื่อ task
      const existing = new Map();
      for (const el of Array.from(container.children)){
        existing.set(el.dataset.mg, el);
      }

      // helper: normalize task key for comparison (supports string or object with key)
      const mgKey = (m) => {
        if (!m) return '';
        if (typeof m === 'string') return m;
        if (typeof m === 'object' && m.key) return String(m.key);
        return String(m);
      };

      const needed = new Set();
      for (const rawMg of (state.myUnlockedTasks || [])){
        const mg = mgKey(rawMg);
        if (!mg) continue;
        if (state.myCompletedTasks?.includes(mg)) continue; // ไม่โชว์ถ้าทำเสร็จแล้ว
        // หา object ที่ยังมีอยู่ในเกม และยัง active เท่านั้น
        const obj = INTERACTABLE_OBJECTS.find(o => mgKey(o.mg) === mg && (o.active !== false));
        if (!obj) {
          // ถ้ามี element เก่าอยู่ ให้ซ่อนไว้
          const stale = existing.get(mg);
          if (stale) stale.style.display = 'none';
          continue; // ข้าม task ที่ไม่มี object แล้ว
        }

        needed.add(mg);
        let el = existing.get(mg);
        if (!el){
          el = document.createElement('div');
          el.className = 'minimap-mission-dot';
          el.dataset.mg = mg;
          container.appendChild(el);
          console.debug('[minimap] Created task dot:', mg);
        }
        const r = (o=>{ let {x,y,width:w,height:h}=o; if (w<0){x+=w;w=-w;} if(h<0){y+=h;h=-h;} return {x,y,w,h}; })(obj);
        el.style.left = `${r.x + r.w/2}px`;
        el.style.top  = `${r.y + r.h/2}px`;
        el.style.transform = dotT;
        el.title = `Task: ${mg}`;
        el.style.display = 'block';
        console.debug('[minimap] Positioned task dot:', mg, 'at', r.x + r.w/2, r.y + r.h/2);
      }

      // ซ่อน/ลบที่ไม่ต้องใช้
      for (const [mg, el] of existing.entries()){
        if (!needed.has(mg)) el.style.display = 'none';
      }
    }
    } catch (e) {
      console.error('[minimap] Task dots error:', e);
    }
}
