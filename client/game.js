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

// *******************************************
// NEW: ข้อมูลความสามารถพิเศษ
// *******************************************
const VISITOR_ABILITIES = {
    'Engineer': 'ซ่อมแซมได้เร็วขึ้น',
    'Scientist': 'มองเห็นจุดภารกิจได้ไกลขึ้น',
    'Janitor': 'สามารถซ่อนหลักฐานที่ถูกขโมยได้ 1 ครั้ง'
};

const THIEF_ABILITIES = {
    'Hacker': 'สามารถสุ่มปิดไฟในห้องหนึ่งเป็นเวลาสั้นๆ'
};

// game.js: เพิ่มโค้ดใหม่ (เลือกตำแหน่งที่เหมาะสม)
export const ROLE_CONFIG = {
  Visitor: {
    Engineer: { taskSpeedMul: 1.35, sabotageFixMul: 1.30, debuffDurMul: 0.8 },
    Scientist:{ visionMul: 1.35, hintEverySec: 12, blackoutVisionMul: 0.5 },
    Janitor:  { charges: 2, cleanseRadius: 120, castMs: 2000, cdMs: 0 }
  },
  Thief: {
    Hacker:   { charges: 3, cdMs: 25000, durMs: 6000, camJamMs: 8000, maxRoomRange: 1100 },
    Shadow:   { speedMul: 1.06, noiseMul: 0.6, forbidSprintStack: true, traceForScientistMs: 1500 },
    Distractor:{ cdMs: 18000, durMs: 6000, fakePing:true, janitorCleanseable:true }
  }
};

// *******************************************
// Collision (object-rect only, no tiles)
// *******************************************
let collisionObjects = []; // Array<{x,y,w,h}> ในพิกัดโลก 8192x8192

// *******************************************

// *******************************************
// NEW: ตัวแปรสำหรับ Minimap
// *******************************************
let isMapFullScreen = false;
const MINIMAP_SIZE_PIXELS = 150; // ขนาด Minimap (150px)
// สัดส่วนการย่อแผนที่สำหรับ Minimap
const MAP_SCALE = MINIMAP_SIZE_PIXELS / 8192; 

// *** NEW: ซูมสำหรับ Minimap โฟกัสผู้เล่น ***
const FOCUSED_MAP_SCALE = 0.5; 
// *******************************************


// *******************************************
// NEW: ขนาดแผนที่และตำแหน่งเริ่มต้น
// *******************************************

const CONTAINER_WIDTH = 8192 ;
const CONTAINER_HEIGHT = 8192 ;

// พาธไฟล์แผนที่ .tmj ที่ใช้งาน
// ไม่ใช้ไฟล์ TMJ อีกต่อไป (ลบการพึ่งพา Tiled)

// ตำแหน่งเริ่มต้นผู้เล่น (กลางแผนที่ 8192x8192)
let playerWorldX = 3500; 
let playerWorldY = 3500; 

// ตำแหน่งจุดภารกิจ (กระจายให้เหมาะสมกับแผนที่ 8192x8192)
const MISSION_SPOTS_DATA = [
//
];

let isChatFocused = false;

// อ้างอิงองค์ประกอบ DOM
const gameContainer = document.getElementById('game-container');
const player = document.getElementById('player');
const minimapBase = document.getElementById('minimap-base');
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
// **************************************

// การอ้างอิง Audio Elements
const sfxInteract = document.getElementById('sfx-interact');
const sfxHeist = document.getElementById('sfx-heist');
const bgmMusic = document.getElementById('bgm-music');

// การอ้างอิง Minimap UI - NEW
const mapOverlay = document.getElementById('map-overlay');
const minimapContent = document.getElementById('minimap-content');
const minimapPlayerDot = document.getElementById('minimap-player-dot');
const minimapMissionDots = {
    'mission-guest': document.getElementById('minimap-guest-dot'),
    'mission-heist': document.getElementById('minimap-heist-dot'),
    'mission-meeting': document.getElementById('minimap-meeting-dot'),
};


// สถานะเกมหลัก
const keysPressed = {};
let isMoving = false; 
let isMeetingActive = false; 
let isRoleRevealed = false; // NEW: สถานะ Role Reveal

// ตำแหน่งกล้องและขนาดหน้าจอ (คงเดิม)
let containerX = 0;
let containerY = 0;
let VIEWPORT_WIDTH = window.innerWidth;
let VIEWPORT_HEIGHT = window.innerHeight;
let playerWidth = 200; 
let playerHeight = 200; 

// *******************************************
// Placeholder (เก็บเฉยๆ ไม่ใช้ Tiled แล้ว)
// *******************************************
const WALL_COLLISION_BOXES = []; 


// *******************************************
// 4. การจัดการแอนิเมชัน (คงเดิม)
// *******************************************
const idleFrames = ['assets/images/idle_1.png']; 
const walkFrames = [
    'assets/images/walk_1.png', 'assets/images/walk_2.png', 'assets/images/walk_3.png', 
    'assets/images/walk_4.png', 'assets/images/walk_5.png', 'assets/images/walk_6.png',
    'assets/images/walk_7.png', 'assets/images/walk_8.png'
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
}




