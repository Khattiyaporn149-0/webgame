// interactions.js — missions + world objects + meeting
import { CONST, state, refs } from './core.js';
import { getRole } from './roles.js';
import { openMinigameForObject } from './minigames.js';
import { getCurrentPlayers } from './multiplayer.js';


// --- Endgame trigger (safe, single-file; dynamic import overlay) ---
// เพิ่มใหม่: ระบบจบเกม (เมื่อภารกิจครบ 100%) — 2025-10-13 21:14:26 +07:00
let __endFired = false;
function endGame(detail){
  if (__endFired) return; __endFired = true;
  try {
    // freeze movement softly and pause bgm
    state.isMeetingActive = true;
    Object.keys(state.keysPressed || {}).forEach(k => state.keysPressed[k] = false);
    refs.bgmMusic?.pause();
  } catch {}
  // notify listeners (harmless if none)
  try { window.dispatchEvent(new CustomEvent('game:end', { detail })); } catch {}
  // best-effort show overlay; won't crash if file missing
  try {
    import('./endgame.js')
      .then(m => (m?.showEnd || m?.default || (()=>{}))(detail))
      .catch(()=>{});
  } catch {}
}

export const MISSION_SPOTS_DATA = [
  { id:'mission-guest',   type:'guest',   x:1500, y:7000, width:90, height:90 },
  // เพิ่มใหม่: ย้าย Heist มาไว้ในห้องด้านบน/กลางของแผนที่ (กะตำแหน่งให้เดินทดสอบง่าย) — 2025-10-13 22:15:00 +07:00
  { id:'mission-heist',   type:'heist',   x:4000, y:3000, width:90, height:90 },
  { id:'mission-meeting', type:'meeting', x:4000, y:4000, width:150, height:150 },
  { id:'mission-cctv',    type:'Open_CCTV', x:6000, y:6000, width:90, height:90 },
];

// เพิ่มใหม่: รองรับ override ตำแหน่ง mission spot ผ่าน query (?heist=4000,4000 เป็นต้น)
// 2025-10-13 22:10:00 +07:00 — เพื่อให้ทดสอบได้เร็วโดยไม่ต้องแก้โค้ดซ้ำ
try {
  const qs = new URLSearchParams(location.search);
  const clampXY = (x, y) => ({
    x: Math.max(0, Math.min(CONST.CONTAINER_WIDTH  - 1, x|0)),
    y: Math.max(0, Math.min(CONST.CONTAINER_HEIGHT - 1, y|0)),
  });
  const setPos = (id, x, y) => {
    const spot = MISSION_SPOTS_DATA.find(s => s.id === id);
    if (spot) { spot.x = x; spot.y = y; }
  };
  const parse = (v) => {
    const [sx, sy] = String(v||'').split(',');
    const x = Number(sx), y = Number(sy);
    return (Number.isFinite(x) && Number.isFinite(y)) ? clampXY(x, y) : null;
  };
  const map = [
    ['guest',   'mission-guest'],
    ['heist',   'mission-heist'],
    ['meeting', 'mission-meeting'],
    ['cctv',    'mission-cctv'],
  ];
  for (const [qkey, id] of map) {
    const v = qs.get(qkey);
    if (!v) continue; const p = parse(v); if (!p) continue; setPos(id, p.x, p.y);
  }
} catch {}

function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

function setMissionUI(){
  const pct = Math.round(state.missionProgress/CONST.MAX_MISSION_PROGRESS*100);
  if (refs.missionBarFill) refs.missionBarFill.style.width = `${pct}%`;
  if (refs.missionText) refs.missionText.textContent = `${pct}%`;

  // End condition: Visitors complete 100%
  // เพิ่มใหม่: ตรวจครบ 100% แล้วสั่งจบเกม — 2025-10-13 21:14:26 +07:00
  try {
    if (!__endFired && getRole()==='Visitor' && state.missionProgress >= CONST.MAX_MISSION_PROGRESS){
      endGame({ outcome: 'visitors_win', reason: 'missions_complete', percent: pct });
    }
  } catch {}
}
export function startMeeting(at = CONST.MEETING_POINT){
  if (state.isMeetingActive) return;
  state.isMeetingActive = true;

  // หยุดการเคลื่อนไหวและย้ายผู้เล่นไปจุดกลางประชุม
  state.playerX = at.x; 
  state.playerY = at.y;
  Object.keys(state.keysPressed).forEach(k => state.keysPressed[k] = false);

  // แสดง Modal
  if (!refs.meetingModal) return;
  refs.meetingModal.style.display = 'flex';
  refs.bgmMusic?.pause();

  const grid = document.getElementById('player-vote-grid');
  const result = refs.voteResultText;
  if (!grid) return;

  grid.innerHTML = ''; // ล้างรายการเก่า

  // ✅ ดึงข้อมูลผู้เล่นทั้งหมดในห้อง
  const players = getCurrentPlayers();
  if (!players || !players.length) {
    const emptyMsg = document.createElement('p');
    emptyMsg.textContent = '(ไม่มีผู้เล่นในห้อง)';
    emptyMsg.style.color = '#ccc';
    grid.appendChild(emptyMsg);
    return;
  }

  // ✅ สร้างการ์ดผู้เล่นแต่ละคน
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.player = p.uid;

    const img = document.createElement('img');
    img.src = `assets/Characters/${p.char}/idle_1.png`;
    img.alt = p.name;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    btn.textContent = 'Vote';
    btn.addEventListener('click', () => {
      if (result) result.textContent = `คุณโหวตให้ ${p.name}`;
      setTimeout(() => endMeeting(), 2000);
    });

    card.append(img, name, btn);
    grid.appendChild(card);
  });
}

