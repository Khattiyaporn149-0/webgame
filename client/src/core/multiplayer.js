/**
 * multiplayer.js — socket, snapshot, renderRemotePlayers
 * - ใช้ socket.io client จาก CDN
 * - อ่าน char/color จาก Firebase (read-only) ให้ซิงก์กับ Lobby
 * - ส่งตำแหน่งด้วย uid ที่ core ส่งมา (sendPlayerPositionThrottled(uid,x,y))
 * - ไม่ใช้ movedelta, ใช้ snapshot อย่างเดียว
 */

import { io as ioCdn } from 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.esm.min.js';

import { state, refs } from './core.js';
import { startMeeting } from './interactions.js';

// ===== socket handle =====
export let socket = null;

// ===== client-side memory =====
let lastPlayersSnapshot = [];          // snapshot ล่าสุดจาก server
const remotePlayers = {};              // uid -> <img> element
const playerChars = new Map();         // uid -> charFolder (จาก Firebase)
const playerColors = new Map();        // uid -> color (จาก Firebase)
const _placeholderCreated = new Set(); // ป้องกันสร้าง placeholder ซ้ำ
let rafRemote = null;                  // render loop handle
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
export function initMultiplayer({ serverUrl, room, uid, name, char, color, x, y }){
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

  const selfInfo = {
    uid,
    name,
    char,
    color,
    x,
    y,
  };

  // อ่าน char/color ของผู้เล่นในห้องจาก Firebase เพื่อให้ตรงกับ Lobby (READ-ONLY)
  try {
    (async () => {
      const fb = await import('../services/firebase.js');
      const { rtdb, ref, onValue } = fb;
      onValue(ref(rtdb, `lobbies/${currentRoom}/players`), (snap) => {
        const data = snap.exists() ? snap.val() : {};
        for (const [uid, v] of Object.entries(data)){
          const ch  = (v && v.char)  ? String(v.char)  : '';
          const col = (v && v.color) ? String(v.color) : '';
          if (ch)  playerChars.set(uid, ch);
          if (col) playerColors.set(uid, col);
        }
      });
    })();
  } catch {}

  // ===== ตอน connect จริง ค่อยประกาศตัวเองไป server =====
  socket.on('connect', () => {
    // 1. ใช้ค่าที่ core ส่งมาเป็นหลัก
    const finalUid   = selfInfo.uid   || state?.uid   || (crypto?.randomUUID?.() || 'uid_' + Math.random().toString(36).slice(2,10));
    const finalName  = selfInfo.name  || state?.displayName || `Player_${String(finalUid).slice(0,4)}`;
    const finalChar  = selfInfo.char  ||
                       playerChars.get(finalUid) ||
                       (typeof localStorage !== 'undefined' ? localStorage.getItem('ggd.char') : '') ||
                       'mini_brown';
    const finalColor = selfInfo.color ||
                       playerColors.get(finalUid) ||
                       (typeof localStorage !== 'undefined' ? localStorage.getItem('ggd.color') : '') ||
                       '#00ffcc';
    const finalX     = Number.isFinite(selfInfo.x) ? selfInfo.x :
                       (Number.isFinite(state?.playerX) ? state.playerX : 0);
    const finalY     = Number.isFinite(selfInfo.y) ? selfInfo.y :
                       (Number.isFinite(state?.playerY) ? state.playerY : 0);

    // 2. แจ้ง server ว่าเราเข้าห้อง พร้อมข้อมูล skin/color ที่ถูกต้อง
    //    ไม่ต้องเดาอีก ไม่ต้องหน่วง setTimeout 40ms แล้วก็ได้
    try {
      console.debug('[multiplayer] connect -> emit game:join', {
        room: currentRoom,
        uid: finalUid,
        name: finalName,
        char: finalChar,
        color: finalColor,
        x: finalX,
        y: finalY,
      });

      socket.emit('game:join', {
        room: currentRoom,
        uid: finalUid,
        name: finalName,
        color: finalColor,
        char: finalChar,
        x: finalX,
        y: finalY,
      });
    } catch (e) {
      console.warn('emit join failed', e);
    }
  });

  // รับ snapshot และอัปเดต
  socket.on('snapshot', (payload = {}) => {
    try { console.debug('[multiplayer] snapshot received', { room: payload.room, playersCount: Array.isArray(payload.players) ? payload.players.length : 0 }); } catch {}
    if (payload.room && payload.room !== currentRoom) return;
    const raw = Array.isArray(payload.players) ? payload.players : [];
    const list = raw.filter(p => (p?.room ?? payload.room ?? currentRoom) === currentRoom);

    // เก็บสี/ตัวละครจาก snapshot ด้วย (เสริมจาก Firebase)
    try {
      for (const p of list) {
        if (p && p.uid) {
          if (p.color) playerColors.set(p.uid, String(p.color));
          if (p.char)  playerChars.set(p.uid, String(p.char));
        }
      }
    } catch {}

    // อัปเดตสี nameplate ของเราเอง (ถ้ามี)
    try {
      const me = list.find(i => i && i.uid === state?.uid);
      if (me && me.color) {
        try { state.playerColor = String(me.color); if (refs?.nameplate) refs.nameplate.style.color = String(me.color); } catch {}
      }
    } catch {}

    lastPlayersSnapshot = list;

    // ---- สร้าง placeholder ถ้ายังไม่มี element แต่มีใน snapshot
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
            ph.src = `../assets/Characters/${(p.char||'mini_brown')}/idle_1.png`;
            Object.assign(ph.style, { position:'absolute', width:'200px', height:'220px', opacity: '0.9', imageRendering:'pixelated' });
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

    // ลบผู้เล่นที่หายไปจาก snapshot
    const live = new Set(list.map(p => p.uid));
    for (const id of Object.keys(remotePlayers)){
      if (!live.has(id)){
        remotePlayers[id]._nametag?.remove();
        remotePlayers[id].remove();
        delete remotePlayers[id];
      }
    }
  });

  // สัญญาณเริ่มประชุม (ถ้าใช้)
  socket.on('meeting:start', (data) => {
    if (data?.room && data.room !== currentRoom) return;
    try {
      startMeeting(data?.at || { x: data?.x ?? 4000, y: data?.y ?? 4000 });
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

// ===== ส่งตำแหน่ง (ใช้ uid ที่ core ส่งมา) =====
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

// ===== render loop ของผู้เล่นอื่น =====
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
        const ch = playerChars.get(p.uid) || p.char || 'mini_brown';
        el.src = `../assets/Characters/${ch}/idle_1.png`;
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
        el._animState = 'idle';
        el._animFrame = 0;
        el._lastFrameAt = performance.now();
        el._frameInterval = 80;
        gc.appendChild(el);
        remotePlayers[p.uid] = el;
      }

      // อัปเดตรูปตาม char ปัจจุบัน
      const desiredChar = playerChars.get(p.uid) || p.char;
      if (desiredChar && el._char !== desiredChar){
        el.src = `../assets/Characters/${desiredChar}/idle_1.png`;
        el._char = desiredChar;
        el._animState = 'idle';
        el._animFrame = 0;
        el._lastFrameAt = performance.now();
      }

      // อัปเดตสีป้ายชื่อให้ตรงกับ map/snapshot ปัจจุบัน (เฉพาะสี)
      const desiredColor = playerColors.get(p.uid) || p.color;
      if (desiredColor && el._nametag && el._nametag.style.color !== desiredColor){
        el._nametag.style.color = desiredColor;
        el._color = desiredColor;
      }

      // smoothing world -> screen
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

      // ตำแหน่งป้ายชื่อ
      const containerX = Number(state?.containerX) || 0;
      const containerY = Number(state?.containerY) || 0;
      const spriteW = (parseFloat(el.style.width) || el.clientWidth || 200);
      const tagX = tx + containerX + (spriteW / 2);
      const tagY = ty + containerY - 14;
      if (el._nametag){
        el._nametag.style.left = `${tagX}px`;
        el._nametag.style.top  = `${tagY}px`;
      }

      // แอนิเมชันเดิน/ยืน
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
            el.src = `../assets/Characters/${ch}/walk_${el._animFrame + 1}.png`;
          }
        } else {
          if (el._animState !== 'idle') {
            el._animState = 'idle';
            el._animFrame = 0;
            el._lastFrameAt = nowT;
            el.src = `../assets/Characters/${ch}/idle_1.png`;
          }
        }
      } catch {}
    }

    rafRemote = requestAnimationFrame(tick);
  }

  if (rafRemote) cancelAnimationFrame(rafRemote);
  rafRemote = requestAnimationFrame(tick);
}

// ให้ chat.js ใช้พิกัดผู้เล่น remote ได้
export function getRemotePlayerWorldXY(uid){
  const p = lastPlayersSnapshot.find(p => p?.uid === uid);
  return p ? { x: p.x, y: p.y } : null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupMultiplayer, { once: true });
}

// ให้ interactions.js ใช้รายชื่อผู้เล่นปัจจุบันได้
export function getCurrentPlayers(){
  try {
    return Array.isArray(lastPlayersSnapshot)
      ? lastPlayersSnapshot.map(p => ({
          uid: p.uid,
          name: p.name || `Player_${String(p.uid).slice(0,4)}`,
          char: p.char || playerChars.get(p.uid) || 'mini_brown',
          color: p.color || playerColors.get(p.uid) || '#ffffff'
        }))
      : [];
  } catch {
    return [];
  }
}