// *******************************************
// 6. การจัดการ Log Event และ Audio (คงเดิม)
// *******************************************
function addLogEvent(message, type = 'general') {
    const logElement = document.createElement('p');
    logElement.className = 'log-message';
    logElement.textContent = message;

    if (type === 'heist') {
        logElement.classList.add('heist');
    }

    if (logContainer.firstChild) {
        logContainer.insertBefore(logElement, logContainer.firstChild);
    } else {
        logContainer.appendChild(logElement);
    }

    while (logContainer.children.length > MAX_LOG_MESSAGES) {
        logContainer.removeChild(logContainer.lastChild);
    }

    setTimeout(() => { logElement.style.opacity = '0'; }, LOG_FADE_DURATION_MS);
    setTimeout(() => {
        if (logElement.parentElement === logContainer) {
            logContainer.removeChild(logElement);
        }
    }, LOG_FADE_DURATION_MS + 1000); 
}

function playSound(audioElement) {
    audioElement.currentTime = 0; 
    audioElement.play().catch(e => console.log("Audio playback blocked by browser:", e)); 
}


// *******************************************
// 7. การจัดการแถบสถานะภารกิจ (คงเดิม)
// *******************************************
function updateMissionStatus() {
    currentMissionProgress = Math.min(currentMissionProgress, MAX_MISSION_PROGRESS);

    const progressPercent = Math.round((currentMissionProgress / MAX_MISSION_PROGRESS) * 100);

    missionProgressBar.style.width = `${progressPercent}%`;
    missionProgressText.textContent = `${progressPercent}%`;

    if (currentMissionProgress >= MAX_MISSION_PROGRESS) {
        console.log("*** ผู้เยี่ยมชมทำภารกิจครบแล้ว! ***");
        addLogEvent("✅ ภารกิจทั้งหมดของผู้เยี่ยมชมเสร็จสมบูรณ์แล้ว! (ฝ่ายผู้เยี่ยมชมชนะ)", 'heist'); 
    }
}

// *******************************************
// 8. การจัดการระบบประชุม (Meeting System)
// *******************************************
function startMeeting() {
    if (isMeetingActive) return;

    isMeetingActive = true;
    meetingModal.style.display = 'flex'; 
    
    bgmMusic.pause();
    
    voteResultText.textContent = ""; 
    votingButtons.forEach(btn => btn.disabled = false);

    // NEW: ซ่อน Minimap
    mapOverlay.style.display = 'none';

    console.log("!!! การประชุมฉุกเฉินเริ่มต้น !!!");
    addLogEvent("🚨 ผู้เล่นเรียกประชุมฉุกเฉิน!", 'heist');
}

function endMeeting() {
    isMeetingActive = false;
    meetingModal.style.display = 'none'; 
    
    bgmMusic.play().catch(e => console.log("BGM playback blocked:", e));

    // NEW: แสดง Minimap กลับมา
    mapOverlay.style.display = 'block';

    console.log("!!! สิ้นสุดการประชุม !!!");
    addLogEvent("การประชุมสิ้นสุดลงแล้ว", 'general');
}

function handleVote(target) {
    if (!isMeetingActive) return;

    voteResultText.textContent = `โหวตไปยัง: ${target}! รอผลโหวตสุดท้าย...`;
    votingButtons.forEach(btn => btn.disabled = true);
    
    setTimeout(() => {
        endMeeting();
    }, 3000); 
}


// *******************************************
// 9. การจัดการ Minimap และ Full Map (แก้ไขให้เป็นวงกลมในโหมด Fullscreen)
// *******************************************
function toggleFullScreenMap() {
    // ป้องกันการเปิดแผนที่เต็มจอระหว่างการประชุม
    if (isMeetingActive) return; 

    isMapFullScreen = !isMapFullScreen;
    
    if (isMapFullScreen) {
        // เปิดโหมดแผนที่เต็มจอ (Minimap ขนาดใหญ่ขึ้นและอยู่ตรงกลาง)
        mapOverlay.classList.add('fullscreen');
        // ล้าง inline transform เพื่อไม่ให้ทับ CSS ของคลาส .fullscreen
        mapOverlay.style.transform = '';
        
        // ซ่อน UI อื่นๆ ที่อาจรบกวน 
        visionOverlay.style.display = 'none';
        document.getElementById('log-container').style.opacity = '0';
        document.getElementById('mission-status-container').style.opacity = '0';
        document.getElementById('interaction-hint').style.display = 'none';
    } else {
        // ปิดโหมดแผนที่เต็มจอ กลับเป็น Minimap เล็ก
        mapOverlay.classList.remove('fullscreen');
        
        // ลบ inline transform (ให้กลับไปพึ่งพา CSS ปกติที่มุมขวาบน)
        mapOverlay.style.transform = ''; 
        
        // เปิด UI ที่ซ่อนไว้กลับมา 
        visionOverlay.style.display = 'block';
        document.getElementById('log-container').style.opacity = '1';
        document.getElementById('mission-status-container').style.opacity = '1';
    }

    // อัปเดตการแสดงผลแผนที่ทันที
    updateMiniMapDisplay(); 
}

