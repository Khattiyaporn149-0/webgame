import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp(); // ใช้ Admin SDK (มีสิทธิ์เต็ม ไม่ติด rules)

export const cleanupPresenceAndRooms = onSchedule("every 2 minutes", async () => {
  const rtdb = getDatabase();
  const fs   = getFirestore();

  const now = Date.now();
  const ttlMs = 60 * 1000; // ใครหายไปเกิน 60 วิ ถือว่า offline

  // 1) เคลียร์ presence ที่หมดอายุ
  const presSnap = await rtdb.ref("presence").get();
  const roomsToCheck = new Set();

  if (presSnap.exists()) {
    const updates = {};
    presSnap.forEach(roomSnap => {
      const room = roomSnap.key;
      roomSnap.forEach(userSnap => {
        const data = userSnap.val() || {};
        if (!data.lastSeen || (now - data.lastSeen) > ttlMs) {
          updates[`presence/${room}/${userSnap.key}`] = null; // ลบ
        } else {
          roomsToCheck.add(room);
        }
      });
      // ถ้าห้องไม่มีลูกเลยก็เช็คตอนข้อ 2
    });

    if (Object.keys(updates).length) {
      await rtdb.ref().update(updates);
      console.log("presence cleaned:", Object.keys(updates).length);
    }
  }

  // 2) ลบ rooms ที่ไม่มีผู้เล่นออนไลน์
  // อ่าน presence อีกครั้ง (หลังลบ timeouts)
  const fresh = await rtdb.ref("presence").get();
  const emptyRooms = [];

  if (fresh.exists()) {
    fresh.forEach(roomSnap => {
      const hasAny = roomSnap.hasChildren();
      if (!hasAny) emptyRooms.push(roomSnap.key);
    });
  }

  // ลบห้องเปล่าใน Firestore
  const batch = fs.batch();
  for (const code of emptyRooms) {
    const ref = fs.collection("rooms").doc(code);
    batch.delete(ref);
  }
  if (emptyRooms.length) {
    await batch.commit();
    console.log("deleted empty rooms:", emptyRooms);
  }
});
