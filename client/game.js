// client/game.js (ES module)
// ใช้ Realtime Database อย่างเดียวให้สอดคล้องกับ lobby
import {
  rtdb, ref, set, update, onValue, onDisconnect, push, get, serverTimestamp
} from "./firebase.js";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const chatInput = $("chatInput");
const chatMessages = $("chatMessages");

// ---------- Context ----------
const params = new URLSearchParams(location.search);
const roomCode = params.get("code");
if (!roomCode) {
  location.href = "roomlist.html";
  throw new Error("Missing room code");
}

const displayName =
  localStorage.getItem("ggd.name") ||
  localStorage.getItem("playerName") ||
  `Player_${Math.random().toString(36).slice(2, 7)}`;
const uid =
  sessionStorage.getItem("ggd.uid") ||
  (() => {
    const v = crypto?.randomUUID?.() || "uid_" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("ggd.uid", v);
    return v;
  })();

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
  players: {},
  myPlayer: { x: 400, y: 300, color: colorFromUid(uid), name: displayName },
};
let keys = {};
let lastNetUpdate = 0;
let lastFrame = performance.now();
const NET_INTERVAL_MS = 80; // ~12.5 Hz network updates

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

// Join / presence
try {
  await set(myPlayerRef, {
    uid,
    name: displayName,
    x: gameState.myPlayer.x,
    y: gameState.myPlayer.y,
    color: gameState.myPlayer.color,
    online: true,
    lastUpdate: serverTimestamp(),
  });
  onDisconnect(myPlayerRef).remove();
} catch (e) {
  console.warn("RTDB set myPlayerRef failed", e);
  $("gameStatus").textContent = '❌ Permission denied: update Firebase rules for /games';
}

// Sync players + messages
let cachedOthers = [];
onValue(gameRootRef, (snap) => {
  const data = snap.val() || {};
  if (data.players) {
    gameState.players = data.players;
    cachedOthers = Object.values(data.players).filter((p) => p && p.uid !== uid && p.online);
  }
  renderPlayersList();

  if (data.messages) {
    const arr = Object.values(data.messages).slice(-50);
    renderChat(arr);
  }
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

  // others
  cachedOthers.forEach((p) => drawPlayer(p, false));
  // me
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
    if (now - lastNetUpdate > NET_INTERVAL_MS) {
      update(myPlayerRef, {
        x: Math.round(gameState.myPlayer.x),
        y: Math.round(gameState.myPlayer.y),
        lastUpdate: serverTimestamp(),
      }).catch(() => {});
      $("playerPos").textContent = `${Math.round(gameState.myPlayer.x)}, ${Math.round(gameState.myPlayer.y)}`;
      lastNetUpdate = now;
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
  const dt = Math.min(0.05, (now - lastFrame) / 1000); // cap 50ms
  lastFrame = now;
  handleMovement(dt);
  drawGame();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// UI status
$("gameStatus").textContent = '✅ Connected!';
console.log('🎮 Game initialized');