function updateMiniMapDisplay() {
    if (!mapOverlay || !minimapContent || !minimapPlayerDot) return;
    let scale;
    let offsetX = 0;
    let offsetY = 0;
    let currentMapOverlaySize; // ขนาดของวงกลม Minimap/Full Map ในปัจจุบัน

    const currentViewPortWidth = window.innerWidth;
    const currentViewPortHeight = window.innerHeight;

    // 1. คำนวณพิกัดโลกของผู้เล่น (จุดศูนย์กลาง)
    const playerCenterX = playerWorldX + (playerWidth / 2); 
    const playerCenterY = playerWorldY + (playerHeight / 2); 
    
    if (isMapFullScreen) {
        // --- Full Map (วงกลมขนาดใหญ่ตรงกลาง) Logic ---
        
        // ขนาดวงกลม Full Map ถูกกำหนดเป็น 80% ของความสูงหน้าจอ (80vh) ใน CSS
        currentMapOverlaySize = Math.floor(currentViewPortHeight * 0.8);
        
        // คำนวณ Scale เพื่อให้แผนที่เต็มพื้นที่วงกลมใหญ่ (ใช้ขนาด 80vh)
        scale = currentMapOverlaySize / CONTAINER_WIDTH; 
        
        // 2. คำนวณตำแหน่งที่ Minimap Content ควรเลื่อน (เพื่อให้ผู้เล่นอยู่ตรงกลางวงกลมใหญ่)
        const scaledPlayerX = playerCenterX * scale;
        const scaledPlayerY = playerCenterY * scale;

        // ตำแหน่งที่ต้องเลื่อน: (จุดกึ่งกลางของวงกลมใหญ่) - (ตำแหน่งผู้เล่นที่ถูก Scale)
        offsetX = (currentMapOverlaySize / 2) - scaledPlayerX;
        offsetY = (currentMapOverlaySize / 2) - scaledPlayerY;

        // 3. จำกัดขอบเขตการเลื่อนของ Minimap Content (ป้องกันแผนที่หลุดขอบ)
        const mapAreaWidth = CONTAINER_WIDTH * scale;
        const mapAreaHeight = CONTAINER_HEIGHT * scale;
        
        // ใช้ currentMapOverlaySize แทน MINIMAP_SIZE_PIXELS
        const maxOffsetLeft = currentMapOverlaySize - mapAreaWidth;
        const minOffsetRight = 0;

        offsetX = Math.min(minOffsetRight, offsetX);
        offsetX = Math.max(maxOffsetLeft, offsetX);
        
        const maxOffsetTop = currentMapOverlaySize - mapAreaHeight;
        const minOffsetBottom = 0;

        offsetY = Math.min(minOffsetBottom, offsetY);
        offsetY = Math.max(maxOffsetTop, offsetY);
        
    } else {
        // --- Minimap (Focused/Radar) Logic (150px) ---
        currentMapOverlaySize = MINIMAP_SIZE_PIXELS;
        scale = FOCUSED_MAP_SCALE; 

        // 2. คำนวณตำแหน่งที่ Minimap Content ควรเลื่อน (เพื่อให้ผู้เล่นอยู่ตรงกลาง Minimap Overlay)
        const scaledPlayerX = playerCenterX * scale;
        const scaledPlayerY = playerCenterY * scale;

        // ตำแหน่งที่ต้องเลื่อน: (จุดกึ่งกลางของ Minimap) - (ตำแหน่งผู้เล่นที่ถูก Scale)
        offsetX = (currentMapOverlaySize / 2) - scaledPlayerX;
        offsetY = (currentMapOverlaySize / 2) - scaledPlayerY;

        // 3. จำกัดขอบเขตการเลื่อนของ Minimap Content (ป้องกันแผนที่หลุดขอบ)
        const mapAreaWidth = CONTAINER_WIDTH * scale;
        const mapAreaHeight = CONTAINER_HEIGHT * scale;
        
        const maxOffsetLeft = currentMapOverlaySize - mapAreaWidth;
        const minOffsetRight = 0;

        offsetX = Math.min(minOffsetRight, offsetX);
        offsetX = Math.max(maxOffsetLeft, offsetX);
        
        const maxOffsetTop = currentMapOverlaySize - mapAreaHeight;
        const minOffsetBottom = 0;

        offsetY = Math.min(minOffsetBottom, offsetY);
        offsetY = Math.max(maxOffsetTop, offsetY);
    }
    
    // 4. ปรับใช้ Transform กับ Map Content
    minimapContent.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    
    // 5. กำหนดตำแหน่ง Dot ทุกจุด
    const playerMapX = playerWorldX + (playerWidth / 2); 
    const playerMapY = playerWorldY + (playerHeight / 2); 

    minimapPlayerDot.style.left = `${playerMapX}px`;
    minimapPlayerDot.style.top = `${playerMapY}px`;
    
    // 6. ปรับขนาด Dot ให้มีขนาดคงที่บนจอ (Anti-scale)
    const inverseScale = 1 / scale; 
    const dotTransformStyle = `translate(-50%, -50%) scale(${inverseScale})`; 

    minimapPlayerDot.style.transform = dotTransformStyle;
    
    // อัปเดตตำแหน่งจุดภารกิจ
    MISSION_SPOTS_DATA.forEach(spot => {
        const dot = minimapMissionDots[spot.id];
        if (dot) {
            dot.style.left = `${spot.x + (spot.width / 2)}px`;
            dot.style.top = `${spot.y + (spot.height / 2)}px`;
            dot.style.transform = dotTransformStyle;
        }
    });
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
    } catch (e) {
        console.warn('JSON collision load failed:', e);
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

// *******************************************
// 5. การจัดการภารกิจและการโต้ตอบ (คงเดิม)
// *******************************************
function getDistance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkInteractions() {
    // ต้องรอจนกว่าจะได้รับบทบาทก่อน
    if (playerRole === 'Loading...') return;
    
    const playerCenterX = playerWorldX + playerWidth / 2;
    const playerCenterY = playerWorldY + playerHeight / 2;

    const missionSpots = MISSION_SPOTS_DATA.map(spotData => ({ 
        ...spotData, 
        element: document.getElementById(spotData.id) 
    }));

    let canInteract = false;

    for (const spot of missionSpots) {
        // การจัดการการแสดงจุดภารกิจตามบทบาท (เพื่อจำลองการทำงาน)
        if (spot.type === 'heist' && playerRole !== 'Thief') {
            spot.element.style.display = 'none'; // ซ่อนจุดขโมยถ้าไม่ใช่โจร
        } else if (spot.type === 'guest' && playerRole === 'Thief') {
             // โจรยังเห็นจุดซ่อมแซมได้
             spot.element.style.display = 'block'; 
        } else {
            spot.element.style.display = 'block';
        }
        
        // ข้ามจุดที่ถูกซ่อนไป
        if (spot.element.style.display === 'none') continue;
        

        const spotCenterX = spot.x + spot.width / 2;
        const spotCenterY = spot.y + spot.height / 2;
        const distance = getDistance(playerCenterX, playerCenterY, spotCenterX, spotCenterY);

        if (distance <= INTERACTION_RADIUS) {
            canInteract = true;
            spot.element.style.opacity = 1.0; 
            
            // ตรวจสอบการกดปุ่ม E
            if (keysPressed[INTERACTION_KEY]) {
                keysPressed[INTERACTION_KEY] = false; // เคลียร์ปุ่ม E

                // *** ตรวจสอบบทบาทก่อนทำภารกิจ ***
                if (spot.type === 'guest' && playerRole === 'Visitor') {
                    // ภารกิจของผู้เยี่ยมชม
                    addLogEvent(`ผู้เยี่ยมชมซ่อมแซมสิ่งของที่ ${spot.id} สำเร็จ!`);
                    
                    if (currentMissionProgress < MAX_MISSION_PROGRESS) {
                        currentMissionProgress += MISSION_INCREASE_AMOUNT;
                        updateMissionStatus();
                    }
                    playSound(sfxInteract); 
                    
                } else if (spot.type === 'heist' && playerRole === 'Thief') {
                    // ภารกิจของหัวขโมย
                    const message = `🚨 หลักฐาน: พบการขโมยเกิดขึ้นที่ [${spot.id}]! 🚨`;
                    addLogEvent(message, 'heist');
                    playSound(sfxHeist); 
                } else if (spot.type === 'meeting') {
                    // จุดประชุมฉุกเฉิน (ทุกคนทำได้)
                    startMeeting();
                    playSound(sfxInteract); 
                } else {
                    // แจ้งเตือนเมื่อพยายามโต้ตอบจุดภารกิจของฝ่ายตรงข้าม
                    addLogEvent("คุณไม่สามารถโต้ตอบกับวัตถุนี้ได้", 'general');
                }
            }
        } else {
            spot.element.style.opacity = 0.6;
        }
    }
    
    // ซ่อนคำแนะนำโต้ตอบเมื่ออยู่ในโหมดแผนที่เต็มจอ
    interactionHint.style.display = canInteract && !isMapFullScreen ? 'block' : 'none';
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
  // หยุดถ้าอยู่ใน Role Reveal หรือ Meeting
  if (isRoleRevealed || isMeetingActive) {
    updateAnimation(timestamp);
    requestAnimationFrame(worldGameLoop);
    return;
  }

  let deltaX = 0;
  let deltaY = 0;

  // การเคลื่อนที่
  if (keysPressed['ArrowUp'] || keysPressed['KeyW']) deltaY -= PLAYER_SPEED;
  if (keysPressed['ArrowDown'] || keysPressed['KeyS']) deltaY += PLAYER_SPEED;
  if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) deltaX -= PLAYER_SPEED;
  if (keysPressed['ArrowRight'] || keysPressed['KeyD']) deltaX += PLAYER_SPEED;

  const wasMoving = isMoving;
  isMoving = (deltaX !== 0 || deltaY !== 0);

  if (isMoving) {
    let nextPlayerWorldX = playerWorldX + deltaX;
    let nextPlayerWorldY = playerWorldY + deltaY;

    // Collision Check
    if (!checkCollision(nextPlayerWorldX, playerWorldY, playerWidth, playerHeight))
      playerWorldX = nextPlayerWorldX;
    if (!checkCollision(playerWorldX, nextPlayerWorldY, playerWidth, playerHeight))
      playerWorldY = nextPlayerWorldY;

    // Clamp boundaries
    const MAX_WORLD_X = CONTAINER_WIDTH - playerWidth;
    const MAX_WORLD_Y = CONTAINER_HEIGHT - playerHeight;
    playerWorldX = Math.min(Math.max(0, playerWorldX), MAX_WORLD_X);
    playerWorldY = Math.min(Math.max(0, playerWorldY), MAX_WORLD_Y);

    // Camera follow
    containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
    containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);
    const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
    const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
    containerX = Math.min(0, Math.max(maxContainerX, containerX));
    containerY = Math.min(0, Math.max(maxContainerY, containerY));

    updateDisplay();

    // ✅ อัปเดต bubble ของตัวเอง
    if (player._chatBubble) {
      const bx = playerWorldX + containerX + playerWidth / 2;
      const by = playerWorldY + containerY - 50;
      player._chatBubble.style.left = `${bx}px`;
      player._chatBubble.style.top = `${by}px`;
    }

    if (!playerNameTag) playerNameTag = createNametag(displayName);
  }

  // ตรวจสอบ Interaction
  checkInteractions();
  checkObjectInteractions();

  if (isMoving || wasMoving !== isMoving)
    updateAnimation(timestamp);

  sendPlayerPosition();
  requestAnimationFrame(worldGameLoop);
}


