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
    'Hacker': 'สามารถสุ่มปิดไฟในห้องหนึ่งเป็นเวลาสั้นๆ',
    'Shadow': 'เคลื่อนไหวได้เงียบและเร็วขึ้นเล็กน้อย',
    'Distractor': 'สามารถสร้างเสียงรบกวนปลอมได้ในแผนที่'
};

// game.js: เพิ่มโค้ดใหม่ (เลือกตำแหน่งที่เหมาะสม)

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
const CONTAINER_WIDTH = 8192;   // ขนาดแผนที่ 8192
const CONTAINER_HEIGHT = 8192;  // ขนาดแผนที่ 8192

// พาธไฟล์แผนที่ .tmj ที่ใช้งาน
// ไม่ใช้ไฟล์ TMJ อีกต่อไป (ลบการพึ่งพา Tiled)

// ตำแหน่งเริ่มต้นผู้เล่น (กลางแผนที่ 8192x8192)
let playerWorldX = 4096; 
let playerWorldY = 4096; 

// ตำแหน่งจุดภารกิจ (กระจายให้เหมาะสมกับแผนที่ 8192x8192)
const MISSION_SPOTS_DATA = [
    // ภารกิจผู้เยี่ยมชม: มุมซ้ายล่าง
    { id: 'mission-guest', type: 'guest', x: 1500, y: 7000, width: 90, height: 90 }, 
    // ภารกิจหัวขโมย: มุมขวาบน
    { id: 'mission-heist', type: 'heist', x: 7000, y: 1500, width: 90, height: 90 }, 
    // จุดเรียกประชุม: กลางแผนที่
    { id: 'mission-meeting', type: 'meeting', x: 4000, y: 4000, width: 150, height: 150 } 
];

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
let playerWidth = 128; 
let playerHeight = 128; 

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

    console.warn('No collision data found (SVG/JSON). Running without collisions.');
}
// game.js: ฟังก์ชัน checkCollision() (ฉบับยืนยัน)

