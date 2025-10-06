// =====================
// 🔌 Socket & Room state
// =====================
const savedRoom = JSON.parse(localStorage.getItem("currentRoom") || "{}");
const params = new URLSearchParams(window.location.search);
const roomCode = savedRoom.code || params.get("room") || "";
const roomName = savedRoom.name || "My Room";

const SERVER_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://webgame-25n5.onrender.com";

const socket = io(SERVER_URL, {
  transports: ["websocket"],
  withCredentials: false,
});

// =====================
// 🧩 DOM helpers
// =====================
const $ = (id) => document.getElementById(id);
const roomNameEl = $("roomName");
const roomCodeEl = $("roomCode");
const img = $("charImage");
const label = $("charLabel");
const prevBtn = $("prevChar");
const nextBtn = $("nextChar");
const readyBtn = $("readyBtn");
const playerListEl = $("playerList");
const chatInput = $("chatInput");
const sendBtn = $("sendBtn");
const chatBox = $("chatMessages");
const warning = $("warningBox");
const overlay = $("countdownOverlay");
const backBtn = $("btnBack");
const bgCanvas = $("bgCanvas");

// ใส่ค่า Room บนจอ
if (roomNameEl) roomNameEl.textContent = roomName;
if (roomCodeEl) roomCodeEl.textContent = roomCode || "XXXX";

// =====================
// 🛰️ Socket lifecycle
// =====================
let hasJoined = false;
function joinRoomOnce() {
  if (!hasJoined && roomCode) {
    socket.emit("joinRoom", roomCode);
    hasJoined = true;
  }
}

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);
  joinRoomOnce();
});
socket.on("connect_error", (err) => {
  console.error("❌ Connect error:", err.message);
  showWarning(true, "⚠️ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง...");
});
socket.on("disconnect", () => {
  console.warn("⚠️ Disconnected");
  showWarning(true, "⚠️ หลุดการเชื่อมต่อ กำลังพยายามเชื่อมใหม่...");
});
socket.io.on("reconnect", (n) => {
  console.log("🔁 Reconnected after", n, "tries");
  showWarning(true, "✅ เชื่อมต่อกลับมาแล้ว");
  joinRoomOnce();
});

