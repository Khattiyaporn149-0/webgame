/* ===========================================================
 🎮 THE HEIST - MAIN FRONT SCRIPT (Stable Synced Version)
=========================================================== */

// ============ 🧭 UTILITIES ============
function $(id) { return document.getElementById(id); }
function safe(id, fn) { const el = $(id); if (el) fn(el); return el; }

// ============ 🎵 AUDIO SYSTEM ============
if (window.GameAudio) window.GameAudio.init();
const bgm = window.bgm;
const clickSound = window.clickSound;

// Resume BGM point
window.addEventListener("DOMContentLoaded", () => {
  const last = parseFloat(localStorage.getItem("bgmTime") || "0");
  if (bgm && !isNaN(last)) bgm.currentTime = last;
});

// Save BGM point before leave
window.addEventListener("beforeunload", () => {
  if (bgm && !bgm.paused) localStorage.setItem("bgmTime", bgm.currentTime);
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
  el.style.pointerEvents = "auto";
  el.setAttribute("aria-hidden", "false");
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
});

/* ==============================
 🧩 ตัวอย่างการใช้เสียง
============================== */

// กด Start แล้วเริ่มเพลง
document.addEventListener("click", () => {
  bgm.play().catch(()=>{});
}, { once: true });

// กดปุ่มใดๆ แล้วเล่นเสียงคลิก
document.addEventListener("click", () => {
  if (window.GameAudio) window.GameAudio.playClick();
  else { try { clickSound.currentTime = 0; clickSound.play(); } catch {} }
});

// ---- Background canvas particles (lightweight) ----
const canvas = document.getElementById('bg-canvas');
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

// ---- State & persistence ----
const state = {
  name: localStorage.getItem('ggd.name') || 'Guest',
  volume: parseFloat(localStorage.getItem('ggd.vol') || '0.8'),
  music: parseFloat(localStorage.getItem('ggd.music') || '0.6'),
  sfx: parseFloat(localStorage.getItem('ggd.sfx') || '0.9'),
  region: localStorage.getItem('ggd.region') || 'asia',
  version: 'V.test1.2.0' // เปลี่ยนเวอร์ชันตรงนี้เมื่ออัปเดตเกม
};
document.getElementById('playerNameTop').textContent = state.name;
document.getElementById('ver').textContent = state.version;

// ---- Countdown (left rail) ----
let remaining = 24*60*60; // 24h demo
const elCountdown = document.getElementById('countdown');
setInterval(() => {
  remaining = Math.max(0, remaining-1);
  const hh = String(Math.floor(remaining/3600)).padStart(2,'0');
  const mm = String(Math.floor((remaining%3600)/60)).padStart(2,'0');
  const ss = String(remaining%60).padStart(2,'0');
  elCountdown.textContent = `${hh}:${mm}:${ss}`;
}, 1000);

// -------------- Name Gate (Start Screen) --------------
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const playerNameInput = document.getElementById("playerNameInput");

// rule: 3–16 chars, allow Thai/English/digits/space/_/-
const nameOk = (n) => {
  if (!n) return false;
  const t = n.trim();
  if (t.length < 3 || t.length > 16) return false;
  // อนุญาตทั่วไป ถ้าจะเข้มงวดขึ้นใช้ regex: /^[\\p{L}\\p{N} _-]+$/u
  return true;
};

function applyName(t) {
  state.name = t.trim();
  localStorage.setItem("ggd.name", state.name);
  document.getElementById("playerNameTop").textContent = state.name;
}

function showStartScreen() {
  startScreen.style.display = "grid";
  document.querySelector(".wrap").style.display = "none";
  playerNameInput.value = (state.name && state.name !== 'Guest') ? state.name : '';
  playerNameInput.focus();
}

function hideStartScreen() {
  startScreen.style.display = "none";
  const wrap = document.querySelector(".wrap");
  wrap.style.display = "grid";
  requestAnimationFrame(() => wrap.classList.add("show")); // ✨ เพิ่มตรงนี้
}


startBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!nameOk(name)) {
    alert("❗ กรุณากรอกชื่อยาว 3–16 ตัวอักษร");
    return;
  }
  clickSound.currentTime = 0; clickSound.volume = state.sfx * state.volume; clickSound.play();
  applyName(name);
  hideStartScreen();
});

// Enter เพื่อยืนยันชื่อ
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startBtn.click();
});

// แสดง start screen ถ้ายังไม่มีชื่อจริง ๆ
window.addEventListener("DOMContentLoaded", () => {
  const savedName = localStorage.getItem("ggd.name");
  if (savedName && nameOk(savedName)) {
    applyName(savedName);
    hideStartScreen();
  } else {
    showStartScreen();
  }
});

// helper: บังคับให้มีชื่อก่อน ถึงจะทำ action
const requireNameThen = (fn) => (...args) => {
  const saved = localStorage.getItem("ggd.name");
  if (!saved || !nameOk(saved)) {
    showStartScreen();
    return;
  }
  applyName(saved);
  fn(...args);
};

// ---- Buttons ----
const settingsModal = document.getElementById('settingsModal');
document.getElementById('btnSettingsTop').addEventListener('click', () => {
  settingsModal.classList.add('show');
  // sync sliders
  if (window.GameSettings) {
    const s = window.GameSettings.get();
    document.getElementById('rangeMaster').value = s.master;
    document.getElementById('rangeMusic').value = s.music;
    document.getElementById('rangeSfx').value = s.sfx;
    document.getElementById('regionSel').value = s.region;
  }
});
document.getElementById('closeSettings').addEventListener('click', () => {
  settingsModal.classList.remove('show');
});

document.getElementById('rangeMaster').addEventListener('input', e => {
  state.volume = +e.target.value; localStorage.setItem('ggd.vol', state.volume);
});
document.getElementById('rangeMusic').addEventListener('input', e => {
  state.music = +e.target.value; localStorage.setItem('ggd.music', state.music);
});
document.getElementById('rangeSfx').addEventListener('input', e => {
  state.sfx = +e.target.value; localStorage.setItem('ggd.sfx', state.sfx);
});
document.getElementById('regionSel').addEventListener('change', e => {
  state.region = e.target.value; localStorage.setItem('ggd.region', state.region);
});

// Primary actions (hook here)
document.getElementById('btnJoin').addEventListener('click', () => {
  window.location.href = '/client/roomlist.html';

  // TODO: window.startGame && window.startGame({ mode: 'quick', ...state });
});
document.getElementById('btnCreate').addEventListener('click', () => {
  window.location.href = '/client/createroom.html';
});

// Extra buttons
document.getElementById('btnClassic').addEventListener('click', ()=> alert('สลับเพลงธีม/โหมดคลาสสิก'));
document.getElementById('btnFriends').addEventListener('click', ()=> alert('เปิดรายชื่อเพื่อน'));

// ปุ่มรูปคน: ให้เปลี่ยนชื่อเมื่อไรก็ได้
document.getElementById('btnProfile').addEventListener('click', ()=> {
  showStartScreen(); // เปิดหน้าตั้งชื่อเหมือนตอนเริ่มเกม
});

document.getElementById('btnWorld').addEventListener('click', ()=> alert('เลือกภูมิภาค/ภาษา'));

// Keyboard shortcut: ถ้าหน้า start ยังเปิดอยู่ ให้ Enter เป็นยืนยันชื่อ
window.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (startScreen.style.display !== 'none') {
      startBtn.click();
    } else {
      document.getElementById('btnCreate').click();
    }
    requestAnimationFrame(loop);
  })();
}