function checkCollision(nextPlayerX, nextPlayerY, playerW, playerH) {
    
    // กำหนด Hitbox ของตัวละครในตำแหน่งถัดไป (ส่วนเท้า 25% ล่าง)
    const effectiveWidth = playerW * 0.5; // 50% ของความกว้าง
    const effectiveHeight = playerH * 0.25; // 25% ของความสูง
    const offsetX = (playerW - effectiveWidth) / 2; // Offset จากขอบซ้าย/ขวา
    const offsetY = playerH - effectiveHeight; // Offset จากขอบบน (ดัน Hitbox ไปที่เท้า)

    const box = {
        left: nextPlayerX + offsetX,
        top: nextPlayerY + offsetY,
        right: nextPlayerX + offsetX + effectiveWidth,
        bottom: nextPlayerY + offsetY + effectiveHeight
    };

    // 1. ระบุ 4 มุมหลักของกล่องการชนที่ต้องตรวจสอบ
    const checkPoints = [
        { x: box.left, y: box.top },       // บนซ้าย
        { x: box.right, y: box.top },      // บนขวา
        { x: box.left, y: box.bottom },    // ล่างซ้าย
        { x: box.right, y: box.bottom }    // ล่างขวา
    ];

    // ตรวจสอบชนกับสี่เหลี่ยมจาก Object Layer (ถ้ามี)
    if (collisionObjects && collisionObjects.length > 0) {
        const px1 = box.left;
        const py1 = box.top;
        const px2 = box.right;
        const py2 = box.bottom;
        for (const r of collisionObjects) {
            const rx1 = r.x;
            const ry1 = r.y;
            const rx2 = r.x + r.w;
            const ry2 = r.y + r.h;
            const overlap = (px1 < rx2 && px2 > rx1 && py1 < ry2 && py2 > ry1);
            if (overlap) return true;
        }
    }

    return false; // ไม่ชน
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
// 2. Game Loop (แก้ไข Logic การเคลื่อนที่และการชน)
// *******************************************
function gameLoop(timestamp) {
    
    // NEW: หยุด Game Loop ถ้า Role Reveal ยังทำงานอยู่
    if (isRoleRevealed) {
        updateAnimation(timestamp); 
        requestAnimationFrame(gameLoop); 
        return; 
    }
    
    if (isMeetingActive) {
        updateAnimation(timestamp); 
        requestAnimationFrame(gameLoop); 
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
    
    if (isMoving || wasMoving !== isMoving) {
        updateAnimation(timestamp);
    }
    
    requestAnimationFrame(gameLoop);
}



// *******************************************
// 3. การเริ่มต้นเกมและ Event Listeners (ปรับปรุงใหม่)
// *******************************************
function initializeGame() {
    VIEWPORT_WIDTH = window.innerWidth;
    VIEWPORT_HEIGHT = window.innerHeight;
    playerWidth = player.offsetWidth;
    playerHeight = player.offsetHeight;

    // *** จำลองการดึง Character Asset Path จาก Database/Multiplayer ***
    const currentPlayerCharacterAsset = player.src; 
    
    // *** จำลองการกำหนดบทบาทและสุ่มความสามารถ ***
    const roles = ['Thief', 'Visitor']; 
    playerRole = roles[Math.floor(Math.random() * roles.length)]; 

    let abilityName;

    // *** NEW: แสดงผลตัวละครใน Modal ***
    if (roleCharacterImage) {
        roleCharacterImage.src = currentPlayerCharacterAsset; 
    }

    // NEW: โหลดข้อมูลการชนก่อนเริ่มเกม
    loadCollisionData(); 

    updateDisplay();

    
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

    // *** ตั้งเวลาซ่อน Modal และเริ่ม Game Loop อัตโนมัติ ***
    setTimeout(() => {
        // เริ่ม Fade out 
        roleRevealModal.style.opacity = '0'; 
        
        // ซ่อนหลังจาก Fade out เสร็จ (1 วินาทีตาม CSS transition)
        setTimeout(() => {
            roleRevealModal.style.display = 'none';
            isRoleRevealed = false;
            
            // เริ่ม Game Loop
            requestAnimationFrame(gameLoop); 
            
            // เพิ่ม Log Event เมื่อเกมเริ่มจริง
            addLogEvent(`คุณได้รับบทบาทเป็น: ${playerRole} (${abilityName})`, playerRole === 'Thief' ? 'heist' : 'general');
            addLogEvent(`สิ่งที่ทำได้: ${playerAbility}`, 'general');
            
            // เพิ่มคำแนะนำ Minimap
            addLogEvent('กด [M] เพื่อสลับเปิด/ปิดแผนที่เต็มจอ (Minimap แสดงตลอดเวลา)');
            
        }, 1000); 
    }, ROLE_REVEAL_DURATION); 

    // **********************************************
    
    // ถ้าเป็นโจร ให้ซ่อนแถบสถานะผู้เยี่ยมชม (คงเดิม)
    if (playerRole === 'Thief') {
        document.getElementById('mission-status-container').style.display = 'none';
    }
    // ******************************

    containerX = -(playerWorldX - VIEWPORT_WIDTH / 2 + playerWidth / 2);
    containerY = -(playerWorldY - VIEWPORT_HEIGHT / 2 + playerHeight / 2);
    
    const maxContainerX = VIEWPORT_WIDTH - CONTAINER_WIDTH;
    const maxContainerY = VIEWPORT_HEIGHT - CONTAINER_HEIGHT;
    containerX = Math.min(0, containerX); 
    containerX = Math.max(maxContainerX, containerX);
    containerY = Math.min(0, containerY);
    containerY = Math.max(maxContainerY, containerY);

    updateDisplay();
    player.src = idleFrames[0];
    
    bgmMusic.volume = 0.4; 
    bgmMusic.play().catch(e => console.log("BGM playback blocked by browser:", e)); 
    
}


// การจัดการการกดปุ่ม (ปรับปรุง: เพิ่ม KeyM)
document.addEventListener('keydown', (e) => {
    // เพิ่ม KeyM, KeyW, KeyA, KeyS, KeyD และ F3-F4, Backquote ในรายการป้องกัน Default Action
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', INTERACTION_KEY, 'KeyM', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'F3', 'F4', 'Backquote'].includes(e.code)) {
        e.preventDefault(); 
    }
    keysPressed[e.code] = true;

    // NEW: Toggle Full Map on 'M' key
    if (e.code === 'KeyM' && !isMeetingActive) {
        toggleFullScreenMap();
    }

    // DEBUG toggles
    if (e.code === 'F3') { DEBUG_SHOW_COLLISION_BOXES = !DEBUG_SHOW_COLLISION_BOXES; console.log('DEBUG_SHOW_COLLISION_BOXES =', DEBUG_SHOW_COLLISION_BOXES); renderDebugOverlay(); }
    if (e.code === 'F4') { DEBUG_SHOW_PLAYER_HITBOX = !DEBUG_SHOW_PLAYER_HITBOX; console.log('DEBUG_SHOW_PLAYER_HITBOX =', DEBUG_SHOW_PLAYER_HITBOX); renderDebugOverlay(); }
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


// การผูก Event Listeners สำหรับ Meeting UI (คงเดิม)
endMeetingButton.addEventListener('click', endMeeting);

votingButtons.forEach(button => {
    button.addEventListener('click', () => {
        handleVote(button.getAttribute('data-target'));
    });
});

// รับเหตุการณ์เปลี่ยนขนาดหน้าต่าง เพื่ออัปเดตตำแหน่ง/สเกลแผนที่ให้ยังคงอยู่กลางจอในโหมด Full Map
window.addEventListener('resize', () => {
    updateMiniMapDisplay();
});

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

// เริ่มต้นเกม
window.onload = initializeGame;
// client/game.js (ES module)
// ใช้ Realtime Database อย่างเดียวให้สอดคล้องกับ lobby
import { rtdb, ref, set, update, onValue, onDisconnect, push, get, serverTimestamp } from "./firebase.js";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const chatInput = $("chatInput");
const chatMessages = $("chatMessages");

// Minimal toast fallback if none exists
if (typeof window.showToast !== 'function') {
  window.showToast = function(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      // Inline fallback styles to ensure visibility in game.html
      container.style.position = 'fixed';
      container.style.bottom = '24px';
      container.style.right = '24px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'flex-end';
      container.style.gap = '10px';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    // Inline fallback for toast box
    t.style.background = (type==='success'?'#2ecc71': type==='error'?'#e74c3c': type==='warning'?'#f39c12':'#34495e');
    t.style.color = '#fff';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 4px 14px rgba(0,0,0,.3)';
    t.style.opacity = '0';
    t.style.transition = 'opacity .2s ease, transform .2s ease';
    t.style.transform = 'translateY(6px)';
    container.appendChild(t);
    const maxToasts = 5;
    while (container.children.length > maxToasts) container.firstElementChild?.remove();
    requestAnimationFrame(()=> { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(()=>{ t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(()=> t.remove(), 250); }, 2400);
  }
}

// ---------- Context ----------
const USE_SOCKET = true; // feature flag: use Socket.IO for movement
let socket = null;

// ดึงข้อมูล room code จาก URL
const params = new URLSearchParams(location.search);
const roomCode = params.get("code");
if (!roomCode) {
  location.href = "roomlist.html";
  throw new Error("Missing room code");
}

// ✅ ตรวจสอบผู้ใช้ (auth / guest)
import { auth } from "./firebase.js"; // ใช้จากไฟล์ firebase.js ที่แก้ไปก่อนหน้า

// --- ถ้ามี user login อยู่ ให้ใช้ uid จริง ---
let user = auth.currentUser;

// 🔹 ถ้า refresh แล้ว auth ยังไม่โหลดทัน ให้รอ state เปลี่ยนก่อน
if (!user) {
  await new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      user = u;
      unsub();
      resolve();
    });
  });
}

// 🔹 ถ้า login อยู่ → ใช้ข้อมูลจริงจาก Firebase Auth
// 🔹 ถ้าไม่ได้ login → ใช้ระบบ guest เดิม (localStorage + random UID)
const displayName = user?.displayName ||
  localStorage.getItem("ggd.name") ||
  localStorage.getItem("playerName") ||
  `Player_${Math.random().toString(36).slice(2, 7)}`;

const uid = user?.uid ||
  sessionStorage.getItem("ggd.uid") ||
  (() => {
    const v =
      crypto?.randomUUID?.() || "uid_" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("ggd.uid", v);
    return v;
  })();

localStorage.setItem("ggd.name", displayName);
localStorage.setItem("ggd.uid", uid);

// แสดงชื่อผู้เล่น + รหัสห้อง
$("playerName").textContent = displayName;
$("roomCode").textContent = roomCode;

// ---------- Canvas sizing ----------
let gridPattern = null;
function makeGridPattern(cell = 50, lineColor = "#333") {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const off = document.createElement("canvas");
  off.width = cell * dpr;
  off.height = cell * dpr;
  const c = off.getContext("2d");
  c.scale(dpr, dpr);
  c.strokeStyle = lineColor;
  c.lineWidth = 1;
  // vertical
  c.beginPath();
  c.moveTo(0.5, 0);
  c.lineTo(0.5, cell);
  c.stroke();
  // horizontal
  c.beginPath();
  c.moveTo(0, 0.5);
  c.lineTo(cell, 0.5);
  c.stroke();
  return ctx.createPattern(off, "repeat");
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = (canvas.clientWidth || canvas.parentElement?.clientWidth || 1024);
  const h = (canvas.clientHeight || 600);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor((h || innerHeight) * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gridPattern = makeGridPattern(50, "#333");
}
resizeCanvas();
addEventListener("resize", resizeCanvas);

// ---------- Game state ----------
const playerColors = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
];

const colorFromUid = (u) => {
  let h = 0;
  for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0;
  return playerColors[h % playerColors.length];
};

let gameState = {
  players: {}, // { uid: {uid,name,x,y,color,online} }
  myPlayer: { x: 400, y: 300, color: colorFromUid(uid), name: displayName, uid },
};
let keys = {};
let lastNetUpdate = 0;
let lastFrame = performance.now();
let lastFpsUi = performance.now();
let smoothedFps = 0;
const NET_INTERVAL_MS = 80; // ~12.5 Hz network updates
let inputSeq = 0;
let myRole = 'crew';
let phase = 'round';

// ---------- RTDB paths ----------
const gameRootRef = ref(rtdb, `games/${roomCode}`);
const myPlayerRef = ref(rtdb, `games/${roomCode}/players/${uid}`);
const messagesRef = ref(rtdb, `games/${roomCode}/messages`);

// Ensure room exists lightly (optional)
try {
  const s = await get(gameRootRef);
  if (!s.exists()) {
    await set(gameRootRef, { createdAt: serverTimestamp() });
  }
} catch {}

// Sync messages via RTDB (keep chat on RTDB)
let cachedOthers = [];
onValue(ref(rtdb, `games/${roomCode}/messages`), (snap) => {
  const messages = snap.val() || {};
  const arr = Object.values(messages).slice(-50);
  renderChat(arr);
});

// For players list (RTDB presence only)
onValue(ref(rtdb, `games/${roomCode}/players`), (snap) => {
  const players = snap.val() || {};
  // keep only presence info for sidebar; do not override render positions
  gameState.players = { ...gameState.players, ...players };
  renderPlayersList();
});

// ---------- Render ----------
function drawPlayer(p, isMe = false) {
  ctx.fillStyle = p.color;
  ctx.strokeStyle = isMe ? "#FFD700" : "#fff";
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y - 30);
}

