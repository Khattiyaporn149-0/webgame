// multiplayer.js — socket, snapshot, renderRemotePlayers
import { io as ioCdn } from 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.esm.min.js';

import { state, refs } from './core.js';
import { startMeeting } from './interactions.js';

// ===== state =====
export let socket = null;

let lastPlayersSnapshot = [];
const remotePlayers = {}; // uid -> <img>
const playerChars = new Map(); // uid -> charFolder
const playerColors = new Map(); // uid -> color
const _placeholderCreated = new Set(); // avoid double-creating placeholders
let rafRemote = null;
let currentRoom = 'lobby01';

// ===== helpers =====
function safeIo() {
  return ioCdn ?? (typeof window !== 'undefined' ? window.io : null);
}

function createNametag(name, color){
  const tag = document.createElement('div');
  tag.className = 'nametag';
  Object.assign(tag.style, {
    position: 'fixed', left:'0px', top:'0px',
    color: color || '#fff', background:'rgba(0,0,0,.55)',
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

  if (socket?.connected) {
    try { socket.disconnect(); } catch {}
  }

  socket = IO(serverUrl, { transports: ['websocket', 'polling'] });
  window.socket = socket;
  currentRoom = room || currentRoom;

  // ติดตาม char ของผู้เล่นในห้องจาก Firebase เพื่อแสดงสไปรท์ให้ตรงกับล็อบบี้
  try {
    (async () => {
      const fb = await import('../firebase.js');
      const { rtdb, ref, onValue } = fb;
      onValue(ref(rtdb, `lobbies/${currentRoom}/players`), (snap) => {
        const data = snap.exists() ? snap.val() : {};
        for (const [uid, v] of Object.entries(data)){
          const ch = (v && v.char) ? String(v.char) : '';
          const col = (v && v.color) ? String(v.color) : '';
          if (ch) playerChars.set(uid, ch);
          if (col) playerColors.set(uid, col);
        }
      });
    })();
  } catch {}

  socket.on('connect', () => {
    const uid = state?.uid ?? (crypto?.randomUUID?.() || 'uid_' + Math.random().toString(36).slice(2,10));
    const name = state?.displayName ?? `Player_${uid.slice(0,4)}`;
    // สีจาก Firebase map ถ้ามี หรือ map จาก char หรือ fallback
    const myChar = playerChars.get(uid) || (typeof localStorage !== 'undefined' ? localStorage.getItem('ggd.char') : '') || 'mini_brown';
    // Prefer explicit color saved to localStorage (set by lobby) or Firebase map, then fallback to map-from-char
    const storedColor = (typeof localStorage !== 'undefined') ? localStorage.getItem('ggd.color') : null;
    const myColor = playerColors.get(uid) || storedColor || (function(ch){
      const map = { mini_brown:'#8B4513', mini_coral:'#FF7F50', mini_gray:'#808080', mini_lavender:'#B57EDC', mini_mint:'#3EB489', mini_pink:'#FFC0CB', mini_sky_blue:'#87CEEB', mini_yellow:'#FFD54F' };
      return map[ch] || '#00ffcc';
    })(myChar);
    const x = Number.isFinite(state?.playerX) ? state.playerX : 0;
    const y = Number.isFinite(state?.playerY) ? state.playerY : 0;

    // Small delay gives the Firebase onValue listener a tick to populate playerChars/playerColors
    // and ensures lobby's localStorage values are available when navigating from the lobby.
    setTimeout(() => {
      try {
        console.debug('[multiplayer] connect -> emit game:join', { uid, room: currentRoom, char: myChar, color: myColor, name });
        socket.emit('game:join', { room: currentRoom, uid, name, color: myColor, char: myChar, x, y });
      } catch (e) { console.warn('emit join failed', e); }
    }, 40);
  });

  socket.on('snapshot', (payload = {}) => {
    try { console.debug('[multiplayer] snapshot received', { room: payload.room, playersCount: Array.isArray(payload.players) ? payload.players.length : 0 }); } catch {}
    if (payload.room && payload.room !== currentRoom) return;
    const raw = Array.isArray(payload.players) ? payload.players : [];
    const list = raw.filter(p => (p?.room ?? payload.room ?? currentRoom) === currentRoom);
    try { console.debug('[multiplayer] snapshot list uids ->', list.map(p => p && p.uid)); } catch {}
    try {
      for (const p of list) {
        if (p && p.uid) {
          if (p.color) playerColors.set(p.uid, String(p.color));
          if (p.char)  playerChars.set(p.uid, String(p.char));
        }
      }
    } catch {}
    // If the RTDB/socket snapshot contains a color for ourselves, apply it to local state/nameplate
    try {
      const me = list.find(i => i && i.uid === state?.uid);
      if (me && me.color) {
        // apply to core state and nameplate if present
        try { state.playerColor = String(me.color); if (refs?.nameplate) refs.nameplate.style.color = String(me.color); } catch {}
      }
    } catch {}
    lastPlayersSnapshot = list;

  // ---- Fallback: if snapshot contains uid but render loop hasn't created element, create a lightweight placeholder
  try {
    for (const p of list) {
      if (!p || !p.uid) continue;
      if (p.uid === state?.uid) continue;
      if (!remotePlayers[p.uid] && !_placeholderCreated.has(p.uid)) {
        try {
          console.debug('[multiplayer] fallback create placeholder for uid', p.uid);
          const ph = document.createElement('img');
          ph.className = 'remote-player placeholder';
          ph.alt = p.name || `player_${String(p.uid).slice(0,4)}`;
          ph.src = `assets/Characters/${(p.char||'mini_brown')}/idle_1.png`;
          Object.assign(ph.style, { position:'absolute', width:'200px', height:'220px', opacity: '0.9', imageRendering:'pixelated' });
          // place near center until real coords arrive
          const gc = refs?.gameContainer || document.getElementById('gameContainer');
          (gc || document.body).appendChild(ph);
          ph.dataset.x = (p.x || 0); ph.dataset.y = (p.y || 0);
          remotePlayers[p.uid] = ph;
          ph._nametag = createNametag(p.name || `Player_${String(p.uid).slice(0,4)}`, playerColors.get(p.uid) || p.color);
          _placeholderCreated.add(p.uid);
        } catch (e) { console.warn('placeholder create failed', e); }
      }
    }
  } catch (e) {}

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
    if (data?.room && data.room !== currentRoom) return;
    try {
      startMeeting({ x: data?.x ?? 4000, y: data?.y ?? 4000 });
    } catch (e) {
      console.error('meeting:start handler failed', e);
    }
  });

  socket.on('disconnect', (r) => console.log('Socket disconnected:', r));
  socket.on('error', (e) => console.error('Socket error:', e));
}

export function cleanupMultiplayer(){
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
    socket.emit('player:move', { room: currentRoom, uid, x, y });
  };
})();