// *******************************************
// 3. การเริ่มต้นเกมและ Event Listeners (ปรับปรุงใหม่)
// *******************************************
function initializeGame() {
    VIEWPORT_WIDTH = window.innerWidth;
    VIEWPORT_HEIGHT = window.innerHeight;
    playerWidth = player.offsetWidth;
    playerHeight = player.offsetHeight;

    document.getElementById('chat-container').style.display = 'none';

    // *** โหลด asset ตัวละคร ***
    const currentPlayerCharacterAsset = player.src; 

    // *** สุ่มบทบาท (Visitor / Thief) ***
    const roles = ['Thief', 'Visitor']; 
    playerRole = roles[Math.floor(Math.random() * roles.length)]; 

    let abilityName = '';
    playerAbility = '';

    if (roleCharacterImage) {
        roleCharacterImage.src = currentPlayerCharacterAsset; 
    }

    loadCollisionData(); 
    updateDisplay();
    if (!playerNameTag) playerNameTag = createNametag(displayName);

    // ล้างคลาสเก่าออกก่อน
    roleNameText.classList.remove('role-name-visitor', 'role-name-thief');
    roleCharacterDisplay?.classList.remove('character-glow-visitor', 'character-glow-thief');

    // === กำหนดบทบาทและความสามารถ ===
    if (playerRole === 'Visitor') {
        const abilityPool = VISITOR_ABILITIES;
        const abilities = Object.keys(abilityPool);
        abilityName = abilities[Math.floor(Math.random() * abilities.length)];
        playerAbility = abilityPool[abilityName];
        roleTeamText.textContent = `ฝ่าย: ผู้เยี่ยมชม`;
        roleTeamText.style.color = '#4CAF50';
        roleNameText.classList.add('role-name-visitor');
        roleCharacterDisplay?.classList.add('character-glow-visitor');
    } else {
        const abilityPool = THIEF_ABILITIES;
        const abilities = Object.keys(abilityPool);
        abilityName = abilities[Math.floor(Math.random() * abilities.length)];
        playerAbility = abilityPool[abilityName];
        roleTeamText.textContent = `ฝ่าย: หัวขโมย`;
        roleTeamText.style.color = '#FF0000';
        roleNameText.classList.add('role-name-thief');
        roleCharacterDisplay?.classList.add('character-glow-thief');
    }

    // === อัปเดต Role Modal ===
    roleNameText.textContent = abilityName.toUpperCase();
    roleAbilityText.textContent = playerAbility; 
    roleRevealModal.style.display = 'flex'; 
    isRoleRevealed = true; 

    // ลบ prompt เก่าออก
    const promptText = roleRevealModal.querySelector('p[style*="margin-top: 30px;"]');
    if (promptText) promptText.style.display = 'none';

    // === ตั้งเวลาให้ modal หาย แล้วเริ่มเกม ===
    setTimeout(() => {
        roleRevealModal.style.opacity = '0'; 
        setTimeout(() => {
            roleRevealModal.style.display = 'none';
            isRoleRevealed = false;
            requestAnimationFrame(worldGameLoop); 

            addLogEvent(`คุณได้รับบทบาทเป็น: ${playerRole} (${abilityName})`, playerRole === 'Thief' ? 'heist' : 'general');
            addLogEvent(`สิ่งที่ทำได้: ${playerAbility}`, 'general');
            addLogEvent('กด [M] เพื่อเปิด/ปิดแผนที่');

            // ✅ อัปเดต HUD role-icon หลังสุ่มเสร็จ
            updateRoleIconHUD(playerRole, abilityName);
            flashRoleHud();
              const chatBox = document.getElementById('chat-container');
            if (chatBox) chatBox.style.display = 'block';

            addLogEvent("ระบบพร้อมใช้งาน: สามารถกด Enter เพื่อพิมพ์แชทได้ 💬");


        }, 1000);
    }, ROLE_REVEAL_DURATION);

    // ถ้าเป็นโจร ซ่อนแถบภารกิจ
    if (playerRole === 'Thief') {
        document.getElementById('mission-status-container').style.display = 'none';
    }

    containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
    containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);

    const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
    const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
    containerX = Math.min(0, Math.max(maxContainerX, containerX));
    containerY = Math.min(0, Math.max(maxContainerY, containerY));

    updateDisplay();
    if (!playerNameTag) playerNameTag = createNametag(displayName);

    player.src = idleFrames[0];
    bgmMusic.volume = 0.4; 
    bgmMusic.play().catch(e => console.log("BGM playback blocked by browser:", e)); 

    const chatInput = document.getElementById('chat-input');
    const chatHint = document.getElementById('chat-hint');
    if (chatInput && chatHint) {
    chatInput.addEventListener('focus', () => chatHint.style.display = 'none');
    chatInput.addEventListener('blur', () => chatHint.style.display = 'block');
    }

}


