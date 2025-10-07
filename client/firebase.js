// client/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase, ref, set, update, onValue, onDisconnect, push, get
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
export const rtdb = getDatabase(app);

// re-export helpers
export { ref, set, update, onValue, onDisconnect, push, get };
export { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
