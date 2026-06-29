// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDqMvhEX4uKbS2g5qQQ-UscDU4387IOiAQ",
  authDomain: "sistema-integrado-56762.firebaseapp.com",
  projectId: "sistema-integrado-56762",
  storageBucket: "sistema-integrado-56762.firebasestorage.app",
  messagingSenderId: "365598930516",
  appId: "1:365598930516:web:0b352f7dfb10723f2a1fc1",
  measurementId: "G-MLKGRJWPW1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);