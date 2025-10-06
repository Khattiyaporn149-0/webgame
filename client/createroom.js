// --- Firestore imports ---
import { db, ts } from "./firebase.js";
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
}