export function endMeeting(){
  state.isMeetingActive = false;
  refs.meetingModal && (refs.meetingModal.style.display = 'none');
  refs.bgmMusic?.play().catch(()=>{});
}

export function checkInteractions(){
  const role = getRole(); // 'Visitor' | 'Thief'
  const pcx = state.playerX + state.playerW/2;
  const pcy = state.playerY + state.playerH/2;

  let canInteract = false;

  for (const spot of MISSION_SPOTS_DATA){
    const el = document.getElementById(spot.id);
    if (!el) continue;

    // วาง element ตาม world pos
    el.style.left = `${spot.x}px`;
    el.style.top  = `${spot.y}px`;

    // ซ่อน/แสดงตามบทบาท
    if (spot.type === 'heist' && role !== 'Thief'){ el.style.display = 'none'; continue; }
    el.style.display = 'block';

    const scx = spot.x + spot.width/2, scy = spot.y + spot.height/2;
    const d = dist(pcx,pcy,scx,scy);

    if (d <= CONST.INTERACTION_RADIUS){
      canInteract = true;
      el.style.opacity = 1;
      if (state.keysPressed[CONST.INTERACTION_KEY]){
        state.keysPressed[CONST.INTERACTION_KEY] = false;

        if (spot.type === 'guest' && role === 'Visitor'){
          state.missionProgress = Math.min(CONST.MAX_MISSION_PROGRESS, state.missionProgress + CONST.MISSION_INCREASE_AMOUNT);
          setMissionUI();
          log('🛠️ ซ่อมแซมสำเร็จ (+1%)');
          refs.sfxInteract?.play().catch(()=>{});
        } else if (spot.type === 'heist' && role === 'Thief'){
          log('🚨 พบการขโมย!', 'heist'); refs.sfxHeist?.play().catch(()=>{});
          // เพิ่มใหม่: ทริกเกอร์โจรชนะเมื่อทำ Heist สำเร็จ — 2025-10-13 21:55:00 +07:00
          try { endGame({ outcome: 'thief_win', reason: 'heist_success' }); } catch {}
        } else if (spot.type === 'meeting'){
          startMeeting(CONST.MEETING_POINT); refs.sfxInteract?.play().catch(()=>{});
        } else if (spot.type === 'Open_CCTV'){
          log('📹 เปิด CCTV'); refs.sfxInteract?.play().catch(()=>{});
        } else {
          log('คุณไม่สามารถโต้ตอบกับวัตถุนี้ได้');
        }
      }
    } else {
      el.style.opacity = 0.6;
    }
  }

  if (refs.interactionHint) refs.interactionHint.style.display = canInteract ? 'block' : 'none';
}

// 1️⃣ ข้อมูล Object ที่โต้ตอบได้ (เพิ่มอันใหม่ได้เรื่อยๆ)
    const INTERACTABLE_OBJECTS = [
    { id: 'printer', x: 3400, y: 3470, width: 100, height: 110, type: 'printer', active: true},
    { id: 'tree_middle_room', x: 4750, y: 4300, width: -50,height: -100, type: 'tree', active: true },
    { id: 'Telephone', x: 4100, y: 4390, width: -100, height: 200, type: 'Telephone', active: true },
    { id: 'Scrupture1', x: 3570, y: 1500, width: 50, height: -200, type: 'Scrupture', active: true },
    { id: 'tree_upper_room1', x: 3200, y: 500, width: -180,height: 30, type: 'tree', active: true },
    { id: 'hidden_switch', x: 4280, y: 550, width: -50,height: -50, type: 'switch(?)', active: true, mg: 'align' },
    { id: 'Scrupture2', x: 4780, y: 1200, width: -800, height: -400, type: 'Scrupture', active: true },
    { id: 'tree_upper_room2', x: 4440, y: 1160, width: -220,height: -220, type: 'tree', active: true },
    { id: 'Broom', x: 1500, y: 3280, width: -200,height: -200, type: 'broom', active: true, mg: 'mop'},
    { id: 'computer1', x: 3520, y: 7020, width: -350,height: -350, type: 'computer', active: true },
    { id: 'computer2', x: 4320, y: 7180, width: -700,height: -350, type: 'computer', active: true , mg: 'upload'},
    { id: 'computer3', x: 4750, y: 6900, width: -100,height: -400, type: 'computer', active: true },
    { id: 'monitor', x: 4980, y: 7500, width: -2000,height: -400, type: 'monitor', active: true , mg: 'dodge'},
    { id: 'matchine', x: 6580, y: 3160, width: -380,height: -200, type: 'matchine', active: true, mg: 'rhythm' },
    { id: 'battery', x: 7120, y: 4260, width: -600,height: -600, type: 'battery', active: true , mg: 'switch'},
    { id: 'power', x: 7420, y: 7850, width: -200,height: -150, type: 'power', active: true , mg: 'wires'},
    { id: '้hackbox', x: 1512, y: 6132, width: -200, height: -150, type: 'hackbox', active: true , mg: 'math'}
];