// =====================
// 🌌 พื้นหลังดาว
// =====================
function drawBackground() {
  if (!bgCanvas) return;
  const ctx = bgCanvas.getContext("2d");
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;

  const g = ctx.createRadialGradient(
    bgCanvas.width / 2,
    bgCanvas.height / 2,
    0,
    bgCanvas.width / 2,
    bgCanvas.height / 2,
    bgCanvas.width * 0.6
  );
  g.addColorStop(0, "#1e2130");
  g.addColorStop(1, "#0b0d12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

  const starCount = Math.min(
    100,
    Math.floor((bgCanvas.width * bgCanvas.height) / 8000)
  );
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * bgCanvas.width;
    const y = Math.random() * bgCanvas.height;
    const r = Math.random() * 1.5 + 0.5;
    const a = Math.random() * 0.5 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
drawBackground();
window.addEventListener("resize", drawBackground);
setInterval(drawBackground, 10000);

// =====================
// 👤 ตัวละคร
// =====================
const characters = [
  "mini_brown",
  "mini_coral",
  "mini_gray",
  "mini_lavender",
  "mini_mint",
  "mini_pink",
  "mini_sky_blue",
  "mini_yellow",
];
let currentCharIndex = 0;
let isReady = false;

function updateChar() {
  const f = characters[currentCharIndex];
  if (img) img.src = `./assets/Characters/${f}/idle_1.png`;
  if (label) label.textContent = f.replace("mini_", "").toUpperCase();
  if (socket.connected && roomCode) {
    socket.emit("changeChar", { room: roomCode, char: f });
  }
}
if (prevBtn)
  prevBtn.onclick = () => {
    if (isReady) return;
    currentCharIndex =
      (currentCharIndex - 1 + characters.length) % characters.length;
    updateChar();
  };
if (nextBtn)
  nextBtn.onclick = () => {
    if (isReady) return;
    currentCharIndex = (currentCharIndex + 1) % characters.length;
    updateChar();
  };
updateChar();

// =====================
// ⚠️ Warning & Countdown
// =====================
function showWarning(show = true, msg) {
  if (!warning) return;
  if (msg) warning.textContent = msg;
  warning.classList.toggle("show", show);
  if (show) {
    clearTimeout(warning._t);
    warning._t = setTimeout(() => warning.classList.remove("show"), 4000);
  }
}

let isCountingDown = false;
function startCountdown() {
  if (isCountingDown) return;
  isCountingDown = true;

  if (!overlay) {
    // ไม่มี overlay ก็เข้าเกมเลย
    window.location.href = "game.html";
    return;
  }
  let count = 3;
  overlay.textContent = count;
  overlay.classList.add("show");
  const timer = setInterval(() => {
    count--;
    overlay.textContent = count > 0 ? count : "GO!";
    if (count < 0) {
      clearInterval(timer);
      overlay.classList.remove("show");
      window.location.href = "game.html";
    }
  }, 1000);
}

// =====================
// 🟩 ปุ่ม READY
// =====================
if (readyBtn)
  readyBtn.onclick = () => {
    isReady = !isReady;
    readyBtn.textContent = isReady ? "READY ✔" : "UNREADY ✖";
    readyBtn.style.background = isReady
      ? "linear-gradient(135deg,#77FF6B,#4AFF59)"
      : "linear-gradient(135deg,#E02F2F,#C04125)";
    if (img) img.classList.toggle("ready-char", isReady);

    // ล็อกปุ่มเปลี่ยนตัว
    if (prevBtn && nextBtn) {
      prevBtn.disabled = nextBtn.disabled = isReady;
      prevBtn.style.opacity = nextBtn.style.opacity = isReady ? 0.3 : 1;
      prevBtn.style.cursor = nextBtn.style.cursor = isReady
        ? "not-allowed"
        : "pointer";
    }

    showWarning(true);
    if (socket.connected && roomCode) {
      socket.emit("playerReady", { room: roomCode, ready: isReady });
    }
  };

// =====================
// 💬 แชท
// =====================
function addMsg(sender, text) {
  if (!chatBox) return;
  const p = document.createElement("p");
  p.innerHTML = `<b>${sender}:</b> ${text}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function sendMessage() {
  const text = (chatInput?.value || "").trim();
  if (!text || !socket.connected || !roomCode) return;
  socket.emit("chatMessage", { room: roomCode, text });
  chatInput.value = "";
}
if (sendBtn) sendBtn.onclick = sendMessage;
if (chatInput)
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

// ให้คลิกที่กล่องแชทแล้วโฟกัสอินพุท (ช่วยเวลา element อื่นเคยกินโฟกัส)
const chatContainer = document.querySelector(".chat-box");
if (chatContainer && chatInput) {
  chatContainer.addEventListener("mousedown", () => {
    // หน่วงนิดให้คลิกผ่านก่อนแล้วค่อยโฟกัส
    setTimeout(() => chatInput.focus(), 0);
  });
}

socket.on("chatMessage", (data) => addMsg(data.sender, data.text));

// =====================
// 👥 รายชื่อผู้เล่น & Auto start
// =====================
socket.on("updatePlayers", (playerList) => {
  if (playerListEl) {
    playerListEl.innerHTML = "";
    playerList.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.name} ${p.ready ? "✔️" : "⌛"}`;
      playerListEl.appendChild(li);
    });
  }
  const allReady = playerList.every((p) => p.ready);
  if (allReady && playerList.length > 1) {
    showWarning(true, "🚀 ทุกคนพร้อมแล้ว! เกมจะเริ่มใน 3...2...1...");
    startCountdown();
  }
});

// =====================
// 🔙 Back
// =====================
if (backBtn) backBtn.onclick = () => (location.href = "createroom.html");
