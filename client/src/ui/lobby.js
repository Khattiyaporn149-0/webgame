// client/lobby.js
// ✅ ใช้ RTDB อย่างเดียว
import {
  rtdb, ref, set, update, onValue, onDisconnect, push, get, remove, serverTimestamp
} from "../services/firebase.js";

// ✅ Socket.IO for game start
let socket = null;

/* ---------- Utils & Context ---------- */
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const roomCode = params.get("code");

// ถ้าไม่มี code ส่งกลับไปหน้า roomlist
if (!roomCode) {
  location.href = "roomlist.html";
  throw new Error("Missing room code");
}

const savedRoom = JSON.parse(localStorage.getItem("currentRoom") || "{}");
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

$("roomName").textContent = savedRoom.name || "Room";
$("roomCode").textContent = roomCode || savedRoom.code || "-";

// ✅ รีเซ็ต task data เมื่อกลับมา lobby
try {
  sessionStorage.removeItem("myRole");
  sessionStorage.removeItem("myWaves");
  sessionStorage.removeItem("myCurrentWave");
  console.log("✅ Lobby: Task data cleared");
  
  // ส่ง game:reset ไป server (ถ้ามี socket)
  if (typeof io !== 'undefined') {
    const host = location.hostname || '127.0.0.1';
    const proto = location.protocol.startsWith('https') ? 'https' : 'http';
    const resetSocket = io(`${proto}://${host}:3000`, { transports: ['websocket','polling'] });
    resetSocket.emit("game:reset", { room: roomCode });
    console.log("🔄 Sent game:reset to server");
    setTimeout(() => resetSocket.disconnect(), 1000);
  }
} catch (e) {
  console.warn("⚠️ Failed to clear task data:", e);
}

/* ---------- BG ---------- */
const canvas = $("bgCanvas");
const ctx = canvas.getContext("2d");
function drawBackground() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const g = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.6
  );
  g.addColorStop(0, "#1e2130");
  g.addColorStop(1, "#0b0d12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5 + 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2); ctx.fill();
  }
}
drawBackground();
addEventListener("resize", drawBackground);

/* ---------- Refs & helpers ---------- */
const roomRef = ref(rtdb, `rooms/${roomCode}`);
const playerRef = ref(rtdb, `lobbies/${roomCode}/players/${uid}`);
const lobbyPlayersRef = ref(rtdb, `lobbies/${roomCode}/players`);
const chatRef = ref(rtdb, `lobbies/${roomCode}/chat`);

const bumpActivity = () =>
  update(roomRef, { lastActivity: serverTimestamp() }).catch(() => {});

async function syncPlayerCount() {
  const snap = await get(lobbyPlayersRef);
  const cnt = snap.exists() ? Object.keys(snap.val() || {}).length : 0;
  await update(roomRef, { playerCount: cnt, lastActivity: serverTimestamp() }).catch(() => {});
}

/* ---------- Ensure room exists (เติม hostId ถ้าสร้างใหม่) ---------- */
try {
  const rs = await get(roomRef);
  if (!rs.exists()) {
    await set(roomRef, {
      code: roomCode,
      name: savedRoom.name || roomCode,
      maxPlayers: savedRoom.maxPlayers || 8,
      type: savedRoom.type || "public",
      host: displayName,
      hostId: uid, // ตั้งโฮสเริ่มต้น
      status: "lobby",
      playerCount: 0,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });
  } else {
    const room = rs.val() || {};
    if (!room.hostId) {
      await update(roomRef, { hostId: uid, host: room.host || displayName, lastActivity: serverTimestamp() }).catch(() => {});
    }
  }
} catch (e) {
  console.warn("ensure room error:", e);
}

/* ---------- Join / Presence ---------- */
// พยายามใช้คาแร็กเตอร์ล่าสุดที่ผู้เล่นเคยเลือกไว้ ถ้าไม่มีใช้ค่าเริ่มต้น
const savedChar = (localStorage.getItem('ggd.char') || 'mini_brown');

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

await set(playerRef, {
  uid,
  name: displayName,
  isHost: !!savedRoom.isHost,
  ready: false,
  online: true,
  char: savedChar,
  color: charToColor(savedChar),
  joinTime: Date.now(), // ใช้ timestamp จริงเพื่อจัดลำดับโฮส
});
onDisconnect(playerRef).remove();
await bumpActivity();

/* ---------- Character selection (no-duplicate) ---------- */
const characters = [
  "mini_brown","mini_coral","mini_gray","mini_lavender",
  "mini_mint","mini_pink","mini_sky_blue","mini_yellow"
];
let currentCharIndex = 0;
let isReady = false;
// เก็บว่า char ใครจองอยู่ { charName: uid }
let takenBy = {};