function drawGame() {
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // grid via cached pattern (fast)
  if (gridPattern) {
    ctx.fillStyle = gridPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // others (from latest snapshot/RTDB presence)
  cachedOthers.forEach((p) => drawPlayer(p, false));
  // me (predicted)
  drawPlayer(gameState.myPlayer, true);
}

function renderPlayersList() {
  const container = $("playersContainer");
  if (!container) return;
  const players = Object.values(gameState.players || {}).filter((p) => p && p.online);
  container.innerHTML = players.map((p) => `
    <div class="player">
      <div class="player-color" style="background:${p.color}"></div>
      <span>${p.name}${p.uid === uid ? ' (You)' : ''}</span>
    </div>
  `).join("") || '<div>No players online</div>';
}

function renderChat(messages) {
  chatMessages.innerHTML = messages.map((m) => {
    if (m.player) {
      return `<div class="message"><span style="color:${m.color};font-weight:700">${m.player}:</span> ${m.message}</div>`;
    }
    return `<div class="message system-message">${m.message}</div>`;
  }).join("");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------- Input / movement ----------
function handleMovement(dt) {
  // freeze during meeting
  if (phase === 'meeting') return;
  const speed = 220; // px/sec
  let moved = false;
  const dy = (keys['w'] || keys['ArrowUp'] ? -1 : 0) + (keys['s'] || keys['ArrowDown'] ? 1 : 0);
  const dx = (keys['a'] || keys['ArrowLeft'] ? -1 : 0) + (keys['d'] || keys['ArrowRight'] ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * speed * dt;
    const vy = (dy / len) * speed * dt;
    const nx = Math.min(Math.max(20, gameState.myPlayer.x + vx), canvas.width - 20);
    const ny = Math.min(Math.max(20, gameState.myPlayer.y + vy), canvas.height - 20);
    moved = (nx !== gameState.myPlayer.x) || (ny !== gameState.myPlayer.y);
    gameState.myPlayer.x = nx;
    gameState.myPlayer.y = ny;
  }

  if (moved) {
    const now = performance.now();
    if (USE_SOCKET && socket) {
      // send input at higher rate (prediction handled locally)
      if (now - lastNetUpdate > 16) { // ~60 Hz
        const ax = (keys['a'] || keys['ArrowLeft'] ? -1 : 0) + (keys['d'] || keys['ArrowRight'] ? 1 : 0);
        const ay = (keys['w'] || keys['ArrowUp'] ? -1 : 0) + (keys['s'] || keys['ArrowDown'] ? 1 : 0);
        socket.volatile.emit('input', { seq: ++inputSeq, t: Date.now(), ax, ay });
        lastNetUpdate = now;
      }
    // } else {
    //   if (now - lastNetUpdate > NET_INTERVAL_MS) {
    //     update(myPlayerRef, {
    //       x: Math.round(gameState.myPlayer.x),
    //       y: Math.round(gameState.myPlayer.y),
    //       lastUpdate: serverTimestamp(),
    //     }).catch(() => {});
    //     $("playerPos").textContent = `${Math.round(gameState.myPlayer.x)}, ${Math.round(gameState.myPlayer.y)}`;
    //     lastNetUpdate = now;
    //   }
    }
  }
}

document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; keys[e.code] = true; });
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const msg = chatInput.value.trim();
    if (msg) {
      push(messagesRef, { player: displayName, message: msg, timestamp: serverTimestamp(), color: gameState.myPlayer.color }).catch(()=>{});
      chatInput.value = '';
    }
  }
});

