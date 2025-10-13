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
  playerX: 3500, playerY: 3500, playerW: 200, playerH: 200,
  containerX: 0, containerY: 0,
  viewportW: window.innerWidth, viewportH: window.innerHeight,
  isMoving: false,
  isMeetingActive: false,
  keysPressed: Object.create(null),
  collisionObjects: [],
  missionProgress: 0,
  uid: null,
  displayName: null,
};

export const refs = {
  get gameContainer(){ return document.getElementById('game-container'); },
  get player(){ return document.getElementById('player'); },
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

const idleFrames = ['assets/images/idle_1.png'];
const walkFrames = [
  'assets/images/walk_1.png','assets/images/walk_2.png','assets/images/walk_3.png',
  'assets/images/walk_4.png','assets/images/walk_5.png','assets/images/walk_6.png',
  'assets/images/walk_7.png','assets/images/walk_8.png'
];
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
  const gc = refs.gameContainer, pl = refs.player, vo = refs.visionOverlay;
  if (!gc || !pl || !vo) return;

  pl.style.transform = `translate(${state.playerX}px, ${state.playerY}px)`;
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
  state.uid = sessionStorage.getItem('uid') || (sessionStorage.setItem('uid', crypto.randomUUID()), sessionStorage.getItem('uid'));
  state.displayName = localStorage.getItem('ggd.name') || localStorage.getItem('playerName') || `Player_${state.uid.slice(0,4)}`;
  if (refs.player) refs.player.src = 'assets/images/idle_1.png';

  await loadCollisionData(); // -> state.collisionObjects

  installInput();
  initChat();
  initMultiplayer({ serverUrl: 'https://webgame-25n5.onrender.com', room: 'lobby01' });
  startRemotePlayersRenderLoop();

  // Role reveal (ไม่บล็อก loop แต่กันเดินผ่าน isRoleRevealed())
  initRoles();

  if (refs.bgmMusic){ refs.bgmMusic.volume = 0.4; refs.bgmMusic.play().catch(()=>{}); }

  updateCamera(); renderDisplay();
  requestAnimationFrame(loop);
}

window.addEventListener('load', initGame);
export { startMeeting, endMeeting };
