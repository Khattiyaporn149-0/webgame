// game.js - รวมครบ: แก้บั๊กสีชนข้ามแท็บ, snapshot hydrate, โฟกัสคีย์บอร์ด/ESC

// ===================== Config =====================
const PLAYER_SPEED = 6;
const VISION_RADIUS = 300;
const FOG_COLOR = 'rgba(0,0,0,0.95)';
const ANIMATION_FRAME_RATE = 80;

const INTERACTION_RADIUS = 150;
const INTERACTION_KEY = 'KeyE';

const MAX_LOG_MESSAGES = 5;
const LOG_FADE_DURATION_MS = 10000;

let currentMissionProgress = 0;
const MAX_MISSION_PROGRESS = 10;
const MISSION_INCREASE_AMOUNT = 1;

let playerRole = 'Loading...';
let playerAbility = 'None';
const ROLE_REVEAL_DURATION = 5000;

// ====== Roles ======
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

// ====== KEYS per room ======
const urlParams = new URLSearchParams(location.search);
const ROOM_CODE = urlParams.get('code') || 'lobby01';
const STATE_KEY    = `heist.state.${ROOM_CODE}`;
const POS_KEY      = `heist.pos.${ROOM_CODE}`;
const SNAPSHOT_KEY = `heist.snapshot.${ROOM_CODE}`;

// uid ต่อแท็บ (cache ลงทั้ง session + local ให้ใช้งานต่อ)
const uid = (sessionStorage.getItem('ggd.uid') || localStorage.getItem('ggd.uid')) ||
  (() => {
    const v = (crypto?.randomUUID?.() || ('uid_' + Math.random().toString(36).slice(2,10)));
    try { sessionStorage.setItem('ggd.uid', v); localStorage.setItem('ggd.uid', v); } catch {}
    return v;
  })();

// อ่าน/เขียนสีแบบ “ต่อห้องต่อคน”
const CHAR_KEY_SCOPED = `ggd.char.${ROOM_CODE}.${uid}`;
function getMyChar() {
  // ให้ session (ต่อแท็บ) ชนะ -> ถ้าไม่มีค่อยไปอ่าน key แบบสโคป
  return sessionStorage.getItem('ggd.char') || localStorage.getItem(CHAR_KEY_SCOPED) || 'mini_brown';
}

// ====== Persist helpers ======
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

const MISSION_SPOTS_DATA = [
  { id: 'mission-guest', type: 'guest', x: 1500, y: 7000, width: 90, height: 90 },
  { id: 'mission-heist', type: 'heist', x: 7000, y: 1500, width: 90, height: 90 },
  { id: 'mission-meeting', type: 'meeting', x: 4000, y: 4000, width: 150, height: 150 }
];

const gameContainer = document.getElementById('game-container');
const player = document.getElementById('player');
const debugCanvas = document.getElementById('debug-overlay');
const debugPanel = document.getElementById('debug-panel');
let debugCtx = debugCanvas ? debugCanvas.getContext('2d') : null;

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
let __spriteChar = getMyChar();
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
    const effW = playerWidth * 0.5, effH = playerHeight * 0.25;
    const offX = (playerWidth - effW) / 2, offY = (playerHeight - effH);
    const x = (playerWorldX + offX) - viewLeft;
    const y = (playerWorldY + offY) - viewTop;
    debugCtx.strokeStyle = 'rgba(0,200,255,0.9)';
    debugCtx.lineWidth = 2;
    debugCtx.strokeRect(x, y, effW, effH);
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

