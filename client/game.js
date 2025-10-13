let playerNameTag = null;
// game.js - โค้ดที่ปรับปรุงใหม่ทั้งหมด พร้อมระบบบทบาทและความสามารถพิเศษ

// *******************************************
// ตัวแปรการตั้งค่า
// *******************************************
const PLAYER_SPEED = 6; // <<< ความเร็ว 6
const VISION_RADIUS = 300;
const FOG_COLOR = 'rgba(0, 0, 0, 0.95)';
const ANIMATION_FRAME_RATE = 80;

// การตั้งค่าภารกิจและการโต้ตอบ
const INTERACTION_RADIUS = 150;
const INTERACTION_KEY = 'KeyE'; // ปุ่มโต้ตอบ (ใช้เรียกประชุมด้วย)

// การตั้งค่า Log
const MAX_LOG_MESSAGES = 5;
const LOG_FADE_DURATION_MS = 10000;

// ตัวแปรสถานะภารกิจ
let currentMissionProgress = 0;
const MAX_MISSION_PROGRESS = 10;
const MISSION_INCREASE_AMOUNT = 1;

// *******************************************
// NEW: ตัวแปรสถานะบทบาทและความสามารถ
// *******************************************
let playerRole = 'Loading...';
let playerAbility = 'None'; // ตัวแปรสำหรับเก็บคำอธิบายความสามารถ

// *** NEW: ระยะเวลาแสดง Role Reveal (หน่วยเป็นมิลลิวินาที) ***
const ROLE_REVEAL_DURATION = 5000; // 5 วินาที

// *******************************************
// NEW: ข้อมูลความสามารถพิเศษ
// *******************************************
const VISITOR_ABILITIES = {
  Engineer: 'ซ่อมแซมได้เร็วขึ้น',
  Scientist: 'มองเห็นจุดภารกิจได้ไกลขึ้น',
  Janitor: 'สามารถซ่อนหลักฐานที่ถูกขโมยได้ 1 ครั้ง',
};

const THIEF_ABILITIES = {
  Hacker: 'สามารถสุ่มปิดไฟในห้องหนึ่งเป็นเวลาสั้นๆ',
  Shadow: 'เคลื่อนไหวได้เงียบและเร็วขึ้นเล็กน้อย',
  Distractor: 'สามารถสร้างเสียงรบกวนปลอมได้ในแผนที่',
};

// *******************************************
// Collision (object-rect only, no tiles)
// *******************************************
let collisionObjects = []; // Array<{x,y,w,h}> ในพิกัดโลก 8192x8192

// *******************************************
// NEW: ตัวแปรสำหรับ Minimap
// *******************************************
let isMapFullScreen = false;
const MINIMAP_SIZE_PIXELS = 150; // ขนาด Minimap (150px)
const MAP_SCALE = MINIMAP_SIZE_PIXELS / 8192; // (สำรอง เผื่อใช้)
const FOCUSED_MAP_SCALE = 0.5; // ซูมสำหรับ Minimap โฟกัสผู้เล่น

// *******************************************
// NEW: ขนาดแผนที่และตำแหน่งเริ่มต้น
// *******************************************
const CONTAINER_WIDTH = 8192;
const CONTAINER_HEIGHT = 8192;

// ตำแหน่งเริ่มต้นผู้เล่น (กลางแผนที่ 8192x8192)
let playerWorldX = 3500;
let playerWorldY = 3500;

// ตำแหน่งจุดภารกิจ
const MISSION_SPOTS_DATA = [
  { id: 'mission-guest', type: 'guest', x: 1500, y: 7000, width: 90, height: 90 },
  { id: 'mission-heist', type: 'heist', x: 7000, y: 1500, width: 90, height: 90 },
  { id: 'mission-meeting', type: 'meeting', x: 4000, y: 4000, width: 150, height: 150 },
  { id: 'mission-cctv', type: 'Open_CCTV', x: 6000, y: 6000, width: 90, height: 90 },
];

// อ้างอิงองค์ประกอบ DOM
const gameContainer = document.getElementById('game-container');
const player = document.getElementById('player');
const playerWrap = document.getElementById('player-wrap');
const nameplateEl = document.getElementById('nameplate');
const minimapBase = document.getElementById('minimap-base');
const debugCanvas = document.getElementById('debug-overlay');
const debugPanel = document.getElementById('debug-panel');
let debugCtx = debugCanvas ? debugCanvas.getContext('2d') : null;
let lastDebugRenderMs = 0;
const DEBUG_MAX_FPS = 30; // throttle debug overlay

// Debug flags
let DEBUG_SHOW_COLLISION_BOXES = false; // F3
let DEBUG_SHOW_PLAYER_HITBOX = false; // F4

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

// การอ้างอิง Mission UI
const missionProgressBar = document.getElementById('mission-bar-fill');
const missionProgressText = document.getElementById('mission-progress-text');

// การอ้างอิง Meeting UI
const meetingModal = document.getElementById('meeting-modal');
const endMeetingButton = document.getElementById('end-meeting-button');
const votingButtons = document.querySelectorAll('.vote-option');
const voteResultText = document.getElementById('vote-result');

// *** NEW: การอ้างอิง Role Reveal UI ***
const roleRevealModal = document.getElementById('role-reveal-modal');
const roleNameText = document.getElementById('role-name-text');
const roleTeamText = document.getElementById('role-team-text');
const roleAbilityText = document.getElementById('role-ability-text');
const roleCharacterImage = document.getElementById('role-character-image');
const roleCharacterDisplay = document.getElementById('role-character-display');

