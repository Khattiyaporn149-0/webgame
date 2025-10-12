// game.js - รวม + แก้บั๊กรีเฟรชแล้วต้องเดินก่อนเห็นคนอื่น (Snapshot Cache + Hydration)

// ===================== Config =====================
const PLAYER_SPEED = 6;
const VISION_RADIUS = 300;
const FOG_COLOR = 'rgba(0,0,0,0.95)';
const ANIMATION_FRAME_RATE = 80;

const PLAYER_SPEED = 20; // <<< ความเร็ว 6
const VISION_RADIUS = 300; 
const FOG_COLOR = 'rgba(0, 0, 0, 0.95)'; 
const ANIMATION_FRAME_RATE = 80; 

// การตั้งค่าภารกิจและการโต้ตอบ
const INTERACTION_RADIUS = 200; 
const INTERACTION_KEY = 'KeyE'; // ปุ่มโต้ตอบ (ใช้เรียกประชุมด้วย)

let currentMissionProgress = 0;
const MAX_MISSION_PROGRESS = 10;
const MISSION_INCREASE_AMOUNT = 1;

let playerRole = 'Loading...';
let playerAbility = 'None';
const ROLE_REVEAL_DURATION = 5000;

const VISITOR_ABILITIES = {
  Engineer: 'ซ่อมแซมได้เร็วขึ้น',
  Scientist: 'มองเห็นจุดภารกิจได้ไกลขึ้น',
  Janitor: 'สามารถซ่อนหลักฐานที่ถูกขโมยได้ 1 ครั้ง'
};
const THIEF_ABILITIES = {
  Hacker: 'สามารถสุ่มปิดไฟในห้องหนึ่งเป็นเวลาสั้นๆ',
  Shadow: 'เคลื่อนไหวได้เงียบและเร็วขึ้นเล็กน้อย',
  Distractor: 'สามารถสร้างเสียงรบกวนปลอมได้ในแผนที่'
};

// ====== PERSISTENCE KEYS (ต่อห้อง) ======
const __params2 = new URLSearchParams(location.search);
const ROOM_CODE = __params2.get('code') || 'lobby01';
const STATE_KEY = `heist.state.${ROOM_CODE}`;     // role/ability/pos
const POS_KEY   = `heist.pos.${ROOM_CODE}`;       // pos only (backup)
const SNAPSHOT_KEY = `heist.snapshot.${ROOM_CODE}`; // ⬅️ แคชสแน็ปช็อตของห้อง

function saveState(partial){
  try{
    const cur = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    const next = { ...cur, ...partial, ts: Date.now() };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  }catch(_){}
}
function loadState(){
  try{
    const data = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return (data && typeof data === 'object') ? data : null;
  }catch(_){ return null; }
}
function clearState(){
  try{
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(POS_KEY);
  }catch(_){}
  console.log('🔁 Cleared saved state for room:', ROOM_CODE);
}
function savePositionThrottled(){
  const now = performance.now();
  if(!savePositionThrottled._last || now - savePositionThrottled._last > 200){
    savePositionThrottled._last = now;
    try{
      localStorage.setItem(POS_KEY, JSON.stringify({
        x: Math.round(playerWorldX), y: Math.round(playerWorldY), ts: Date.now()
      }));
    }catch(_){}
  }
}
function loadLastPositionOnly(){
  try{
    const p = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
    if(Number.isFinite(p.x) && Number.isFinite(p.y)) return { x:p.x, y:p.y };
  }catch(_){}
  return null;
}

// ===================== World / DOM =====================
let collisionObjects = [];

let isMapFullScreen = false;
const MINIMAP_SIZE_PIXELS = 150;
const FOCUSED_MAP_SCALE = 0.5;

const CONTAINER_WIDTH = 8192;
const CONTAINER_HEIGHT = 8192;

let playerWorldX = 4096;
let playerWorldY = 4096;

const CONTAINER_WIDTH = 8192 ;
const CONTAINER_HEIGHT = 8192 ;

// พาธไฟล์แผนที่ .tmj ที่ใช้งาน
// ไม่ใช้ไฟล์ TMJ อีกต่อไป (ลบการพึ่งพา Tiled)

// ตำแหน่งเริ่มต้นผู้เล่น (กลางแผนที่ 8192x8192)
let playerWorldX = 3500; 
let playerWorldY = 3500; 

// ตำแหน่งจุดภารกิจ (กระจายให้เหมาะสมกับแผนที่ 8192x8192)
const MISSION_SPOTS_DATA = [
    // ภารกิจผู้เยี่ยมชม: มุมซ้ายล่าง
    { id: 'mission-guest', type: 'guest', x: 1500, y: 7000, width: 90, height: 90 }, 
    // ภารกิจหัวขโมย: มุมขวาบน
    { id: 'mission-heist', type: 'heist', x: 7000, y: 1500, width: 90, height: 90 }, 
    // จุดเรียกประชุม: กลางแผนที่
    { id: 'mission-meeting', type: 'meeting', x: 4000, y: 4000, width: 150, height: 150 },
    // จุดโต้ตอบอื่นๆ (เช่น CCTV, ไฟฉุกเฉิน) สามารถเพิ่มได้ที่นี่
    { id: 'mission-cctv', type: 'Open_CCTV', x: 6000, y: 6000, width: 90, height: 90 }
];


// อ้างอิงองค์ประกอบ DOM
const gameContainer = document.getElementById('game-container');
const player = document.getElementById('player');
const debugCanvas = document.getElementById('debug-overlay');
const debugPanel = document.getElementById('debug-panel');
let debugCtx = debugCanvas ? debugCanvas.getContext('2d') : null;
let lastDebugRenderMs = 0; 
const DEBUG_MAX_FPS = 30; // throttle debug overlay

// Debug flags
let DEBUG_SHOW_COLLISION_BOXES = false; // F3
let DEBUG_SHOW_PLAYER_HITBOX = false;   // F4
// เปิดดีบักอัตโนมัติเมื่อมีพารามิเตอร์ ?debug=1 ใน URL

if (DEBUG_SHOW_PLAYER_HITBOX) {
  const hitW = playerWidth * 0.8;
  const hitH = playerHeight * 0.6;
  const offsetX = (playerWidth - hitW) / 2;
  const offsetY = (playerHeight - hitH) / 2 + 20;
  const x = (playerWorldX + offsetX) - viewLeft;
  const y = (playerWorldY + offsetY) - viewTop;

  debugCtx.strokeStyle = 'rgba(0,200,255,0.9)';
  debugCtx.lineWidth = 2;
  debugCtx.strokeRect(x, y, hitW, hitH);
}


try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
        DEBUG_SHOW_COLLISION_BOXES = true;
        DEBUG_SHOW_PLAYER_HITBOX = false;
    }
} catch (_) {}
let debugMouseWorldX = 0;
let debugMouseWorldY = 0;
let lastFogUpdateMs = 0; 
const FOG_MAX_FPS = 30; // throttle fog-of-war updates
const visionOverlay = document.getElementById('vision-overlay');
const interactionHint = document.getElementById('interaction-hint');
const logContainer = document.getElementById('log-container');

const missionProgressBar = document.getElementById('mission-bar-fill');
const missionProgressText = document.getElementById('mission-progress-text');

const meetingModal = document.getElementById('meeting-modal');
const endMeetingButton = document.getElementById('end-meeting-button');
const votingButtons = document.querySelectorAll('.vote-option');
const voteResultText = document.getElementById('vote-result');

const roleRevealModal = document.getElementById('role-reveal-modal');
const roleNameText = document.getElementById('role-name-text');
const roleTeamText = document.getElementById('role-team-text');
const roleAbilityText = document.getElementById('role-ability-text');
const roleCharacterImage = document.getElementById('role-character-image');
const roleCharacterDisplay = document.getElementById('role-character-display');

const sfxInteract = document.getElementById('sfx-interact');
const sfxHeist = document.getElementById('sfx-heist');
const bgmMusic = document.getElementById('bgm-music');

