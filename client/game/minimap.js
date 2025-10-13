// minimap.js — toggleFullScreenMap, updateMiniMapDisplay
import { CONST, state } from './core.js';
import { MISSION_SPOTS_DATA } from './interactions.js';

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
}