// การอ้างอิง Audio Elements
const sfxInteract = document.getElementById('sfx-interact');
const sfxHeist = document.getElementById('sfx-heist');
const bgmMusic = document.getElementById('bgm-music');

// การอ้างอิง Minimap UI
const mapOverlay = document.getElementById('map-overlay');
const minimapContent = document.getElementById('minimap-content');
const minimapPlayerDot = document.getElementById('minimap-player-dot');
const minimapMissionDots = {
  'mission-guest': document.getElementById('minimap-guest-dot'),
  'mission-heist': document.getElementById('minimap-heist-dot'),
  'mission-meeting': document.getElementById('minimap-meeting-dot'),
  // ถ้ามีจุด cctv บน minimap ให้เพิ่ม id ด้วย
  // 'mission-cctv': document.getElementById('minimap-cctv-dot'),
};

// สถานะเกมหลัก
const keysPressed = {};
let isMoving = false;
let isMeetingActive = false;
let isRoleRevealed = false;

// ตำแหน่งกล้องและขนาดหน้าจอ
let containerX = 0;
let containerY = 0;
let VIEWPORT_WIDTH = window.innerWidth;
let VIEWPORT_HEIGHT = window.innerHeight;
let playerWidth = 200;
let playerHeight = 200;

// *******************************************
// 4. การจัดการแอนิเมชัน
// *******************************************
const idleFrames = ['assets/images/idle_1.png'];
const walkFrames = [
  'assets/images/walk_1.png',
  'assets/images/walk_2.png',
  'assets/images/walk_3.png',
  'assets/images/walk_4.png',
  'assets/images/walk_5.png',
  'assets/images/walk_6.png',
  'assets/images/walk_7.png',
  'assets/images/walk_8.png',
];
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
    if (player) player.src = frames[currentFrameIndex];
  }
}

// *******************************************
// 1. ฟังก์ชันแสดงผล
// *******************************************
function updateDisplay() {
  if (!gameContainer || !player || !visionOverlay) return;

  // ตำแหน่ง mission spots
  for (const spot of MISSION_SPOTS_DATA) {
    const el = document.getElementById(spot.id);
    if (!el) continue;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
  }

  // world → screen
  if (playerWrap) {
    playerWrap.style.transform = `translate3d(${playerWorldX}px, ${playerWorldY}px, 0)`;
  }
  if (player) {
    player.style.transform = '';
  }
  gameContainer.style.transform = `translate3d(${containerX}px, ${containerY}px, 0)`;

  // Fog of War (throttle)
  const playerScreenX = playerWorldX + containerX + playerWidth / 2;
  const playerScreenY = playerWorldY + containerY + playerHeight / 2;
  const now = performance.now();
  if (isMoving || now - lastFogUpdateMs > 1000 / FOG_MAX_FPS) {
    lastFogUpdateMs = now;
    const cx = Math.round(playerScreenX);
    const cy = Math.round(playerScreenY);
    visionOverlay.style.background = `radial-gradient(
      circle at ${cx}px ${cy}px,
      transparent 0px,
      transparent ${VISION_RADIUS}px,
      ${FOG_COLOR} ${VISION_RADIUS + 50}px
    )`;
  }

  // Minimap + Nametag + Debug
  updateMiniMapDisplay();
  updateNametagPosition();
  renderDebugOverlay();
}

function updateNametagPosition() {
  if (!playerNameTag) return;
  const tagX = playerWorldX + containerX + playerWidth / 2;
  const tagY = playerWorldY + containerY - 8;
  playerNameTag.style.left = `${tagX}px`;
  playerNameTag.style.top = `${tagY}px`;
}

