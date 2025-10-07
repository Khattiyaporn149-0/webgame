// --- Firestore imports ---
import { db, ts } from "./firebase.js";
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

if (window.hasOwnProperty("AccountCheck")) {
  console.log("⏭️ AccountCheck already initialized — skipping duplicate import");
} else {
  window.AccountCheck = true;
}

// 📌 อ่านชื่อผู้เล่นจากระบบเดิม (ถ้ามี)
const playerName = localStorage.getItem('ggd.name') || 'Guest';

// 📌 ปุ่มกลับ
const btnBack = document.getElementById('btnBack');
if (btnBack) btnBack.addEventListener('click', () => (window.location.href = 'index.html'));

// 📌 สุ่มโค้ดห้อง 4 ตัว
function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// 📌 สีสุ่ม
function randColor() {
  const hues = [150, 180, 200, 220, 260, 300];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 70% 65%)`;
}

// 📌 ปุ่ม CREATE
document.getElementById('btnCreate').addEventListener('click', async () => {
  const nameEl = document.getElementById('roomName');
  const roomNameInput = nameEl.value.trim();
  const errorDiv = document.getElementById('nameError');
  errorDiv.textContent = "";

  // 1) ตรวจชื่อห้อง
  if (roomNameInput === "") {
    errorDiv.textContent = "⚠️ Please enter a room name.";
    return;
  }
  // 👉 เปลี่ยนให้ยอมรับไทย/เว้นวรรค/ขีดล่างได้ (กันเคสชื่อไม่ผ่านแล้วไม่เด้ง)
  const validNamePattern = /^[A-Za-z0-9ก-๙ _-]+$/;
  if (!validNamePattern.test(roomNameInput)) {
    errorDiv.textContent = "⚠️ ใช้ตัวอักษร/ตัวเลข/ไทย/ช่องว่าง/_/- ได้เท่านั้น";
    return;
  }

  let code = "";
  try {
    // 2) หาโค้ดที่ยังไม่ซ้ำ
    console.log("[create] finding free code…");
    while (true) {
      code = genCode();
      const snap = await getDoc(doc(db, "rooms", code));
      if (!snap.exists()) break;
    }
    console.log("[create] code =", code);

    const maxPlayers = +document.getElementById('maxPlayers').value;
    const type = document.getElementById('roomType').value;

    // 3) สร้างเอกสารห้อง
    const roomRef = doc(db, "rooms", code);
    console.log("[create] setDoc room…");
    await setDoc(roomRef, {
      code,
      name: roomNameInput,
      maxPlayers,
      type,                // public | private
      status: "lobby",     // lobby | playing | ended
      host: playerName,
      createdAt: ts()      // serverTimestamp()
    });
    console.log("[create] room created");

    // 4) พยายามเพิ่มผู้เล่น (ถ้าล้มเหลวก็ยัง redirect ต่อ)
    try {
      console.log("[create] add first player…");
      await addDoc(collection(roomRef, "players"), {
        name: playerName,
        color: randColor(),
        ready: false,
        joinedAt: ts()
      });
      console.log("[create] first player added");
    } catch (e) {
      console.warn("[create] add player failed (will still redirect):", e);
      // แสดงเตือนเล็กๆ แต่ไม่บล็อกการเข้า lobby
      errorDiv.textContent = "⚠️ เพิ่มผู้เล่นไม่สำเร็จ แต่สร้างห้องแล้ว — จะพาไป Lobby";
    }

    // 5) เก็บโค้ด และไป Lobby “เสมอ”
    localStorage.setItem('lastRoomCode', code);
    console.log("[create] redirect to lobby with code:", code);
    window.location.href = `lobby.html?code=${code}`;

  } catch (err) {
    console.error("[create] failed:", err);
    errorDiv.textContent = `⚠️ Failed to create room: ${(err && err.code) || err}`;
  }
});

// 📌 เด้งแอนิเมชันกล่อง
window.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("setup");
  if (setup) setup.classList.add("show");
});

// 📌 ลบห้องถ้าเป็นโฮสต์ (ไว้ใช้หน้าอื่น)
export async function deleteRoomIfHost(code) {
  if (!code) return;

  const roomRef = doc(db, "rooms", code);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const roomData = snap.data();
  if (roomData.host === playerName) {
    // ลบ players ก่อน
    const playersRef = collection(roomRef, "players");
    const playersSnap = await getDocs(playersRef);
    for (const p of playersSnap.docs) {
      await deleteDoc(p.ref);
    }
    await deleteDoc(roomRef);
    console.log(`✅ Room ${code} deleted because host left.`);
  }
}// ===============================
// 🎵 GLOBAL SOUND (Persistent across pages)
// ===============================

// ✅ โหลดค่าที่บันทึกไว้
const settings = JSON.parse(localStorage.getItem("gameSettings")) || {
  master: 1.0,
  music: 0.8,
  sfx: 0.8,
  region: "asia"
};

// 🔊 ฟังก์ชันจัดการเสียง
function updateVolumes() {
  if (window.bgm) window.bgm.volume = settings.master * settings.music;
  if (window.clickSound) window.clickSound.volume = settings.master * settings.sfx;
}
function saveSettings() {
  localStorage.setItem("gameSettings", JSON.stringify(settings));
  updateVolumes();
}

// 🔸 สร้าง bgm ครั้งเดียว
if (!window.bgm) {
  window.bgm = new Audio("assets/sounds/galaxy-283941.mp3");
  window.bgm.loop = true;
  window.bgm.volume = settings.master * settings.music;

  // เล่นหลังคลิกแรก (ตาม policy browser)
  document.addEventListener("click", () => {
    window.bgm.play().catch(() => {});
  }, { once: true });
}

// 🔸 สร้าง click sound ครั้งเดียว
if (!window.clickSound) {
  window.clickSound = new Audio("assets/sounds/click.mp3");
  window.clickSound.volume = settings.master * settings.sfx;
}

// สร้าง shortcut ตัวแปร
const bgm = window.bgm;
const clickSound = window.clickSound;

// 🪄 apply volume ตอนโหลด
updateVolumes();

// 🌍 region debug
function updateRegion() {
  console.log("🌐 Region set to:", settings.region);
}
updateRegion();

// ✅ Resume จากเวลาเดิมถ้ามี (ตอน refresh)
window.addEventListener("beforeunload", () => {
  if (bgm && !bgm.paused) {
    localStorage.setItem("bgmTime", bgm.currentTime);
  }
});
window.addEventListener("DOMContentLoaded", () => {
  const last = parseFloat(localStorage.getItem("bgmTime") || "0");
  if (bgm && !isNaN(last)) bgm.currentTime = last;
});

// ===============================
// 🎛️ SETTINGS MODAL
// ===============================
const rangeMaster = document.getElementById("rangeMaster");
const rangeMusic = document.getElementById("rangeMusic");
const rangeSfx = document.getElementById("rangeSfx");
const regionSel = document.getElementById("regionSel");

if (rangeMaster && rangeMusic && rangeSfx && regionSel) {
  rangeMaster.value = settings.master;
  rangeMusic.value = settings.music;
  rangeSfx.value = settings.sfx;
  regionSel.value = settings.region;

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
}

// ===============================
// 🪟 SETTINGS MODAL TOGGLE
// ===============================
const btnSettingsTop = document.getElementById("btnSettingsTop");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");

if (btnSettingsTop && settingsModal && closeSettings) {
  btnSettingsTop.addEventListener("click", () => {
    settingsModal.setAttribute("aria-hidden", "false");
    playClick();
  });

  closeSettings.addEventListener("click", () => {
    settingsModal.setAttribute("aria-hidden", "true");
    playClick();
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.setAttribute("aria-hidden", "true");
      playClick();
    }
  });
}

// ===============================
// 🔉 PLAY CLICK SOUND (debounced)
// ===============================
let lastClick = 0;
function playClick() {
  const now = Date.now();
  if (now - lastClick > 100) {
    clickSound.currentTime = 0;
    clickSound.play();
    lastClick = now;
  }
}

// Centralize audio + settings
try {
  if (window.GameAudio) window.GameAudio.init();
  if (window.GameSettings) {
    window.GameSettings.bindUI({});
    window.GameSettings.onChange(() => { if (window.GameAudio) window.GameAudio.applyVolumes(); });
  }
} catch {}
