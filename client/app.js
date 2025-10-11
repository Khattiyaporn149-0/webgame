import { auth, provider, signInWithPopup, rtdb, ref, set } from "./firebase.js";



// 🧩 Auto-generate guest UID ถ้าไม่มี
if (!localStorage.getItem("ggd.uid")) {
  const guest = crypto.randomUUID ? crypto.randomUUID() : "uid_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("ggd.uid", guest);
  localStorage.setItem("ggd.name", "Guest");
  // ระบุสถานะ auth เป็น guest (กันสับสนว่าเป็น Google)
  if (!localStorage.getItem("ggd.auth")) {
    localStorage.setItem("ggd.auth", "guest");
  }
}

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
  version: "V.test1.3.2"
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

// Startup gating: if a valid name already exists, keep the start screen hidden
(function ensureStartScreenState(){
  try {
    const stored = localStorage.getItem("ggd.name") || localStorage.getItem("playerName") || "";
    const candidate = state.name !== "Guest" ? state.name : stored;
    if (nameOk(candidate) && candidate !== "Guest") {
      if (state.name === "Guest") { state.name = candidate; saveState(); }
      hideStartScreen();
      const top = document.getElementById("playerNameTop");
      if (top) top.textContent = state.name;
    }
  } catch {}
})();

startBtn?.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!nameOk(name)) return alert("❗ ชื่อต้องยาว 3–16 ตัวอักษร");
  clickSound.pause(); clickSound.currentTime = 0; clickSound.play();
  state.name = name;
  saveState();
  document.getElementById("playerNameTop").textContent = state.name;
  hideStartScreen();
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


// Helper: ตรวจสอบสถานะว่าเป็น Google Login จริงไหม
function isGoogleLoggedIn() {
  return localStorage.getItem("ggd.auth") === "google";
}

// 🔐 GOOGLE LOGIN (รวม logic ไว้ที่เดียว ใช้ซ้ำได้)
async function handleGoogleLogin(trigger = "start") {
  try {
    // ✅ popup login
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // ✅ บันทึกสถานะใน localStorage / state
    state.name = user.displayName || "Unknown";
    state.uid = user.uid;
    localStorage.setItem("ggd.name", state.name);
    localStorage.setItem("ggd.uid", state.uid);
    // ระบุว่าเป็นการล็อกอินด้วย Google ชัดเจน
    localStorage.setItem("ggd.auth", "google");
    saveState();

    // ✅ อัปเดต Realtime DB (เก็บข้อมูลผู้ใช้)
    // แนะนำใช้ path /users_safe/ (กัน permission clash)
    await set(ref(rtdb, `users_safe/${user.uid}`), {
      name: state.name,
      email: user.email,
      photo: user.photoURL,
      lastLogin: new Date().toISOString(),
    });

    showToast(`🎉 Welcome ${state.name}!`, "success");
    updateProfileUI();
    hideStartScreen();
  } catch (err) {
    console.error("❌ Login failed:", err);
    showToast("⚠️ Google login failed", "error");
  }
}


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
  // ✅ ป้องกันกรณี modal ยังไม่ render ตอนเรียก
  if (!googleLoginBtn || !displayNameEl) return;

  // ✅ อัปเดตชื่อในโปรไฟล์
  displayNameEl.textContent = state.name || "Guest";

  // ✅ อัปเดตปุ่ม Google Login ตามสถานะ (ดูจาก flag ไม่ใช่แค่มี guest uid)
  if (isGoogleLoggedIn()) {
    googleLoginBtn.classList.add("disabled");
    googleLoginBtn.innerHTML = `<span>✅ You already logged in with Google</span>`;
  } else {
    googleLoginBtn.classList.remove("disabled");
    googleLoginBtn.innerHTML = `
      <img 
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
        alt="Google" 
        style="width:20px;height:20px;margin-right:8px;vertical-align:middle;"
      />
      <span>Login with Google</span>
    `;
  }

  // ✅ reset โหมดแก้ไขชื่อเสมอ (กันค้าง)
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
  settingsModal.setAttribute('aria-hidden','false');
  settingsModal.classList.add("show");
  document.getElementById("rangeMaster").value = state.master;
  document.getElementById("rangeMusic").value = state.music;
  document.getElementById("rangeSfx").value = state.sfx;
  document.getElementById("regionSel").value = state.region;
});
document.getElementById("closeSettings")?.addEventListener("click", () => { settingsModal.classList.remove("show"); settingsModal.setAttribute('aria-hidden','true'); });
settingsModal?.addEventListener('click', (e)=>{ if (e.target === settingsModal) { settingsModal.classList.remove('show'); settingsModal.setAttribute('aria-hidden','true'); }});