// === HUD Role Icon ===
function updateRoleIconHUD(role, abilityName) {
    const iconImg = document.getElementById('role-icon-img');
    const iconText = document.getElementById('role-icon-text');
    const hud = document.getElementById('role-icon-hud');
    if (!iconImg || !iconText || !hud) return;

    // ใช้ชื่อ ability (ไม่ใช่คำอธิบาย)
    const path = `assets/role/${abilityName}.png`;
    iconImg.src = path;
    iconText.textContent = `${abilityName} (${role})`;

    // สี Glow ตามฝ่าย
    hud.style.boxShadow = role === 'Thief' 
        ? '0 0 15px 3px #ff3333' 
        : '0 0 15px 3px #00ff80';
}

function flashRoleHud() {
    const hud = document.getElementById('role-icon-hud');
    if (!hud) return;
    hud.style.transition = 'transform 0.25s, box-shadow 0.3s';
    hud.style.transform = 'scale(1.2)';
    setTimeout(()=> hud.style.transform = 'scale(1)', 250);
}

const hud = document.getElementById('role-icon-hud');
hud.classList.remove('visitor', 'thief');
hud.classList.add(playerRole.toLowerCase());

// เริ่มต้นเกม
try {
  const hasWorldDOM = document.getElementById('game-container') && document.getElementById('player');
  if (hasWorldDOM) {
    window.addEventListener('load', initializeGame);
  }
} catch(_) {}
// client/game.js (ES module)

