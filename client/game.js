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
