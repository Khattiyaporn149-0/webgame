// ใช้ CDN + ES Modules (ไม่ต้องมี bundler)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ใส่ config จาก Project settings → General → Your apps (Web)
const firebaseConfig = {
  apiKey: "AIzaSyC68MpIXzvlcloyhweqy3vHIGy_sPYJWQA",
  authDomain: "theheist-6a6fb.firebaseapp.com",
  projectId: "theheist-6a6fb",
  storageBucket: "theheist-6a6fb.firebasestorage.app",
  messagingSenderId: "99426941589",
  appId: "1:99426941589:web:67cd06c5e68cccbc34399c",
  measurementId: "G-N0YPDY0VSK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const ts = serverTimestamp;
