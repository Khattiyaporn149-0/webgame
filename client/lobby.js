// =====================
// 🌐 เชื่อมต่อเซิร์ฟเวอร์ Socket.IO
// =====================
const socket = io("https://webgame-25n5.onrender.com"); // ✅ Render URL จริง
const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");
document.getElementById("roomCodeText").textContent = roomCode;

if (window.hasOwnProperty("AccountCheck")) return;
window.AccountCheck = true;

// =====================
// 🚀 โหลดทุกอย่างเมื่อหน้าเว็บพร้อม
// =====================
window.addEventListener("load", () => {
  // =====================
  // 🧩 ตัวแปรหลัก
  // =====================
  const readyBtn = document.getElementById("readyBtn");
  const img = document.getElementById("charImage");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const chatBox = document.getElementById("chatMessages");
  const playerListEl = document.getElementById("playerList");
  const prevBtn = document.getElementById("prevChar");
  const nextBtn = document.getElementById("nextChar");

  let isReady = false;

  //sounds
  const bgm = new Audio("assets/sounds/galaxy-283941.mp3");
  const clickSound = new Audio("assets/sounds/click.mp3");

    bgm.loop = true; // ให้เล่นวนลูป
    bgm.volume = 0.5; // ปรับระดับเสียง 0.0 - 1.0
    bgm.play();


  // =====================
  // ⚠️ กล่องเตือน
  // =====================
  const warningBox = document.createElement("div");
  Object.assign(warningBox.style, {
    position: "fixed",
    bottom: "40px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(255,255,0,0.1)",
    border: "1px solid #ffd86b",
    color: "#ffd86b",
    fontWeight: "700",
    padding: "10px 20px",
    borderRadius: "10px",
    boxShadow: "0 0 15px rgba(255,255,0,0.3)",
    backdropFilter: "blur(5px)",
    display: "none",
    zIndex: "9999",
  });
  warningBox.textContent = "⚠ เกมจะเริ่มอัตโนมัติเมื่อผู้เล่นทุกคนกด READY!";
  document.body.appendChild(warningBox);

  const showWarning = (show = true, msg) => {
    warningBox.textContent =
      msg || "⚠ เกมจะเริ่มอัตโนมัติเมื่อผู้เล่นทุกคนกด READY!";
    warningBox.style.display = show ? "block" : "none";
    if (show) {
      warningBox.style.animation = "fadeInOut 1.5s ease";
      setTimeout(() => (warningBox.style.animation = ""), 1500);
    }
  };

  // =====================
  // 🟩 ปุ่ม READY
  // =====================
  readyBtn.addEventListener("click", () => {
    isReady = !isReady;
    readyBtn.textContent = isReady ? "READY ✔" : "UNREADY ✖";
    readyBtn.style.background = isReady
      ? "linear-gradient(135deg,#77FF6B,#4AFF59)"
      : "linear-gradient(135deg,#E02F2F,#C04125)";

    img.classList.toggle("ready-char", isReady);

    clickSound.currentTime = 0; clickSound.volume = state.sfx * state.volume; clickSound.play();
    prevBtn.disabled = nextBtn.disabled = isReady;
    prevBtn.style.opacity = nextBtn.style.opacity = isReady ? 0.3 : 1;
    prevBtn.style.cursor = nextBtn.style.cursor = isReady
      ? "not-allowed"
      : "pointer";

    showWarning(true);

    // ส่งสถานะไป server
    if (socket.connected) {
      socket.emit("playerReady", { room: roomCode, ready: isReady });
    }
  });

  // =====================
  // 💬 ระบบแชท
  // =====================
  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (text === "" || !socket.connected) return;
    socket.emit("chatMessage", { room: roomCode, text });
    chatInput.value = "";
  };

  sendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  socket.on("chatMessage", (data) => {
    const msgEl = document.createElement("div");
    msgEl.className = "chat-message";
    msgEl.innerHTML = `<strong>${data.sender}:</strong> ${data.text}`;
    chatBox.appendChild(msgEl);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // =====================
  // 👥 อัปเดตรายชื่อผู้เล่นในห้อง
  // =====================
  socket.on("updatePlayers", (playerList) => {
    playerListEl.innerHTML = "";
    playerList.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.name} ${p.ready ? "✔️" : "⌛"}`;
      playerListEl.appendChild(li);
    });

    const allReady = playerList.every((p) => p.ready);
    if (allReady && playerList.length > 1) {
      showWarning(true, "🚀 ทุกคนพร้อมแล้ว! เกมจะเริ่มใน 3...2...1...");
      setTimeout(() => {
        window.location.href = "game.html";
      }, 3000);
    }
  });

  // =====================
  // 🌌 พื้นหลัง: ดาวกระพริบ
  // =====================
  const drawBackground = () => {
    const canvas = document.getElementById("bgCanvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.6
    );
    gradient.addColorStop(0, "#1e2130");
    gradient.addColorStop(1, "#0b0d12");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const starCount = Math.min(
      100,
      Math.floor((canvas.width * canvas.height) / 8000)
    );
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 1.5 + 0.5;
      const alpha = Math.random() * 0.5 + 0.3;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawBackground();
  window.addEventListener("resize", drawBackground);
  setInterval(drawBackground, 10000);

  // =====================
  // 🧠 Debug / Reconnect
  // =====================
  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    socket.emit("joinRoom", roomCode);
  });

  socket.on("disconnect", () => {
    console.warn("⚠️ Disconnected from server.");
    showWarning(true, "⚠️ Lost connection. Trying to reconnect...");
  });

  socket.io.on("reconnect", (attempt) => {
    console.log("🔁 Reconnected after", attempt, "tries");
    showWarning(true, "✅ Reconnected to server!");
    socket.emit("joinRoom", roomCode);
  });
});
