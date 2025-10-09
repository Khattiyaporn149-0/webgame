// client/firebase.js
// =============================================
// 🔥 Firebase Core + Auth + Realtime Database
// =============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  push,
  get,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// =============================================
// 🔧 CONFIG (ของจริงจากโปรเจกต์นาย)
// =============================================
const firebaseConfig = {
  apiKey: "AIzaSyC68MpIXzvlcloyhweqy3vHIGy_sPYJWQA",
  authDomain: "theheist-6a6fb.firebaseapp.com",
  databaseURL:
    "https://theheist-6a6fb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "theheist-6a6fb",
  storageBucket: "theheist-6a6fb.appspot.com",
  messagingSenderId: "99426941589",
  appId: "1:99426941589:web:67cd06c5e68cccbc34399c",
};

// =============================================
// 🚀 Initialize Firebase app
// =============================================
const app = initializeApp(firebaseConfig);

// =============================================
// 🔐 AUTHENTICATION SYSTEM
// =============================================

// ✅ กำหนด Auth provider (Google)
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// ✅ Helper: login ด้วย popup
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // บันทึกชื่อและ uid ไว้ใน localStorage ให้เกมใช้งานต่อ
    localStorage.setItem("ggd.name", user.displayName || "Unknown");
    localStorage.setItem("ggd.uid", user.uid);
    console.log("✅ Google login success:", user.displayName);
    return user;
  } catch (err) {
    console.warn("❌ Google login failed:", err);
    throw err;
  }
}

// ✅ Helper: ใช้ตอนเกมเริ่ม — ถ้า login อยู่แล้วให้ดึง uid กลับมา
export function watchAuthState(callback) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // มีการ login อยู่
      localStorage.setItem("ggd.name", user.displayName || "Unknown");
      localStorage.setItem("ggd.uid", user.uid);
    }
    callback(user || null);
  });
}

// =============================================
// 💾 REALTIME DATABASE EXPORTS
// =============================================
export const rtdb = getDatabase(app);
export {
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  push,
  get,
  serverTimestamp,
};