document.getElementById("rangeMaster")?.addEventListener("input", e => { state.master = +e.target.value; saveState(); });
document.getElementById("rangeMusic")?.addEventListener("input", e => { state.music = +e.target.value; saveState(); });
document.getElementById("rangeSfx")?.addEventListener("input", e => { state.sfx = +e.target.value; saveState(); });
document.getElementById("regionSel")?.addEventListener("change", e => { state.region = e.target.value; saveState(); });

// ========= ❓ TUTORIAL =========
const btnTutorial = document.getElementById("btnTutorial");
const tutorialModal = document.getElementById("tutorialModal");
const closeTutorial = document.getElementById("closeTutorial");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

btnTutorial?.addEventListener("click", () => { tutorialModal.setAttribute('aria-hidden','false'); tutorialModal.classList.add("active"); });
closeTutorial?.addEventListener("click", () => { tutorialModal.classList.remove("active"); tutorialModal.setAttribute('aria-hidden','true'); });
tutorialModal?.addEventListener("click", e => { if (e.target === tutorialModal) { tutorialModal.classList.remove("active"); tutorialModal.setAttribute('aria-hidden','true'); } });
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
  const container = document.getElementById("toast-container") || (() => {
    const div = document.createElement("div");
    div.id = "toast-container";
    div.style.position = "fixed";
    div.style.bottom = "20px";
    div.style.right = "20px";
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.gap = "8px";
    document.body.appendChild(div);
    return div;
  })();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);

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

  // ✅ ปุ่ม Login ทำงานหลัง DOM โหลดครบ
  const loginBtn = document.getElementById("loginGoogleBtn");
  const googleLoginBtn = document.getElementById("googleLoginBtn");

  // ปุ่มหน้าเริ่มต้น: ให้กดเพื่อเข้าสู่ระบบ Google ได้ทันที
  loginBtn?.addEventListener("click", () => handleGoogleLogin("start"));

  // ปุ่มในโปรไฟล์: อนุญาตเฉพาะตอนยังไม่ได้ล็อกอินด้วย Google
  googleLoginBtn?.addEventListener("click", () => {
    if (!isGoogleLoggedIn()) handleGoogleLogin("profile");
  });

});

// Global stacked toast (override to stack instead of overlap)
(function installStackedToast(){
  const stacked = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    const maxToasts = 5;
    while (container.children.length > maxToasts) container.firstElementChild?.remove();
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 300); }, 2400);
  };
  window.showToast = stacked;
})();


const collection = [
  { id: 1, name: "Golden Mask", rare: "legendary", owned: false },
  { id: 2, name: "Silver Key", rare: "rare", owned: true },
  { id: 3, name: "Museum Ticket", rare: "common", owned: true },
  { id: 4, name: "Ancient Coin", rare: "epic", owned: false },
  { id: 5, name: "Heist Blueprint", rare: "rare", owned: false },
];

// (Collection modal managed in enforceStandaloneCollectionModal)
// Safety override: ensure Join/Create always navigate (auto-generate name if missing)
(() => {
  const bindSafeNav = (id, href) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.navbound === '1') return;
    el.dataset.navbound = '1';
    el.addEventListener('click', () => {
      let name = (typeof state?.name === 'string' ? state.name.trim() : '') || '';
      if (!nameOk(name) || name === 'Guest' || name === '') {
        name = localStorage.getItem('ggd.name') || localStorage.getItem('playerName') || `Player_${Math.random().toString(36).slice(2,7)}`;
        if (state) state.name = name;
        try { saveState && saveState(); } catch {}
        try { hideStartScreen && hideStartScreen(); } catch {}
      }
      window.location.href = href;
    });
  };
  bindSafeNav('btnJoin', 'roomlist.html');
  bindSafeNav('btnCreate', 'createroom.html');
})();

