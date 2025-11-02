/**
 * multiplayer.js — socket, snapshot, renderRemotePlayers
 * - ใช้ socket.io client จาก CDN
 * - อ่าน char/color จาก Firebase (read-only) ให้ซิงก์กับ Lobby
 * - ส่งตำแหน่งด้วย uid ที่ core ส่งมา (sendPlayerPositionThrottled(uid,x,y))
 * - ไม่ใช้ movedelta, ใช้ snapshot อย่างเดียว
 */

import { io as ioCdn } from 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.esm.min.js';
import { startMeeting } from './interactions.js';

import { state, refs } from './core.js';

// ===== socket handle =====
export let socket = null;

// ===== client-side memory =====
let lastPlayersSnapshot = [];          // snapshot ล่าสุดจาก server
const remotePlayers = {};              // uid -> <img> element
const playerChars = new Map();         // uid -> charFolder (จาก Firebase)
const playerColors = new Map();        // uid -> color (จาก Firebase)
const playerEquips = new Map();        // uid -> equip object (จาก Firebase/snapshot)
const remoteEquipLayers = new Map();   // uid -> { slot: HTMLImageElement }
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

// ---- Equipment helpers (remote) ----
let equipManifest = null;
async function loadEquipManifest(){
  if (equipManifest) return equipManifest;
  try {
    const res = await fetch('../assets/equipment/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest fetch failed');
    equipManifest = await res.json();
  } catch {
    equipManifest = { hat: [], mask: [], suit: [], back: [], acc: [] };
  }
  return equipManifest;
}

function findEntry(slot, id){
  try {
    const list = Array.isArray(equipManifest?.[slot]) ? equipManifest[slot] : [];
    return list.find(x => String(x.id) === String(id)) || null;
  } catch { return null; }
}

function ensureRemotePlayerEquipWrapper(uid){
  const gc = refs?.gameContainer || document.getElementById('gameContainer');
  if (!gc) return null;
  const playerEl = remotePlayers[uid];
  if (!playerEl) return null;
  
  // Create wrapper if not exists (similar to player-wrap for local player)
  if (!playerEl._equipWrapper){
    const wrapper = document.createElement('div');
    wrapper.className = 'remote-player-equip-wrapper';
    Object.assign(wrapper.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '200px',
      height: '220px',
      pointerEvents: 'none',
      willChange: 'transform',
    });
    // Position wrapper at player location
    const playerTransform = playerEl.style.transform || '';
    const match = playerTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (match){
      const px = parseFloat(match[1]) || 0;
      const py = parseFloat(match[2]) || 0;
      wrapper.style.transform = `translate(${px}px, ${py}px)`;
    }
    gc.appendChild(wrapper);
    playerEl._equipWrapper = wrapper;
  }
  return playerEl._equipWrapper;
}

function ensureRemoteEquipLayer(uid, slot){
  const wrapper = ensureRemotePlayerEquipWrapper(uid);
  if (!wrapper) return null;
  if (!remoteEquipLayers.has(uid)) remoteEquipLayers.set(uid, {});
  const store = remoteEquipLayers.get(uid);
  if (store[slot]) return store[slot];
  const el = document.createElement('img');
  el.className = 'remote-equip';
  el.alt = slot;
  Object.assign(el.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    willChange: 'transform',
  });
  // z-index will be updated based on manifest layer in updateRemoteEquipTransform
  // Default z-index (will be overridden when equipment loads)
  el.style.zIndex = '310';
  wrapper.appendChild(el);
  store[slot] = el;
  return el;
}

