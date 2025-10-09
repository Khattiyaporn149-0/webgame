// ✅ ใช้ RTDB อย่างเดียว (ไม่ใช้ socket.io)
import {
  rtdb, ref, set, update, onValue, onDisconnect, push, get, serverTimestamp
} from "./firebase.js";

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

/* ---------- Background ---------- */
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

/* ---------- Ensure room exists ---------- */
const roomRef = ref(rtdb, `rooms/${roomCode}`);
try {
  const rs = await get(roomRef);
  if (!rs.exists()) {
    await set(roomRef, {
      code: roomCode,
      name: savedRoom.name || roomCode,
      maxPlayers: savedRoom.maxPlayers || 8,
      type: savedRoom.type || "public",
      host: displayName,
      status: "lobby",
      playerCount: 0,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });
  }
} catch (e) {
  console.warn("ensure room error:", e);
}

/* ---------- Join / Presence ---------- */
const playerRef = ref(rtdb, `lobbies/${roomCode}/players/${uid}`);
await set(playerRef, {
  uid,
  name: displayName,
  isHost: !!savedRoom.isHost,
  ready: false,
  online: true,
  char: "mini_brown",
  joinTime: serverTimestamp(),
});
onDisconnect(playerRef).remove();
await update(roomRef, { lastActivity: serverTimestamp() });

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

function renderChar() {
  const f = characters[currentCharIndex];
  img.src = `./assets/Characters/${f}/idle_1.png`;
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
  try { await update(playerRef, { char: characters[currentCharIndex] }); } catch {}
}

$("prevChar").onclick = () => changeChar(-1);
$("nextChar").onclick = () => changeChar(+1);
renderChar();

// หลัง join แล้ว ถ้า mini_brown ถูกจอง → กระโดดไปตัวว่าง
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
  try {
    await update(playerRef, { ready: isReady });
    await update(roomRef, { lastActivity: serverTimestamp() });
  } catch {}
};

$("btnBack").onclick = async () => {
  try { await update(roomRef, { lastActivity: serverTimestamp() }); } catch {}
  try { await set(playerRef, null); } catch {}
  location.href = "roomlist.html";
};

/* ---------- Players list sync ---------- */
const playerListEl = $("playerList");
const playerCountEl = $("playerCount");
const lobbyPlayersRef = ref(rtdb, `lobbies/${roomCode}/players`);

let countdownStarted = false;
onValue(lobbyPlayersRef, async (snap) => {
  const obj = snap.val() || {};
  const players = Object.values(obj);

  // อัปเดต map character ที่ถูกจับจอง
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

  // นับคน & sync room
  playerCountEl.textContent = `${players.length} player${players.length > 1 ? "s" : ""}`;
  try { await update(roomRef, { playerCount: players.length, lastActivity: serverTimestamp() }); } catch {}

  // start เมื่อทุกคนพร้อม >=2
  const allReady = players.length >= 2 && players.every((p) => p.ready);
  if (allReady && !countdownStarted) {
    countdownStarted = true;
    startCountdown();
  }
});

function startCountdown() {
  let count = 3;
  overlay.textContent = count;
  overlay.classList.add("show");
  const t = setInterval(() => {
    count--;
    overlay.textContent = count > 0 ? count : "GO!";
    if (count < 0) {
      clearInterval(t);
      overlay.classList.remove("show");
      // ⚠️ ถ้าต้องการ reset chat ตอนเริ่มเกม ให้ล้างที่นี่ (เฉพาะ host ก็ได้)
      // await set(ref(rtdb, `lobbies/${roomCode}/chat`), null);
      location.href = `game.html?code=${encodeURIComponent(roomCode)}`;
    }
  }, 1000);
}

/* ---------- Chat ---------- */
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

const chatRef = ref(rtdb, `lobbies/${roomCode}/chat`);
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
};
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});
