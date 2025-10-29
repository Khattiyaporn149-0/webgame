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

async function persistUserSafeProfile(user) {
  try {
    await set(ref(rtdb, `users_safe/${user.uid}`), {
      name: user.displayName || "Unknown",
      email: user.email || null,
      photo: user.photoURL || null,
      lastLogin: new Date().toISOString(),
    });
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
      // Keep existing guest uid/name; just mark as guest
      if (!localStorage.getItem("ggd.auth")) {
        localStorage.setItem("ggd.auth", "guest");
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