// Helper to calculate and apply equipment transform (called every render frame)
function updateRemoteEquipTransform(el, slot, name, tx, ty){
  try {
    const BASE_BOX = { w: 200, h: 220 };
    const SLOT_BASE_SCALE = { hat: 0.85, mask: 0.9, suit: 0.65, back: 0.8, acc: 0.9 };
    
    function cssVar(name, fallback = '0px'){
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
      } catch {
        return fallback;
      }
    }
    
    const meta = findEntry(slot, name) || {};
    
    // Wait for image to load before calculating size (use natural dimensions only when loaded)
    if (!el.complete || el.naturalWidth === 0 || el.naturalHeight === 0){
      // Image not loaded yet, just set position without scale
      const mx = meta.x != null ? (meta.x + 'px') : cssVar(`--equip-${slot}-x`, '0px');
      const my = meta.y != null ? (meta.y + 'px') : cssVar(`--equip-${slot}-y`, '0px');
      const defaultOrigins = { hat: 'center bottom', mask: 'center center', suit: 'center bottom', back: 'center bottom', acc: 'center center' };
      const origin = meta.origin || defaultOrigins[slot] || 'center';
      el.style.transformOrigin = origin;
      el.style.transform = `translate(-50%, -50%) translate(${mx}, ${my}) scale(1)`;
      return; // Wait for image to load
    }
    
    // Image is loaded, calculate actual size (same as lobby.html)
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    // Calculate auto scale to fit base box (same as lobby.html - uses BASE_BOX directly)
    const sAuto = Math.min(BASE_BOX.w / nw, BASE_BOX.h / nh);
    // Apply base scale for slot (same as lobby.html fitLayer function)
    const baseScale = SLOT_BASE_SCALE[slot] || 1;
    const manifestScale = meta.scale || 1;  // Use same as lobby: ov.scale || 1
    // Use same calculation as lobby: sAuto * SLOT_BASE_SCALE * manifestScale
    const finalScale = sAuto * baseScale * manifestScale;
    
    // Update z-index based on layer from manifest (back should be behind player)
    const layer = meta.layer || slot;
    const zIndexMap = { back: 290, suit: 310, hat: 320, mask: 330, acc: 340 };
    const z = zIndexMap[layer] || zIndexMap[slot] || 310;
    el.style.zIndex = String(z);
    
    // Get x, y from manifest or use CSS variable fallback (same as lobby.html)
    const mx = meta.x != null ? (meta.x + 'px') : cssVar(`--equip-${slot}-x`, '0px');
    const my = meta.y != null ? (meta.y + 'px') : cssVar(`--equip-${slot}-y`, '0px');
    // Transform origin (same as lobby: ov.origin || null, only set if origin exists)
    const origin = meta.origin || null;
    
    if (origin) el.style.transformOrigin = origin;
    // Use same transform pattern as lobby.html: translate(-50%, -50%) translate(offset) scale
    // Wrapper handles player position, so equipment only needs relative transform
    el.style.transform = `translate(-50%, -50%) translate(${mx}, ${my}) scale(${finalScale})`;
  } catch (e) {
    // Fallback: just position it at player location
    el.style.transformOrigin = 'center';
    el.style.transform = `translate(-50%, -50%) scale(1)`;
  }
}