const mapOverlay = document.getElementById('map-overlay');
const minimapContent = document.getElementById('minimap-content');
const minimapPlayerDot = document.getElementById('minimap-player-dot');
const minimapMissionDots = {
  'mission-guest': document.getElementById('minimap-guest-dot'),
  'mission-heist': document.getElementById('minimap-heist-dot'),
  'mission-meeting': document.getElementById('minimap-meeting-dot'),
};

const keysPressed = {};
let isMoving = false;
let isMeetingActive = false;
let isRoleRevealed = false;

let containerX = 0;
let containerY = 0;
let VIEWPORT_WIDTH = window.innerWidth;
let VIEWPORT_HEIGHT = window.innerHeight;
let playerWidth = 128;
let playerHeight = 128;

// ===================== Sprites / Animation =====================
let __spriteChar = 'mini_brown';
try { const c = localStorage.getItem('ggd.char'); if (c) __spriteChar = c; } catch(_){}

function colorFromChar(charName){
  switch((charName||'').toLowerCase()){
    case 'mini_brown': return '#8B4513';
    case 'mini_coral': return '#FF7F50';
    case 'mini_gray': return '#A9A9A9';
    case 'mini_lavender': return '#B19CD9';
    case 'mini_mint': return '#3EB489';
    case 'mini_pink': return '#FF69B4';
    case 'mini_sky_blue': return '#87CEEB';
    case 'mini_yellow': return '#FFD700';
    default: return '#4CAF50';
  }
}
let idleFrames = [`assets/Characters/${__spriteChar}/idle_1.png`];
let walkFrames = Array.from({length:8}, (_,i)=>`assets/Characters/${__spriteChar}/walk_${i+1}.png`);
let currentAnimation = 'idle';
let currentFrameIndex = 0;
let lastFrameTime = 0;

function updateAnimation(timestamp) {
    if (timestamp - lastFrameTime >= ANIMATION_FRAME_RATE) {
        lastFrameTime = timestamp;
        
        let frames;
        if (isMoving) {
            frames = walkFrames;
            if (currentAnimation !== 'walking') {
                currentAnimation = 'walking';
                currentFrameIndex = 0; 
            }
        } else {
            frames = idleFrames;
            if (currentAnimation !== 'idle') {
                currentAnimation = 'idle';
                currentFrameIndex = 0; 
            }
        }
        
        currentFrameIndex = (currentFrameIndex + 1) % frames.length;
        player.src = frames[currentFrameIndex];
    }
}



// *******************************************
// 1. ฟังก์ชันแสดงผล 
// *******************************************
function updateDisplay() {
     // กำหนดตำแหน่งของจุดภารกิจใน DOM ให้ตรงกับพิกัดใน MISSION_SPOTS_DATA
    MISSION_SPOTS_DATA.forEach(spot => {
        const element = document.getElementById(spot.id);
        if (element) {
            element.style.left = `${spot.x}px`;
            element.style.top = `${spot.y}px`;
        }
    });

    player.style.transform = `translate(${playerWorldX}px, ${playerWorldY}px)`;
    gameContainer.style.transform = `translate(${containerX}px, ${containerY}px)`;

    // อัปเดต Fog of War
    const playerScreenX_Center = playerWorldX + containerX + (playerWidth / 2);
    const playerScreenY_Center = playerWorldY + containerY + (playerHeight / 2);

    const nowFog = performance.now();
    if (nowFog - lastFogUpdateMs > (1000 / FOG_MAX_FPS) || isMoving) {
        lastFogUpdateMs = nowFog;
        visionOverlay.style.background = `radial-gradient(
            circle at ${playerScreenX_Center}px ${playerScreenY_Center}px, 
            transparent 0px, 
            transparent ${VISION_RADIUS}px, 
            ${FOG_COLOR} ${VISION_RADIUS + 50}px
        )`;
    }
    
    // NEW: อัปเดต Minimap
    updateMiniMapDisplay();

    // DEBUG: วาด Overlay ถ้ามีการเปิดโหมดดีบัก
    renderDebugOverlay();
}

function updateDebugPanel() {
    if (!debugPanel) return;
    const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
    debugPanel.style.display = anyOn ? 'block' : 'none';
    if (!anyOn) return;

    const playerCenterX = playerWorldX + (playerWidth/2);
    const playerCenterY = playerWorldY + (playerHeight/2);
    debugPanel.innerText = [
        `PlayerWorld: ${Math.round(playerWorldX)}, ${Math.round(playerWorldY)}`,
        `Container: ${Math.round(containerX)}, ${Math.round(containerY)}`,
        `MouseWorld: ${Math.round(debugMouseWorldX)}, ${Math.round(debugMouseWorldY)}`,
        `CollisionRects: ${collisionObjects?.length || 0}`
    ].filter(Boolean).join('\n');
}

