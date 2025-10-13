// core.js — loop, initGame, renderDisplay

import { loadCollisionData, checkCollision } from './collision.js';
import { toggleFullScreenMap, updateMiniMapDisplay } from './minimap.js';
import { checkInteractions, checkObjectInteractions, startMeeting, endMeeting } from './interactions.js';
import { initMultiplayer, sendPlayerPositionThrottled, startRemotePlayersRenderLoop } from './multiplayer.js';
import { initChat, isTyping } from './chat.js';
import { initRoles, isRoleRevealed } from './roles.js';
import { installDebugHotkeys, renderDebugOverlayIfNeeded } from './debug.js';

export const CONST = {
  PLAYER_SPEED: 20,                   // ตาม config เดิม
  VISION_RADIUS: 300,
  FOG_COLOR: 'rgba(0, 0, 0, 0.95)',
  ANIMATION_FRAME_MS: 80,
  INTERACTION_RADIUS: 200,
  INTERACTION_KEY: 'KeyE',
  CONTAINER_WIDTH: 8192,
  CONTAINER_HEIGHT: 8192,
  MINIMAP_SIZE_PIXELS: 150,
  FOCUSED_MAP_SCALE: 0.5,
  MEETING_POINT: { x: 3500, y: 3900 }, // กลับมาใช้กลางแมพตามโค้ดเดิม
  MAX_MISSION_PROGRESS: 10,
  MISSION_INCREASE_AMOUNT: 1,
  MAX_TELEPHONE_CALLS: 2,
  TELEPHONE_COOLDOWN_MS: 30000,
};

export const state = {
  playerX: 3500, playerY: 3500, playerW: 200, playerH: 220,
  containerX: 0, containerY: 0,
  viewportW: window.innerWidth, viewportH: window.innerHeight,
  isMoving: false,
  isMeetingActive: false,
  keysPressed: Object.create(null),
  collisionObjects: [],
  missionProgress: 0,
  uid: null,
  displayName: null,
  charFolder: 'mini_brown',
  playerColor: '#00ffcc',
};

export const refs = {
  get gameContainer(){ return document.getElementById('game-container'); },
  get playerWrap(){ return document.getElementById('player-wrap'); },
  get player(){ return document.getElementById('player'); },
  get nameplate(){ return document.getElementById('nameplate'); },
  get visionOverlay(){ return document.getElementById('vision-overlay'); },
  get interactionHint(){ return document.getElementById('interaction-hint'); },
  get logContainer(){ return document.getElementById('log-container'); },
  get missionBarFill(){ return document.getElementById('mission-bar-fill'); },
  get missionText(){ return document.getElementById('mission-progress-text'); },
  get meetingModal(){ return document.getElementById('meeting-modal'); },
  get endMeetingButton(){ return document.getElementById('end-meeting-button'); },
  get voteButtons(){ return document.querySelectorAll('.vote-option'); },
  get voteResultText(){ return document.getElementById('vote-result'); },
  get bgmMusic(){ return document.getElementById('bgm-music'); },
  get sfxInteract(){ return document.getElementById('sfx-interact'); },
  get sfxHeist(){ return document.getElementById('sfx-heist'); },
};

let idleFrames = ['assets/Characters/mini_brown/idle_1.png'];
let walkFrames = Array.from({length:8},(_,i)=>`assets/Characters/mini_brown/walk_${i+1}.png`);
function setCharacterFolder(folder){
  try {
    if (typeof folder !== 'string' || !folder) return;
    state.charFolder = folder;
    idleFrames = [`assets/Characters/${folder}/idle_1.png`];
    walkFrames = Array.from({length:8},(_,i)=>`assets/Characters/${folder}/walk_${i+1}.png`);
    if (refs.player) refs.player.src = idleFrames[0];
    // ปรับขนาดกล่อง player-wrap ให้ตรงกับรูป (เพื่อให้ nameplate อยู่กึ่งกลางจริง)
    try {
      if (refs.playerWrap) {
        refs.playerWrap.style.width = '200px';
        refs.playerWrap.style.height = '220px';
      }
    } catch {}
  } catch {}
}