function updateDebugPanel() {
  if (!debugPanel) return;
  const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
  debugPanel.style.display = anyOn ? 'block' : 'none';
  if (!anyOn) return;

  debugPanel.innerText = [
    `PlayerWorld: ${Math.round(playerWorldX)}, ${Math.round(playerWorldY)}`,
    `Container: ${Math.round(containerX)}, ${Math.round(containerY)}`,
    `MouseWorld: ${Math.round(debugMouseWorldX)}, ${Math.round(debugMouseWorldY)}`,
    `CollisionRects: ${collisionObjects?.length || 0}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderDebugOverlay() {
  if (!debugCtx || !debugCanvas) return;
  const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
  if (!anyOn) {
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    updateDebugPanel();
    return;
  }
  const now = performance.now();
  const minDelta = 1000 / DEBUG_MAX_FPS;
  if (now - lastDebugRenderMs < minDelta) return;
  lastDebugRenderMs = now;

  if (debugCanvas.width !== VIEWPORT_WIDTH) debugCanvas.width = VIEWPORT_WIDTH;
  if (debugCanvas.height !== VIEWPORT_HEIGHT) debugCanvas.height = VIEWPORT_HEIGHT;

  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

  // Visible region in world coordinates
  const viewLeft = Math.max(0, -containerX);
  const viewTop = Math.max(0, -containerY);
  const viewRight = Math.min(CONTAINER_WIDTH, viewLeft + VIEWPORT_WIDTH);
  const viewBottom = Math.min(CONTAINER_HEIGHT, viewTop + VIEWPORT_HEIGHT);

  // Draw collision boxes (object layer)
  if (DEBUG_SHOW_COLLISION_BOXES && collisionObjects && collisionObjects.length) {
    debugCtx.strokeStyle = 'rgba(255,165,0,0.85)';
    debugCtx.lineWidth = 2;
    for (const r of collisionObjects) {
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      if (r.x > viewRight || rx2 < viewLeft || r.y > viewBottom || ry2 < viewTop) continue;
      debugCtx.strokeRect(r.x - viewLeft, r.y - viewTop, r.w, r.h);
    }
  }

  // Draw player hitbox (foot box)
  if (DEBUG_SHOW_PLAYER_HITBOX) {
    const effectiveWidth = playerWidth * 0.5;
    const effectiveHeight = playerHeight * 0.25;
    const offsetX = (playerWidth - effectiveWidth) / 2;
    const offsetY = playerHeight - effectiveHeight;
    const x = playerWorldX + offsetX - viewLeft;
    const y = playerWorldY + offsetY - viewTop;
    debugCtx.strokeStyle = 'rgba(0,200,255,0.9)';
    debugCtx.lineWidth = 2;
    debugCtx.strokeRect(x, y, effectiveWidth, effectiveHeight);
  }

  updateDebugPanel();
}

// *******************************************
// 6. การจัดการ Log Event และ Audio
// *******************************************
function addLogEvent(message, type = 'general') {
  const logElement = document.createElement('p');
  logElement.className = 'log-message';
  logElement.textContent = message;

  if (type === 'heist') logElement.classList.add('heist');

  if (logContainer.firstChild) logContainer.insertBefore(logElement, logContainer.firstChild);
  else logContainer.appendChild(logElement);

  while (logContainer.children.length > MAX_LOG_MESSAGES) {
    logContainer.removeChild(logContainer.lastChild);
  }

  setTimeout(() => {
    logElement.style.opacity = '0';
  }, LOG_FADE_DURATION_MS);
  setTimeout(() => {
    if (logElement.parentElement === logContainer) {
      logContainer.removeChild(logElement);
    }
  }, LOG_FADE_DURATION_MS + 1000);
}

function playSound(audioElement) {
  if (!audioElement) return;
  audioElement.currentTime = 0;
  audioElement.play().catch((e) => {
    console.warn('Audio playback blocked or file missing:', e);
  });
}

// *******************************************
// 7. การจัดการแถบสถานะภารกิจ
// *******************************************
function updateMissionStatus() {
  currentMissionProgress = Math.min(currentMissionProgress, MAX_MISSION_PROGRESS);
  const progressPercent = Math.round((currentMissionProgress / MAX_MISSION_PROGRESS) * 100);

  missionProgressBar && (missionProgressBar.style.width = `${progressPercent}%`);
  missionProgressText && (missionProgressText.textContent = `${progressPercent}%`);

  if (currentMissionProgress >= MAX_MISSION_PROGRESS) {
    console.log('*** ผู้เยี่ยมชมทำภารกิจครบแล้ว! ***');
    addLogEvent('✅ ภารกิจทั้งหมดของผู้เยี่ยมชมเสร็จสมบูรณ์แล้ว! (ฝ่ายผู้เยี่ยมชมชนะ)', 'heist');
  }
}

// *******************************************
// 8. การจัดการระบบประชุม (Meeting System)
// *******************************************
function startMeeting() {
  if (isMeetingActive) return;
  isMeetingActive = true;
  meetingModal && (meetingModal.style.display = 'flex');

  bgmMusic && bgmMusic.pause();

  voteResultText && (voteResultText.textContent = '');
  votingButtons.forEach((btn) => (btn.disabled = false));

  mapOverlay && (mapOverlay.style.display = 'none');

  console.log('!!! การประชุมฉุกเฉินเริ่มต้น !!!');
  addLogEvent('🚨 ผู้เล่นเรียกประชุมฉุกเฉิน!', 'heist');
}

function endMeeting() {
  isMeetingActive = false;
  meetingModal && (meetingModal.style.display = 'none');

  bgmMusic && bgmMusic.play().catch((e) => console.log('BGM playback blocked:', e));

  mapOverlay && (mapOverlay.style.display = 'block');

  console.log('!!! สิ้นสุดการประชุม !!!');
  addLogEvent('การประชุมสิ้นสุดลงแล้ว', 'general');
}

function handleVote(target) {
  if (!isMeetingActive) return;

  if (voteResultText) voteResultText.textContent = `โหวตไปยัง: ${target}! รอผลโหวตสุดท้าย...`;
  votingButtons.forEach((btn) => (btn.disabled = true));

  setTimeout(() => {
    endMeeting();
  }, 3000);
}

// *******************************************
// 9. การจัดการ Minimap และ Full Map
// *******************************************
function toggleFullScreenMap() {
  if (isMeetingActive) return;

  isMapFullScreen = !isMapFullScreen;

  if (isMapFullScreen) {
    mapOverlay?.classList.add('fullscreen');
    mapOverlay && (mapOverlay.style.transform = '');
    visionOverlay && (visionOverlay.style.display = 'none');
    document.getElementById('log-container') && (document.getElementById('log-container').style.opacity = '0');
    document.getElementById('mission-status-container') &&
      (document.getElementById('mission-status-container').style.opacity = '0');
    document.getElementById('interaction-hint') && (document.getElementById('interaction-hint').style.display = 'none');
  } else {
    mapOverlay?.classList.remove('fullscreen');
    mapOverlay && (mapOverlay.style.transform = '');
    visionOverlay && (visionOverlay.style.display = 'block');
    document.getElementById('log-container') && (document.getElementById('log-container').style.opacity = '1');
    document.getElementById('mission-status-container') &&
      (document.getElementById('mission-status-container').style.opacity = '1');
  }

  updateMiniMapDisplay();
}

function updateMiniMapDisplay() {
  if (!mapOverlay || !minimapContent || !minimapPlayerDot) return;

  let scale;
  let offsetX = 0;
  let offsetY = 0;
  let currentMapOverlaySize;

  const currentViewPortHeight = window.innerHeight;

  const playerCenterX = playerWorldX + playerWidth / 2;
  const playerCenterY = playerWorldY + playerHeight / 2;

  if (isMapFullScreen) {
    currentMapOverlaySize = Math.floor(currentViewPortHeight * 0.8);
    scale = currentMapOverlaySize / CONTAINER_WIDTH;

    const scaledPlayerX = playerCenterX * scale;
    const scaledPlayerY = playerCenterY * scale;

    offsetX = currentMapOverlaySize / 2 - scaledPlayerX;
    offsetY = currentMapOverlaySize / 2 - scaledPlayerY;

    const mapAreaWidth = CONTAINER_WIDTH * scale;
    const mapAreaHeight = CONTAINER_HEIGHT * scale;

    const maxOffsetLeft = currentMapOverlaySize - mapAreaWidth;
    const minOffsetRight = 0;
    offsetX = Math.min(minOffsetRight, Math.max(maxOffsetLeft, offsetX));

    const maxOffsetTop = currentMapOverlaySize - mapAreaHeight;
    const minOffsetBottom = 0;
    offsetY = Math.min(minOffsetBottom, Math.max(maxOffsetTop, offsetY));
  } else {
    currentMapOverlaySize = MINIMAP_SIZE_PIXELS;
    scale = FOCUSED_MAP_SCALE;

    const scaledPlayerX = playerCenterX * scale;
    const scaledPlayerY = playerCenterY * scale;

    offsetX = currentMapOverlaySize / 2 - scaledPlayerX;
    offsetY = currentMapOverlaySize / 2 - scaledPlayerY;

    const mapAreaWidth = CONTAINER_WIDTH * scale;
    const mapAreaHeight = CONTAINER_HEIGHT * scale;

    const maxOffsetLeft = currentMapOverlaySize - mapAreaWidth;
    const minOffsetRight = 0;
    offsetX = Math.min(minOffsetRight, Math.max(maxOffsetLeft, offsetX));

    const maxOffsetTop = currentMapOverlaySize - mapAreaHeight;
    const minOffsetBottom = 0;
    offsetY = Math.min(minOffsetBottom, Math.max(maxOffsetTop, offsetY));
  }

  minimapContent.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  const playerMapX = playerWorldX + playerWidth / 2;
  const playerMapY = playerWorldY + playerHeight / 2;

  minimapPlayerDot.style.left = `${playerMapX}px`;
  minimapPlayerDot.style.top = `${playerMapY}px`;

  const inverseScale = 1 / scale;
  const dotTransformStyle = `translate(-50%, -50%) scale(${inverseScale})`;
  minimapPlayerDot.style.transform = dotTransformStyle;

  MISSION_SPOTS_DATA.forEach((spot) => {
    const dot = minimapMissionDots[spot.id];
    if (dot) {
      dot.style.left = `${spot.x + spot.width / 2}px`;
      dot.style.top = `${spot.y + spot.height / 2}px`;
      dot.style.transform = dotTransformStyle;
    }
  });
}

// *******************************************
// Load Collision Data (SVG/JSON)
// *******************************************
async function loadCollisionData() {
  collisionObjects = [];
  try {
    const res = await fetch('assets/maps/collision.svg', { cache: 'no-cache' });
    if (res.ok) {
      const svgText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.documentElement;

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
        const wAttr = parseFloat((svgEl.getAttribute('width') || '').replace('px', ''));
        const hAttr = parseFloat((svgEl.getAttribute('height') || '').replace('px', ''));
        if (!Number.isNaN(wAttr) && wAttr > 0) baseW = wAttr;
        if (!Number.isNaN(hAttr) && hAttr > 0) baseH = hAttr;
      }
      const sx = CONTAINER_WIDTH / baseW;
      const sy = CONTAINER_HEIGHT / baseH;

      const rects = Array.from(doc.getElementsByTagName('rect'));
      for (const r of rects) {
        const x = parseFloat(r.getAttribute('x') || '0');
        const y = parseFloat(r.getAttribute('y') || '0');
        const w = parseFloat(r.getAttribute('width') || '0');
        const h = parseFloat(r.getAttribute('height') || '0');
        if (w > 0 && h > 0) {
          collisionObjects.push({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
        }
      }
      console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from SVG`);
      return;
    }
  } catch (e) {
    console.warn('SVG collision load failed:', e);
  }

  try {
    const res = await fetch('assets/maps/collision.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      let rects = [];
      if (Array.isArray(data)) rects = data;
      else if (Array.isArray(data.rects)) rects = data.rects;
      collisionObjects = rects
        .map((o) => ({ x: +o.x || 0, y: +o.y || 0, w: +o.w || 0, h: +o.h || 0 }))
        .filter((o) => o.w > 0 && o.h > 0);
      console.log(`➕ Loaded ${collisionObjects.length} collision rectangles from JSON`);
      return;
    }
  } catch (e) {
    console.warn('JSON collision load failed:', e);
  }

  // ถ้าไม่มีข้อมูลเลย จะเตือนและวิ่งต่อแบบไม่มีชน
  console.warn('No collision data found (SVG/JSON). Running without collisions.');
}