function renderDebugOverlay() {
    if (!debugCtx || !debugCanvas) return;
    const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
    if (!anyOn) { debugCtx.clearRect(0,0,debugCanvas.width, debugCanvas.height); updateDebugPanel(); return; }
    const now = performance.now();
    const minDelta = 1000 / DEBUG_MAX_FPS;
    if (now - lastDebugRenderMs < minDelta) { return; }
    lastDebugRenderMs = now;

    // Ensure canvas matches current viewport size (not full map) for performance
    if (debugCanvas.width !== VIEWPORT_WIDTH) debugCanvas.width = VIEWPORT_WIDTH;
    if (debugCanvas.height !== VIEWPORT_HEIGHT) debugCanvas.height = VIEWPORT_HEIGHT;

    debugCtx.clearRect(0,0,debugCanvas.width, debugCanvas.height);

    // Visible region in world coordinates
    const viewLeft = Math.max(0, -containerX);
    const viewTop = Math.max(0, -containerY);
    const viewRight = Math.min(CONTAINER_WIDTH, viewLeft + VIEWPORT_WIDTH);
    const viewBottom = Math.min(CONTAINER_HEIGHT, viewTop + VIEWPORT_HEIGHT);

    // (ลบระบบ Grid/Tiles ออกไปแล้ว)

    // Draw collision boxes (object layer)
    if (DEBUG_SHOW_COLLISION_BOXES && collisionObjects && collisionObjects.length) {
        debugCtx.strokeStyle = 'rgba(255,165,0,0.85)'; // orange
        debugCtx.lineWidth = 2;
        for (const r of collisionObjects) {
            const rx2 = r.x + r.w;
            const ry2 = r.y + r.h;
            if (r.x > viewRight || rx2 < viewLeft || r.y > viewBottom || ry2 < viewTop) continue; // skip off-screen
            debugCtx.strokeRect(r.x - viewLeft, r.y - viewTop, r.w, r.h);
        }
    }

    // Draw player hitbox (foot box used for collision)
    if (DEBUG_SHOW_PLAYER_HITBOX) {
        const effectiveWidth = playerWidth * 0.5;
        const effectiveHeight = playerHeight * 0.25;
        const offsetX = (playerWidth - effectiveWidth) / 2;
        const offsetY = playerHeight - effectiveHeight;
        const x = (playerWorldX + offsetX) - viewLeft;
        const y = (playerWorldY + offsetY) - viewTop;
        debugCtx.strokeStyle = 'rgba(0,200,255,0.9)';
        debugCtx.lineWidth = 2;
        debugCtx.strokeRect(x, y, effectiveWidth, effectiveHeight);
    }


    console.log("Sample wall:", collisionObjects[0]);
console.log("Player:", playerWorldX, playerWorldY);

    updateDebugPanel();
function updateAnimation(timestamp){
  if(timestamp - lastFrameTime >= ANIMATION_FRAME_RATE){
    lastFrameTime = timestamp;
    const frames = isMoving ? walkFrames : idleFrames;
    const nextAnim = isMoving ? 'walking' : 'idle';
    if(currentAnimation !== nextAnim){ currentAnimation = nextAnim; currentFrameIndex = 0; }
    currentFrameIndex = (currentFrameIndex + 1) % frames.length;
    if(player) player.src = frames[currentFrameIndex];
  }
}

// ===================== Display / Debug =====================
let lastFogUpdateMs = 0;
const FOG_MAX_FPS = 30;

let lastDebugRenderMs = 0;
const DEBUG_MAX_FPS = 30;
let DEBUG_SHOW_COLLISION_BOXES = false;
let DEBUG_SHOW_PLAYER_HITBOX = false;
let debugMouseWorldX = 0;
let debugMouseWorldY = 0;

(function primeDebugFlags(){
  try{
    const params = new URLSearchParams(window.location.search);
    if(params.get('debug') === '1'){ DEBUG_SHOW_COLLISION_BOXES = true; }
  }catch(_){}
})();

function updateDisplay(){
  // จุดภารกิจ
  MISSION_SPOTS_DATA.forEach(spot=>{
    const el = document.getElementById(spot.id);
    if(el){ el.style.left = `${spot.x}px`; el.style.top = `${spot.y}px`; }
  });

  // ผู้เล่น
  const wrap = document.getElementById('player-wrap');
  const t = `translate(${playerWorldX}px, ${playerWorldY}px)`;
  if(wrap) wrap.style.transform = t; else if(player) player.style.transform = t;

  // ป้ายชื่อ
  try{
    const np = document.getElementById('nameplate');
    const storedUID = (localStorage.getItem('ggd.uid') || sessionStorage.getItem('ggd.uid') || '0000');
    const pn = (localStorage.getItem('ggd.name') || `Player_${storedUID.slice(0,4)}`);
    if(np && np.textContent !== pn) np.textContent = pn;
  }catch(_){}

  // กล้อง
  gameContainer.style.transform = `translate(${containerX}px, ${containerY}px)`;

  // Fog follow player (throttle)
  const nowFog = performance.now();
  if(nowFog - lastFogUpdateMs > (1000/FOG_MAX_FPS) || isMoving){
    lastFogUpdateMs = nowFog;
    const cx = playerWorldX + containerX + (playerWidth/2);
    const cy = playerWorldY + containerY + (playerHeight/2);
    visionOverlay.style.background = `radial-gradient(circle at ${cx}px ${cy}px, transparent 0px, transparent ${VISION_RADIUS}px, ${FOG_COLOR} ${VISION_RADIUS+50}px)`;
  }

  updateMiniMapDisplay();
  renderDebugOverlay();
}

function updateDebugPanel(){
  if(!debugPanel) return;
  const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
  debugPanel.style.display = anyOn ? 'block' : 'none';
  if(!anyOn) return;
  debugPanel.innerText = [
    `PlayerWorld: ${Math.round(playerWorldX)}, ${Math.round(playerWorldY)}`,
    `Container: ${Math.round(containerX)}, ${Math.round(containerY)}`,
    `MouseWorld: ${Math.round(debugMouseWorldX)}, ${Math.round(debugMouseWorldY)}`,
    `CollisionRects: ${collisionObjects?.length || 0}`
  ].join('\n');
}

function renderDebugOverlay(){
  if(!debugCtx || !debugCanvas) return;
  const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
  if(!anyOn){ debugCtx.clearRect(0,0,debugCanvas.width,debugCanvas.height); updateDebugPanel(); return; }
  const now = performance.now();
  if(now - lastDebugRenderMs < (1000/DEBUG_MAX_FPS)) return;
  lastDebugRenderMs = now;

  if(debugCanvas.width !== VIEWPORT_WIDTH) debugCanvas.width = VIEWPORT_WIDTH;
  if(debugCanvas.height !== VIEWPORT_HEIGHT) debugCanvas.height = VIEWPORT_HEIGHT;
  debugCtx.clearRect(0,0,debugCanvas.width,debugCanvas.height);

  const viewLeft = Math.max(0, -containerX);
  const viewTop  = Math.max(0, -containerY);
  const viewRight = Math.min(CONTAINER_WIDTH, viewLeft + VIEWPORT_WIDTH);
  const viewBottom = Math.min(CONTAINER_HEIGHT, viewTop + VIEWPORT_HEIGHT);

  if(DEBUG_SHOW_COLLISION_BOXES && collisionObjects?.length){
    debugCtx.strokeStyle = 'rgba(255,165,0,0.85)';
    debugCtx.lineWidth = 2;
    for(const r of collisionObjects){
      const rx2 = r.x + r.w, ry2 = r.y + r.h;
      if(r.x > viewRight || rx2 < viewLeft || r.y > viewBottom || ry2 < viewTop) continue;
      debugCtx.strokeRect(r.x - viewLeft, r.y - viewTop, r.w, r.h);
    }
  }
  if(DEBUG_SHOW_PLAYER_HITBOX){
    const effectiveWidth = playerWidth * 0.5;
    const effectiveHeight = playerHeight * 0.25;
    const offsetX = (playerWidth - effectiveWidth) / 2;
    const offsetY = playerHeight - effectiveHeight;
    const x = (playerWorldX + offsetX) - viewLeft;
    const y = (playerWorldY + offsetY) - viewTop;
    debugCtx.strokeStyle = 'rgba(0,200,255,0.9)';
    debugCtx.lineWidth = 2;
    debugCtx.strokeRect(x, y, effectiveWidth, effectiveHeight);
  }
  updateDebugPanel();
}

// ===================== Log & Audio =====================
function addLogEvent(message, type='general'){
  const el = document.createElement('p');
  el.className = 'log-message';
  if(type === 'heist') el.classList.add('heist');
  el.textContent = message;
  if(logContainer.firstChild) logContainer.insertBefore(el, logContainer.firstChild);
  else logContainer.appendChild(el);
  while(logContainer.children.length > MAX_LOG_MESSAGES) logContainer.removeChild(logContainer.lastChild);
  setTimeout(()=>{ el.style.opacity = '0'; }, LOG_FADE_DURATION_MS);
  setTimeout(()=>{ if(el.parentElement === logContainer) logContainer.removeChild(el); }, LOG_FADE_DURATION_MS + 1000);
}
function playSound(a){ a.currentTime = 0; a.play().catch(()=>{}); }

// ===================== Mission =====================
function updateMissionStatus(){
  currentMissionProgress = Math.min(currentMissionProgress, MAX_MISSION_PROGRESS);
  const percent = Math.round((currentMissionProgress / MAX_MISSION_PROGRESS) * 100);
  missionProgressBar.style.width = `${percent}%`;
  missionProgressText.textContent = `${percent}%`;
  if(currentMissionProgress >= MAX_MISSION_PROGRESS){
    addLogEvent('✅ ภารกิจผู้เยี่ยมชมเสร็จสมบูรณ์ (ฝ่ายผู้เยี่ยมชมชนะ)', 'heist');
  }
}

// game.js: ฟังก์ชัน loadCollisionData() (ไม่มี Tiled; ใช้ SVG/JSON)
async function loadCollisionData() {
    collisionObjects = [];
    // 1) ลองโหลดจาก SVG ก่อน
    try {   
        const res = await fetch('assets/maps/collision.svg', { cache: 'no-cache' });
        if (res.ok) {
            const svgText = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgEl = doc.documentElement;

            // คำนวณสเกลจากขนาด SVG -> ขนาดโลกเกม (8192x8192)
            let baseW = CONTAINER_WIDTH;
            let baseH = CONTAINER_HEIGHT;
            const vb = svgEl.getAttribute('viewBox');
            if (vb) {
                const parts = vb.split(/\s+/).map(Number);
                if (parts.length === 4) {
                    baseW = parts[2] || baseW;
                    baseH = parts[3] || baseH;
                }
            } else {
                const wAttr = parseFloat((svgEl.getAttribute('width')||'').replace('px',''));
                const hAttr = parseFloat((svgEl.getAttribute('height')||'').replace('px',''));
                if (!Number.isNaN(wAttr) && wAttr>0) baseW = wAttr;
                if (!Number.isNaN(hAttr) && hAttr>0) baseH = hAttr;
            }
            const sx = CONTAINER_WIDTH / baseW;
            const sy = CONTAINER_HEIGHT / baseH;

            const rects = Array.from(doc.getElementsByTagName('rect'));
            for (const r of rects) {
                const x = parseFloat(r.getAttribute('x')||'0');
                const y = parseFloat(r.getAttribute('y')||'0');
                const w = parseFloat(r.getAttribute('width')||'0');
                const h = parseFloat(r.getAttribute('height')||'0');
                if (w>0 && h>0) {
                    collisionObjects.push({ x: x*sx, y: y*sy, w: w*sx, h: h*sy });
                }
            }
            console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from SVG`);
            return;
        }
    } catch (e) {
        console.warn('SVG collision load failed:', e);
    }

    // 2) Fallback: โหลดจาก JSON
    try {
        const res = await fetch('assets/maps/collision.json', { cache: 'no-cache' });
        if (res.ok) {
            const data = await res.json();
            let rects = [];
            if (Array.isArray(data)) rects = data;
            else if (Array.isArray(data.rects)) rects = data.rects;
            collisionObjects = rects
                .map(o => ({ x: +o.x||0, y: +o.y||0, w: +o.w||0, h: +o.h||0 }))
                .filter(o => o.w>0 && o.h>0);
            console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from JSON`);
            return;
        }
      }
    }else{
      el.style.opacity = .6;
    }

    for (const r of collisionObjects) {
        r.x *= 8;
        r.y *= 8;
        r.w *= 8;
        r.h *= 8;
        }
