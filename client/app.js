/* ===========================================================
 🎮 THE HEIST - MAIN FRONT SCRIPT (Clean & Stable)
    Features:
    - Persistent BGM + SFX
    - Universal Settings system
    - Popup Modals (Settings / Tutorial / Login / Profile)
    - Firebase Auth integration
    - Start screen gate
    - Animated background
=========================================================== */

// ============ 🧭 UTILITIES ============
function $(id) { return document.getElementById(id); }
function safe(id, fn) { const el = $(id); if (el) fn(el); return el; }

// ============ 🎵 AUDIO SYSTEM ============
if (window.GameAudio) window.GameAudio.init();

const bgm = window.bgm;
const clickSound = window.clickSound;

// Resume bgm point
window.addEventListener("DOMContentLoaded", () => {
  const last = parseFloat(localStorage.getItem("bgmTime") || "0");
  if (bgm && !isNaN(last)) bgm.currentTime = last;
});

// Save bgm point before leave
window.addEventListener("beforeunload", () => {
  if (bgm && !bgm.paused) {
    localStorage.setItem("bgmTime", bgm.currentTime);
  }
});

// ============ ⚙️ SETTINGS ============
window.GameSettings = window.GameSettings || {
  data: JSON.parse(localStorage.getItem("gameSettings") || '{"master":1,"music":0.8,"sfx":0.8,"region":"asia"}'),
  get() { return this.data; },
  set(newData) {
    Object.assign(this.data, newData);
    localStorage.setItem("gameSettings", JSON.stringify(this.data));
    updateAudioVolumes();
  }
};

function updateAudioVolumes() {
  const s = GameSettings.get();
  if (bgm) bgm.volume = s.master * s.music;
  if (clickSound) clickSound.volume = s.master * s.sfx;
}
updateAudioVolumes();

// ============ 🪟 MODAL CONTROL ============
function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.style.display = "flex";
  el.style.zIndex = "10001";
  el.style.pointerEvents = "auto";
  el.setAttribute("aria-hidden", "false");
  if (id === 'accountModal') {
    const start = $('startScreen');
    if (start && start.style.display !== 'none') start.style.display = 'none';
  }
}
function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.style.display = "none";
  el.style.pointerEvents = "none";
  el.setAttribute("aria-hidden", "true");
}

// ============ 🧱 BACKGROUND CANVAS ============
const canvas = $('bg-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, stars;
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    stars = Array.from({length: Math.min(140, Math.floor(w*h/12000))}, () => ({
      x: Math.random()*w,
      y: Math.random()*h,
      r: Math.random()*1.8 + 0.2,
      s: Math.random()*0.5 + 0.1
    }));
  }
  window.addEventListener('resize', resize);
  resize();
  (function loop(){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const st of stars) {
      ctx.globalAlpha = 0.4 + Math.sin((performance.now()/1000 + st.x)*st.s)*0.4;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(loop);
  })();
}

// ============ 🧠 STATE ============
const state = {
  name: localStorage.getItem('ggd.name') || 'Guest',
  version: 'V.test1.2.0'
};
safe('playerNameTop', el => el.textContent = state.name);
safe('ver', el => el.textContent = state.version);

// ============ ⏰ COUNTDOWN ============
let remaining = 24*60*60;
const elCountdown = $('countdown');
if (elCountdown) {
  setInterval(() => {
    remaining = Math.max(0, remaining-1);
    const hh = String(Math.floor(remaining/3600)).padStart(2,'0');
    const mm = String(Math.floor((remaining%3600)/60)).padStart(2,'0');
    const ss = String(remaining%60).padStart(2,'0');
    elCountdown.textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}

// ============ 🪪 START SCREEN ============
const startScreen = $('startScreen');
const playerNameInput = $('playerNameInput');
const startBtn = $('startBtn');

const nameOk = (n) => n && n.trim().length >= 3 && n.trim().length <= 16;
function applyName(t) {
  state.name = t.trim();
  localStorage.setItem("ggd.name", state.name);
  $('playerNameTop').textContent = state.name;
}
function showStartScreen() {
  startScreen.style.display = "grid";
  document.querySelector(".wrap").style.display = "none";
  playerNameInput.value = (state.name && state.name !== 'Guest') ? state.name : '';
}
function hideStartScreen() {
  startScreen.style.display = "none";
  const wrap = document.querySelector(".wrap");
  wrap.style.display = "grid";
  requestAnimationFrame(() => wrap.classList.add("show"));
}

safe('startBtn', el => el.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!nameOk(name)) return alert("❗ กรุณากรอกชื่อยาว 3–16 ตัวอักษร");
  if (window.GameAudio) window.GameAudio.playClick();
  applyName(name);
  hideStartScreen();
}));
safe('playerNameInput', el => el.addEventListener("keydown", e => {
  if (e.key === "Enter") $('startBtn').click();
}));