function charToColor(ch){
  const map = {
    mini_brown:    '#8B4513',
    mini_coral:    '#FF7F50',
    mini_gray:     '#808080',
    mini_lavender: '#B57EDC',
    mini_mint:     '#3EB489',
    mini_pink:     '#FFC0CB',
    mini_sky_blue: '#87CEEB',
    mini_yellow:   '#FFD54F',
  };
  return map[ch] || '#FFFFFF';
}
let currentAnim = 'idle', frameIdx = 0, lastFrameAt = 0;
function tickAnimation(ts){
  if (!refs.player) return;
  if (ts - lastFrameAt < CONST.ANIMATION_FRAME_MS) return;
  lastFrameAt = ts;
  let frames;
  if (state.isMoving){
    frames = walkFrames; if (currentAnim!=='walking'){ currentAnim='walking'; frameIdx=0; }
  } else {
    frames = idleFrames; if (currentAnim!=='idle'){ currentAnim='idle'; frameIdx=0; }
  }
  frameIdx = (frameIdx+1) % frames.length;
  refs.player.src = frames[frameIdx];
}

let lastFogAt = 0; const FOG_MAX_FPS = 30;
export function renderDisplay(){
  const gc = refs.gameContainer, pl = refs.player, pw = refs.playerWrap, vo = refs.visionOverlay;
  if (!gc || !pl || !vo) return;

  if (pw){
    // ขยับทั้งกล่อง player-wrap เพื่อให้ nameplate ตามตัวละคร
    pw.style.transform = `translate(${state.playerX}px, ${state.playerY}px)`;
    // ล้าง transform เดิมบน <img id="player"> หากเคยตั้งไว้
    try { pl.style.transform = ''; } catch {}
  } else {
    // fallback: ขยับเฉพาะรูปผู้เล่น
    pl.style.transform = `translate(${state.playerX}px, ${state.playerY}px)`;
  }
  gc.style.transform = `translate(${state.containerX}px, ${state.containerY}px)`;

  const now = performance.now();
  if (state.isMoving || now - lastFogAt > 1000/FOG_MAX_FPS){
    lastFogAt = now;
    const px = Math.round(state.playerX + state.containerX + state.playerW/2);
    const py = Math.round(state.playerY + state.containerY + state.playerH/2);
    vo.style.background = `radial-gradient(
    circle at ${px}px ${py}px,
    rgba(255, 255, 255, 0.02) 0%,
    rgba(255, 255, 255, 0.03) ${CONST.VISION_RADIUS * 0.3}px,
    rgba(255, 255, 255, 0.02) ${CONST.VISION_RADIUS * 0.5}px,
    rgba(0, 0, 0, 0.15) ${CONST.VISION_RADIUS * 0.7}px,
    rgba(0, 0, 0, 0.45) ${CONST.VISION_RADIUS * 0.9}px,
    rgba(0, 0, 0, 0.75) ${CONST.VISION_RADIUS * 1.1}px,
    rgba(0, 0, 0, 0.9) ${CONST.VISION_RADIUS * 1.3}px,
    ${CONST.FOG_COLOR} ${CONST.VISION_RADIUS * 1.6}px
  ),
  radial-gradient(
    ellipse at 50% 50%,
    rgba(0, 0, 0, 0) 50%,
    rgba(0, 0, 0, 0.4) 80%,
    rgba(0, 0, 0, 0.85) 100%
  )
`;
  }
  updateMiniMapDisplay();
  renderDebugOverlayIfNeeded(); // DEBUG overlay
}

function updateCamera(){
  state.containerX = -(state.playerX - state.viewportW/2 + state.playerW/2);
  state.containerY = -(state.playerY - state.viewportH/2 + state.playerH/2);
  const maxX = state.viewportW - CONST.CONTAINER_WIDTH;
  const maxY = state.viewportH - CONST.CONTAINER_HEIGHT;
  state.containerX = Math.min(0, Math.max(maxX, state.containerX));
  state.containerY = Math.min(0, Math.max(maxY, state.containerY));
}