console.log("🔧 Applied manual scale x8 to collision boxes");

    console.warn('No collision data found (SVG/JSON). Running without collisions.');
}
// game.js: ฟังก์ชัน checkCollision() (ฉบับยืนยัน)
// 🔧 HITBOX FIXED
function checkCollision(nextX, nextY, playerW, playerH) {
  if (!collisionObjects?.length) return false;

  // ปรับสัดส่วน hitbox ให้ตรงกับภาพตัวละคร
  const hitW = playerW * 0.2;       // แคบลงหน่อย ให้ชนตรงกลาง
  const hitH = playerH * 0.2;       // สูงประมาณถึงไหล่
  const offsetX = (playerW - hitW) / 2;
  const offsetY = (playerH - hitH) ;  // 🔥 ยก hitbox ขึ้นมาประมาณ 20%

  const box = {
    left: nextX + offsetX,
    top: nextY + offsetY,
    right: nextX + offsetX + hitW,
    bottom: nextY + offsetY + hitH,
  };

  for (const r of collisionObjects) {
    const rx2 = r.x + r.w;
    const ry2 = r.y + r.h;
    if (box.left < rx2 && box.right > r.x && box.top < ry2 && box.bottom > r.y) {
      return true; // collide!
    }
  }
  return false;
}

// 🔍 DEBUG OVERLAY FIX
if (DEBUG_SHOW_PLAYER_HITBOX) {
  const hitW = playerW * 0.005;       // แคบลงหน่อย ให้ชนตรงกลาง
  const hitH = playerH * 0.00005;
  const offsetX = (playerWidth - hitW) / 2;
  const offsetY = (playerHeight - hitH) * 0.2;
  const x = (playerWorldX + offsetX) - viewLeft;
  const y = (playerWorldY + offsetY) - viewTop;
  debugCtx.strokeStyle = 'rgba(0,255,255,0.9)';
  debugCtx.lineWidth = 2;
  debugCtx.strokeRect(x, y, hitW, hitH);
}

// game.js: ฟังก์ชัน checkCollisionAdvanced() (สำหรับรูปทรงอื่นๆ)
function checkCollisionAdvanced(nextX, nextY, playerW, playerH) {
  // ปรับ hitbox ให้ตรงพื้นจริง (เหมือนฟังก์ชันข้างบน)
  const hitW = playerW * 0.3;
  const hitH = playerH * 0.4;
  const offsetX = (playerW - hitW) / 2;
  const offsetY = (playerH - hitH) / 2; // เพิ่ม 20px ลงล่าง

  const box = {
    left: nextX + offsetX,
    top: nextY + offsetY,
    right: nextX + offsetX + hitW,
    bottom: nextY + offsetY + hitH
  };

  if (!collisionObjects?.length) return false;

  for (const r of collisionObjects) {
    if (r.type === 'rect') {
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      if (
        box.left < rx2 &&
        box.right > r.x &&
        box.top < ry2 &&
        box.bottom > r.y
      ) return true;
    }
    else if (r.type === 'circle') {
      const cx = r.x;
      const cy = r.y;
      const radius = r.r;
      const closestX = Math.max(box.left, Math.min(cx, box.right));
      const closestY = Math.max(box.top, Math.min(cy, box.bottom));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    else if (r.type === 'polygon' && r.points?.length >= 3) {
      // polygon collision (simple point-in-poly)
      const corners = [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.left, y: box.bottom },
        { x: box.right, y: box.bottom }
      ];
      if (corners.some(pt => pointInPolygon(pt, r.points))) return true;
    }
  }
  return false;
}

// helper function สำหรับ polygon collision
function pointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
                      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function endMeeting(){
  isMeetingActive = false;
  meetingModal.style.display = 'none';
  bgmMusic.play().catch(()=>{});
  mapOverlay.style.display = 'block';
  addLogEvent('การประชุมสิ้นสุดลงแล้ว');
}
function handleVote(target){
  if(!isMeetingActive) return;
  voteResultText.textContent = `โหวตไปยัง: ${target}! รอผล...`;
  votingButtons.forEach(b=>b.disabled=true);
  setTimeout(endMeeting, 3000);
}

// *******************************************
// 🧩 SYSTEM: Generic Object Interaction System
// *******************************************

// 1️⃣ ข้อมูล Object ที่โต้ตอบได้ (เพิ่มอันใหม่ได้เรื่อยๆ)
    const INTERACTABLE_OBJECTS = [
    { id: 'printer', x: 3400, y: 3470, width: 100, height: 110, type: 'printer', active: true },
    { id: 'tree_middle_room', x: 4750, y: 4300, width: -50,height: -100, type: 'tree', active: true },
    { id: 'Telephone', x: 4100, y: 4390, width: -100, height: 200, type: 'Telephone', active: true },
    { id: 'Scrupture1', x: 3570, y: 1500, width: 50, height: -200, type: 'Scrupture', active: true },
    { id: 'tree_upper_room1', x: 3200, y: 500, width: -180,height: 30, type: 'tree', active: true },
    { id: 'hidden_switch', x: 4280, y: 550, width: -50,height: -50, type: 'switch(?)', active: true },
    { id: 'Scrupture2', x: 4780, y: 1200, width: -800, height: -400, type: 'Scrupture', active: true },
    { id: 'tree_upper_room2', x: 4440, y: 1160, width: -220,height: -220, type: 'tree', active: true },
    { id: 'Broom', x: 1500, y: 3280, width: -200,height: -200, type: 'broom', active: true },
    { id: 'computer1', x: 3520, y: 7020, width: -350,height: -350, type: 'computer', active: true },
    { id: 'computer2', x: 4320, y: 7180, width: -700,height: -350, type: 'computer', active: true },
    { id: 'computer3', x: 4750, y: 6900, width: -100,height: -400, type: 'computer', active: true },
    { id: 'monitor', x: 4980, y: 7500, width: -2000,height: -400, type: 'monitor', active: true },
    { id: 'matchine', x: 6580, y: 3160, width: -380,height: -200, type: 'matchine', active: true },
    { id: 'battery', x: 7120, y: 4260, width: -600,height: -600, type: 'battery', active: true },
    { id: 'power', x: 7420, y: 7850, width: -200,height: -150, type: 'power', active: true },
];