// *******************************************
// Collision (axis-aligned) สำหรับสี่เหลี่ยม
// *******************************************
function checkCollision(nextX, nextY, playerW, playerH) {
  if (!collisionObjects?.length) return false;

  const hitW = playerW * 0.2;
  const hitH = playerH * 0.2;
  const offsetX = (playerW - hitW) / 2;
  const offsetY = playerH - hitH;

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

// (ตัวอย่าง advance collision รองรับ circle/polygon — เก็บไว้ใช้ภายหลัง)
function checkCollisionAdvanced(nextX, nextY, playerW, playerH) {
  const hitW = playerW * 0.3;
  const hitH = playerH * 0.4;
  const offsetX = (playerW - hitW) / 2;
  const offsetY = (playerH - hitH) / 2;

  const box = {
    left: nextX + offsetX,
    top: nextY + offsetY,
    right: nextX + offsetX + hitW,
    bottom: nextY + offsetY + hitH,
  };

  if (!collisionObjects?.length) return false;

  for (const r of collisionObjects) {
    if (r.type === 'rect') {
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      if (box.left < rx2 && box.right > r.x && box.top < ry2 && box.bottom > r.y) return true;
    } else if (r.type === 'circle') {
      const cx = r.x;
      const cy = r.y;
      const radius = r.r;
      const closestX = Math.max(box.left, Math.min(cx, box.right));
      const closestY = Math.max(box.top, Math.min(cy, box.bottom));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    } else if (r.type === 'polygon' && r.points?.length >= 3) {
      const corners = [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.left, y: box.bottom },
        { x: box.right, y: box.bottom },
      ];
      if (corners.some((pt) => pointInPolygon(pt, r.points))) return true;
    }
  }
  return false;
}

function pointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;
    const intersect =
      yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// *******************************************
// 5. การจัดการภารกิจและการโต้ตอบ (Mission Spots)
// *******************************************
function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function checkInteractions() {
  if (playerRole === 'Loading...') return;

  const playerCenterX = playerWorldX + playerWidth / 2;
  const playerCenterY = playerWorldY + playerHeight / 2;

  const missionSpots = MISSION_SPOTS_DATA.map((spotData) => ({
    ...spotData,
    element: document.getElementById(spotData.id) || null,
  }));

  let canInteract = false;

  for (const spot of missionSpots) {
    if (!spot.element) continue;

    if (spot.type === 'heist' && playerRole !== 'Thief') {
      spot.element.style.display = 'none';
      continue;
    } else {
      spot.element.style.display = 'block';
    }

    const spotCenterX = spot.x + spot.width / 2;
    const spotCenterY = spot.y + spot.height / 2;
    const distance = getDistance(playerCenterX, playerCenterY, spotCenterX, spotCenterY);

    if (distance <= INTERACTION_RADIUS) {
      canInteract = true;
      spot.element.style.opacity = 1.0;

      if (keysPressed[INTERACTION_KEY]) {
        keysPressed[INTERACTION_KEY] = false;

        if (spot.type === 'guest' && playerRole === 'Visitor') {
          addLogEvent(`ผู้เยี่ยมชมซ่อมแซมที่ ${spot.id} สำเร็จ!`);
          if (currentMissionProgress < MAX_MISSION_PROGRESS) {
            currentMissionProgress += MISSION_INCREASE_AMOUNT;
            updateMissionStatus();
          }
          sfxInteract && playSound(sfxInteract);
        } else if (spot.type === 'heist' && playerRole === 'Thief') {
          addLogEvent(`🚨 พบการขโมยที่ [${spot.id}]!`, 'heist');
          sfxHeist && playSound(sfxHeist);
        } else if (spot.type === 'meeting') {
          startMeeting();
          sfxInteract && playSound(sfxInteract);
        } else if (spot.type === 'Open_CCTV') {
          addLogEvent('📹 เปิดกล้องวงจรปิด (CCTV) แล้ว', 'general');
          sfxInteract && playSound(sfxInteract);
        } else {
          addLogEvent('คุณไม่สามารถโต้ตอบกับวัตถุนี้ได้', 'general');
        }
      }
    } else {
      spot.element.style.opacity = 0.6;
    }
  }

  interactionHint && (interactionHint.style.display = canInteract && !isMapFullScreen ? 'block' : 'none');
}

// *******************************************
// 🧩 SYSTEM: Generic Object Interaction System
// *******************************************

// 1) วัตถุที่โต้ตอบได้
const INTERACTABLE_OBJECTS = [
  { id: 'printer', x: 3400, y: 3470, width: 100, height: 110, type: 'printer', active: true },
  { id: 'tree_middle_room', x: 4750, y: 4300, width: -50, height: -100, type: 'tree', active: true },
  { id: 'Telephone', x: 4100, y: 4390, width: -100, height: 200, type: 'Telephone', active: true },
  { id: 'Scrupture1', x: 3570, y: 1500, width: 50, height: -200, type: 'Scrupture', active: true },
  { id: 'tree_upper_room1', x: 3200, y: 500, width: -180, height: 30, type: 'tree', active: true },
  { id: 'hidden_switch', x: 4280, y: 550, width: -50, height: -50, type: 'switch(?)', active: true },
  { id: 'Scrupture2', x: 4780, y: 1200, width: -800, height: -400, type: 'Scrupture', active: true },
  { id: 'tree_upper_room2', x: 4440, y: 1160, width: -220, height: -220, type: 'tree', active: true },
  { id: 'Broom', x: 1500, y: 3280, width: -200, height: -200, type: 'broom', active: true },
  { id: 'computer1', x: 3520, y: 7020, width: -350, height: -350, type: 'computer', active: true },
  { id: 'computer2', x: 4320, y: 7180, width: -700, height: -350, type: 'computer', active: true },
  { id: 'computer3', x: 4750, y: 6900, width: -100, height: -400, type: 'computer', active: true },
  { id: 'monitor', x: 4980, y: 7500, width: -2000, height: -400, type: 'monitor', active: true },
  { id: 'matchine', x: 6580, y: 3160, width: -380, height: -200, type: 'matchine', active: true },
  { id: 'battery', x: 7120, y: 4260, width: -600, height: -600, type: 'battery', active: true },
  { id: 'power', x: 7420, y: 7850, width: -200, height: -150, type: 'power', active: true },
];

