// multiplayer.js — socket, snapshot, renderRemotePlayers
// ⬅️ ต้องรันแบบ ES Module เท่านั้น (ดู note ด้านบน)
import { io as ioCdn } from 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.esm.min.js';

import { state, refs } from './core.js';
import { startMeeting } from './interactions.js';

// ===== state =====
export let socket = null;

let lastPlayersSnapshot = [];
const remotePlayers = {}; // uid -> <img>
let rafRemote = null;

// ===== helpers =====
function safeIo() {
  // เผื่อบางหน้าโหลด UMD มาก่อนแล้วมี window.io ให้ fallback
  return ioCdn ?? (typeof window !== 'undefined' ? window.io : null);
}

function createNametag(name){
  const tag = document.createElement('div');
  tag.className = 'nametag';
  Object.assign(tag.style, {
    position: 'fixed', left:'0px', top:'0px',
    color:'#fff', background:'rgba(0,0,0,.55)',
    padding:'3px 8px', borderRadius:'8px',
    fontSize:'14px', fontWeight:'700',
    pointerEvents:'none', textShadow:'0 0 4px #000',
    transform:'translate(-50%, -100%)', zIndex: 100000,
  });
  tag.textContent = name;
  document.body.appendChild(tag);
  return tag;
}

// ===== init / teardown =====
export function initMultiplayer({ serverUrl, room }){
  const IO = safeIo();
  if (!IO) {
    console.error('socket.io-client not available. Make sure this file is loaded as a module.');
    return;
  }

  // กันเปิดซ้ำ
  if (socket?.connected) {
    try { socket.disconnect(); } catch {}
  }

  socket = IO(serverUrl, { transports: ['websocket', 'polling'] });
  window.socket = socket;

  socket.on('connect', () => {
    // กันค่า undefined จาก core
    const uid = state?.uid ?? (crypto?.randomUUID?.() || 'uid_' + Math.random().toString(36).slice(2,10));
    const name = state?.displayName ?? `Player_${uid.slice(0,4)}`;
    const x = Number.isFinite(state?.playerX) ? state.playerX : 0;
    const y = Number.isFinite(state?.playerY) ? state.playerY : 0;

    socket.emit('game:join', {
      room, uid, name, color: '#00ffcc', x, y,
    });
  });

  socket.on('snapshot', (payload = {}) => {
    const list = Array.isArray(payload.players) ? payload.players : [];
    lastPlayersSnapshot = list;

    // remove vanished players
    const live = new Set(list.map(p => p.uid));
    for (const id of Object.keys(remotePlayers)){
      if (!live.has(id)){
        remotePlayers[id]._nametag?.remove();
        remotePlayers[id].remove();
        delete remotePlayers[id];
      }
    }
  });

  socket.on('meeting:start', (data) => {
    try {
      startMeeting({ x: data?.x ?? 4000, y: data?.y ?? 4000 });
    } catch (e) {
      console.error('meeting:start handler failed', e);
    }
  });

  socket.on('disconnect', (r) => console.log('❌ Socket disconnected:', r));
  socket.on('error', (e) => console.error('⚠️ Socket error:', e));
}

export function cleanupMultiplayer(){
  // ยกเลิก loop และล้าง DOM remote ทั้งหมด
  if (rafRemote) { cancelAnimationFrame(rafRemote); rafRemote = null; }
  for (const id of Object.keys(remotePlayers)){
    remotePlayers[id]._nametag?.remove();
    remotePlayers[id].remove();
    delete remotePlayers[id];
  }
  lastPlayersSnapshot = [];
  if (socket) {
    try {
      socket.removeAllListeners?.();
      socket.disconnect();
    } catch {}
    socket = null;
  }
}

// ===== emitters =====
export const sendPlayerPositionThrottled = (() => {
  let last = 0; const INTERVAL = 80; // ~12.5 Hz
  return (uid, x, y) => {
    if (!socket || !socket.connected) return;
    const now = performance.now();
    if (now - last < INTERVAL) return;
    last = now;
    socket.emit('player:move', { uid, x, y });
  };
})();

// ===== render loop =====
export function startRemotePlayersRenderLoop(){
  function tick(){
    const gc = refs?.gameContainer || document.getElementById('game-container');
    if (!gc){ rafRemote = requestAnimationFrame(tick); return; }

    for (const p of lastPlayersSnapshot){
      if (!p || p.uid === state?.uid) continue;

      let el = remotePlayers[p.uid];
      if (!el){
        el = document.createElement('img');
        el.src = 'assets/images/idle_1.png';
        el.alt = p.name || 'player';
        el.className = 'remote-player';
        Object.assign(el.style, {
          position:'absolute',
          width:'200px', height:'220px',
          imageRendering:'pixelated',
          willChange:'transform'
        });
        el.dataset.x = p.x; el.dataset.y = p.y;
        el.dataset.tx = p.x; el.dataset.ty = p.y;
        el.dataset.uid = p.uid;
        el._lastUpdate = performance.now();
        el._nametag = createNametag(p.name || `Player_${String(p.uid).slice(0,4)}`);
        gc.appendChild(el);
        remotePlayers[p.uid] = el;
      }

      // === smoothing ===
      const cx = parseFloat(el.dataset.x), cy = parseFloat(el.dataset.y);
      const now = performance.now(), dt = (now - (el._lastUpdate || now)) / 1000;
      el._lastUpdate = now;

      const smoothing = Math.min(1, dt * 8);
      const nx = cx + (p.x - cx) * smoothing;
      const ny = cy + (p.y - cy) * smoothing;

      const tx = Math.round(nx), ty = Math.round(ny);
      if (tx !== +el.dataset.tx || ty !== +el.dataset.ty){
        el.style.transform = `translate(${tx}px, ${ty}px)`;
        el.dataset.tx = tx; el.dataset.ty = ty;
      }
      el.dataset.x = nx; el.dataset.y = ny;

      // === nametag world->screen ===
      const containerX = Number(state?.containerX) || 0;
      const containerY = Number(state?.containerY) || 0;
      const tagX = tx + containerX + 64;
      const tagY = ty + containerY - 12;
      if (el._nametag){
        el._nametag.style.left = `${tagX}px`;
        el._nametag.style.top  = `${tagY}px`;
      }
    }

    rafRemote = requestAnimationFrame(tick);
  }

  if (rafRemote) cancelAnimationFrame(rafRemote);
  rafRemote = requestAnimationFrame(tick);
}

/* === For chat.js to anchor remote bubbles === */
export function getRemotePlayerWorldXY(uid){
  const p = lastPlayersSnapshot.find(p => p?.uid === uid);
  return p ? { x: p.x, y: p.y } : null;
}

// กัน memory leak ตอนเปลี่ยนหน้า
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupMultiplayer, { once: true });
}