// ===== Multiplayer Section (Socket.IO Integration) =====
//import { io } from "/socket.io/socket.io.esm.min.js"; // โหลด socket.io client module

const socket = io("https://webgame-25n5.onrender.com");
// ===== Multiplayer Section (Socket.IO Integration) =====
//const socket = io("http://localhost:3000");
window.socket = socket;

// === Player identity ===
const ROOM_CODE = "lobby01";
const uid =
  sessionStorage.getItem("uid") ||
  (() => {
    const v = crypto.randomUUID();
    sessionStorage.setItem("uid", v);
    return v;
  })();

const CHAR_KEY_SCOPED = `ggd.char.${ROOM_CODE}.${uid}`;
function getMyChar() { return sessionStorage.getItem('ggd.char') || localStorage.getItem(CHAR_KEY_SCOPED) || 'mini_brown'; }

// === Determine player display name ===
const displayName = localStorage.getItem("playerName") || `Player_${uid.slice(0,4)}`;
console.log("🆔 Current UID:", uid);

// === Socket connection ===
socket.on("connect", () => {
  console.log("✅ Connected to server:", socket.id);
  socket.emit("game:join", {
    room: ROOM_CODE,
    uid,
    name: `Player_${uid.slice(0, 4)}`,
    color: "#00ffcc",
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
    position: 'absolute',
    color: '#fff',
    background: 'rgba(0,0,0,0.5)',
    padding: '3px 8px',
    borderRadius: '8px',
    fontSize: '14px',
    pointerEvents: 'none',
    transform: 'translate(-50%, -100%)',
    zIndex: 999
  });
  gameContainer.appendChild(tag);
  return tag;
}

// === Snapshot handling ===
let remotePlayers = {};
let lastPlayersSnapshot = [];
let lastActiveUIDs = new Set();

socket.on("snapshot", (payload) => {
  if (!payload?.players) return;
  lastPlayersSnapshot = payload.players;

  const newSet = new Set(payload.players.map(p => p.uid));

  // ✅ ลบเฉพาะ player ที่ "หายไป" จาก snapshot รอบนี้เท่านั้น
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

// --- Render Loop (ลื่นมากกว่า) ---
function renderRemotePlayers() {
  for (const p of lastPlayersSnapshot) {
    if (p.uid === uid) continue;

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
        willChange: "transform",
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

    // Nametag
    if (!el._nametag) {
      el._nametag = createNametag(p.name || `Player_${p.uid.slice(0, 4)}`);
    }
    el._nametag.style.left = `${p.x + containerX + 64}px`;
    el._nametag.style.top = `${p.y + containerY - 40}px`;

    // Remote player movement
    if (tx !== +el.dataset.tx || ty !== +el.dataset.ty) {
      el.style.transform = `translate(${tx}px, ${ty}px)`;
      el.dataset.tx = tx;
      el.dataset.ty = ty;
    }

    el.dataset.x = nx;
    el.dataset.y = ny;

    // ✅ Bubble ของ remote player
    if (el._chatBubble) {
      const bx = p.x + containerX + 64;
      const by = p.y + containerY - 70;
      el._chatBubble.style.left = `${bx}px`;
      el._chatBubble.style.top = `${by}px`;
    }
  }

  requestAnimationFrame(renderRemotePlayers);
}

// === Send position with throttle ===
let lastSent = 0;                   // 🟢 ประกาศก่อนใช้
const SEND_INTERVAL = 80;           // ส่งทุก 80ms พอ

function sendPlayerPosition() {
  const now = performance.now();
  if (!isMoving || now - lastSent < SEND_INTERVAL) return;
  lastSent = now;
  socket.emit("player:move", {
    uid,
    x: playerWorldX,
    y: playerWorldY,
  });
}

// === Handle disconnect ===
socket.on("disconnect", (reason) => {
  console.log("❌ Disconnected from server:", reason);
});

// === Handle errors ===
socket.on("error", (error) => {
  console.error("⚠️ Socket error:", error);
});


// ===== CHAT SYSTEM (Fixed multi-use + start after Role Reveal) =====
const chatContainer = document.getElementById("chat-container");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");

let chatMode = false;
let chatReady = false; // 🚫 ยังไม่เปิดใช้จนกว่า role เผยหมด

// ฟังก์ชันเปิดระบบแชทหลัง role reveal จบ
function enableChatSystem() {
  chatReady = true;
  console.log("💬 Chat system is now active.");
}

// เรียกตอนท้าย initializeGame() หลัง role reveal modal หาย
// เช่นใน setTimeout(..., ROLE_REVEAL_DURATION):
//    enableChatSystem();

document.addEventListener("keydown", (e) => {
  // ถ้ายังไม่พร้อม -> ห้ามใช้ระบบแชท
  if (!chatReady || isRoleRevealed) return;

  // ถ้ายังไม่ได้อยู่ในโหมดแชทและกด Enter -> เปิดช่องพิมพ์
  if (!chatMode && e.key === "Enter") {
    chatMode = true;
    chatInput.style.display = "block";
    chatInput.focus();
    e.preventDefault();
    return;
  }

  // ถ้าอยู่ในโหมดแชทแล้วกด Enter -> ส่งข้อความ
  if (chatMode && e.key === "Enter") {
    const msg = chatInput.value.trim();
    if (msg !== "") {
      socket.emit("chat:message", { uid, name: displayName, text: msg });
      addChatMessage(displayName, msg);
      showChatBubble(uid, msg);
    }

    chatInput.value = "";
    chatInput.blur();
    chatInput.style.display = "none";
    chatMode = false;
    e.preventDefault();
    return;
  }

  // ถ้าอยู่ในโหมดแชท -> ห้ามเดิน
  if (chatMode) return;
});

// เมื่อ focus input -> ปิดการเคลื่อนไหว
chatInput.addEventListener("focus", () => (chatMode = true));

// แสดงข้อความในกล่อง log ด้านล่าง
function addChatMessage(sender, text) {
  const p = document.createElement("p");
  p.innerHTML = `<b style="color:#00ffc6">${sender}:</b> ${text}`;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (chatMessages.children.length > 30)
    chatMessages.removeChild(chatMessages.firstChild);
}

function appendChatMessage(sender, message) {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return;

  const div = document.createElement('div');
  div.textContent = `${sender}: ${message}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // ✅ ให้แสดง bubble ของตัวเอง
  showChatBubble(uid, message);
}

// แสดง bubble ซ้อนขึ้น
function showChatBubble(playerId, text) {
  const isSelf = playerId === uid;
  const playerEl = isSelf ? player : remotePlayers[playerId];
  if (!playerEl) return;

  if (!playerEl._chatStack) playerEl._chatStack = [];

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  document.body.appendChild(bubble);
  playerEl._chatStack.push(bubble);

  function updateStackPositions() {
    const baseX =
      (isSelf ? playerWorldX : parseFloat(playerEl.dataset.tx) || 0) +
      containerX +
      playerWidth / 2;
    const baseY =
      (isSelf ? playerWorldY : parseFloat(playerEl.dataset.ty) || 0) +
      containerY -
      30;
    playerEl._chatStack.forEach((b, i) => {
      const bx = baseX;
      const by = baseY - i * 28;
      b.style.left = `${bx}px`;
      b.style.top = `${by}px`;
    });
  }

  function followHead() {
    if (!playerEl._chatStack?.length) return;
    updateStackPositions();
    requestAnimationFrame(followHead);
  }
  requestAnimationFrame(followHead);

  bubble.classList.add("show");

  setTimeout(() => {
    bubble.classList.remove("show");
    setTimeout(() => {
      bubble.remove();
      const idx = playerEl._chatStack.indexOf(bubble);
      if (idx >= 0) playerEl._chatStack.splice(idx, 1);
    }, 300);
  }, 3000);
}

// ฟังข้อความจาก server
socket.on("chat:message", (data) => {
  if (!data?.text || !data?.uid) return;
  addChatMessage(data.name || "Unknown", data.text);
  showChatBubble(data.uid, data.text);
});


// การจัดการการกดปุ่ม (ปรับปรุง: เพิ่ม KeyM)
// ============================================
// KEYBOARD HANDLING + CHAT SYSTEM
// ============================================
document.addEventListener('keydown', (e) => {
  const chatInput = document.getElementById('chat-input');

  // ถ้าโฟกัสช่องแชทอยู่และไม่ใช่ Enter → อย่าให้เกมจับปุ่ม
  if (isChatFocused && e.code !== 'Enter') return;

  // ป้องกัน scroll หรือ input แปลก ๆ
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
       INTERACTION_KEY, 'KeyM', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
       'F3', 'F4', 'Backquote'].includes(e.code)) {
    e.preventDefault();
  }

  // =======================================
  // 💬 Enter key behavior
  // =======================================
  if (e.code === 'Enter') {
  if (!chatInput) return;

  if (!isChatFocused) {
    // ✅ ล้างปุ่มค้างก่อนเข้าสู่โหมดพิมพ์
    for (const k in keysPressed) keysPressed[k] = false;

    chatInput.focus();
    isChatFocused = true;
  } else {
    const msg = chatInput.value.trim();
    if (msg.length > 0) {
      appendChatMessage('คุณ', msg);
      socket.emit("chat:message", { uid, name: displayName, text: msg });
      chatInput.value = '';
    }
    chatInput.blur();
    isChatFocused = false;
  }

  e.preventDefault();
  return;
}

  // =======================================
  // ปุ่มอื่น ๆ ของเกม (ทำงานเฉพาะเมื่อไม่ได้พิมพ์)
  // =======================================
  if (e.code === 'KeyM' && !isMeetingActive) {
    toggleFullScreenMap();
    return;
  }

  if (e.code === 'F3') { DEBUG_SHOW_COLLISION_BOXES = !DEBUG_SHOW_COLLISION_BOXES; renderDebugOverlay(); return; }
  if (e.code === 'F4') { DEBUG_SHOW_PLAYER_HITBOX = !DEBUG_SHOW_PLAYER_HITBOX; renderDebugOverlay(); return; }
  if (e.code === 'Backquote') {
    const next = !(DEBUG_SHOW_COLLISION_BOXES || DEBUG_SHOW_PLAYER_HITBOX);
    DEBUG_SHOW_COLLISION_BOXES = next;
    DEBUG_SHOW_PLAYER_HITBOX = false;
    renderDebugOverlay();
    return;
  }

  // ปุ่มปกติของเกม
  keysPressed[e.code] = true;
});

document.addEventListener('keyup', (e) => {
  if (!isChatFocused) keysPressed[e.code] = false;
});



// การผูก Event Listeners สำหรับ Meeting UI (คงเดิม)
endMeetingButton?.addEventListener('click', endMeeting);

votingButtons.forEach(button => {
    button.addEventListener('click', () => {
        handleVote(button.getAttribute('data-target'));
    });
});

// รับเหตุการณ์เปลี่ยนขนาดหน้าต่าง เพื่ออัปเดตตำแหน่ง/สเกลแผนที่ให้ยังคงอยู่กลางจอในโหมด Full Map
window.addEventListener('resize', () => { try { updateMiniMapDisplay(); } catch(_){} });

// ติดตามตำแหน่งเมาส์เพื่อช่วยดีบักพิกัด World
window.addEventListener('mousemove', (e) => {
    if (!gameContainer) return;
    const rect = gameContainer.getBoundingClientRect();
    // world = screen - containerScreenTopLeft
    debugMouseWorldX = e.clientX - rect.left;
    debugMouseWorldY = e.clientY - rect.top;
    // อัปเดตแผงดีบักทันทีเมื่อเปิดโหมด
    updateDebugPanel();
});



// ===== End Multiplayer Section =====