import { auth, provider, signInWithPopup, rtdb, ref, set } from "./firebase.js";

// ============ 🎵 SOUND SYSTEM ============
if (!window.bgm) {
  window.bgm = new Audio("assets/sounds/galaxy-283941.mp3");
  window.bgm.loop = true;
  window.bgm.volume = 0.5;
  document.addEventListener("click", () => bgm.play().catch(() => {}), { once: true });
}
if (!window.clickSound) {
  window.clickSound = new Audio("assets/sounds/click.mp3");
  window.clickSound.volume = 0.8;
}

const bgm = window.bgm;
const clickSound = window.clickSound;

// ========= 🌐 GLOBAL STATE ==========
const state = {
  name: localStorage.getItem("ggd.name") || "Guest",
  uid: localStorage.getItem("ggd.uid") || null,
  music: parseFloat(localStorage.getItem("ggd.music") || "0.6"),
  sfx: parseFloat(localStorage.getItem("ggd.sfx") || "0.9"),
  master: parseFloat(localStorage.getItem("ggd.master") || "1"),
  region: localStorage.getItem("ggd.region") || "asia",
  version: "V.test1.2.2"
};

function saveState() {
  for (const k in state) {
    if (typeof state[k] !== "object") localStorage.setItem(`ggd.${k}`, state[k]);
  }
  updateVolumes();
}

function updateVolumes() {
  bgm.volume = state.master * state.music;
  clickSound.volume = state.master * state.sfx;
}
updateVolumes();

// ========== 🪄 BASIC UI HOOKS ==========
const startScreen = document.getElementById("startScreen");
const wrap = document.querySelector(".wrap");
const startBtn = document.getElementById("startBtn");
const loginBtn = document.getElementById("loginGoogleBtn");
const playerNameInput = document.getElementById("playerNameInput");
const playerNameStored = localStorage.getItem("ggd.name") || localStorage.getItem("playerName") || "";
if (playerNameInput) {
  playerNameInput.value = state.name !== "Guest" ? state.name : playerNameStored;
}
showStartScreen(); // เริ่มด้วยการโชว์หน้าตั้งชื่อก่อน

document.getElementById("playerNameTop").textContent = state.name;
document.getElementById("ver").textContent = state.version;


// ========= 🧠 START SCREEN =========
const btnProfile = document.getElementById("btnProfile");

function showStartScreen() {
  startScreen.classList.add("show"); // ✅ ใช้ class ไม่ใช้ fadeIn
  wrap.style.opacity = "0";
  wrap.style.pointerEvents = "none";
}

function hideStartScreen() {
  startScreen.classList.remove("show"); // ✅ เอา class ออก
  wrap.style.opacity = "1";
  wrap.style.pointerEvents = "auto";
}

function nameOk(n) {
  if (typeof n !== "string") return false;
  const t = n.trim();

  // ต้องมีความยาว 3–16 ตัวอักษร
  // และใช้เฉพาะ: ไทย อังกฤษ ตัวเลข ขีดกลาง ขีดล่าง
  const valid = /^[A-Za-z0-9\u0E00-\u0E7F_-]{3,16}$/;
  return valid.test(t);
}

startBtn?.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!nameOk(name)) return alert("❗ ชื่อต้องยาว 3–16 ตัวอักษร");
  clickSound.pause(); clickSound.currentTime = 0; clickSound.play();
  state.name = name;
  saveState();
  document.getElementById("playerNameTop").textContent = state.name;
  hideStartScreen();
});


// 🔐 GOOGLE LOGIN
loginBtn?.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    state.name = user.displayName;
    state.uid = user.uid;
    localStorage.setItem("ggd.uid", user.uid);
    saveState();

    // 🧾 Save to RTDB
    await set(ref(rtdb, `users/${user.uid}`), {
      name: user.displayName,
      email: user.email,
      photo: user.photoURL,
      lastLogin: new Date().toISOString()
    });

    alert(`🎉 Welcome ${user.displayName}`);
    hideStartScreen();
  } catch (err) {
    console.error(err);
    alert("❌ Login failed");
  }
});

// ถ้ามีชื่อแล้ว ให้ข้าม
window.addEventListener("DOMContentLoaded", () => {
  if (nameOk(state.name)) hideStartScreen();
  else showStartScreen();
});