// normalize สี่เหลี่ยมที่มี width/height ติดลบ
function normRect(obj) {
  let { x, y, width: w, height: h } = obj;
  if (w < 0) {
    x = x + w;
    w = Math.abs(w);
  }
  if (h < 0) {
    y = y + h;
    h = Math.abs(h);
  }
  return { x, y, w, h };
}

// วาดวัตถุ (เฉพาะตอนเปิด DEBUG_SHOW_COLLISION_BOXES)
function renderInteractableObjects() {
  if (!debugCtx || !DEBUG_SHOW_COLLISION_BOXES) return;
  debugCtx.strokeStyle = 'rgba(0,255,100,0.8)';
  debugCtx.lineWidth = 2;

  const viewLeft = Math.max(0, -containerX);
  const viewTop = Math.max(0, -containerY);

  for (const raw of INTERACTABLE_OBJECTS) {
    const { x, y, w, h } = normRect(raw);
    const sx = x - viewLeft;
    const sy = y - viewTop;
    debugCtx.strokeRect(sx, sy, w, h);
  }
}

function checkObjectInteractions() {
  const pcx = playerWorldX + playerWidth / 2;
  const pcy = playerWorldY + playerHeight / 2;

  let nearObj = null;
  for (const raw of INTERACTABLE_OBJECTS) {
    if (!raw.active) continue;
    const { x, y, w, h } = normRect(raw);
    const ocx = x + w / 2;
    const ocy = y + h / 2;
    const dist = getDistance(pcx, pcy, ocx, ocy);
    if (dist < INTERACTION_RADIUS) {
      nearObj = { ...raw, x, y, width: w, height: h };
      break;
    }
  }

  if (nearObj) {
    interactionHint && (interactionHint.style.display = 'block');
    interactionHint && (interactionHint.textContent = `Press E to interact with ${nearObj.type}`);
    if (keysPressed[INTERACTION_KEY]) {
      keysPressed[INTERACTION_KEY] = false;
      handleObjectInteraction(nearObj);
    }
  } else {
    interactionHint && interactionHint.style.display !== 'none' && (interactionHint.style.display = 'none');
  }
}

function handleObjectInteraction(obj) {
  switch (obj.type) {
    case 'door':
      addLogEvent('🚪 คุณเปิดประตูแล้ว!');
      playSound(sfxInteract);
      obj.active = false;
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
  if (isRoleRevealed || isMeetingActive) {
    updateAnimation(timestamp);
    requestAnimationFrame(worldGameLoop);
    return;
  }

  let deltaX = 0;
  let deltaY = 0;

  if (keysPressed['ArrowUp'] || keysPressed['KeyW']) deltaY -= PLAYER_SPEED;
  if (keysPressed['ArrowDown'] || keysPressed['KeyS']) deltaY += PLAYER_SPEED;
  if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) deltaX -= PLAYER_SPEED;
  if (keysPressed['ArrowRight'] || keysPressed['KeyD']) deltaX += PLAYER_SPEED;

  const wasMoving = isMoving;
  isMoving = deltaX !== 0 || deltaY !== 0;

  if (isMoving) {
    let nextPlayerWorldX = playerWorldX + deltaX;
    let nextPlayerWorldY = playerWorldY + deltaY;

    if (!checkCollision(nextPlayerWorldX, playerWorldY, playerWidth, playerHeight)) {
      playerWorldX = nextPlayerWorldX;
    }
    if (!checkCollision(playerWorldX, nextPlayerWorldY, playerWidth, playerHeight)) {
      playerWorldY = nextPlayerWorldY;
    }

    const MAX_WORLD_X = CONTAINER_WIDTH - playerWidth;
    const MAX_WORLD_Y = CONTAINER_HEIGHT - playerHeight;
    playerWorldX = Math.max(0, Math.min(MAX_WORLD_X, playerWorldX));
    playerWorldY = Math.max(0, Math.min(MAX_WORLD_Y, playerWorldY));

    containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
    containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);

    const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
    const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
    containerX = Math.min(0, Math.max(maxContainerX, containerX));
    containerY = Math.min(0, Math.max(maxContainerY, containerY));
  }

  // ✅ อัปเดตภาพทุกเฟรม (ไม่ผูกกับ isMoving อย่างเดียว)
  updateDisplay();

  checkInteractions();
  checkObjectInteractions();

  if (isMoving || wasMoving !== isMoving) {
    updateAnimation(timestamp);
  }

  sendPlayerPosition();
  requestAnimationFrame(worldGameLoop);
}