const img = $("charImage");
const label = $("charLabel");

// ตั้งค่า index เริ่มต้นตามที่เคยเลือกไว้ (ถ้ามี)
try {
  const idx0 = characters.indexOf(savedChar);
  if (idx0 >= 0) currentCharIndex = idx0;
} catch {}

function renderChar() {
  const f = characters[currentCharIndex];
  img.src = `../assets/Characters/${f}/idle_1.png`;
  label.textContent = f.replace("mini_", "").toUpperCase();
}

function findNextFree(fromIndex, direction = +1) {
  for (let i = 0; i < characters.length; i++) {
    const idx = (fromIndex + direction * i + characters.length) % characters.length;
    const ch = characters[idx];
    if (!takenBy[ch] || takenBy[ch] === uid) return idx;
  }
  return null;
}

async function ensureUniqueChar() {
  const mine = characters[currentCharIndex];
  if (takenBy[mine] && takenBy[mine] !== uid) {
    const idx = findNextFree(currentCharIndex + 1, +1);
    if (idx !== null) {
      currentCharIndex = idx;
      renderChar();
      try { await update(playerRef, { char: characters[idx] }); } catch {}
      bumpActivity();
    }
  }
}

async function changeChar(delta) {
  if (isReady) return;
  const dir = delta >= 0 ? +1 : -1;
  const next = findNextFree(currentCharIndex + dir, dir);
  if (next === null) return; // ตัวละครถูกจองครบ
  currentCharIndex = next;
  renderChar();
  const chosen = characters[currentCharIndex];
  try { await update(playerRef, { char: chosen, color: charToColor(chosen) }); } catch {}
  try {
    localStorage.setItem('ggd.char', chosen);
    localStorage.setItem('ggd.color', charToColor(chosen));
  } catch {}
  bumpActivity();
}

$("prevChar").onclick = () => changeChar(-1);
$("nextChar").onclick = () => changeChar(+1);
renderChar();
await ensureUniqueChar();

/* ---------- Ready / Back ---------- */
const readyBtn = $("readyBtn");
const warning = $("warningBox");
const overlay = $("countdownOverlay");

function showWarning() {
  warning.classList.add("show");
  clearTimeout(warning._t);
  warning._t = setTimeout(() => warning.classList.remove("show"), 4000);
}

readyBtn.onclick = async () => {
  isReady = !isReady;
  readyBtn.textContent = isReady ? "READY ✔" : "UNREADY ✖";
  readyBtn.style.background = isReady
    ? "linear-gradient(135deg,#77FF6B,#4AFF59)"
    : "linear-gradient(135deg,#E02F2F,#C04125)";
  img.classList.toggle("ready-char", isReady);
  showWarning();
  try { await update(playerRef, { ready: isReady }); } catch {}
  bumpActivity();
};

// ออกห้อง: ถ้าเราเป็นคนสุดท้าย → ลบ lobby → room (ตามกฎ)
$("btnBack").onclick = async () => {
  try { await set(playerRef, null); } catch {}
  try {
    const pSnap = await get(lobbyPlayersRef);
    const left = pSnap.exists() ? Object.keys(pSnap.val() || {}).length : 0;
    if (left === 0) {
      // เคลียร์ลูกใต้ lobby ก่อนเสมอ เพื่อผ่าน rules
      try { await remove(ref(rtdb, `lobbies/${roomCode}/players`)); } catch {}
      try { await remove(ref(rtdb, `lobbies/${roomCode}/chat`)); } catch {}
      try { await remove(ref(rtdb, `lobbies/${roomCode}`)); } catch {}
      try { await remove(roomRef); } catch {}
      console.log(`🗑 Room ${roomCode} deleted (last player left).`);
    } else {
      await bumpActivity();
    }
  } catch {}
  location.href = "roomlist.html";
};

/* ---------- Players list sync + host auto-promotion ---------- */
const playerListEl = $("playerList");
const playerCountEl = $("playerCount");