// ========= 🧩 PROFILE MODAL =========
const profileModal = document.getElementById("profileModal");
const closeProfile = document.getElementById("closeProfile");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const displayNameEl = document.getElementById("displayName");
const editNameBtn = document.getElementById("editNameBtn");

// 🔹 element ของโหมดแก้ไข
const editNameGroup = document.getElementById("editNameGroup");
const editNameInput = document.getElementById("editNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const cancelNameBtn = document.getElementById("cancelNameBtn");

// เปิดโปรไฟล์
btnProfile?.addEventListener("click", () => {
  updateProfileUI();
  profileModal.classList.add("show");
});

// ปิดโปรไฟล์
closeProfile?.addEventListener("click", () => profileModal.classList.remove("show"));
profileModal?.addEventListener("click", (e) => {
  if (e.target === profileModal) profileModal.classList.remove("show");
});

// 🎯 อัปเดตข้อมูลในโปรไฟล์
function updateProfileUI() {
  displayNameEl.textContent = state.name || "Guest";

  if (state.uid) {
    googleLoginBtn.classList.add("disabled");
    googleLoginBtn.innerHTML = `<span>✅ You already logged in with Google</span>`;
  } else {
    googleLoginBtn.classList.remove("disabled");
    googleLoginBtn.innerHTML = `
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
      <span>Login with Google</span>
    `;
  }

  resetEditMode();
}

// 🎉 UNIVERSAL TOAST (ใช้ได้ทุกระบบ)
if (typeof window.showToast !== "function") {
  window.showToast = function (message, type = "info") {
    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "💬",
    };
    const icon = icons[type] || "";

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icon} ${message}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 2200);
  };
}


// ✏️ เข้าโหมดแก้ไข (พร้อมแอนิเมชัน)
editNameBtn?.addEventListener("click", () => {
  editNameInput.value = state.name;
  displayNameEl.classList.add("fade-out");
  editNameBtn.classList.add("fade-out");
  setTimeout(() => {
    displayNameEl.style.display = "none";
    editNameBtn.style.display = "none";
    editNameGroup.classList.remove("hidden");
    editNameGroup.classList.add("fade-in");
    editNameInput.focus();
  }, 200);
});

// 💾 บันทึกชื่อใหม่
saveNameBtn?.addEventListener("click", () => {
  const newName = editNameInput.value.trim();
  if (nameOk(newName)) {
    state.name = newName;
    saveState();
    updateProfileUI();
    document.getElementById("playerNameTop").textContent = state.name;
    showToast("✅ Name updated successfully!", "success");
  } else {
    showToast("⚠️ Name must be 3–16 characters", "error");
  }
});

// ❌ ยกเลิก
cancelNameBtn?.addEventListener("click", resetEditMode);

function resetEditMode() {
  editNameGroup.classList.remove("fade-in");
  editNameGroup.classList.add("fade-out");
  setTimeout(() => {
    editNameGroup.classList.add("hidden");
    displayNameEl.style.display = "inline";
    editNameBtn.style.display = "inline-flex";
    displayNameEl.classList.remove("fade-out");
    editNameBtn.classList.remove("fade-out");
    displayNameEl.classList.add("fade-in");
    editNameBtn.classList.add("fade-in");
  }, 200);
}

// 🔐 กด login ด้วย Google (ซ้ำ logic เดิม)
googleLoginBtn?.addEventListener("click", async () => {
  if (state.uid) return; // ป้องกันกดซ้ำ

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    state.name = user.displayName;
    state.uid = user.uid;
    localStorage.setItem("ggd.uid", user.uid);
    saveState();

    await set(ref(rtdb, `users/${user.uid}`), {
      name: user.displayName,
      email: user.email,
      photo: user.photoURL,
      lastLogin: new Date().toISOString()
    });

    updateProfileUI();
    alert(`🎉 Welcome ${user.displayName}`);
  } catch (err) {
    console.error(err);
    alert("❌ Login failed");
  }
});


// ========= main UI =========
const btnJoin = document.getElementById("btnJoin");
const btnCreate = document.getElementById("btnCreate");