function stepMovement(){
  if (state.isMeetingActive || isRoleRevealed() || isTyping()) return;

  let dx=0, dy=0;
  if (state.keysPressed.ArrowUp || state.keysPressed.KeyW) dy -= CONST.PLAYER_SPEED;
  if (state.keysPressed.ArrowDown || state.keysPressed.KeyS) dy += CONST.PLAYER_SPEED;
  if (state.keysPressed.ArrowLeft || state.keysPressed.KeyA) dx -= CONST.PLAYER_SPEED;
  if (state.keysPressed.ArrowRight || state.keysPressed.KeyD) dx += CONST.PLAYER_SPEED;

  const wasMoving = state.isMoving;
  state.isMoving = !!(dx || dy);

  if (state.isMoving){
    const nx = state.playerX + dx, ny = state.playerY + dy;
    if (!checkCollision(nx, state.playerY, state.playerW, state.playerH)) state.playerX = nx;
    if (!checkCollision(state.playerX, ny, state.playerW, state.playerH)) state.playerY = ny;

    const maxX = CONST.CONTAINER_WIDTH - state.playerW;
    const maxY = CONST.CONTAINER_HEIGHT - state.playerH;
    state.playerX = Math.max(0, Math.min(maxX, state.playerX));
    state.playerY = Math.max(0, Math.min(maxY, state.playerY));

    if (state.uid) sendPlayerPositionThrottled(state.uid, state.playerX, state.playerY);
  }
  updateCamera();
}

function loop(ts){
  stepMovement();
  renderDisplay();
  checkInteractions();
  checkObjectInteractions();
  tickAnimation(ts);
  requestAnimationFrame(loop);
}

function installInput(){
  document.addEventListener('keydown', (e) => {
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD', CONST.INTERACTION_KEY, 'KeyM'].includes(e.code)){
      if (isTyping() && e.code !== 'KeyM') return;
      e.preventDefault();
    }
    state.keysPressed[e.code] = true;
    if (e.code === 'KeyM' && !state.isMeetingActive){ toggleFullScreenMap(); renderDisplay(); }
  });
  document.addEventListener('keyup', (e) => { state.keysPressed[e.code] = false; });

  window.addEventListener('resize', () => {
    state.viewportW = window.innerWidth; state.viewportH = window.innerHeight;
    updateCamera(); renderDisplay();
  });

  refs.endMeetingButton?.addEventListener('click', () => endMeeting());
  refs.voteButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      refs.voteResultText && (refs.voteResultText.textContent = `โหวต: ${btn.getAttribute('data-target')}`);
      setTimeout(() => endMeeting(), 3000);
    });
  });

  // DEBUG hotkeys (F3/F4/Backquote)
  installDebugHotkeys();
}