let countdownStarted = false;
onValue(lobbyPlayersRef, async (snap) => {
  const obj = snap.val() || {};
  const players = Object.values(obj);

  // อัปเดต map char ที่ถูกจอง
  takenBy = {};
  players.forEach((p) => { if (p.char) takenBy[p.char] = p.uid; });

  // ถ้าของเราโดนชน ให้หาตัวใหม่ที่ว่าง
  await ensureUniqueChar();

  // render รายชื่อ
  playerListEl.innerHTML = players.map((p) => {
    const meMark = p.uid === uid ? " (You)" : "";
    const host = p.isHost ? "👑" : "";
    const rd = p.ready ? "✅" : "⌛";
    return `<li>${p.name}${meMark} ${host} ${rd}</li>`;
  }).join("");

  // นับคน & sync room & bump
  playerCountEl.textContent = `${players.length} player${players.length > 1 ? "s" : ""}`;
  try { await update(roomRef, { playerCount: players.length, lastActivity: serverTimestamp() }); } catch {}

  // เลือกโฮสใหม่อัตโนมัติ (คนที่ joinTime เก่าสุด)
  const currentHost = players.find(p => p.isHost)?.uid || null;
  if (!currentHost && players.length > 0) {
    const sorted = players
      .map(p => ({ id: p.uid, name: p.name, jt: p.joinTime || 0 }))
      .sort((a, b) => a.jt - b.jt);
    const candidate = sorted[0];
    if (candidate && candidate.id === uid) {
      try {
        await update(playerRef, { isHost: true });
        await update(roomRef, { host: displayName, hostId: uid, lastActivity: serverTimestamp() });
      } catch {}
    }
  }

  // ✅ ต้องมีอย่างน้อย 3 คนถึงจะเริ่มเกมได้
  const minPlayers = 3;
  const allReady = players.length >= minPlayers && players.every((p) => p.ready);
  
  // แสดงข้อความเตือนถ้าคนน้อยกว่า 3
  const warningEl = $("minPlayerWarning");
  if (warningEl) {
    if (players.length < minPlayers && players.some(p => p.ready)) {
      warningEl.style.display = "block";
      warningEl.textContent = `⚠️ ต้องมีอย่างน้อง ${minPlayers} คนถึงจะเริ่มเกมได้ (ตอนนี้มี ${players.length} คน)`;
    } else {
      warningEl.style.display = "none";
    }
  }
  
  if (allReady && !countdownStarted) {
    countdownStarted = true;
    startCountdown();
  }
});

function startCountdown() {
  // ⭐ ล้าง role และ game state เก่าออกเพื่อเริ่มเกมใหม่
  sessionStorage.removeItem("myRole");
  sessionStorage.removeItem("myWaves");
  sessionStorage.removeItem("myCurrentWave");
  sessionStorage.removeItem("myCompletedTasks");
  sessionStorage.removeItem("roleRevealShown"); // ลบ flag เพื่อให้แสดง modal ใหม่
  sessionStorage.removeItem("myAbilityRole");
  sessionStorage.removeItem("myAbilityName");
  sessionStorage.removeItem("myAbilityDesc");

  // ⭐ ลบ listener เก่าออก (แต่ไม่ disconnect socket)
  if (socket) {
    console.log("🔄 Clearing old listeners...");
    socket.off("tasks:assigned");
    socket.off("game:join:ack");
  }

  // ⭐ ถ้ายังไม่มี socket หรือ disconnect แล้ว ให้สร้างใหม่
  if (!socket || !socket.connected) {
    console.log("🔌 Creating new socket connection...");
    // เชื่อมต่อ Socket.IO ใหม่
  const host = location.hostname || '127.0.0.1';
  const proto = location.protocol.startsWith('https') ? 'https' : 'http';
  const localUrl = `${proto}://${host}:3000`;
  const remoteUrl = 'https://webgame-25n5.onrender.com';
  let connectingTo = 'local';
  
  function bindHandlers(){
    // เพิ่ม error handling
    socket.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err.message);
      if (connectingTo === 'local'){
        console.warn('🔁 Fallback to remote server...');
        connectingTo = 'remote';
        try { socket.removeAllListeners?.(); socket.disconnect?.(); } catch {}
        socket = io(remoteUrl, { transports: ['websocket','polling'] });
        try { localStorage.removeItem('ws.local'); } catch {}
        bindHandlers();
      }
    });
  
    socket.on("connect", () => {
      console.log(`✅ Socket connected in lobby! (${connectingTo})`);
      try {
        if (connectingTo === 'local') localStorage.setItem('ws.local','1');
        else localStorage.removeItem('ws.local');
      } catch {}
      
      // ⭐ เมื่อ connect สำเร็จแล้ว ค่อยเริ่มนับถอยหลัง
      startCountdownTimer();
    });
  }

    // เริ่มจาก local ก่อน ถ้าไม่ได้จะสลับไป remote
    socket = io(localUrl, { transports: ['websocket','polling'] });
    try { localStorage.setItem('ws.local','1'); } catch {}
    bindHandlers();
  } else {
    // ⭐ ถ้า socket connected อยู่แล้ว เริ่มนับถอยหลังทันที
    console.log("✅ Socket already connected, starting countdown...");
    startCountdownTimer();
  }
}