async function renderRemoteEquipFor(p, tx, ty){
  try { await loadEquipManifest(); } catch {}
  const uid = p.uid;
  const equip = (playerEquips.get(uid) || p.equip || {});
  const slots = ['back','suit','mask','hat','acc'];
  
  // Debug: log equipment data (only first time per uid)
  if (equip && Object.keys(equip).length > 0 && !remoteEquipLayers.has(uid + '_logged')){
    try { console.debug('[equip] Remote player', uid, 'has equipment:', equip); } catch {}
    remoteEquipLayers.set(uid + '_logged', true);
  }
  
  for (const slot of slots){
    const name = equip?.[slot];
    const el = ensureRemoteEquipLayer(uid, slot);
    if (!el) continue;
    if (!name){ 
      el.style.display = 'none'; 
      el.src = ''; 
      continue; 
    }
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    
    // Setup onload handler to calculate size when image first loads
    if (!el.dataset.equipLoaded || el.dataset.equipLoaded !== name){
      el.onload = () => {
        el.dataset.equipLoaded = name;
        // Force update transform when image loads
        updateRemoteEquipTransform(el, slot, name, tx, ty);
      };
      
      el.onerror = () => {
        el.style.display = 'none';
      };
      
      // Only set src if it's different to avoid reloading
      if (el.src !== `../assets/equipment/${slot}/${name}.png`){
        el.src = `../assets/equipment/${slot}/${name}.png`;
        el.dataset.equipLoaded = ''; // Reset to trigger onload
      }
    }
    
    // Update transform every frame - this ensures equipment follows player and uses correct size
    updateRemoteEquipTransform(el, slot, name, tx, ty);
  }
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
          const eq  = (v && v.equip && typeof v.equip === 'object') ? v.equip : null;
          if (ch)  playerChars.set(uid, ch);
          if (col) playerColors.set(uid, col);
          if (eq)  playerEquips.set(uid, eq);
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
        equip: (()=>{ try { return JSON.parse(localStorage.getItem('ggd.equip')||'{}'); } catch { return playerEquips.get(finalUid) || {}; } })(),
      });

      socket.emit('game:join', {
        room: currentRoom,
        uid: finalUid,
        name: finalName,
        color: finalColor,
        char: finalChar,
        x: finalX,
        y: finalY,
        equip: (()=>{ try { return JSON.parse(localStorage.getItem('ggd.equip')||'{}'); } catch { return playerEquips.get(finalUid) || {}; } })(),
      });
      // ขอ tasks และ state (resume) อีกครั้งในหน้าเกม เผื่อหลุดจาก lobby redirect
      try {
        socket.emit('tasks:request', { room: currentRoom, uid: finalUid });
        socket.emit('state:request', { room: currentRoom, uid: finalUid });
      } catch {}
      // เพิ่ม retry เบาๆ กันกรณี latency/ลำดับ event
      try {
        let tries = 0;
        const tick = setInterval(() => {
          const role = sessionStorage.getItem('myRole');
          if (role) { clearInterval(tick); return; }
          tries++;
          if (tries > 5) { clearInterval(tick); return; }
          if (socket && socket.connected) {
            console.warn(`[multiplayer] retry tasks:request ${tries}/5`);
            socket.emit('tasks:request', { room: currentRoom, uid: finalUid });
          }
        }, 1200);
      } catch {}
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
          if (p.equip && typeof p.equip === 'object') playerEquips.set(p.uid, p.equip);
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
        // remove equip overlays for this uid
        try {
          const layers = remoteEquipLayers.get(id);
          if (layers){
            for (const slot of Object.keys(layers)) layers[slot]?.remove?.();
          }
          remoteEquipLayers.delete(id);
        } catch {}
      }
    }
  });

  // สัญญาณเริ่มประชุม (ถ้าใช้)
  socket.on('meeting:start', (data) => {
    // ✅ Accept meeting:start from any room (or if room matches)
    try {
      console.log('� [Meeting] Received meeting:start broadcast:', data);
      // 👻 Ghost เห็น Modal แต่ไม่สามารถโหวตได้
      startMeeting(data?.at || { x: data?.x ?? 4000, y: data?.y ?? 4000, _broadcast: true });
    } catch (e) {
      console.error('meeting:start handler failed', e);
    }
  });

  // 🗳️ รับผลโหวตแบบ realtime
  socket.on('meeting:voteUpdate', (data) => {
    try {
      const { votes } = data || {};
      if (votes) {
        console.log('📊 [Meeting] Vote update received:', votes);
        // Dispatch custom event to update UI
        window.dispatchEvent(new CustomEvent('meeting:voteUpdate', { detail: { votes } }));
      }
    } catch (e) {
      console.error('meeting:voteUpdate handler failed', e);
    }
  });

    // ✅ รับสัญญาณว่าทุกคนโหวตครบแล้ว
  socket.on('meeting:allVoted', (data) => {
    try {
      const { votes } = data || {};
      console.log('✅ [Meeting] All players voted! Finalizing immediately...');
      // Dispatch custom event to finalize meeting
      window.dispatchEvent(new CustomEvent('meeting:allVoted', { detail: { votes } }));
    } catch (e) {
      console.error('meeting:allVoted handler failed', e);
    }
  });

  // 💬 รับแชทในการประชุม
  socket.on('meeting:chat', (data) => {
    try {
      const { uid, name, text, isGhost } = data || {};
      if (!text || uid === state.uid) return; // ไม่แสดง echo ของตัวเอง
      
      // 👻 Ghost เห็นทุกแชท, Alive ไม่เห็นแชท Ghost
      const iAmGhost = state.isGhost || false;
      if (!iAmGhost && isGhost) return; // คนปกติไม่เห็นแชท Ghost
      
      // เพิ่มข้อความในแชท
      const chatMessages = document.getElementById('meeting-chat-messages');
      if (chatMessages) {
        const msg = document.createElement('div');
        msg.className = 'meeting-chat-msg' + (isGhost ? ' ghost' : '');
        msg.innerHTML = `<strong>${isGhost ? '👻 ' : ''}${name}:</strong>${text}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (e) {
      console.error('meeting:chat handler failed', e);
    }
  });

  // 👻 รับสัญญาณว่ามีคนถูกโหวตออก → Ghost Mode
  socket.on('player:ejected', (data) => {
    try {
      const { uid, name, wasThief } = data || {};
      console.log(`� [Ejection] ${name} was ejected! Was thief: ${wasThief}`);
      
      // Show notification
      const logContainer = document.getElementById('log-container');
      if (logContainer) {
        const msg = document.createElement('p');
        msg.className = 'log-message';
        msg.style.color = wasThief ? '#ff3333' : '#ffaa00';
        msg.style.fontWeight = '800';
        msg.textContent = `� ${name} ถูกโหวตออก! ${wasThief ? '(เป็น Thief!)' : '(ไม่ใช่ Thief)'}`;
        logContainer.insertBefore(msg, logContainer.firstChild);
        
        // Fade out after 8 seconds
        setTimeout(() => { msg.style.opacity = '0'; }, 8000);
        setTimeout(() => { msg.remove(); }, 9000);
      }
      
      // If I was ejected → Enter Ghost Mode (แบบ Among Us)
      if (uid === state.uid) {
        state.isGhost = true; // 👻 เป็น Ghost แล้ว
        state.isMeetingActive = false; // ให้เคลื่อนที่ได้
        
        // ทำให้ตัวละครโปร่งแสง
        const player = document.getElementById('player');
        const nameplate = document.getElementById('nameplate');
        if (player) player.style.opacity = '0.4';
        if (nameplate) {
          nameplate.style.opacity = '0.6';
          nameplate.style.color = '#888';
          nameplate.textContent = `👻 ${state.displayName}`;
        }
        
        // Show ghost notification
        setTimeout(() => {
          const ghostMsg = document.createElement('div');
          ghostMsg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.9);
            color: #fff;
            padding: 30px 50px;
            border-radius: 15px;
            font-size: 24px;
            font-weight: 800;
            z-index: 10000;
            text-align: center;
            border: 3px solid #888;
          `;
          ghostMsg.innerHTML = `
            👻 คุณกลายเป็น Ghost!<br>
            <span style="font-size: 18px; color: #aaa;">คุณเห็นทุกคน แต่ไม่สามารถโต้ตอบได้</span>
          `;
          document.body.appendChild(ghostMsg);
          
          setTimeout(() => {
            ghostMsg.style.transition = 'opacity 1s';
            ghostMsg.style.opacity = '0';
            setTimeout(() => ghostMsg.remove(), 1000);
          }, 4000);
        }, 1000);
        
        console.log('👻 You are now a ghost. You can see everyone but they cannot see you.');
        
        // 👻 เมื่อกลายเป็น Ghost → แสดง Ghost players ทั้งหมดที่ถูกซ่อนไว้
        setTimeout(() => {
          for (const [uid, el] of Object.entries(remotePlayers)) {
            // ถ้า element ถูกซ่อนไว้ → แสดงเป็น Ghost (โปร่งแสง)
            if (el.style.display === 'none') {
              el.style.display = 'block';
              el.style.opacity = '0.4';
              
              // แสดง nametag
              if (el._nametag) {
                el._nametag.style.display = 'block';
                el._nametag.style.opacity = '0.6';
                el._nametag.style.color = '#888';
              }
              
              // แสดง equipment
              if (remoteEquipLayers.has(uid)) {
                const layers = remoteEquipLayers.get(uid);
                for (const slot in layers) {
                  if (layers[slot]) {
                    layers[slot].style.display = 'block';
                    layers[slot].style.opacity = '0.4';
                  }
                }
              }
            }
          }
        }, 100); // รอให้ state.isGhost = true เสร็จก่อน
      }
      
      // ❌ ถ้าคนที่ยังเล่นอยู่ (ไม่ใช่ Ghost) → ซ่อน Ghost player
      if (!state.isGhost) {
        // ซ่อนตัวละคร
        if (remotePlayers[uid]) {
          remotePlayers[uid].style.display = 'none';
        }
        
        // ซ่อน nametag
        const nametags = document.querySelectorAll('.nametag');
        nametags.forEach(tag => {
          if (tag.textContent.includes(name)) {
            tag.style.display = 'none';
          }
        });
        
        // ซ่อน equipment
        if (remoteEquipLayers.has(uid)) {
          const layers = remoteEquipLayers.get(uid);
          for (const slot in layers) {
            if (layers[slot]) {
              layers[slot].style.display = 'none';
            }
          }
        }
      }
      // ✅ ถ้าเป็น Ghost → ทำ ejected player ให้โปร่งใส
      else {
        if (remotePlayers[uid]) {
          remotePlayers[uid].style.opacity = '0.4';
          remotePlayers[uid].style.display = 'block';
        }
        
        const nametags = document.querySelectorAll('.nametag');
        nametags.forEach(tag => {
          if (tag.textContent.includes(name) && !tag.textContent.includes('👻')) {
            tag.style.color = '#888';
            tag.style.opacity = '0.6';
            tag.textContent = `👻 ${name}`;
            tag.style.display = 'block';
          }
        });
        
        if (remoteEquipLayers.has(uid)) {
          const layers = remoteEquipLayers.get(uid);
          for (const slot in layers) {
            if (layers[slot]) {
              layers[slot].style.opacity = '0.4';
              layers[slot].style.display = 'block';
            }
          }
        }
      }
      
    } catch (e) {
      console.error('player:ejected handler failed', e);
    }
  });

  // ✅ Wave Unlock
  socket.on('wave:unlock', (data) => {
    try {
      const { currentWave, unlockedTasks } = data || {};
      if (!Array.isArray(unlockedTasks)) return;

      // อัปเดต state ให้ถูกต้อง (เดิมอ้างอิงตัวแปรผิด)
      state.myCurrentWave = currentWave;
      state.myUnlockedTasks = [...state.myUnlockedTasks, ...unlockedTasks];

      // อัปเดต sessionStorage (กันรีโหลดหน้าแล้วค่าหาย)
      try {
        sessionStorage.setItem('myCurrentWave', String(currentWave));
      } catch {}

      console.log(`🔓 Wave ${currentWave} unlocked!`, unlockedTasks);

      // อัปเดตแผนที่ย่อและ world markers ถ้ามีฟังก์ชันให้เรียก
      try {
        // refresh minimap
        import('./minimap.js').then(m => m.updateMiniMapDisplay?.()).catch(()=>{});
      } catch {}
      try {
        // refresh world task hints (defined in interactions.js)
        import('./interactions.js').then(m => { m.updateTaskWorldHints?.(); m.updateVisitorMissionHUD?.(); }).catch(()=>{});
      } catch {}

      if (typeof window.showNotification === 'function') {
        window.showNotification(`Wave ${currentWave} unlocked!`);
      }
    } catch (e) {
      console.error('wave:unlock handler failed', e);
    }
  });

  // ✅ Role update (private) — server-authoritative reveal
  socket.on('role:update', (data={}) => {
    try {
      if (!data) return;
      const role = data.role || null;
      if (!role) return;
      // persist and apply
      try { sessionStorage.setItem('myRole', role); } catch {}
      state.myRole = role;
      // If became Thief, fetch gem state and show markers/HUD
      try { if (window.socket && window.socket.connected && role === 'Thief') { window.socket.emit('gem:get'); } } catch {}
      try { import('./interactions.js').then(m=>{ m.updateGemMarkers?.(); m.updateThiefGemHUD?.(); }); } catch {}
      // trigger reveal UI if available
      import('./roles.js').then(m => {
        if (typeof m.getRole === 'function' && m.getRole() === role) return;
        if (typeof m.isRoleRevealed === 'function' && m.isRoleRevealed()) return;
        const reveal = m.revealRole || m.default;
        if (reveal) reveal(role);
      }).catch(()=>{});
      console.log('🃏 role:update received ->', role);
    } catch (e) {
      console.error('role:update handler failed', e);
    }
  });

  // ✅ Receive tasks while already in game page
  socket.on('tasks:assigned', (data={}) => {
    try {
      const role = data.role || null;
      const waves = Array.isArray(data.waves) ? data.waves : [];
      const currentWave = Number(data.currentWave || 0);

      // persist
      try { sessionStorage.setItem('myRole', role); } catch {}
      try { sessionStorage.setItem('myWaves', JSON.stringify(waves)); } catch {}
      try { sessionStorage.setItem('myCurrentWave', String(currentWave)); } catch {}
  // note: completedTasks will be set by state:resume if available

      // update runtime state
      state.myRole = role;
      state.myWaves = waves;
      state.myCurrentWave = currentWave;
      state.myUnlockedTasks = currentWave > 0 && waves[currentWave-1] ? [...waves[currentWave-1]] : [];

      // refresh UI hints
      try { import('./minimap.js').then(m=>m.updateMiniMapDisplay?.()); } catch {}
      try { import('./interactions.js').then(m=>{ m.updateTaskWorldHints?.(); m.updateVisitorMissionHUD?.(); }); } catch {}
      console.log('📦 tasks:assigned applied in game page', { role, currentWave, waves });

      // แสดง role reveal จาก server (กันซ้ำถ้าเคยตั้งบทบาทในหน้านี้แล้ว)
      try {
        import('./roles.js').then(m => {
          // ถ้า roles module เคยรู้บทบาทอยู่แล้ว และตรงกับที่ server ส่งมา ให้ข้ามการ reveal
          if (typeof m.getRole === 'function' && m.getRole() === role) return;
          if (typeof m.isRoleRevealed === 'function' && m.isRoleRevealed()) return;
          const reveal = m.revealRole || m.default;
          if (reveal && role) reveal(role);
        }).catch(()=>{});
      } catch {}
    } catch (e) {
      console.error('tasks:assigned handler failed', e);
    }
  });

  // ✅ Resume complete state on refresh
  socket.on('state:resume', (data={}) => {
    try {
      const role = data.role || null;
      const waves = Array.isArray(data.waves) ? data.waves : [];
      const currentWave = Number(data.currentWave || 0);
      const completed = Array.isArray(data.completedTasks) ? data.completedTasks : [];
      const x = Number.isFinite(data.x) ? data.x : state.playerX;
      const y = Number.isFinite(data.y) ? data.y : state.playerY;

      // persist
      try { sessionStorage.setItem('myRole', role); } catch {}
      try { sessionStorage.setItem('myWaves', JSON.stringify(waves)); } catch {}
      try { sessionStorage.setItem('myCurrentWave', String(currentWave)); } catch {}
      try { sessionStorage.setItem('myCompletedTasks', JSON.stringify(completed)); } catch {}

      // apply runtime
      state.myRole = role;
      state.myWaves = waves;
      state.myCurrentWave = currentWave;
      state.myCompletedTasks = completed;
      state.myUnlockedTasks = currentWave > 0 && waves[currentWave-1] ? [...waves[currentWave-1]] : [];

      // restore player position
      state.playerX = x; state.playerY = y;

  // refresh UI
  try { import('./minimap.js').then(m=>m.updateMiniMapDisplay?.()); } catch {}
  try { import('./interactions.js').then(m=>{ m.updateTaskWorldHints?.(); m.refreshMissionUI?.(); m.updateGemMarkers?.(); m.updateThiefGemHUD?.(); m.updateVisitorMissionHUD?.(); }); } catch {}
      console.log('🔁 state:resume applied', { role, currentWave, completedCount: completed.length, x, y });

      // เรียก revealRole เมื่อรีเฟรชหน้า เพื่อให้ HUD/mission bar ถูกต้องตามบทบาททันที
      try {
        import('./roles.js').then(m => {
          if (!role) return;
          // กันซ้ำ: ถ้า module รู้บทบาทอยู่แล้วให้ข้าม
          if (typeof m.getRole === 'function' && m.getRole() === role) return;
          if (typeof m.isRoleRevealed === 'function' && m.isRoleRevealed()) return;
          const reveal = m.revealRole || m.default;
          if (reveal) reveal(role);
        }).catch(()=>{});
      } catch {}
    } catch (e) {
      console.error('state:resume handler failed', e);
    }
  });

  // ✅ Visitors Win
  socket.on('game:visitorsWin', (data) => {
    try {
      console.log('🎉 Visitors Win!', data);
      // เรียก endgame overlay
      import('./endgame.js').then(m => {
        const showEnd = m?.showEnd || m?.default;
        if (showEnd) {
          showEnd({
            outcome: 'visitors_win',
            reason: 'all_tasks_complete',
            title: 'VISITORS WIN!',
            desc: data?.message || 'All visitors completed their tasks!',
          });
        }
      }).catch(err => console.error('endgame load failed', err));
    } catch (e) {
      console.error('game:visitorsWin handler failed', e);
    }
  });

  // ✅ Thief Wins (gem heist)
  socket.on('game:thiefWin', (data) => {
    try {
      console.log('💎 Thief Win!', data);
      import('./endgame.js').then(m => {
        const showEnd = m?.showEnd || m?.default;
        if (showEnd) {
          showEnd({
            outcome: 'thief_win',
            reason: 'all_gems_stolen',
            title: 'THIEF WINS!',
            desc: data?.message || 'All gems have been stolen.'
          });
        }
      }).catch(err => console.error('endgame load failed', err));
    } catch (e) {
      console.error('game:thiefWin handler failed', e);
    }
  });

  // ✅ Sync gem layout/state
  socket.on('gem:state', (data={}) => {
    try {
      state.gems = Array.isArray(data.gems) ? data.gems : [];
      // Update simple HUD and markers
      import('./interactions.js').then(m => {
        m.updateGemMarkers?.();
        m.updateThiefGemHUD?.();
      }).catch(()=>{});
    } catch (e) {
      console.error('gem:state handler failed', e);
    }
  });

  // ✅ Cooldown feedback for failed lockpicks
  socket.on('gem:cooldown', (data={}) => {
    try {
      const until = Number(data.until||0);
      state.gemCooldownUntil = until;
      const remain = Math.max(0, Math.ceil((until - Date.now())/1000));
      window.showToast && showToast(`⏳ Lockpick cooldown ${remain}s`, 'warning');
    } catch {}
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
  try {
    for (const [uid, layers] of Array.from(remoteEquipLayers.entries())){
      for (const slot of Object.keys(layers || {})) layers[slot]?.remove?.();
      remoteEquipLayers.delete(uid);
    }
  } catch {}
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
    // 👻 ส่ง ghost status ไปด้วย
    socket.emit('player:move', { 
      room: currentRoom, 
      uid, 
      x, 
      y, 
      isGhost: state.isGhost || false 
    });
  };
})();

