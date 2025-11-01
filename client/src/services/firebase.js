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
  return (
    auth?.currentUser?.displayName ||
    localStorage.getItem("ggd.name") ||
    localStorage.getItem("playerName") ||
    `Player_${Math.random().toString(36).slice(2,7)}`
  );
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
    await set(ref(rtdb, `users_safe/${user.uid}`), {
      name: user.displayName || "Unknown",
      email: user.email || null,
      photo: user.photoURL || null,
      lastLogin: new Date().toISOString(),
    });
    // Also keep basic public profile under /users for friends list rendering
    try {
      await update(ref(rtdb, `users/${user.uid}`), {
        name: user.displayName || "Unknown",
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
  localStorage.setItem("ggd.name", user.displayName || "Unknown");
  localStorage.setItem("ggd.uid", user.uid);
  localStorage.setItem("ggd.auth", "google");
  await persistUserSafeProfile(user);
  return user;
}

export function watchAuthState(callback) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      localStorage.setItem("ggd.name", user.displayName || "Unknown");
      localStorage.setItem("ggd.uid", user.uid);
      localStorage.setItem("ggd.auth", "google");
      // Fire and forget; keep users_safe fresh
      persistUserSafeProfile(user);
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