// ⭐ ฟังก์ชันนับถอยหลัง (แยกออกมาเพื่อเรียกหลังจาก socket connected)
function startCountdownTimer() {
  let count = 3;
  overlay.textContent = count;
  overlay.classList.add("show");

  // ⭐ นับถอยหลังทุกครั้ง
  const t = setInterval(() => {
    count--;
    overlay.textContent = count > 0 ? count : "GO!";
    if (count < 0) {
      clearInterval(t);
      overlay.classList.remove("show");
      
      // ⭐ ส่ง game:join + game:start หลังจากนับถอยหลังเสร็จแล้ว
      if (socket && socket.connected) {
        // อ่านค่าจาก ggd.char และ ggd.color ที่บันทึกไว้ใน lobby
        const playerChar = localStorage.getItem("ggd.char") || "mini_mint";
        const playerColor = localStorage.getItem("ggd.color") || "#3EB489";
        const isHost = JSON.parse(localStorage.getItem("currentRoom") || "{}").isHost;
        
        console.log(`🎨 [${displayName}] Using char: ${playerChar}, color: ${playerColor}`);
        
        // ⭐ ผูก tasks:assigned listener ก่อน (เพื่อไม่พลาดข้อมูล)
        socket.once("tasks:assigned", (data) => {
          console.log(`✅ [${displayName}] Received task assignment:`, data);
          
          // เก็บข้อมูลลง sessionStorage
          sessionStorage.setItem("myRole", data.role);
          sessionStorage.setItem("myWaves", JSON.stringify(data.waves || []));
          sessionStorage.setItem("myCurrentWave", data.currentWave || 0);
          
          // redirect ไปหน้าเกม
          console.log(`🚀 [${displayName}] Redirecting to game...`);
          location.href = `game.html?code=${encodeURIComponent(roomCode)}`;
        });
        
        // ส่ง game:join ก่อน
        socket.emit("game:join", {
          room: roomCode,
          uid,
          name: displayName,
          color: playerColor,
          char: playerChar,
          x: 3500,
          y: 3900
        });
        console.log(`📍 [${displayName}] Sent game:join after countdown`);
        
        // ⭐ รอ acknowledgment จาก server ว่าได้รับ game:join แล้ว
        let joinAckReceived = false;
        socket.once("game:join:ack", (data) => {
          console.log(`✔️ [${displayName}] Server acknowledged game:join`, data);
          joinAckReceived = true;
          
          // ถ้าเป็น host ให้ส่ง game:start ทันที
          if (isHost) {
            console.log("🎮 [HOST] Sending game:start to server...");
            socket.emit("game:start", { room: roomCode });
          }
        });
        
        // Backup: ถ้า 1 วิยังไม่ได้ ack ให้ส่ง game:start อยู่ดี (non-host รอต่อ)
        setTimeout(() => {
          if (!joinAckReceived && isHost) {
            console.warn("⚠️ [HOST] No join:ack after 1s, sending game:start anyway...");
            socket.emit("game:start", { room: roomCode });
          }
        }, 1000);
        
        // ถ้า 5 วินาทียังไม่ได้ tasks ให้ขอใหม่
        setTimeout(() => {
          if (!sessionStorage.getItem("myRole")) {
            console.warn(`⚠️ [${displayName}] No tasks received after 5s, requesting again...`);
            socket.emit("tasks:request", { room: roomCode, uid });
          }
        }, 5000);
      }
    }
  }, 1000);
}

/* ---------- Chat (+ bumpActivity) ---------- */
const chatInput = $("chatInput");
const sendBtn = $("sendBtn");
const box = $("chatMessages");

function addMsg(sender, text, ts) {
  const p = document.createElement("p");
  const time = ts ? new Date(ts).toLocaleTimeString() : "";
  p.innerHTML = `<b>${sender}</b> <small style="opacity:.7">${time}</small>: ${text}`;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

onValue(chatRef, (snap) => {
  const data = snap.val() || {};
  const arr = Object.values(data)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-100);
  box.innerHTML = "";
  arr.forEach((m) => addMsg(m.sender, m.text, m.ts));
});

sendBtn.onclick = async () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = "";
  try {
    await push(chatRef, { sender: displayName, text: msg, ts: Date.now() });
  } catch (e) {
    console.warn("chat push fail", e);
  }
  bumpActivity();
};
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});