// ===== render loop ของผู้เล่นอื่น =====
export function startRemotePlayersRenderLoop(){
  function tick(){
    const gc = refs?.gameContainer || document.getElementById('gameContainer');
    if (!gc){ rafRemote = requestAnimationFrame(tick); return; }

    for (const p of lastPlayersSnapshot){
      if (!p || p.uid === state?.uid) continue;
      
      // 👻 ระบบ Ghost Visibility:
      // - Ghost เห็นทุกคน (Alive + Ghost)
      // - Alive ไม่เห็น Ghost
      const playerIsGhost = p.isGhost || false;
      const iAmGhost = state.isGhost || false;
      
      if (!iAmGhost && playerIsGhost) {
        // ฉันไม่ใช่ Ghost แต่เขาเป็น Ghost → ไม่เห็น
        if (remotePlayers[p.uid]) {
          remotePlayers[p.uid].style.display = 'none';
          if (remotePlayers[p.uid]._nametag) {
            remotePlayers[p.uid]._nametag.style.display = 'none';
          }
        }
        continue;
      }
      
      // ✅ Ghost เห็นทุกคน (แสดงปกติ)
      // ✅ Alive เห็น Alive (แสดงปกติ)

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
      
      // 👻 อัปเดต ghost status (ถ้าเป็น ghost ทำให้โปร่งแสง)
      if (p.isGhost) {
        el.style.opacity = '0.4';
        if (el._nametag) {
          el._nametag.style.opacity = '0.6';
          el._nametag.style.color = '#888';
          if (!el._nametag.textContent.includes('👻')) {
            el._nametag.textContent = `👻 ${p.name || 'Ghost'}`;
          }
        }
      } else {
        el.style.opacity = '1';
        if (el._nametag) {
          el._nametag.style.opacity = '1';
          el._nametag.style.color = playerColors.get(p.uid) || p.color || '#fff';
          if (el._nametag.textContent.includes('👻')) {
            el._nametag.textContent = p.name || 'Player';
          }
        }
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
        // Update equipment wrapper position to match player
        if (el._equipWrapper){
          el._equipWrapper.style.transform = `translate(${tx}px, ${ty}px)`;
        }
        el.dataset.tx = tx; el.dataset.ty = ty;
      }
      el.dataset.x = nx; el.dataset.y = ny;

      // Render equipment overlays for this remote player (wrapper handles position)
      try {
        renderRemoteEquipFor(p, tx, ty);
      } catch {}

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
          color: p.color || playerColors.get(p.uid) || '#ffffff',
          isGhost: p.isGhost || false // 👻 เพิ่ม ghost status
        }))
      : [];
  } catch {
    return [];
  }
}