function getDistance(x1,y1,x2,y2){ const dx=x1-x2, dy=y1-y2; return Math.hypot(dx,dy); }
function checkInteractions(){
  if(playerRole === 'Loading...') return;
  const cx = playerWorldX + playerWidth/2;
  const cy = playerWorldY + playerHeight/2;
  let canInteract = false;

  for(const spot of MISSION_SPOTS_DATA){
    const el = document.getElementById(spot.id);
    if(!el) continue;
    if(spot.type === 'heist' && playerRole !== 'Thief') el.style.display = 'none';
    else el.style.display = 'block';
    if(el.style.display === 'none') continue;

    const sx = spot.x + spot.width/2;
    const sy = spot.y + spot.height/2;
    const d = getDistance(cx, cy, sx, sy);

    if(d <= INTERACTION_RADIUS){
      canInteract = true;
      el.style.opacity = 1;
      if(keysPressed[INTERACTION_KEY]){
        keysPressed[INTERACTION_KEY] = false;
        if(spot.type === 'guest' && playerRole === 'Visitor'){
          addLogEvent(`ผู้เยี่ยมชมซ่อมแซมที่ ${spot.id} สำเร็จ!`);
          if(currentMissionProgress < MAX_MISSION_PROGRESS){
            currentMissionProgress += MISSION_INCREASE_AMOUNT;
            updateMissionStatus();
          }
          playSound(sfxInteract);
        }else if(spot.type === 'heist' && playerRole === 'Thief'){
          addLogEvent(`🚨 พบการขโมยเกิดขึ้นที่ [${spot.id}]! 🚨`, 'heist');
          playSound(sfxHeist);
        }else if(spot.type === 'meeting'){
          startMeeting(); playSound(sfxInteract);
        }else{
          addLogEvent('คุณไม่สามารถโต้ตอบกับวัตถุนี้ได้');
        }
      }
    }else{
      el.style.opacity = .6;
    }
  }
  interactionHint.style.display = (canInteract && !isMapFullScreen) ? 'block' : 'none';
}

// ===================== Meeting =====================
function startMeeting(){
  if(isMeetingActive) return;
  isMeetingActive = true;
  meetingModal.style.display = 'flex';
  bgmMusic.pause();
  voteResultText.textContent = '';
  votingButtons.forEach(b=>b.disabled=false);
  mapOverlay.style.display = 'none';
  addLogEvent('🚨 ผู้เล่นเรียกประชุมฉุกเฉิน!', 'heist');
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

// ===================== Minimap =====================
function toggleFullScreenMap(){
  if(isMeetingActive) return;
  isMapFullScreen = !isMapFullScreen;
  if(isMapFullScreen){
    mapOverlay.classList.add('fullscreen');
    visionOverlay.style.display = 'none';
    document.getElementById('log-container').style.opacity = '0';
    document.getElementById('mission-status-container').style.opacity = '0';
    interactionHint.style.display = 'none';
  }else{
    mapOverlay.classList.remove('fullscreen');
    visionOverlay.style.display = 'block';
    document.getElementById('log-container').style.opacity = '1';
    document.getElementById('mission-status-container').style.opacity = '1';
  }
  updateMiniMapDisplay();
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

  const scaledPlayerX = playerCenterX * scale;
  const scaledPlayerY = playerCenterY * scale;

  offsetX = (overlaySize/2) - scaledPlayerX;
  offsetY = (overlaySize/2) - scaledPlayerY;

  const mapAreaWidth = CONTAINER_WIDTH * scale;
  const mapAreaHeight = CONTAINER_HEIGHT * scale;

  offsetX = Math.min(0, Math.max(overlaySize - mapAreaWidth, offsetX));
  offsetY = Math.min(0, Math.max(overlaySize - mapAreaHeight, offsetY));

  minimapContent.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

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

console.log("🆔 Current UID:", uid);

let lastPlayersSnapshot = [];
let lastActiveUIDs = new Set();
let remotePlayers = {};
let remoteNameplates = {};

// Hydration จากแคช
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
  const myChar = getMyChar();
  socket.emit("game:join", {
    room: ROOM_CODE, uid, name: myName, char: myChar, color: "#00ffcc", x: playerWorldX, y: playerWorldY,
  });

  sendPlayerPosition(true);
  announcePresenceBurst();

  try{ socket.emit("game:snapshot:request", { room: ROOM_CODE }); }catch(_){}
});

socket.on("snapshot", (payload)=>{
  if(!payload?.players) return;
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

  try{ localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ players: payload.players, ts: Date.now() })); }catch(_){}

  for(const p of payload.players){ ensureRemoteExistsAndPosition(p); }
});

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
  const myName = (localStorage.getItem('ggd.name') || `Player_${uid.slice(0,4)}`);
  const myChar = getMyChar();
  socket.emit("player:move", { uid, x: playerWorldX, y: playerWorldY, name: myName, char: myChar });
}