function normRect({x,y,width:w,height:h}){
  if (w<0){ x+=w; w=-w; } if (h<0){ y+=h; h=-h; }
  return { x,y,w,h };
}

let telCooldown=false, telRemain=0, telTimer=null, telUsed=0;

export function checkObjectInteractions(){
  const pcx = state.playerX + state.playerW/2;
  const pcy = state.playerY + state.playerH/2;

  let near = null;
  for (const raw of INTERACTABLE_OBJECTS){
    if (!raw.active) continue;
    const {x,y,w,h} = normRect(raw);
    const ocx = x+w/2, ocy = y+h/2;
    if (dist(pcx,pcy,ocx,ocy) < CONST.INTERACTION_RADIUS){ near = { ...raw, x,y,w,h }; break; }
  }

  if (!refs.interactionHint) return;
  if (!near){ refs.interactionHint.style.display='none'; return; }
  refs.interactionHint.style.display='block';
  if (near.type === 'Telephone'){
    refs.interactionHint.textContent = telCooldown ? `📵 โทรศัพท์กำลังรีเซ็ต (${telRemain}s)` : '📞 กด [E] เพื่อโทรเรียกประชุมฉุกเฉิน';
  } else {
    refs.interactionHint.textContent = near.mg ? '🎮 กด [E] เพื่อเริ่มมินิเกม' : `กด [E] เพื่อโต้ตอบกับ ${near.type}`;
  }

  if (!state.keysPressed[CONST.INTERACTION_KEY]) return;
  state.keysPressed[CONST.INTERACTION_KEY] = false;

  // มินิเกมก่อน ถ้ามี
  if (near.mg){
    openMinigameForObject(near, {
      onComplete: (obj) => {
        // เพิ่มความคืบหน้าภารกิจเมื่อผ่านมินิเกม
        const inc = Number(obj?.mg?.progress) || 1;
        state.missionProgress = Math.min(CONST.MAX_MISSION_PROGRESS, state.missionProgress + inc);
        setMissionUI();
        log('✅ Minigame complete! (+progress)');
        obj.active = false;
      }
    });
    return;
  }

  if (near.type === 'Telephone'){
    if (state.isMeetingActive){ log('☎️ ประชุมอยู่แล้ว'); return; }
    if (telCooldown){ log(`⏳ รอได้อีก (${telRemain}s)`); return; }
    if (telUsed >= CONST.MAX_TELEPHONE_CALLS){ log('📵 โทรศัพท์ใช้ครบแล้ว'); return; }

    telUsed++; log(`📞 โทรเรียกประชุม (${telUsed}/${CONST.MAX_TELEPHONE_CALLS})`);
    startMeeting(CONST.MEETING_POINT); refs.sfxInteract?.play().catch(()=>{});

    telCooldown = true; telRemain = CONST.TELEPHONE_COOLDOWN_MS/1000;
    clearInterval(telTimer);
    telTimer = setInterval(() => {
      telRemain--;
      if (telRemain <= 0){
        clearInterval(telTimer); telCooldown = false; telRemain = 0;
        if (telUsed < CONST.MAX_TELEPHONE_CALLS) log('📞 โทรศัพท์พร้อมใช้งานอีกครั้ง');
      }
      if (refs.interactionHint && near.type === 'Telephone'){
        refs.interactionHint.textContent = telCooldown ? `📵 โทรศัพท์กำลังรีเซ็ต (${telRemain}s)` : '📞 กด [E] เพื่อโทรเรียกประชุมฉุกเฉิน';
      }
    }, 1000);
    return;
  }

  // generic
  log(`✅ โต้ตอบกับ ${near.id}`); refs.sfxInteract?.play().catch(()=>{});
  near.active = false;
}

/* ===== log helper ===== */
function log(text, kind='general'){
  const box = refs.logContainer; if (!box) return;
  const p = document.createElement('p'); p.className = 'log-message'; if (kind==='heist') p.classList.add('heist');
  p.textContent = text; box.insertBefore(p, box.firstChild || null);
  while (box.children.length > 5) box.removeChild(box.lastChild);
  setTimeout(()=>{ p.style.opacity='0'; }, 10000);
  setTimeout(()=>{ p.remove(); }, 11000);
}