// 2️⃣ ฟังก์ชันวาดวัตถุ (ตัวอย่างให้วาดจุด debug)
function renderInteractableObjects() {
  if (!debugCtx || !DEBUG_SHOW_COLLISION_BOXES) return;
  debugCtx.strokeStyle = 'rgba(0,255,100,0.8)';
  debugCtx.lineWidth = 2;
  for (const obj of INTERACTABLE_OBJECTS) {
    const x = obj.x - Math.max(0, -containerX);
    const y = obj.y - Math.max(0, -containerY);
    debugCtx.strokeRect(x, y, obj.width, obj.height);
  }
}

// 3️⃣ ฟังก์ชันตรวจโต้ตอบกับ Object
function checkObjectInteractions() {
  const playerCenterX = playerWorldX + playerWidth / 2;
  const playerCenterY = playerWorldY + playerHeight / 2;

  let nearObj = null;
  for (const obj of INTERACTABLE_OBJECTS) {
    if (!obj.active) continue;
    const objCenterX = obj.x + obj.width / 2;
    const objCenterY = obj.y + obj.height / 2;
    const dist = getDistance(playerCenterX, playerCenterY, objCenterX, objCenterY);

    if (dist < INTERACTION_RADIUS) {
      nearObj = obj;
      break;
    }
  }

  // แสดง Hint ถ้าอยู่ใกล้
  if (nearObj) {
    interactionHint.style.display = 'block';
    interactionHint.textContent = `Press E to interact with ${nearObj.type}`;
    if (keysPressed[INTERACTION_KEY]) {
      keysPressed[INTERACTION_KEY] = false;
      handleObjectInteraction(nearObj);
    }
  } else {
    if (interactionHint.style.display !== 'none')
      interactionHint.style.display = 'none';
  }
}

// 4️⃣ ฟังก์ชันทำงานเมื่อโต้ตอบจริง
function handleObjectInteraction(obj) {
  switch (obj.type) {
    case 'door':
      addLogEvent('🚪 คุณเปิดประตูแล้ว!');
      playSound(sfxInteract);
      obj.active = false; // ทำได้ครั้งเดียว
      break;
    case 'console':
      addLogEvent('💻 คุณใช้งานคอนโซล ระบบทำงานแล้ว!');
      playSound(sfxInteract);
      break;
    case 'item':
      addLogEvent('🎁 คุณเก็บของได้สำเร็จ!');
      playSound(sfxInteract);
      obj.active = false;
      break;
    default:
      addLogEvent(`❓ คุณโต้ตอบกับวัตถุ ${obj.id}`);
      break;
  }
}



// *******************************************
// 2. Game Loop (แก้ไข Logic การเคลื่อนที่และการชน)
// *******************************************
function worldGameLoop(timestamp) {
    
    // NEW: หยุด Game Loop ถ้า Role Reveal ยังทำงานอยู่
    if (isRoleRevealed) {
        updateAnimation(timestamp); 
        requestAnimationFrame(worldGameLoop); 
        return; 
    }
    
    if (isMeetingActive) {
        updateAnimation(timestamp); 
        requestAnimationFrame(worldGameLoop); 
        return; 
    }
    
    let deltaX = 0;
    let deltaY = 0;

    // 1. ตรวจสอบการกดปุ่มและคำนวณการเปลี่ยนแปลงตำแหน่ง
    if (keysPressed['ArrowUp'] || keysPressed['KeyW']) { deltaY -= PLAYER_SPEED; }
    if (keysPressed['ArrowDown'] || keysPressed['KeyS']) { deltaY += PLAYER_SPEED; }
    if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) { deltaX -= PLAYER_SPEED; }
    if (keysPressed['ArrowRight'] || keysPressed['KeyD']) { deltaX += PLAYER_SPEED; }

    
    const wasMoving = isMoving;
    isMoving = (deltaX !== 0 || deltaY !== 0);

    if (isMoving) {
        let nextPlayerWorldX = playerWorldX + deltaX;
        let nextPlayerWorldY = playerWorldY + deltaY;

        // *******************************************
        // NEW/FIXED: Logic การเคลื่อนที่และการชน (Collision)
        // *******************************************
        
        // ตรวจสอบการชนแกน X
        // ลองเคลื่อนที่ไป X ใหม่ (ใช้ Y เดิม)
        if (!checkCollision(nextPlayerWorldX, playerWorldY, playerWidth, playerHeight)) {
            playerWorldX = nextPlayerWorldX; // ไม่ชน, อนุญาตให้เคลื่อนที่
        }
        
        // ตรวจสอบการชนแกน Y
        // ลองเคลื่อนที่ไป Y ใหม่ (ใช้ X ล่าสุด)
        if (!checkCollision(playerWorldX, nextPlayerWorldY, playerWidth, playerHeight)) {
            playerWorldY = nextPlayerWorldY; // ไม่ชน, อนุญาตให้เคลื่อนที่
        }

        // *******************************************
        // END: Logic การเคลื่อนที่และการชน
        // *******************************************

        // 2. จำกัดขอบเขตผู้เล่น (Boundaries Check)
        const MAX_WORLD_X = CONTAINER_WIDTH - playerWidth; 
        const MAX_WORLD_Y = CONTAINER_HEIGHT - playerHeight; 
        
        playerWorldX = Math.max(0, playerWorldX);
        playerWorldX = Math.min(MAX_WORLD_X, playerWorldX);
        playerWorldY = Math.max(0, playerWorldY);
        playerWorldY = Math.min(MAX_WORLD_Y, playerWorldY);

        // 3. การควบคุมกล้อง (Camera/Viewport)
        containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
        containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);

        // จำกัดขอบเขตการ Pan
        const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
        const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
        containerX = Math.min(0, containerX); 
        containerX = Math.max(maxContainerX, containerX); 
        containerY = Math.min(0, containerY); 
        containerY = Math.max(maxContainerY, containerY); 
        
        updateDisplay();
    }
    
    checkInteractions();
    checkObjectInteractions(); // ตรวจสอบการโต้ตอบกับวัตถุ
    
    if (isMoving || wasMoving !== isMoving) {
        updateAnimation(timestamp);
    }
    
    sendPlayerPosition();
    requestAnimationFrame(worldGameLoop);
}