// Heartbeat (ช่วงแรกถี่แล้วผ่อน)
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

// ===================== Keyboard focus helpers =====================
function ensureKeyboardFocus() {
  try { document.body.setAttribute('tabindex', '-1'); } catch {}
  setTimeout(() => { try { document.body.focus(); } catch {} }, 0);
  window.addEventListener('pointerdown', () => { try { document.body.focus(); } catch {} });
  window.addEventListener('focus', () => { try { document.body.focus(); } catch {} });
}

// ===================== Game Loop =====================
function worldGameLoop(timestamp){
  if(isRoleRevealed || isMeetingActive){
    updateAnimation(timestamp);
    requestAnimationFrame(worldGameLoop);
    return;
  }

  // ensure ping แม้ไม่ได้เดิน
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

  ensureKeyboardFocus();

  const chosenChar = getMyChar();
  const currentCharAsset = `assets/Characters/${chosenChar}/idle_1.png`;
  try{ if(player) player.src = currentCharAsset; }catch(_){}

  idleFrames = [`assets/Characters/${chosenChar}/idle_1.png`];
  walkFrames = Array.from({length:8}, (_,i)=>`assets/Characters/${chosenChar}/walk_${i+1}.png`);

  loadCollisionData();

  const prev = loadState();
  let restoredPos = (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) ? {x:prev.x,y:prev.y} : loadLastPositionOnly();
  if(restoredPos){
    playerWorldX = Math.max(0, Math.min(CONTAINER_WIDTH - playerWidth, restoredPos.x));
    playerWorldY = Math.max(0, Math.min(CONTAINER_HEIGHT - playerHeight, restoredPos.y));
  }else{
    playerWorldX = 4096; playerWorldY = 4096;
  }

  // Role & UI
  let abilityName;
  roleNameText?.classList.remove('role-name-visitor','role-name-thief');
  roleCharacterDisplay?.classList.remove('character-glow-visitor','character-glow-thief');

  const chosenColor = colorFromChar(chosenChar);
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

  // Hydrate จากแคช -> เห็นทันทีหลังรีเฟรช
  hydrateRemoteFromCache();

  // ส่งตำแหน่งครั้งแรก + burst
  sendPlayerPosition(true);
  announcePresenceBurst();

  // กันพลาด: สตาร์ท loop แน่ๆ
  setTimeout(() => requestAnimationFrame(worldGameLoop), 50);
}

// ===================== Events =====================
function onKeyDown(e){
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',INTERACTION_KEY,'KeyM','KeyW','KeyA','KeyS','KeyD','F3','F4','Backquote','Escape'].includes(e.code)){
    e.preventDefault();
  }
  keysPressed[e.code] = true;

  if(e.code==='KeyM' && !isMeetingActive) toggleFullScreenMap();
  if(e.code==='F3'){ DEBUG_SHOW_COLLISION_BOXES = !DEBUG_SHOW_COLLISION_BOXES; renderDebugOverlay(); }
  if(e.code==='F4'){ DEBUG_SHOW_PLAYER_HITBOX = !DEBUG_SHOW_PLAYER_HITBOX; renderDebugOverlay(); }
  if(e.code==='Backquote'){
    const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
    const next = !anyOn; DEBUG_SHOW_COLLISION_BOXES = next; DEBUG_SHOW_PLAYER_HITBOX = false; renderDebugOverlay();
  }
  // ปุ่มฉุกเฉิน: ESC ปิด modal/meeting ให้ควบคุมเกมต่อได้
  if(e.code==='Escape'){
    try { meetingModal.style.display = 'none'; } catch {}
    try { roleRevealModal.style.display = 'none'; } catch {}
    isMeetingActive = false; isRoleRevealed = false;
    requestAnimationFrame(worldGameLoop);
  }
}
function onKeyUp(e){ keysPressed[e.code] = false; }

window.addEventListener('keydown', onKeyDown, { passive:false });
window.addEventListener('keyup', onKeyUp);

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