// *******************************************
// 3. การเริ่มต้นเกมและ Event Listeners
// *******************************************
function initializeGame() {
  VIEWPORT_WIDTH = window.innerWidth;
  VIEWPORT_HEIGHT = window.innerHeight;
  playerWidth = player?.offsetWidth || playerWidth;
  playerHeight = player?.offsetHeight || playerHeight;

  const currentPlayerCharacterAsset = player?.src;

  // สุ่มบทบาท/ความสามารถ
  const roles = ['Thief', 'Visitor'];
  playerRole = roles[Math.floor(Math.random() * roles.length)];
  let abilityName;

  // รูปตัวละครใน Role Reveal
  if (roleCharacterImage && currentPlayerCharacterAsset) roleCharacterImage.src = currentPlayerCharacterAsset;

  // โหลดข้อมูลการชน (async แต่ไม่ block)
  loadCollisionData();

  // เตรียมคลาส/ข้อความ Role Reveal
  roleNameText && roleNameText.classList.remove('role-name-visitor', 'role-name-thief');
  roleCharacterDisplay &&
    roleCharacterDisplay.classList.remove('character-glow-visitor', 'character-glow-thief');

  if (playerRole === 'Visitor') {
    const abilities = Object.keys(VISITOR_ABILITIES);
    abilityName = abilities[Math.floor(Math.random() * abilities.length)];
    playerAbility = VISITOR_ABILITIES[abilityName];
    roleTeamText && (roleTeamText.textContent = 'ฝ่าย: ผู้เยี่ยมชม');
    roleTeamText && (roleTeamText.style.color = '#4CAF50');
    roleNameText && roleNameText.classList.add('role-name-visitor');
    roleCharacterDisplay && roleCharacterDisplay.classList.add('character-glow-visitor');
  } else {
    const abilities = Object.keys(THIEF_ABILITIES);
    abilityName = abilities[Math.floor(Math.random() * abilities.length)];
    playerAbility = THIEF_ABILITIES[abilityName];
    roleTeamText && (roleTeamText.textContent = 'ฝ่าย: หัวขโมย');
    roleTeamText && (roleTeamText.style.color = '#FF0000');
    roleNameText && roleNameText.classList.add('role-name-thief');
    roleCharacterDisplay && roleCharacterDisplay.classList.add('character-glow-thief');
  }

  roleNameText && (roleNameText.textContent = abilityName.toUpperCase());
  roleAbilityText && (roleAbilityText.textContent = playerAbility);
  roleRevealModal && (roleRevealModal.style.display = 'flex');
  isRoleRevealed = true;

  // กล้องเริ่มต้นให้อยู่กลางจอ
  containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
  containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);
  const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
  const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
  containerX = Math.min(0, Math.max(maxContainerX, containerX));
  containerY = Math.min(0, Math.max(maxContainerY, containerY));

  // สร้าง nametag (ครั้งเดียว)
  try {
    if (nameplateEl && !nameplateEl.textContent) {
      nameplateEl.textContent = displayName;
    }
  } catch (_) {}

  // วาดครั้งแรก
  updateDisplay();

  // ตั้งภาพนิ่ง/เสียง
  if (player) player.src = idleFrames[0];
  if (bgmMusic) {
    bgmMusic.volume = 0.4;
    bgmMusic.play().catch((e) => console.log('BGM playback blocked by browser:', e));
  }

  const promptText = roleRevealModal?.querySelector('p[style*="margin-top: 30px;"]');
  if (promptText) promptText.style.display = 'none';

  setTimeout(() => {
    if (roleRevealModal) roleRevealModal.style.opacity = '0';
    setTimeout(() => {
      if (roleRevealModal) roleRevealModal.style.display = 'none';
      isRoleRevealed = false;

      requestAnimationFrame(worldGameLoop);

      addLogEvent(
        `คุณได้รับบทบาทเป็น: ${playerRole} (${abilityName})`,
        playerRole === 'Thief' ? 'heist' : 'general'
      );
      addLogEvent(`สิ่งที่ทำได้: ${playerAbility}`, 'general');
      addLogEvent('กด [M] เพื่อสลับเปิด/ปิดแผนที่เต็มจอ (Minimap แสดงตลอดเวลา)');
    }, 1000);
  }, ROLE_REVEAL_DURATION);

  if (playerRole === 'Thief') {
    const ms = document.getElementById('mission-status-container');
    ms && (ms.style.display = 'none');
  }

  // การจัดการการกดปุ่ม
  document.addEventListener('keydown', (e) => {
    if (
      [
        'Space',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        INTERACTION_KEY,
        'KeyM',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'F3',
        'F4',
        'Backquote',
      ].includes(e.code)
    ) {
      e.preventDefault();
    }
    keysPressed[e.code] = true;

    if (e.code === 'KeyM' && !isMeetingActive) {
      toggleFullScreenMap();
    }

    // DEBUG toggles
    if (e.code === 'F3') {
      DEBUG_SHOW_COLLISION_BOXES = !DEBUG_SHOW_COLLISION_BOXES;
      console.log('DEBUG_SHOW_COLLISION_BOXES =', DEBUG_SHOW_COLLISION_BOXES);
      renderDebugOverlay();
    }
    if (e.code === 'F4') {
      DEBUG_SHOW_PLAYER_HITBOX = !DEBUG_SHOW_PLAYER_HITBOX;
      console.log('DEBUG_SHOW_PLAYER_HITBOX =', DEBUG_SHOW_PLAYER_HITBOX);
      renderDebugOverlay();
    }
    if (e.code === 'Backquote') {
      const anyOn = DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX;
      const next = !anyOn;
      DEBUG_SHOW_COLLISION_BOXES = next;
      DEBUG_SHOW_PLAYER_HITBOX = false;
      console.log('DEBUG ALL =', next);
      renderDebugOverlay();
    }
  });

  document.addEventListener('keyup', (e) => {
    keysPressed[e.code] = false;
  });

  // Meeting UI
  endMeetingButton?.addEventListener('click', endMeeting);
  votingButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleVote(button.getAttribute('data-target'));
    });
  });

  // resize
  window.addEventListener('resize', () => {
    try {
      updateMiniMapDisplay();
      updateNametagPosition();
    } catch (_) {}
  });

  // ตำแหน่งเมาส์เพื่อดีบัก
  window.addEventListener('mousemove', (e) => {
    if (!gameContainer) return;
    const rect = gameContainer.getBoundingClientRect();
    debugMouseWorldX = e.clientX - rect.left;
    debugMouseWorldY = e.clientY - rect.top;
    updateDebugPanel();
  });
}