function updateMiniMapDisplay(){
  if(!mapOverlay || !minimapContent || !minimapPlayerDot) return;

  const currentViewPortHeight = window.innerHeight;
  const playerCenterX = playerWorldX + (playerWidth/2);
  const playerCenterY = playerWorldY + (playerHeight/2);

  let scale, offsetX=0, offsetY=0, overlaySize;
  if(isMapFullScreen){
    overlaySize = Math.floor(currentViewPortHeight * 0.8);
    scale = overlaySize / CONTAINER_WIDTH;
  }else{
    overlaySize = MINIMAP_SIZE_PIXELS;
    scale = FOCUSED_MAP_SCALE;
  }

    // *** จำลองการดึง Character Asset Path จาก Database/Multiplayer ***
    const currentPlayerCharacterAsset = player.src; 
    
    // *** จำลองการกำหนดบทบาทและสุ่มความสามารถ ***
    const roles = ['Thief', 'Visitor']; 
    playerRole = roles[Math.floor(Math.random() * roles.length)]; 
  const scaledPlayerX = playerCenterX * scale;
  const scaledPlayerY = playerCenterY * scale;

  offsetX = (overlaySize/2) - scaledPlayerX;
  offsetY = (overlaySize/2) - scaledPlayerY;

  const mapAreaWidth = CONTAINER_WIDTH * scale;
  const mapAreaHeight = CONTAINER_HEIGHT * scale;

  offsetX = Math.min(0, Math.max(overlaySize - mapAreaWidth, offsetX));
  offsetY = Math.min(0, Math.max(overlaySize - mapAreaHeight, offsetY));

  minimapContent.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    
    // ล้าง Class Animation เก่าออกก่อน
    roleNameText.classList.remove('role-name-visitor', 'role-name-thief');
    if(roleCharacterDisplay) {
        roleCharacterDisplay.classList.remove('character-glow-visitor', 'character-glow-thief');
    }
    

    if (playerRole === 'Visitor') {
        const abilityPool = VISITOR_ABILITIES;
        const abilities = Object.keys(abilityPool);
        abilityName = abilities[Math.floor(Math.random() * abilities.length)];
        playerAbility = abilityPool[abilityName];
        roleTeamText.textContent = `ฝ่าย: ผู้เยี่ยมชม`;
        roleTeamText.style.color = '#4CAF50'; // สีเขียว
        
        // กำหนด Class Animation สีเขียว (เฉพาะเงาเรืองแสง)
        roleNameText.classList.add('role-name-visitor');
        if(roleCharacterDisplay) {
            roleCharacterDisplay.classList.add('character-glow-visitor'); 
        }
        
    } else if (playerRole === 'Thief') {
        const abilityPool = THIEF_ABILITIES;
        const abilities = Object.keys(abilityPool);
        abilityName = abilities[Math.floor(Math.random() * abilities.length)];
        playerAbility = abilityPool[abilityName];
        roleTeamText.textContent = `ฝ่าย: หัวขโมย`;
        roleTeamText.style.color = '#FF0000'; // สีแดง
        
        // กำหนด Class Animation สีแดง (เฉพาะเงาเรืองแสง)
        roleNameText.classList.add('role-name-thief');
        if(roleCharacterDisplay) {
            roleCharacterDisplay.classList.add('character-glow-thief'); 
        }
    }
    
    // แสดงผลบทบาทและความสามารถบน Modal
    roleNameText.textContent = abilityName.toUpperCase();
    roleAbilityText.textContent = playerAbility; 
    
    // แสดง Modal และตั้งค่าสถานะ
    roleRevealModal.style.display = 'flex'; 
    isRoleRevealed = true; 
    
    // ลบข้อความ Prompt ออกจาก HTML (ถ้ามี)
    const promptText = roleRevealModal.querySelector('p[style*="margin-top: 30px;"]');
    if (promptText) {
        promptText.style.display = 'none';
    }
  const playerMapX = playerWorldX + (playerWidth/2);
  const playerMapY = playerWorldY + (playerHeight/2);
  minimapPlayerDot.style.left = `${playerMapX}px`;
  minimapPlayerDot.style.top  = `${playerMapY}px`;
  const inv = 1/scale;
  const dotT = `translate(-50%,-50%) scale(${inv})`;
  minimapPlayerDot.style.transform = dotT;

  MISSION_SPOTS_DATA.forEach(spot=>{
    const dot = minimapMissionDots[spot.id];
    if(dot){
      dot.style.left = `${spot.x + (spot.width/2)}px`;
      dot.style.top  = `${spot.y + (spot.height/2)}px`;
      dot.style.transform = dotT;
    }
  });
}

// ===================== Collision =====================
async function loadCollisionData(){
  collisionObjects = [];
  try{
    const res = await fetch('assets/maps/collision.svg',{cache:'no-cache'});
    if(res.ok){
      const svgText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText,'image/svg+xml');
      const svgEl = doc.documentElement;
      let baseW = CONTAINER_WIDTH, baseH = CONTAINER_HEIGHT;
      const vb = svgEl.getAttribute('viewBox');
      if(vb){
        const parts = vb.split(/\s+/).map(Number);
        if(parts.length === 4){ baseW = parts[2] || baseW; baseH = parts[3] || baseH; }
      }else{
        const w = parseFloat((svgEl.getAttribute('width')||'').replace('px',''));
        const h = parseFloat((svgEl.getAttribute('height')||'').replace('px',''));
        if(!Number.isNaN(w) && w>0) baseW = w;
        if(!Number.isNaN(h) && h>0) baseH = h;
      }
      const sx = CONTAINER_WIDTH / baseW;
      const sy = CONTAINER_HEIGHT / baseH;
      const rects = Array.from(doc.getElementsByTagName('rect'));
      for(const r of rects){
        const x = parseFloat(r.getAttribute('x')||'0');
        const y = parseFloat(r.getAttribute('y')||'0');
        const w = parseFloat(r.getAttribute('width')||'0');
        const h = parseFloat(r.getAttribute('height')||'0');
        if(w>0 && h>0) collisionObjects.push({x:x*sx,y:y*sy,w:w*sx,h:h*sy});
      }
      console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from SVG`);
      return;
    }
  }catch(e){ console.warn('SVG collision load failed:', e); }

  try{
    const res = await fetch('assets/maps/collision.json',{cache:'no-cache'});
    if(res.ok){
      const data = await res.json();
      let rects = Array.isArray(data) ? data : (Array.isArray(data.rects) ? data.rects : []);
      collisionObjects = rects.map(o=>({x:+o.x||0,y:+o.y||0,w:+o.w||0,h:+o.h||0})).filter(o=>o.w>0&&o.h>0);
      console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from JSON`);
      return;
    }
  }catch(e){ console.warn('JSON collision load failed:', e); }

  console.warn('No collision data found (SVG/JSON). Running without collisions.');
}

function checkCollision(nextX, nextY, w, h){
  const effW = w*0.5, effH = h*0.25;
  const offX = (w - effW)/2, offY = (h - effH);
  const box = { left: nextX+offX, top: nextY+offY, right: nextX+offX+effW, bottom: nextY+offY+effH };
  for(const r of collisionObjects){
    const rx2 = r.x + r.w, ry2 = r.y + r.h;
    if(box.left < rx2 && box.right > r.x && box.top < ry2 && box.bottom > r.y) return true;
  }
  return false;
}

// ===================== Remote Players (Socket) =====================
const socket = io("https://webgame-25n5.onrender.com");
window.socket = socket;

const uid = (sessionStorage.getItem('ggd.uid') || localStorage.getItem('ggd.uid')) ||
  (()=>{ const v = (crypto?.randomUUID?.() || ('uid_' + Math.random().toString(36).slice(2,10)));
         sessionStorage.setItem('ggd.uid', v); localStorage.setItem('ggd.uid', v); return v; })();
console.log("🆔 Current UID:", uid);

let lastPlayersSnapshot = [];
let lastActiveUIDs = new Set();
let remotePlayers = {};
let remoteNameplates = {};

// ⬇️ Hydration: สร้างรีโมตเพลเยอร์จากแคชทันที (ยังไม่พึ่งเครือข่าย)
function hydrateRemoteFromCache(){
  try{
    const cache = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
    const arr = Array.isArray(cache.players) ? cache.players : [];
    if(!arr.length) return;
    lastPlayersSnapshot = arr;
    lastActiveUIDs = new Set(arr.map(p=>p.uid));
    for(const p of arr){ ensureRemoteExistsAndPosition(p); }
    console.log(`💾 Hydrated ${arr.length} remote players from cache`);
  }catch(e){ console.warn('Hydrate snapshot failed', e); }
}

// สร้าง/อัปเดตรีโมตเพลเยอร์
function ensureRemoteExistsAndPosition(p){
  if(p.uid === uid) return;
  let el = remotePlayers[p.uid];
  if(!el){
    el = document.createElement('img');
    const charName = p.char || 'mini_brown';
    el.src = `assets/Characters/${charName}/idle_1.png`;
    el.className = 'remote-player';
    Object.assign(el.style,{position:'absolute',width:'128px',height:'128px',imageRendering:'pixelated',willChange:'transform'});
    el.dataset.x = p.x; el.dataset.y = p.y;
    el.dataset.tx = p.x; el.dataset.ty = p.y;
    el._lastUpdate = performance.now();
    gameContainer.appendChild(el);
    remotePlayers[p.uid] = el;

    const np = document.createElement('div');
    np.className = 'remote-nameplate';
    np.textContent = p.name || `Player_${(p.uid||'xxxx').slice(0,4)}`;
    Object.assign(np.style,{position:'absolute',color:'#fff',fontWeight:'700',textShadow:'0 2px 6px #000',zIndex:350});
    gameContainer.appendChild(np);
    remoteNameplates[p.uid] = np;
  }
  const tx = Math.round(p.x), ty = Math.round(p.y);
  el.style.transform = `translate(${tx}px, ${ty}px)`;
  el.dataset.x = p.x; el.dataset.y = p.y;
  el.dataset.tx = tx; el.dataset.ty = ty;

  const np = remoteNameplates[p.uid];
  if(np){
    np.style.left = `${tx + 64}px`;
    np.style.top  = `${ty - 8}px`;
    np.style.transform = 'translate(-50%, -100%)';
    np.textContent = p.name || np.textContent;
  }
}

