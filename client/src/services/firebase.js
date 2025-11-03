// client/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref, set, update, onValue, onDisconnect, push, get, remove,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC68MpIXzvlcloyhweqy3vHIGy_sPYJWQA",
  authDomain: "theheist-6a6fb.firebaseapp.com",
  databaseURL: "https://theheist-6a6fb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "theheist-6a6fb",
  storageBucket: "theheist-6a6fb.appspot.com",
  messagingSenderId: "99426941589",
  appId: "1:99426941589:web:67cd06c5e68cccbc34399c",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Helpers: centralized identity for pages
export function currentUid() {
  const u = auth?.currentUser?.uid || null;
  if (u) {
    try { sessionStorage.setItem("ggd.uid", u); } catch {}
    return u;
  }
  try {
    const s = sessionStorage.getItem("ggd.uid");
    if (s && typeof s === "string" && s.length) return s;
  } catch {}
  const rand = (self.crypto?.randomUUID?.() || ("uid_" + Math.random().toString(36).slice(2, 10)));
  const guest = String(rand).startsWith("uid_") ? String(rand) : ("uid_" + String(rand));
  try { sessionStorage.setItem("ggd.uid", guest); } catch {}
  return guest;
}

export function currentDisplayName() {
  // ✅ Check localStorage FIRST for Google users (they may have changed their name)
  // Then fall back to Firebase Auth displayName for consistency
  const localName = localStorage.getItem("ggd.name");
  if (localName && localName !== "undefined" && localName !== "null") {
    return localName;
  }
  
  // ✅ Fallback: Google user display name
  if (auth?.currentUser?.displayName) {
    return auth.currentUser.displayName;
  }
  
  // ✅ Fallback: stored playerName
  const playerName = localStorage.getItem("playerName");
  if (playerName && playerName !== "undefined" && playerName !== "null") {
    return playerName;
  }
  
  // ✅ Last resort: generate unique name
  const randomName = `Player_${Math.random().toString(36).slice(2,7)}`;
  localStorage.setItem("ggd.name", randomName);
  return randomName;
}

export function waitAuthReady() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      try { unsub(); } catch {}
      resolve(u || null);
    });
  });
}

async function persistUserSafeProfile(user) {
  try {
    // ✅ ใช้ชื่อจาก localStorage (ซึ่งอาจจะเป็นชื่อที่ผู้เล่นเปลี่ยน) มากกว่าชื่อ Google
    const displayName = localStorage.getItem("ggd.name") || user.displayName || "Unknown";
    
    await set(ref(rtdb, `users_safe/${user.uid}`), {
      name: displayName,
      email: user.email || null,
      photo: user.photoURL || null,
      lastLogin: new Date().toISOString(),
    });
    // Also keep basic public profile under /users for friends list rendering
    try {
      await update(ref(rtdb, `users/${user.uid}`), {
        name: displayName,
        updatedAt: Date.now(),
      });
    } catch {}
  } catch (e) {
    console.warn("[firebase] persist users_safe failed:", e?.code || e?.message || e);
  }
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  
  // ✅ ตรวจสอบว่าผู้เล่นเปลี่ยนชื่อมาแล้วหรือไม่
  const isNameCustomized = localStorage.getItem("ggd.name_customized") === "true";
  const currentStoredName = localStorage.getItem("ggd.name") || "";
  const googleName = user.displayName || "Unknown";
  
  // ✅ ถ้าผู้เล่นเปลี่ยนชื่อมาแล้ว ให้ใช้ชื่อนั้น มิฉะนั้นใช้ชื่อ Google
  const finalName = isNameCustomized ? currentStoredName : googleName;
  
  localStorage.setItem("ggd.name", finalName);
  localStorage.setItem("ggd.uid", user.uid);
  localStorage.setItem("ggd.auth", "google");
  
  // บันทึกชื่อลง Firebase
  try {
    await set(ref(rtdb, `users_safe/${user.uid}`), {
      name: finalName,
      email: user.email || null,
      photo: user.photoURL || null,
      lastLogin: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[loginWithGoogle] Firebase update failed:", e?.message);
  }
  
  return user;
}

export function watchAuthState(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        // ✅ อ่านชื่อจากฐานข้อมูล
        const userSafeRef = ref(rtdb, `users_safe/${user.uid}`);
        let finalName = user.displayName || "Unknown";
        
        try {
          const getPromise = get(userSafeRef);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), 3000)
          );
          const snapshot = await Promise.race([getPromise, timeoutPromise]);
          
          if (snapshot.exists() && snapshot.val()?.name) {
            finalName = snapshot.val().name;
            // console.log("[watchAuthState] Found name in Firebase:", finalName);
          } else {
            // ถ้าไม่มี entry ให้สร้างใหม่
            await set(userSafeRef, {
              name: finalName,
              email: user.email || null,
              photo: user.photoURL || null,
              lastLogin: new Date().toISOString(),
            });
            // console.log("[watchAuthState] Created new entry with Google name");
          }
        } catch (getError) {
          // console.log("[watchAuthState] Using Google name (Firebase read failed)");
        }
        
        // console.log("[watchAuthState] Final name:", finalName);
        
        localStorage.setItem("ggd.name", finalName);
        localStorage.setItem("ggd.uid", user.uid);
        localStorage.setItem("ggd.auth", "google");
      } catch (e) {
        console.warn("[watchAuthState] Error:", e?.message);
        const googleName = user.displayName || "Unknown";
        localStorage.setItem("ggd.name", googleName);
        localStorage.setItem("ggd.uid", user.uid);
        localStorage.setItem("ggd.auth", "google");
      }
    } else {
      // No Firebase user: ensure UI treats as guest
      localStorage.setItem("ggd.auth", "guest");
      // Clean up obviously bad names from previous runs
      const nm = localStorage.getItem("ggd.name");
      if (!nm || nm === "undefined" || nm === "null") {
        try { localStorage.removeItem("ggd.name"); } catch {}
      }
    }
    callback(user || null);
  });
}

export const rtdb = getDatabase(app);
export {
  ref, set, update, onValue, onDisconnect, push, get, remove,
  serverTimestamp, runTransaction
};

export { getAuth, GoogleAuthProvider, signInWithPopup }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
export { getDatabase }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

export { signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
