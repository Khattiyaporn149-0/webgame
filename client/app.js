// Tiny animated background + UI logic + persistence
// ==============================
// 🎵 SOUND (Persistent across pages)
// ==============================

// ✅ ใช้ global ตัวเดียวตลอด tab
if (!window.bgm) {
  window.bgm = new Audio("assets/sounds/galaxy-283941.mp3");
  window.bgm.loop = true;
  window.bgm.volume = 0.5;

  // เล่นหลัง user interaction ครั้งแรก (จำเป็นตาม policy browser)
  document.addEventListener("click", () => {
    window.bgm.play().catch(() => {});
  }, { once: true });
}

if (!window.clickSound) {
  window.clickSound = new Audio("assets/sounds/click.mp3");
  window.clickSound.volume = 0.8;
}

// 👇 ใช้ reference เดิม (ไม่สร้างใหม่)
const bgm = window.bgm;
const clickSound = window.clickSound;

// ✅ เก็บเวลาปัจจุบันก่อนออกจากหน้า
window.addEventListener("beforeunload", () => {
  if (bgm && !bgm.paused) {
    localStorage.setItem("bgmTime", bgm.currentTime);
  }
});

// ✅ กลับมาเล่นต่อจุดเดิมตอนโหลดใหม่
window.addEventListener("DOMContentLoaded", () => {
  const last = parseFloat(localStorage.getItem("bgmTime") || "0");
  if (bgm && !isNaN(last)) bgm.currentTime = last;
});


// 🧠 โหลดค่าที่บันทึกไว้
const settings = JSON.parse(localStorage.getItem("gameSettings")) || {
  master: 1.0,
  music: 0.8,
  sfx: 0.8,
  region: "asia"
};

// 🧮 ฟังก์ชันอัปเดตเสียง
function updateVolumes() {
  bgm.volume = settings.master * settings.music;
  clickSound.volume = settings.master * settings.sfx;
}

// 💾 ฟังก์ชันบันทึก
function saveSettings() {
  localStorage.setItem("gameSettings", JSON.stringify(settings));
  updateVolumes();
}

// 🌍 อัปเดต region
function updateRegion() {
  console.log("🌐 Region set to:", settings.region);
}

// เรียกตอนเริ่ม
updateVolumes();
updateRegion();

/* ==============================
 ⚙️ SETTINGS MODAL
============================== */

const btnSettingsTop = document.getElementById("btnSettingsTop");
const rangeMaster = document.getElementById("rangeMaster");
const rangeMusic = document.getElementById("rangeMusic");
const rangeSfx = document.getElementById("rangeSfx");
const regionSel = document.getElementById("regionSel");

// ตั้งค่าตามที่บันทึกไว้
rangeMaster.value = settings.master;
rangeMusic.value = settings.music;
rangeSfx.value = settings.sfx;
regionSel.value = settings.region;

// 🎚 ปรับค่าระหว่างเล่น
rangeMaster.addEventListener("input", e => {
  settings.master = parseFloat(e.target.value);
  saveSettings();
});

rangeMusic.addEventListener("input", e => {
  settings.music = parseFloat(e.target.value);
  saveSettings();
});

rangeSfx.addEventListener("input", e => {
  settings.sfx = parseFloat(e.target.value);
  saveSettings();
});

regionSel.addEventListener("change", e => {
  settings.region = e.target.value;
  saveSettings();
  updateRegion();
});

/* ==============================
 🪟 OPEN / CLOSE MODAL
============================== */

// ปุ่มเปิด (เพิ่มเองใน UI เช่น <button id="openSettings">⚙️ Settings</button>)
const btnOpen = document.getElementById("openSettings");
const btnClose = document.getElementById("closeSettings");

if (btnOpen) {
  btnOpen.addEventListener("click", () => {
    btnSettingsTop.style.display = "flex";
    btnSettingsTop.setAttribute("aria-hidden", "false");
  });
}

btnClose.addEventListener("click", () => {
  const modal = document.getElementById("settingsModal");
  modal.style.display = "none"; // แค่ซ่อน popup
  modal.setAttribute("aria-hidden", "true");
});
document.getElementById("settingsModal").addEventListener("click", e => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = "none"; // แค่ซ่อน popup
    e.currentTarget.setAttribute("aria-hidden", "true");
  }
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
  version: 'V.test1.2.1' // เปลี่ยนเวอร์ชันตรงนี้เมื่ออัปเดตเกม
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
  }
});

// sound
function hideStartScreen() {
  startScreen.style.display = "none";
  const wrap = document.querySelector(".wrap");
  wrap.style.display = "grid";
  requestAnimationFrame(() => wrap.classList.add("show")); // ✨ เพิ่มตรงนี้
}

const btnTutorial = document.getElementById('btnTutorial');
const tutorialModal = document.getElementById('tutorialModal');
const closeTutorial = document.getElementById('closeTutorial');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// เปิด Popup
btnTutorial.addEventListener('click', () => {
  tutorialModal.classList.add('active');
});

// ปิด Popup
closeTutorial.addEventListener('click', () => {
  tutorialModal.classList.remove('active');
});

// ปิดเมื่อคลิกข้างนอก
tutorialModal.addEventListener('click', (e) => {
  if (e.target === tutorialModal) tutorialModal.classList.remove('active');
});

// สลับแท็บ
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // เอา active ออกจากทุกปุ่มและ pane
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    // ใส่ active ในแท็บที่เลือก
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });

  
});