// Strong override for Collection modal to be independent from tutorial
(function enforceStandaloneCollectionModal(){
  function ensureCollectionModal(){
    let modal = document.getElementById('collectionModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'collectionModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden','true');
      modal.innerHTML = `
        <div class="coll-dialog">
          <div class="coll-head">
            <h3>📦 COLLECTION</h3>
            <button class="x" id="closeCollection">✕</button>
          </div>
          <div class="coll-body" id="collectionGrid"></div>
        </div>`;
      document.body.appendChild(modal);
    } else {
      try { if (modal.closest('#tutorialModal')) document.body.appendChild(modal); } catch {}
    }
    // Robust close handling: backdrop and close button via delegation
    if (!modal.dataset.boundBackdrop) {
      modal.dataset.boundBackdrop = '1';
      modal.addEventListener('click', (e)=>{
        if (e.target === modal) {
          modal.classList.remove('show');
          modal.setAttribute('aria-hidden','true');
          return;
        }
        const isClose = (e.target.id === 'closeCollection') || (e.target.closest && e.target.closest('#closeCollection'));
        if (isClose) {
          modal.classList.remove('show');
          modal.setAttribute('aria-hidden','true');
        }
      });
    }
  }

  function renderCollectionGridLive(){
    const grid = document.getElementById('collectionGrid');
    if (!grid) return;
    const badge = (rare) => {
      const colors = { legendary:'#f1c40f', epic:'#9b59b6', rare:'#3498db', common:'#7f8c8d' };
      const c = colors[rare] || '#7f8c8d';
      return `<span class="rare" style="background:${c}20;border:1px solid ${c}55;color:${c}">${rare.toUpperCase()}</span>`;
    };
    grid.innerHTML = (Array.isArray(collection)?collection:[]).map(it => `
      <div class="coll-card ${it.owned ? 'owned' : ''}" title="${it.name}">
        <div class="thumb">${it.owned ? '★' : '☆'}</div>
        <div class="meta">
          <div class="name">${it.name}</div>
          ${badge(it.rare)}
        </div>
      </div>
    `).join('');
  }

  function openCollectionStandalone(){
    const tut = document.getElementById('tutorialModal');
    if (tut) { tut.classList.remove('active'); tut.classList.remove('active'); tut.setAttribute('aria-hidden','true'); }
    ensureCollectionModal();
    renderCollectionGridLive();
    const modal = document.getElementById('collectionModal');
    if (modal) {
      modal.style.zIndex = '10000';
      modal.setAttribute('aria-hidden','false');
      modal.classList.add('show');
    }
  }

  // Capture-phase handlers for all collection buttons
  const bind = () => {
    document.querySelectorAll('#btnCollection, #btnCollectionTop').forEach((btn)=>{
      if (btn.dataset.collBound === '1') return;
      btn.dataset.collBound = '1';
      try { btn.onclick = null; } catch {}
      btn.addEventListener('click', (e)=>{ e.stopImmediatePropagation(); e.preventDefault?.(); openCollectionStandalone(); }, true);
    });
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') bind();
  else document.addEventListener('DOMContentLoaded', bind, { once: true });
})();

// Harden Settings and Tutorial modal openers (bind all duplicates, unified behavior)
(function hardenCoreModals(){
  function openModal(modal){
    if (!modal) return;
    modal.setAttribute('aria-hidden','false');
    modal.classList.add('active');
  }
  function closeModal(modal){
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden','true');
  }
  function bindModalOpeners(buttonSelector, modalId, closeBtnId){
    const nodes = document.querySelectorAll(buttonSelector);
    const modal = document.getElementById(modalId);
    if (!nodes.length || !modal) return;
    // Close on backdrop
    if (!modal.dataset.backdropBound){
      modal.dataset.backdropBound = '1';
      modal.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(modal); });
    }
    // Close button
    if (closeBtnId){
      const x = document.getElementById(closeBtnId);
      if (x && !x.dataset.xBound){ x.dataset.xBound='1'; x.addEventListener('click', ()=> closeModal(modal)); }
    }
    nodes.forEach((btn)=>{
      if (btn.dataset.modalBound === modalId) return;
      btn.dataset.modalBound = modalId;
      try { btn.onclick = null; } catch {}
      btn.addEventListener('click', (e)=>{
        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
        try { e.preventDefault && e.preventDefault(); } catch {}
        openModal(modal);
      }, true);
    });

    // Global delegated fallback (handles late/duplicate DOM)
    if (!modal.dataset.delegatedOpen){
      modal.dataset.delegatedOpen = '1';
      document.addEventListener('click', (e)=>{
        const hit = e.target && (e.target.id === buttonSelector.replace('#','') || (e.target.closest && e.target.closest(buttonSelector)));
        if (hit) {
          try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
          try { e.preventDefault && e.preventDefault(); } catch {}
          openModal(modal);


          
        }
      }, true);
    }
  }
  const init = ()=>{
    bindModalOpeners('#btnSettingsTop', 'settingsModal', 'closeSettings');
    bindModalOpeners('#btnTutorial', 'tutorialModal', 'closeTutorial');
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();




