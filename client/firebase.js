// ================================
// 🔥 FIREBASE CONFIG - FRONTEND MODULE
// ================================

// ✅ CDN + ES Modules (no bundler)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// ================================
// 🧩 CONFIGURATION
// ================================
const firebaseConfig = {
  apiKey: "AIzaSyC68MpIXzvlcloyhweqy3vHIGy_sPYJWQA",
  authDomain: "theheist-6a6fb.firebaseapp.com",
  projectId: "theheist-6a6fb",
  storageBucket: "theheist-6a6fb.firebasestorage.app",
  messagingSenderId: "99426941589",
  appId: "1:99426941589:web:67cd06c5e68cccbc34399c",
  measurementId: "G-N0YPDY0VSK"
};

// ================================
// 🚀 INITIALIZE
// ================================
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const ts = serverTimestamp;

// ================================
// ✏️ UPDATE DISPLAY NAME FUNCTION
// ================================
export async function updateFirebaseName(newName) {
  const user = auth.currentUser;
  if (!user) { console.error("Cannot update name: User is not logged in."); return false; }
  try {
    await updateProfile(user, { displayName: newName });
    await setDoc(doc(db, "users", user.uid), { name: newName, lastUpdated: ts() }, { merge: true });
    console.log(`✅ Updated Firebase name to: ${newName}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to update Firebase name:", error);
    return false;
  }
}

// ================================
// ✅ EXPORTS (helpers)
// ================================
export { signInWithPopup, signOut, onAuthStateChanged, doc, setDoc };

console.log("✅ firebase.js loaded successfully");