socket.on("connect", ()=>{
  console.log("✅ Connected:", socket.id);
  const myName = (localStorage.getItem('ggd.name') || `Player_${uid.slice(0,4)}`);
  const myChar = (localStorage.getItem('ggd.char') || 'mini_brown');
  socket.emit("game:join", {
    room: ROOM_CODE, uid, name: myName, char: myChar, color: "#00ffcc", x: playerWorldX, y: playerWorldY,
  });

  // ส่งตำแหน่งทันที + burst
  sendPlayerPosition(true);
  announcePresenceBurst();

  // ขอ snapshot ทันที (ถ้าฝั่งเซิร์ฟเวอร์รองรับ event นี้)
  try{ socket.emit("game:snapshot:request", { room: ROOM_CODE }); }catch(_){}
});

socket.on("snapshot", (payload)=>{
  if(!payload?.players) return;
  // อัปเดต active set
  const newSet = new Set(payload.players.map(p=>p.uid));
  for(const id of lastActiveUIDs){
    if(!newSet.has(id) && remotePlayers[id]){
      try{ remotePlayers[id].remove(); }catch(_){}
      delete remotePlayers[id];
      if(remoteNameplates[id]){ try{ remoteNameplates[id].remove(); }catch(_){}
        delete remoteNameplates[id]; }
    }
  }
  lastPlayersSnapshot = payload.players;
  lastActiveUIDs = newSet;

  // แคชลง localStorage
  try{ localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ players: payload.players, ts: Date.now() })); }catch(_){}

    let el = remotePlayers[p.uid];
    if (!el) {
      el = document.createElement("img");
      el.src = "assets/images/idle_1.png";
      el.className = "remote-player";
      Object.assign(el.style, {
        position: "absolute",
        width: "128px",
        height: "128px",
        imageRendering: "pixelated",
        willChange: "transform"
      });
      el.dataset.x = p.x;
      el.dataset.y = p.y;
      el.dataset.tx = p.x;
      el.dataset.ty = p.y;
      el._lastUpdate = performance.now();
      gameContainer.appendChild(el);
      remotePlayers[p.uid] = el;
    }
  // สร้าง/อัปเดต DOM
  for(const p of payload.players){ ensureRemoteExistsAndPosition(p); }
});

// Render loop: ลื่นไถล
function renderRemotePlayers(){
  for(const p of lastPlayersSnapshot){
    if(p.uid === uid) continue;
    let el = remotePlayers[p.uid];
    if(!el) continue;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const now = performance.now();
    const dt = (now - (el._lastUpdate || now)) / 1000;
    el._lastUpdate = now;

    const smoothing = Math.min(1, dt * 8);
    const nx = cx + (p.x - cx) * smoothing;
    const ny = cy + (p.y - cy) * smoothing;

    const tx = Math.round(nx), ty = Math.round(ny);
    if(tx !== +el.dataset.tx || ty !== +el.dataset.ty){
      el.style.transform = `translate(${tx}px, ${ty}px)`;
      el.dataset.tx = tx;
      el.dataset.ty = ty;
      el.dataset.tx = tx; el.dataset.ty = ty;
      const np = remoteNameplates[p.uid];
      if(np){
        np.style.left = `${tx + 64}px`;
        np.style.top  = `${ty - 8}px`;
        np.style.transform = 'translate(-50%, -100%)';
        np.textContent = p.name || np.textContent;
      }
    }
    el.dataset.x = nx; el.dataset.y = ny;
  }
  requestAnimationFrame(renderRemotePlayers);
}
requestAnimationFrame(renderRemotePlayers);

// ส่งตำแหน่งแบบ throttle
let lastSent = 0;
const SEND_INTERVAL = 80;
function sendPlayerPosition(force=false){
  const now = performance.now();
  if(!force && (!isMoving || now - lastSent < SEND_INTERVAL)) return;
  lastSent = now;
  socket.emit("player:move", {
    uid,
    x: playerWorldX,
    y: playerWorldY,
  });
  const myName = (localStorage.getItem('ggd.name') || `Player_${uid.slice(0,4)}`);
  const myChar = (localStorage.getItem('ggd.char') || 'mini_brown');
  socket.emit("player:move", { uid, x: playerWorldX, y: playerWorldY, name: myName, char: myChar });
}

// Heartbeat ช่วงแรกถี่ แล้วค่อยผ่อน
let heartbeatInterval = 1000;
let heartbeatTimer = setInterval(()=>sendPlayerPosition(true), heartbeatInterval);
setTimeout(()=>{
  clearInterval(heartbeatTimer);
  heartbeatInterval = 3000;
  heartbeatTimer = setInterval(()=>sendPlayerPosition(true), heartbeatInterval);
}, 10_000);

socket.on("disconnect", (reason)=>console.log("❌ Disconnected:", reason));
socket.on("error", (err)=>console.error("⚠️ Socket error:", err));

// ===================== Presence Burst =====================
function announcePresenceBurst(durationMs=1200, everyMs=150){
  const start = Date.now();
  const timer = setInterval(()=>{
    sendPlayerPosition(true);
    if(Date.now() - start >= durationMs) clearInterval(timer);
  }, everyMs);
}

// ===================== Game Loop =====================
function worldGameLoop(timestamp){
  if(isRoleRevealed || isMeetingActive){
    updateAnimation(timestamp);
    requestAnimationFrame(worldGameLoop);
    return;
  }

  // ส่งตำแหน่ง ensure (แม้ยังไม่เดิน)
  sendPlayerPosition(true);

  let dx=0, dy=0;
  if(keysPressed['ArrowUp']||keysPressed['KeyW']) dy -= PLAYER_SPEED;
  if(keysPressed['ArrowDown']||keysPressed['KeyS']) dy += PLAYER_SPEED;
  if(keysPressed['ArrowLeft']||keysPressed['KeyA']) dx -= PLAYER_SPEED;
  if(keysPressed['ArrowRight']||keysPressed['KeyD']) dx += PLAYER_SPEED;

  const wasMoving = isMoving;
  isMoving = (dx!==0 || dy!==0);

  if(isMoving){
    let nx = playerWorldX + dx;
    let ny = playerWorldY + dy;

    if(!checkCollision(nx, playerWorldY, playerWidth, playerHeight)) playerWorldX = nx;
    if(!checkCollision(playerWorldX, ny, playerWidth, playerHeight)) playerWorldY = ny;

    const MAX_X = CONTAINER_WIDTH - playerWidth;
    const MAX_Y = CONTAINER_HEIGHT - playerHeight;
    playerWorldX = Math.max(0, Math.min(MAX_X, playerWorldX));
    playerWorldY = Math.max(0, Math.min(MAX_Y, playerWorldY));

    containerX = -(playerWorldX - VIEWPORT_WIDTH/2 + playerWidth/2);
    containerY = -(playerWorldY - VIEWPORT_HEIGHT/2 + playerHeight/2);
    const maxCX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
    const maxCY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
    containerX = Math.min(0, Math.max(maxCX, containerX));
    containerY = Math.min(0, Math.max(maxCY, containerY));

    updateDisplay();

// ===== End Multiplayer Section =====
    savePositionThrottled();
    saveState({ x: Math.round(playerWorldX), y: Math.round(playerWorldY) });
  }

  checkInteractions();
  if(isMoving || wasMoving !== isMoving) updateAnimation(timestamp);
  sendPlayerPosition();
  requestAnimationFrame(worldGameLoop);
}

