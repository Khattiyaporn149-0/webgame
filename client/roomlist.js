// ===============================
// 🧩 Room List Logic + Settings + Sound
// ===============================

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ===============================
// 🎵 SOUND SETUP (persistent across pages)
// ===============================
if (window.GameAudio) window.GameAudio.init();
const bgm = window.bgm;
const clickSound = window.clickSound;

// ===============================
// ⚙️ SETTINGS (load + save)
// ===============================
let settings = JSON.parse(localStorage.getItem("settings") || "{}");
settings = {
  master: settings.master ?? 0.8,
  music: settings.music ?? 0.6,
  sfx: settings.sfx ?? 0.8,
  region: settings.region ?? "asia",
};

function applyVolume() {
  bgm.volume = settings.music * settings.master;
  clickSound.volume = settings.sfx * settings.master;
}
function saveSettings() {
  localStorage.setItem("settings", JSON.stringify(settings));
  applyVolume();
}
applyVolume();

// ===============================
// 🎛️ SETTINGS MODAL UI
// ===============================
const rangeMaster = document.getElementById("rangeMaster");
const rangeMusic = document.getElementById("rangeMusic");
const rangeSfx = document.getElementById("rangeSfx");
const regionSel = document.getElementById("regionSel");

if (rangeMaster && rangeMusic && rangeSfx && regionSel) {
  // ตั้งค่าตามค่าเดิม
  rangeMaster.value = settings.master;
  rangeMusic.value = settings.music;
  rangeSfx.value = settings.sfx;
  regionSel.value = settings.region;

  // อัปเดตเมื่อผู้ใช้เลื่อน
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
  });
}

// ✅ Sync settings ระหว่างหลายหน้า (index ↔ roomlist ↔ lobby)
window.addEventListener("storage", (e) => {
  if (e.key === "settings" && e.newValue) {
    try {
      const newSettings = JSON.parse(e.newValue);
      settings = newSettings;
      applyVolume();
      console.log("🔄 Settings updated from another page:", newSettings);

      // ถ้ามี UI slider → อัปเดตให้ตรง
      if (rangeMaster && rangeMusic && rangeSfx && regionSel) {
        rangeMaster.value = settings.master;
        rangeMusic.value = settings.music;
        rangeSfx.value = settings.sfx;
        regionSel.value = settings.region;
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse updated settings:", err);
    }
  }
});

// ===============================
// 🪟 MODAL OPEN/CLOSE LOGIC
// ===============================
const btnSettingsTop = document.getElementById("btnSettingsTop");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");

if (btnSettingsTop && settingsModal && closeSettings) {
  btnSettingsTop.addEventListener("click", () => {
    settingsModal.classList.add("show");
    playClick();
  });
  closeSettings.addEventListener("click", () => {
    settingsModal.classList.remove("show");
    playClick();
  });
  settingsModal.addEventListener("click", e => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove("show");
      playClick();
    }
  });
}

// ===============================
// 🔊 SOUND CONTROL
// ===============================
let lastClick = 0;
function playClick() {
  const now = Date.now();
  if (now - lastClick > 120) {
    clickSound.currentTime = 0;
    clickSound.play();
    lastClick = now;
  }
}
document.addEventListener("click", () => bgm.play().catch(() => {}), { once: true });

// Centralize settings sliders to shared settings if available
if (window.GameSettings) {
  try {
    window.GameSettings.bindUI({});
    window.GameSettings.onChange(() => { if (window.GameAudio) window.GameAudio.applyVolumes(); });
  } catch {}
}

// ===============================
// 🧱 FIRESTORE ROOM LIST
// ===============================
const q = query(
  collection(db, "rooms"),
  where("type", "==", "public"),
  orderBy("createdAt", "desc")
);

onSnapshot(q, (snap) => {
  const list = document.getElementById("roomList");
  const empty = document.getElementById("emptyState");
  list.innerHTML = "";

  if (snap.empty) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  snap.forEach(docSnap => {
    const room = docSnap.data();
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <div class="room-info">
        <div class="room-name">📛 ${room.name}</div>
        <div class="room-detail">👥 ${room.maxPlayers ?? "?"} • 🔒 ${room.type}</div>
      </div>
      <button class="join-btn" data-roomcode="${room.code}">Join</button>
    `;
    list.appendChild(div);
  });

  document.querySelectorAll(".join-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const roomCode = btn.dataset.roomcode;
      const roomCard = btn.closest(".room-card");
      const type = roomCard.querySelector(".room-detail").textContent.includes("public") ? "public" : "private";
      playClick();
      if (type === "public") {
        window.location.href = `lobby.html?code=${roomCode}`;
      } else {
        showCodePrompt(roomCode);
      }
    });
  });
});

// ===============================
// 🔑 JOIN WITH CODE PROMPT
// ===============================
async function showCodePrompt(correctCode) {
  const input = prompt("🔑 กรุณาใส่โค้ด 4 ตัวเพื่อเข้าห้องนี้:");
  if (input === null) return;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    alert("⚠️ กรุณาใส่โค้ด 4 ตัว (A-Z หรือ 0-9)");
    return;
  }
  if (code !== correctCode) {
    alert("❌ โค้ดไม่ถูกต้อง ลองใหม่อีกครั้ง");
    return;
  }
  const q = query(collection(db, "rooms"), where("code", "==", code));
  const snap = await getDocs(q);
  if (snap.empty) {
    alert("❌ ไม่พบห้องนี้ หรือห้องถูกลบไปแล้ว");
    return;
  }
  playClick();
  window.location.href = `lobby.html?code=${code}`;
}