btnJoin?.addEventListener("click", () => {
  const name = state.name?.trim() || displayNameEl?.textContent?.trim() || "";

  // เงื่อนไข: ถ้าไม่มีชื่อหรือชื่อไม่ผ่าน
  if (!nameOk(name) || name === "Guest" || name === "") {
    showStartScreen();
    return;
  }

  // ✅ ผ่านทุกอย่างแล้ว เข้าได้
  window.location.href = "roomlist.html";
});

btnCreate?.addEventListener("click", () => {
  const name = state.name?.trim() || displayNameEl?.textContent?.trim() || "";

  // เงื่อนไข: ถ้าไม่มีชื่อหรือชื่อไม่ผ่าน
  if (!nameOk(name) || name === "Guest" || name === "") {
    showStartScreen();
    return;
  }

  // ✅ ผ่านทุกอย่างแล้ว เข้าได้
  window.location.href = "createroom.html";
});


// ========= ⚙️ SETTINGS =========
const settingsModal = document.getElementById("settingsModal");
document.getElementById("btnSettingsTop")?.addEventListener("click", () => {
  settingsModal.classList.add("show");
  document.getElementById("rangeMaster").value = state.master;
  document.getElementById("rangeMusic").value = state.music;
  document.getElementById("rangeSfx").value = state.sfx;
  document.getElementById("regionSel").value = state.region;
});
document.getElementById("closeSettings")?.addEventListener("click", () => settingsModal.classList.remove("show"));

document.getElementById("rangeMaster")?.addEventListener("input", e => { state.master = +e.target.value; saveState(); });
document.getElementById("rangeMusic")?.addEventListener("input", e => { state.music = +e.target.value; saveState(); });
document.getElementById("rangeSfx")?.addEventListener("input", e => { state.sfx = +e.target.value; saveState(); });
document.getElementById("regionSel")?.addEventListener("change", e => { state.region = e.target.value; saveState(); });

// ========= ❓ TUTORIAL =========
const btnTutorial = document.getElementById("btnTutorial");
const btnTutorialStart = document.getElementById("btnTutorialStart");
const tutorialModal = document.getElementById("tutorialModal");
const closeTutorial = document.getElementById("closeTutorial");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

btnTutorial?.addEventListener("click", () => tutorialModal.classList.add("active"));
btnTutorialStart?.addEventListener("click", () => tutorialModal.classList.add("active"));
closeTutorial?.addEventListener("click", () => tutorialModal.classList.remove("active"));
tutorialModal?.addEventListener("click", e => { if (e.target === tutorialModal) tutorialModal.classList.remove("active"); });
tabButtons.forEach(btn => btn.addEventListener("click", () => {
  tabButtons.forEach(b => b.classList.remove("active"));
  tabPanes.forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
}));

// ========= 🪐 BACKGROUND STARS =========
const canvas = document.getElementById("bg-canvas");
if (canvas) {
  const ctx = canvas.getContext("2d");
  let w, h, stars = [];
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    stars = Array.from({length: Math.min(140, Math.floor(w*h/12000))}, () => ({
      x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.8 + 0.2, s: Math.random()*0.5 + 0.1
    }));
  }
  window.addEventListener("resize", resize);
  resize();
  (function loop(){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const st of stars) {
      ctx.globalAlpha = 0.4 + Math.sin((performance.now()/1000 + st.x)*st.s)*0.4;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(loop);
  })();
}

/* ===========================================================
 🎮 LEFT RAIL SYSTEM  (Clean & UI-ready Version)
    🎁 Gifts — daily reward
    🗂️ Missions — daily objectives
    🗓️ 7 Day(s) — login streak
    ⏰ Timer — event countdown
=========================================================== */

// 🧭 UTILITIES
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => new Date().toDateString();
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

// 🪄 SIMPLE POPUP (placeholder)
function showminiToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => toast.classList.remove("show"), 2000);
  setTimeout(() => toast.remove(), 2500);
}