// ---------- Game loop ----------
function gameLoop(ts) {
  const now = ts ?? performance.now();
  const rawDt = Math.max(0.000001, (now - lastFrame) / 1000);
  const dt = Math.min(0.05, rawDt); // cap physics step at 50ms
  lastFrame = now;

  // FPS smoothing (EMA)
  const instFps = 1 / rawDt;
  smoothedFps = smoothedFps ? (smoothedFps * 0.9 + instFps * 0.1) : instFps;

  handleMovement(dt);
  drawGame();

  // Update FPS UI at ~4Hz
  if (now - lastFpsUi > 250) {
    const el = document.getElementById('fpsCounter');
    if (el) el.textContent = `FPS: ${Math.round(smoothedFps)}`;
    lastFpsUi = now;
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ---------- Socket.IO setup (movement) ----------
try {
  if (USE_SOCKET && typeof io !== 'undefined') {
    socket = io({ transports: ['websocket'], upgrade: false, timeout: 5000 });
    socket.on('connect', () => {
      $("gameStatus").textContent = '✅ Connected (WS)';
      // join game room
      socket.emit('game:join', {
        room: roomCode,
        uid,
        name: displayName,
        color: gameState.myPlayer.color,
        x: Math.round(gameState.myPlayer.x),
        y: Math.round(gameState.myPlayer.y),
      });
    });

    socket.on('snapshot', (payload) => {
      // payload: { t, players: [{uid,x,y,name,color}], lastSeq }
      if (!payload || !Array.isArray(payload.players)) return;
      const map = {};
      payload.players.forEach(p => { if (p && p.uid) map[p.uid] = p; });
      // update others list and my position correction (light reconciliation)
      const me = map[uid];
      if (me) {
        gameState.myPlayer.x = me.x;
        gameState.myPlayer.y = me.y;
      }
      // update presence cache for rendering others (alive only)
      cachedOthers = Object.values(map).filter(p => p.uid !== uid && (p.alive ?? true));
      $("playerPos").textContent = `${Math.round(gameState.myPlayer.x)}, ${Math.round(gameState.myPlayer.y)}`;
    });

    // Gameplay events
    socket.on('role', (data)=>{
      myRole = data?.role === 'impostor' ? 'impostor' : 'crew';
      $("playerRole").textContent = myRole === 'impostor' ? 'Impostor' : 'Crewmate';
      // show kill button only for impostor
      $("btnKill").style.display = (myRole==='impostor') ? 'inline-block' : 'none';
    });

    socket.on('phase', (data)=>{
      phase = data?.phase || 'round';
      $("roundStatus").textContent = `Phase: ${phase}`;
      if (phase === 'ended' && data?.winner) {
        showToast(`🏁 ${data.winner} win!`, 'success');
      }
    });

    socket.on('meeting:start', (data)=>{
      phase = 'meeting';
      $("roundStatus").textContent = `Phase: meeting`;
      const overlay = $("meetingOverlay");
      const list = $("candidates");
      const info = $("meetingInfo");
      overlay.style.display = 'flex';
      list.innerHTML = '';
      info.textContent = data?.reason || 'Discuss and vote';
      const candidates = data?.candidates || [];
      candidates.forEach(c => {
        const b = document.createElement('button');
        b.textContent = `${c.name}` + (c.uid===uid?' (You)':'');
        b.onclick = ()=>{
          socket.emit('game:event', { type: 'vote', target: c.uid });
          info.textContent = `You voted for ${c.name}`;
        };
        list.appendChild(b);
      });
    });

    socket.on('meeting:result', (data)=>{
      const overlay = $("meetingOverlay");
      const info = $("meetingInfo");
      if (data?.ejected) {
        info.textContent = `🗳️ Ejected: ${data.ejectedName || data.ejected}`;
      } else {
        info.textContent = `🗳️ No one was ejected`;
      }
      setTimeout(()=>{ overlay.style.display='none'; }, 2000);
    });

    socket.on('event:kill', (data)=>{
      showToast(`💥 ${data?.victimName || 'A player'} was eliminated`, 'warning');
    });

    socket.on('disconnect', () => {
      $("gameStatus").textContent = '⚠️ Disconnected (WS)';
    });
  } else {
    $("gameStatus").textContent = '✅ Connected (RTDB)';
  }
} catch (e) {
  console.warn('Socket.IO unavailable, fallback to RTDB', e);
  $("gameStatus").textContent = '✅ Connected (RTDB fallback)';
}

console.log('🎮 Game initialized');

// ---------- Gameplay buttons ----------
const btnStart = $("btnStartRound");
const btnReport = $("btnReport");
const btnMeeting = $("btnCallMeeting");
const btnKill = $("btnKill");
const btnVoteSkip = $("btnVoteSkip");
const btnCloseMeeting = $("btnCloseMeeting");
const btnAddBot = $("btnAddBot");
const btnForceImp = $("btnForceImp");
const btnForceCrew = $("btnForceCrew");
const btnSpawnBody = $("btnSpawnBody");

btnStart?.addEventListener('click', ()=> socket?.emit('game:start', { room: roomCode }));
btnReport?.addEventListener('click', ()=> socket?.emit('game:event', { type: 'report' }));
btnMeeting?.addEventListener('click', ()=> socket?.emit('game:event', { type: 'callMeeting' }));
btnKill?.addEventListener('click', ()=> socket?.emit('game:event', { type: 'kill' }));
btnVoteSkip?.addEventListener('click', ()=> socket?.emit('game:event', { type: 'vote', target: 'skip' }));
btnCloseMeeting?.addEventListener('click', ()=> { $("meetingOverlay").style.display='none'; });

btnAddBot?.addEventListener('click', ()=> socket?.emit('dev:addBot', { room: roomCode }));
btnForceImp?.addEventListener('click', ()=> socket?.emit('dev:forceRole', { role: 'impostor' }));
btnForceCrew?.addEventListener('click', ()=> socket?.emit('dev:forceRole', { role: 'crew' }));
btnSpawnBody?.addEventListener('click', ()=> socket?.emit('dev:spawnBody'));