// ============ 🧠 STATE ============
const state = {
  name: localStorage.getItem('ggd.name') ,
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

// ============ ⚙️ SETTINGS POPUP ============
safe('btnSettingsTop', btn => btn.addEventListener('click', ()=> openModal('settingsModal')));
safe('closeSettings', btn => btn.addEventListener('click', ()=> closeModal('settingsModal')));

['rangeMasterSet','rangeMusicSet','rangeSfxSet'].forEach(id=>{
  safe(id, el => el.addEventListener('input', e => GameSettings.set({
    [id.replace('Set','').replace('range','').toLowerCase()]: +e.target.value
  })));
});
safe('regionSelSet', el => el.addEventListener('change', e => GameSettings.set({ region: e.target.value })));

// ============ 🧩 TUTORIAL ============
safe('btnTutorial', btn => btn.addEventListener('click', ()=> openModal('tutorialModal')));
safe('closeTutorial', btn => btn.addEventListener('click', ()=> closeModal('tutorialModal')));
safe('tutorialModal', modal => modal.addEventListener('click', e => { if (e.target===modal) closeModal('tutorialModal'); }));

// Tabs switching
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

// ============ 👤 PROFILE BUTTON + ACCOUNT MODAL ============

// อ่านค่าชื่อจาก localStorage
let storedName = localStorage.getItem('ggd.name');
const user = { displayName: storedName || null };

// // 🧩 ให้เด้ง popup แค่ตอนแรกที่ยังไม่มีชื่อ
// window.addEventListener("DOMContentLoaded", () => {
//   const alreadyPrompted = localStorage.getItem("ggd.prompted");

//   // ถ้าไม่มีชื่อ + ยังไม่เคยเด้ง
//   if ((!storedName || storedName.trim() === "") && !alreadyPrompted) {
//     openModal("accountModal");
//     localStorage.setItem("ggd.prompted", "1"); // กันไม่ให้เด้งซ้ำ
//   }
// });

// 🎯 ปุ่ม Profile — ถ้ายังไม่มีชื่อให้เปิด modal, ถ้ามีก็แสดงข้อมูล
safe('btnProfile', btn => btn.addEventListener('click', () => {
  const name = localStorage.getItem('ggd.name');
  if (!name || name.trim() === "") {
    // ยังไม่เคยตั้งชื่อ
    openModal('accountModal');
  } else {
    // มีชื่อแล้ว = เปิดดูข้อมูล account ได้
    openModal('accountModal');
  }
}));

// ปุ่มปิด modal
safe('closeAccount', btn => btn.addEventListener('click', () => closeModal('accountModal')));

// ปิดเมื่อคลิกนอกกรอบ
safe('accountModal', modal => modal.addEventListener('click', e => {
  if (e.target === modal) closeModal('accountModal');
}));

// ============ 🔐 FIREBASE LOGIN ============
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, doc, setDoc } from "./firebase.js";

const playerNameTop = $('playerNameTop');
const btnLoginGoogle = $('btnLoginGoogle');
const profileName = $('profileName');
const profileEmail = $('profileEmail');
const profilePic = $('profilePic');
const btnLogout = $('btnLogout');
const guestView = $('guestView');
const userView = $('userView');
const startBtn = $('startBtn');
const playerNameInput = $('playerNameInput');

function updateAccountView() {
  const user = auth.currentUser;
  if (user) {
    guestView.style.display = 'none';
    userView.style.display = 'block';
    profileName.textContent = user.displayName || 'Unknown';
    profileEmail.textContent = user.email || '';
    profilePic.src = user.photoURL || 'assets/default-avatar.png';
  } else {
    guestView.style.display = 'block';
    userView.style.display = 'none';
  }
}

// Manual name set (guest)
safe('startBtn', el => el.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!/^[\wก-๙]{3,16}$/.test(name)) return alert("❗ กรุณากรอกชื่อ 3–16 ตัวอักษร");
  localStorage.setItem('ggd.name', name);
  playerNameTop.textContent = name;
  closeModal('accountModal');
}));

// Google Login
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
    playerNameTop.textContent = user.displayName ;
    updateAccountView();
    closeModal('accountModal');
  } catch (err) {
    console.error("❌ Login failed:", err);
    alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
  }
}));

onAuthStateChanged(auth, (user) => {
  playerNameTop.textContent = user ? (user.displayName) : (state.name || "Guest");
  updateAccountView();
});

safe('btnLogout', el => el.addEventListener("click", async () => {
  await signOut(auth);
  playerNameTop.textContent = "Guest";
  updateAccountView();
  alert("ออกจากระบบเรียบร้อยแล้ว");
}));