// ===================== Init =====================
function initializeGame(){
  VIEWPORT_WIDTH = window.innerWidth;
  VIEWPORT_HEIGHT = window.innerHeight;
  playerWidth = player.offsetWidth;
  playerHeight = player.offsetHeight;

  let chosenChar = 'mini_brown';
  try{ const c = localStorage.getItem('ggd.char'); if(c) chosenChar = c; }catch(_){}
  const currentCharAsset = `assets/Characters/${chosenChar}/idle_1.png`;
  try{ if(player) player.src = currentCharAsset; }catch(_){}

  loadCollisionData();

  const prev = loadState();
  let restoredPos = (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) ? {x:prev.x,y:prev.y} : loadLastPositionOnly();
  if(restoredPos){
    playerWorldX = Math.max(0, Math.min(CONTAINER_WIDTH - playerWidth, restoredPos.x));
    playerWorldY = Math.max(0, Math.min(CONTAINER_HEIGHT - playerHeight, restoredPos.y));
  }else{
    playerWorldX = 4096; playerWorldY = 4096;
  }

  // Role
  let abilityName;
  roleNameText?.classList.remove('role-name-visitor','role-name-thief');
  roleCharacterDisplay?.classList.remove('character-glow-visitor','character-glow-thief');

  const chosenColor = colorFromChar(localStorage.getItem('ggd.char') || __spriteChar);
  try{ if(minimapPlayerDot) minimapPlayerDot.style.backgroundColor = chosenColor; }catch(_){}

  if(prev && prev.role && prev.abilityName && prev.playerAbility){
    playerRole = prev.role;
    abilityName = prev.abilityName;
    playerAbility = prev.playerAbility;
  }else{
    const roles = ['Thief','Visitor'];
    playerRole = roles[Math.floor(Math.random()*roles.length)];
    if(playerRole === 'Visitor'){
      const abilities = Object.keys(VISITOR_ABILITIES);
      abilityName = abilities[Math.floor(Math.random()*abilities.length)];
      playerAbility = VISITOR_ABILITIES[abilityName];
    }else{
      const abilities = Object.keys(THIEF_ABILITIES);
      abilityName = abilities[Math.floor(Math.random()*abilities.length)];
      playerAbility = THIEF_ABILITIES[abilityName];
    }
    saveState({ role: playerRole, abilityName, playerAbility });
  }

  if(roleCharacterImage) roleCharacterImage.src = currentCharAsset;
  roleTeamText.textContent = (playerRole === 'Visitor') ? 'ฝ่าย: ผู้เยี่ยมชม' : 'ฝ่าย: หัวขโมย';
  roleTeamText.style.color = (playerRole === 'Visitor') ? '#4CAF50' : '#FF0000';
  if(playerRole === 'Visitor'){
    roleNameText.classList.add('role-name-visitor');
    roleCharacterDisplay?.classList.add('character-glow-visitor');
    if(roleCharacterImage) roleCharacterImage.style.filter = `drop-shadow(0 0 18px ${chosenColor})`;
  }else{
    roleNameText.classList.add('role-name-thief');
    roleCharacterDisplay?.classList.add('character-glow-thief');
    if(roleCharacterImage) roleCharacterImage.style.filter = `drop-shadow(0 0 18px ${chosenColor})`;
  }
  roleNameText.textContent = (abilityName || '').toUpperCase();
  roleAbilityText.textContent = playerAbility;

  // ถ้ามี role เดิม -> ไม่ต้องโชว์ modal
  if(prev && prev.role){
    roleRevealModal.style.display = 'none';
    isRoleRevealed = false;
    requestAnimationFrame(worldGameLoop);
    addLogEvent(`บทบาทต่อเนื่อง: ${playerRole} (${abilityName})`, playerRole==='Thief'?'heist':'general');
  }else{
    roleRevealModal.style.display = 'flex';
    isRoleRevealed = true;
    setTimeout(()=>{
      roleRevealModal.style.opacity = '0';
      setTimeout(()=>{
        roleRevealModal.style.display = 'none';
        isRoleRevealed = false;
        requestAnimationFrame(worldGameLoop);
        addLogEvent(`คุณได้รับบทบาทเป็น: ${playerRole} (${abilityName})`, playerRole==='Thief'?'heist':'general');
        addLogEvent(`สิ่งที่ทำได้: ${playerAbility}`);
        addLogEvent('กด [M] เพื่อเปิด/ปิดแผนที่เต็มจอ');
      }, 1000);
    }, ROLE_REVEAL_DURATION);
  }

  // กล้องเริ่มต้น + เฟรมแรก
  containerX = -(playerWorldX - VIEWPORT_WIDTH/2 + playerWidth/2);
  containerY = -(playerWorldY - VIEWPORT_HEIGHT/2 + playerHeight/2);
  const maxCX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
  const maxCY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
  containerX = Math.min(0, Math.max(maxCX, containerX));
  containerY = Math.min(0, Math.max(maxCY, containerY));
  updateDisplay();
  if(player) player.src = idleFrames[0];

  bgmMusic.volume = 0.4; bgmMusic.play().catch(()=>{});

  // ⬇️ สำคัญ: ไฮเดรตรีโมตเพลเยอร์จากแคชทันที (จะเห็นคนอื่นทันทีหลังรีเฟรช)
  hydrateRemoteFromCache();

  // ส่งตำแหน่งครั้งแรก + burst
  sendPlayerPosition(true);
  announcePresenceBurst();
}

// ===================== Events =====================
document.addEventListener('keydown',(e)=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',INTERACTION_KEY,'KeyM','KeyW','KeyA','KeyS','KeyD','F3','F4','Backquote'].includes(e.code)){
    e.preventDefault();
  }
  keysPressed[e.code] = true;
  if(e.code==='KeyM' && !isMeetingActive) toggleFullScreenMap();
  if(e.code==='F3'){ DEBUG_SHOW_COLLISION_BOXES = !DEBUG_SHOW_COLLISION_BOXES; renderDebugOverlay(); }
  if(e.code==='F4'){ DEBUG_SHOW_PLAYER_HITBOX = !DEBUG_SHOW_PLAYER_HITBOX; renderDebugOverlay(); }
  if(e.code==='Backquote'){
    const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
    const next = !anyOn;
    DEBUG_SHOW_COLLISION_BOXES = next;
    DEBUG_SHOW_PLAYER_HITBOX = false;
    renderDebugOverlay();
  }
});
document.addEventListener('keyup',(e)=>{ keysPressed[e.code] = false; });

endMeetingButton?.addEventListener('click', endMeeting);
votingButtons.forEach(btn => btn.addEventListener('click', ()=>handleVote(btn.getAttribute('data-target'))));

window.addEventListener('resize', ()=>{ VIEWPORT_WIDTH = innerWidth; VIEWPORT_HEIGHT = innerHeight; updateMiniMapDisplay(); });
window.addEventListener('mousemove', (e)=>{
  if(!gameContainer) return;
  const rect = gameContainer.getBoundingClientRect();
  debugMouseWorldX = e.clientX - rect.left;
  debugMouseWorldY = e.clientY - rect.top;
  updateDebugPanel();
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    sendPlayerPosition(true);
    announcePresenceBurst(800,160);
  }
});

window.addEventListener('beforeunload', ()=>{
  try{ saveState({ x: Math.round(playerWorldX), y: Math.round(playerWorldY) }); }catch(_){}
});

// เริ่มเกมเมื่อ DOM พร้อม
if(document.getElementById('game-container') && document.getElementById('player')){
  window.addEventListener('load', initializeGame);
}