// 🎁 GIFTS
const GiftSystem = {
  canOpen() {
    const last = +localStorage.getItem("giftTime") || 0;
    return Date.now() - last >= DAY_MS;
  },
  open() {
    if (!this.canOpen()) return showminiToast("🎁 You’ve already claimed today!");
    const pool = [
      "💎 +20 Gems",
      "🪙 +200 Coins",
      "🧠 +100 EXP",
      "🎨 Skin Token ×1",
    ];
    const reward = pool[Math.floor(Math.random() * pool.length)];
    localStorage.setItem("giftTime", Date.now());
    showminiToast(`🎁 ${reward}`);
    this.updateBadge();
  },
  updateBadge() {
    const badge = $(".rail-btn.gift .badge");
    badge.textContent = this.canOpen() ? "Ready" : "✓";
    badge.classList.toggle("glow", this.canOpen());
  },
};

// 🗂️ MISSIONS
const MissionSystem = {
  base: [
    { id: 1, text: "Play 2 matches", done: false },
    { id: 2, text: "Win 1 game", done: false },
    { id: 3, text: "Login today", done: false },
  ],
  load() {
    const saved = localStorage.getItem("missions");
    const date = localStorage.getItem("missionDate");
    if (date !== today() || !saved) {
      this.data = this.base.map((m) => ({ ...m, done: false }));
      localStorage.setItem("missionDate", today());
      localStorage.setItem("missions", JSON.stringify(this.data));
    } else {
      this.data = JSON.parse(saved);
    }
    this.updateBadge();
  },
  complete(id) {
    const mission = this.data.find((m) => m.id === id);
    if (mission && !mission.done) {
      mission.done = true;
      showminiToast(`✅ ${mission.text} complete!`);
      localStorage.setItem("missions", JSON.stringify(this.data));
      this.updateBadge();
    }
  },
  updateBadge() {
    const remain = this.data.filter((m) => !m.done).length;
    const badge = $(".rail-btn.missions .badge");
    badge.textContent = remain > 0 ? remain : "✓";
  },
};

// 🗓️ LOGIN STREAK
const LoginSystem = {
  init() {
    const last = localStorage.getItem("loginDate");
    const streak = +localStorage.getItem("streak") || 0;
    const isToday = last === today();
    if (isToday) return this.updateLabel(streak);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const newStreak = last === yesterday.toDateString() ? streak + 1 : 1;
    localStorage.setItem("streak", newStreak);
    localStorage.setItem("loginDate", today());
    this.updateLabel(newStreak);
    showminiToast(`📅 Login Streak: Day ${newStreak}/7`);
  },
  updateLabel(streak) {
    $(".rail-btn.calendar .label").textContent = `${streak} Day(s)`;
  },
};

// ⏰ BONUS TIMER
const BonusSystem = {
  start(hours = 2) {
    const end = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem("bonusEnd", end);
  },
  update() {
    const end = +localStorage.getItem("bonusEnd") || 0;
    const countdown = $("#countdown");
    const badge = $(".rail-btn.timer .badge");
    if (!end) return;
    const diff = end - Date.now();
    if (diff <= 0) {
      countdown.textContent = "00:00:00";
      badge.textContent = "Expired";
    } else {
      countdown.textContent = fmtTime(diff);
      badge.textContent = "Bonus ×3";
    }
  },
};

// 🚀 INIT
document.addEventListener("DOMContentLoaded", () => {
  GiftSystem.updateBadge();
  MissionSystem.load();
  LoginSystem.init();
  BonusSystem.update();
  setInterval(() => BonusSystem.update(), 1000);

  $(".rail-btn.gift").onclick = () => GiftSystem.open();
  $(".rail-btn.missions").onclick = () => showminiToast("📋 Missions popup soon!");
  $(".rail-btn.calendar").onclick = () => showminiToast("📅 Streak popup soon!");
  $(".rail-btn.timer").onclick = () => showminiToast("⏰ Bonus active!");
});


const collection = [
  { id: 1, name: "Golden Mask", rare: "legendary", owned: false },
  { id: 2, name: "Silver Key", rare: "rare", owned: true },
  { id: 3, name: "Museum Ticket", rare: "common", owned: true },
];

function openCollection() {
  // TODO: แสดง modal หรือหน้ารวม item
  console.log("🧳 Collection:", collection);
  showToast("📦 Opened your collection!");
}
document.getElementById("btnCollection").addEventListener("click", openCollection);