export async function initGame(){
  // ใช้ UID เดียวกับ Lobby: ggd.uid (fallback เป็น session uid หากไม่มี)
  try {
    let uid = localStorage.getItem('ggd.uid') || sessionStorage.getItem('ggd.uid') || sessionStorage.getItem('uid');
    if (!uid) { uid = (crypto?.randomUUID?.() || ('uid_' + Math.random().toString(36).slice(2,10))); }
    state.uid = uid;
    try { localStorage.setItem('ggd.uid', uid); } catch {}
    try { sessionStorage.setItem('ggd.uid', uid); } catch {}
  } catch {
    state.uid = sessionStorage.getItem('uid') || (sessionStorage.setItem('uid', crypto.randomUUID()), sessionStorage.getItem('uid'));
  }
  state.displayName = localStorage.getItem('ggd.name') || localStorage.getItem('playerName') || `Player_${state.uid.slice(0,4)}`;
  // ตั้งคาแร็กเตอร์เริ่มต้น (จะอัปเดตจาก Firebase ตามห้องอีกที)
  try {
    const localChar = localStorage.getItem('ggd.char') || 'mini_brown';
    setCharacterFolder(localChar);
    const localColor = charToColor(localChar);
    state.playerColor = localColor;
    if (refs.nameplate) refs.nameplate.style.color = localColor;
  } catch { setCharacterFolder('mini_brown'); }
  // ตั้งชื่อของเราเองบน nameplate (ถ้ามีใน DOM)
  try { if (refs.nameplate) refs.nameplate.textContent = state.displayName; } catch {}

  await loadCollisionData(); // -> state.collisionObjects

  installInput();
  // คำนวณรหัสห้องจาก URL หรือ localStorage ให้ socket และ firebase ใช้ห้องเดียวกัน
  try {
    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get('code');
    const codeFromStore = (JSON.parse(localStorage.getItem('currentRoom') || '{}') || {}).code;
    state.currentRoom = codeFromUrl || codeFromStore || 'lobby01';
  } catch { state.currentRoom = 'lobby01'; }

  // ฉีด state เข้า chat และเปิด socket เข้าห้องเดียวกัน
  initChat(state);
  // เลือก server socket อัตโนมัติ: ถ้าเปิดจาก localhost ให้เชื่อมไปที่ localhost:3000
  let serverUrl = 'https://webgame-25n5.onrender.com';
  try {
    const host = location.hostname;
    // Prefer local development server when running on localhost/127.0.0.1
    if (host === 'localhost' || host === '127.0.0.1') {
      serverUrl = `${location.protocol}//${host}:3000`;
    } else if (location.port) {
      // If the page is served from a specific port, prefer same origin
      serverUrl = `${location.protocol}//${location.hostname}:${location.port}`;
    }
  } catch (e) {
    // ignore and fall back to production server
  }
  initMultiplayer({ serverUrl, room: state.currentRoom });
  startRemotePlayersRenderLoop();

  // Presence แบบเบาๆ ใน Firebase ภายใต้ lobbies/<code>/players/<uid> (ให้ตรงกับ rules ปัจจุบัน)
  // ทำแบบไดนามิกและห่อ try/catch เผื่อโหลด firebase ไม่สำเร็จ
  try {
    const fb = await import('../firebase.js');
    const { rtdb, ref, update, onDisconnect, serverTimestamp, get, onValue } = fb;
    const playerRef = ref(rtdb, `lobbies/${state.currentRoom}/players/${state.uid}`);
    // update แทน set เพื่อไม่ลบ field char ที่ล็อบบี้ตั้งไว้
    await update(playerRef, {
      uid: state.uid,
      name: state.displayName,
      joinedAt: Date.now(),
      online: true,
      // ensure char/color from lobby/localStorage are preserved into presence for others
      char: state.charFolder || (localStorage.getItem('ggd.char') || 'mini_brown'),
      color: state.playerColor || (localStorage.getItem('ggd.color') || ''),
    });
    onDisconnect(playerRef).remove();
    const roomRef = ref(rtdb, `rooms/${state.currentRoom}`);
    await update(roomRef, { status: 'in_game', lastActivity: serverTimestamp() }).catch(()=>{});
    setInterval(() => {
      update(roomRef, { lastActivity: serverTimestamp() }).catch(()=>{});
    }, 15000);
    // ติดตาม char ของผู้เล่นจาก Firebase (สด) แล้วตั้งสไปรท์ให้ตรงกับล็อบบี้
    try {
      const myRef = ref(rtdb, `lobbies/${state.currentRoom}/players/${state.uid}`);
      onValue(myRef, (snap) => {
        const v = snap.exists() ? (snap.val() || {}) : {};
        const ch = (v.char || '').toString();
        const col = (v.color || '').toString();
        if (ch) setCharacterFolder(ch);
        const resolved = col || (ch ? charToColor(ch) : '');
        if (resolved) {
          state.playerColor = resolved;
          if (refs.nameplate) refs.nameplate.style.color = resolved;
        }
      });
    } catch {}
  } catch (e) {
    console.warn('Firebase presence skipped:', e?.message || e);
  }

  // Role reveal (ไม่บล็อก loop แต่กันเดินผ่าน isRoleRevealed())
  initRoles();

  if (refs.bgmMusic){ refs.bgmMusic.volume = 0.4; refs.bgmMusic.play().catch(()=>{}); }

  updateCamera(); renderDisplay();
  requestAnimationFrame(loop);
}

window.addEventListener('load', initGame);
export { startMeeting, endMeeting };