// เริ่มต้นเกม
try {
  const hasWorldDOM = document.getElementById('game-container') && document.getElementById('player');
  if (hasWorldDOM) {
    window.addEventListener('load', initializeGame);
  }
} catch (_) {}

// ===== Multiplayer Section (Socket.IO Integration) =====
// import { io } from "/socket.io/socket.io.esm.min.js";
const socket = io('https://webgame-25n5.onrender.com');
// const socket = io("http://localhost:3000");
window.socket = socket;

// === Player identity ===
const ROOM_CODE = 'lobby01';
const uid =
  sessionStorage.getItem('uid') ||
  (() => {
    const v = crypto.randomUUID();
    sessionStorage.setItem('uid', v);
    return v;
  })();

const CHAR_KEY_SCOPED = `ggd.char.${ROOM_CODE}.${uid}`;
function getMyChar() {
  return sessionStorage.getItem(CHAR_KEY_SCOPED) || localStorage.getItem(CHAR_KEY_SCOPED) || 'mini_brown';
}

// === Determine player display name ===
const displayName =
  localStorage.getItem('ggd.name') || localStorage.getItem('playerName') || `Player_${uid.slice(0, 4)}`;
console.log('🆔 Current UID:', uid, '👤 Name:', displayName);

// === Socket connection ===
try {
  if (nameplateEl) nameplateEl.textContent = displayName;
} catch (_) {}
socket.on('connect', () => {
  console.log('✅ Connected to server:', socket.id);
  socket.emit('game:join', {
    room: ROOM_CODE,
    uid,
    name: displayName,
    color: '#00ffcc',
    x: playerWorldX,
    y: playerWorldY,
  });
});

// === Nametag Creation Helper ===
function createNametag(name) {
  const tag = document.createElement('div');
  tag.className = 'nametag';
  tag.textContent = name;
  Object.assign(tag.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    padding: '3px 8px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    pointerEvents: 'none',
    textShadow: '0 0 4px #000',
    transform: 'translate(-50%, -100%)',
    zIndex: 100000, // สูงกว่า vision-overlay
  });
  document.body.appendChild(tag);
  return tag;
}

// === Snapshot handling ===
let remotePlayers = {};
let lastPlayersSnapshot = [];
let lastActiveUIDs = new Set();

socket.on('snapshot', (payload) => {
  if (!payload?.players) return;
  lastPlayersSnapshot = payload.players;

  const newSet = new Set(payload.players.map((p) => p.uid));

  // ลบเฉพาะ player ที่หายไปจาก snapshot รอบนี้
  for (const id of lastActiveUIDs) {
    if (!newSet.has(id) && remotePlayers[id]) {
      remotePlayers[id].remove();
      if (remotePlayers[id]._nametag) remotePlayers[id]._nametag.remove();
      delete remotePlayers[id];
    }
  }

  lastPlayersSnapshot = payload.players;
  lastActiveUIDs = newSet;
});

// --- Render Loop สำหรับ remote players ---
function renderRemotePlayers() {
  for (const p of lastPlayersSnapshot) {
    if (p.uid === uid) continue;

    let el = remotePlayers[p.uid];
    if (!el) {
      el = document.createElement('img');
      el.src = 'assets/images/idle_1.png';
      el.className = 'remote-player';
      Object.assign(el.style, {
        position: 'absolute',
        width: '128px',
        height: '128px',
        imageRendering: 'pixelated',
        willChange: 'transform',
      });
      el.dataset.x = p.x;
      el.dataset.y = p.y;
      el.dataset.tx = p.x;
      el.dataset.ty = p.y;
      el._lastUpdate = performance.now();
      gameContainer.appendChild(el);
      remotePlayers[p.uid] = el;
    }

    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const now = performance.now();
    const dt = (now - (el._lastUpdate || now)) / 1000;
    el._lastUpdate = now;

    const smoothing = Math.min(1, dt * 8);
    const nx = cx + (p.x - cx) * smoothing;
    const ny = cy + (p.y - cy) * smoothing;

    const tx = Math.round(nx);
    const ty = Math.round(ny);

    if (!el._nametag) {
      el._nametag = createNametag(p.name || `Player_${p.uid.slice(0, 4)}`);
    }
    const tagX = tx + containerX + 64;
    const tagY = ty + containerY - 12;
    el._nametag.style.left = `${tagX}px`;
    el._nametag.style.top = `${tagY}px`;

    if (tx !== +el.dataset.tx || ty !== +el.dataset.ty) {
      el.style.transform = `translate(${tx}px, ${ty}px)`;
      el.dataset.tx = tx;
      el.dataset.ty = ty;
    }

    el.dataset.x = nx;
    el.dataset.y = ny;
  }

  requestAnimationFrame(renderRemotePlayers);
}
renderRemotePlayers();

// === Send position with throttle ===
let lastSent = 0;
const SEND_INTERVAL = 80; // ส่งทุก 80ms พอ

function sendPlayerPosition() {
  const now = performance.now();
  if (!isMoving || now - lastSent < SEND_INTERVAL) return;
  lastSent = now;
  socket.emit('player:move', {
    uid,
    x: playerWorldX,
    y: playerWorldY,
  });
}

// === Handle disconnect / errors ===
socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected from server:', reason);
});
socket.on('error', (error) => {
  console.error('⚠️ Socket error:', error);
});