// ===== render loop =====
export function startRemotePlayersRenderLoop(){
  function tick(){
    const gc = refs?.gameContainer || document.getElementById('gameContainer');
    if (!gc){ rafRemote = requestAnimationFrame(tick); return; }

    for (const p of lastPlayersSnapshot){
      if (!p || p.uid === state?.uid) continue;

      let el = remotePlayers[p.uid];
      if (!el){
        try { console.debug('[multiplayer] creating remote player for uid', p.uid); } catch {}
        el = document.createElement('img');
        // ใช้ idle ของคาแร็กเตอร์ถ้ามีใน map
        const ch = playerChars.get(p.uid) || p.char || 'mini_brown';
        el.src = `assets/Characters/${ch}/idle_1.png`;
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
        el._lastUpdate = performance.now();
        el._nametag = createNametag(p.name || `Player_${String(p.uid).slice(0,4)}`, playerColors.get(p.uid) || p.color);
        el._char = ch;
        // ตัวแปรแอนิเมชันสำหรับผู้เล่นคนนี้
        el._animState = 'idle';
        el._animFrame = 0;
        el._lastFrameAt = performance.now();
        el._frameInterval = 80; // ms ต่อเฟรม ให้พอๆ กับ local
        gc.appendChild(el);
        remotePlayers[p.uid] = el;
      }

      // อัปเดตรูปของผู้เล่นให้ตรงกับ char ปัจจุบัน
      const desiredChar = playerChars.get(p.uid) || p.char;
      if (desiredChar && el._char !== desiredChar){
        el.src = `assets/Characters/${desiredChar}/idle_1.png`;
        el._char = desiredChar;
        el._animState = 'idle';
        el._animFrame = 0;
        el._lastFrameAt = performance.now();
      }
      // อัปเดตสีป้ายชื่อให้ตรงกับ map ปัจจุบัน
      const desiredColor = playerColors.get(p.uid) || p.color;
      if (desiredColor && el._nametag && el._nametag.style.color !== desiredColor){
        el._nametag.style.color = desiredColor;
        el._color = desiredColor;
      }
      // อัปเดตตำแหน่ง (world -> screen) โดยประมาณ
      const pX = Number.isFinite(p.x) ? p.x : 0;
      const pY = Number.isFinite(p.y) ? p.y : 0;
      const camX = Number.isFinite(state?.containerX) ? state.containerX : 0;
      const camY = Number.isFinite(state?.containerY) ? state.containerY : 0;

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

      // === nametag world->screen (จัดกึ่งกลางตามความกว้างของสไปรท์)
      const containerX = Number(state?.containerX) || 0;
      const containerY = Number(state?.containerY) || 0;
      const spriteW = (parseFloat(el.style.width) || el.clientWidth || 200);
      const tagX = tx + containerX + (spriteW / 2);
      const tagY = ty + containerY - 14;
      if (el._nametag){
        el._nametag.style.left = `${tagX}px`;
        el._nametag.style.top  = `${tagY}px`;
      }

      // === อัปเดตแอนิเมชันเดิน/ยืน จากข้อมูล socket (ตำแหน่ง)
      try {
        const moving = Math.abs(p.x - cx) + Math.abs(p.y - cy) > 0.5;
        const nowT = performance.now();
        const ch = el._char || 'mini_brown';
        if (moving) {
          if (el._animState !== 'walking') {
            el._animState = 'walking';
            el._animFrame = 0;
            el._lastFrameAt = nowT;
          }
          if (nowT - el._lastFrameAt >= el._frameInterval) {
            el._lastFrameAt = nowT;
            el._animFrame = (el._animFrame + 1) % 8;
            el.src = `assets/Characters/${ch}/walk_${el._animFrame + 1}.png`;
          }
        } else {
          if (el._animState !== 'idle') {
            el._animState = 'idle';
            el._animFrame = 0;
            el._lastFrameAt = nowT;
            el.src = `assets/Characters/${ch}/idle_1.png`;
          }
        }
      } catch {}
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

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupMultiplayer, { once: true });
}