window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("ggd.name");
  if (saved && nameOk(saved)) {
    applyName(saved);
    hideStartScreen();
  } else showStartScreen();
});

// ============ ⚙️ SETTINGS POPUP ============
safe('btnSettingsTop', btn => btn.addEventListener('click', ()=> openModal('settingsModal')));
safe('closeSettings', btn => btn.addEventListener('click', ()=> closeModal('settingsModal')));

['rangeMaster','rangeMusic','rangeSfx'].forEach(id=>{
  safe(id, el => el.addEventListener('input', e => GameSettings.set({ 
    [id.replace('range','').toLowerCase()]: +e.target.value 
  })));
});
safe('regionSel', el => el.addEventListener('change', e => GameSettings.set({ region: e.target.value })));
// Support new suffixed controls in index.html
['rangeMaster_s','rangeMusic_s','rangeSfx_s'].forEach(id=>{
  safe(id, el => el.addEventListener('input', e => GameSettings.set({ 
    [id.replace('range','').replace('_s','').toLowerCase()]: +e.target.value 
  })));
});
safe('regionSel_s', el => el.addEventListener('change', e => GameSettings.set({ region: e.target.value })));

// ============ 🧩 TUTORIAL ============
safe('btnTutorial', btn => btn.addEventListener('click', ()=> openModal('tutorialModal')));
safe('closeTutorial', btn => btn.addEventListener('click', ()=> closeModal('tutorialModal')));
safe('tutorialModal', modal => modal.addEventListener('click', e => { if (e.target===modal) closeModal('tutorialModal'); }));

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============ 🪩 BUTTON ACTIONS ============
safe('btnJoin', btn => btn.addEventListener('click', () => window.location.href='roomlist.html'));
safe('btnCreate', btn => btn.addEventListener('click', () => window.location.href='createroom.html'));
safe('btnClassic', btn => btn.addEventListener('click', ()=> alert('🎵 สลับเพลงธีม/โหมดคลาสสิก')));
safe('btnFriends', btn => btn.addEventListener('click', ()=> alert('👥 เปิดรายชื่อเพื่อน')));
safe('btnWorld', btn => btn.addEventListener('click', ()=> alert('🌍 เลือกภูมิภาค/ภาษา')));

// Profile button -> unified account modal
safe('btnProfile', btn => btn.addEventListener('click', () => {
  openModal('accountModal');
  if (typeof updateAccountView === 'function') updateAccountView();
}));

// ============ 🔐 FIREBASE LOGIN ============
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, doc, setDoc } from "./firebase.js";

const playerNameTop = $('playerNameTop');
const btnLoginGoogle = $('btnLoginGoogle');
// unified account modal elements
const accountModal = $('accountModal');
const closeAccount = $('closeAccount');
const profileName = $('profileName');
const profileEmail = $('profileEmail');
const profilePic = $('profilePic');
const btnLogout = $('btnLogout');
const guestView = $('guestView');
const userView = $('userView');
const playerNameInput2 = $('playerNameInput2');
const startBtn2 = $('startBtn2');

function updateAccountView() {
  const user = auth.currentUser;
  if (user) {
    if (guestView) guestView.style.display = 'none';
    if (userView) userView.style.display = 'block';
    if (profileName) profileName.textContent = user.displayName || 'Unknown';
    if (profileEmail) profileEmail.textContent = user.email || '';
    if (profilePic) profilePic.src = user.photoURL || 'assets/default-avatar.png';
  } else {
    if (guestView) guestView.style.display = 'block';
    if (userView) userView.style.display = 'none';
  }
}

safe('closeAccount', el => el.addEventListener('click', ()=> closeModal('accountModal')));
safe('startBtn2', el => el.addEventListener('click', ()=> {
  if (playerNameInput2 && playerNameInput2.value && nameOk(playerNameInput2.value)) {
    applyName(playerNameInput2.value);
    closeModal('accountModal');
  }
}));

safe('btnLoginGoogle', el => el.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    await setDoc(doc(db, "users", user.uid), {
      name: user.displayName,
      email: user.email,
      coins: 0,
      lastLogin: new Date()
    }, { merge: true });
    if (playerNameTop) playerNameTop.textContent = user.displayName || 'Guest';
    updateAccountView();
    closeModal('accountModal');
  } catch (err) {
    console.error("❌ Login failed:", err);
    alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
  }
}));

onAuthStateChanged(auth, (user) => {
  playerNameTop.textContent = user ? user.displayName : "Guest";
});

safe('btnLogout', el => el.addEventListener("click", async () => {
  await signOut(auth);
  closeModal('profileModal');
  playerNameTop.textContent = "Guest";
  alert("ออกจากระบบเรียบร้อยแล้ว");
}));

// Gift button forces login
safe('btnGift', el => el.addEventListener("click", () => {
  if (!auth.currentUser) openModal('loginModal');
  else alert("🎁 คุณได้รับ 50 Coins!");
}));
