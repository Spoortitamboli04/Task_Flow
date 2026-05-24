// ============================================================
//  firebase.js — YOUR FIREBASE CONFIGURATION
//  Replace every value below with your own project's config.
//  Get it from: Firebase Console → Project Settings → Your Apps
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCCClaTWJgqkJeBgnaZf4iXCIXrT-dpPLo",
  authDomain: "task-flow-77c28.firebaseapp.com",
  projectId: "task-flow-77c28",
  storageBucket: "task-flow-77c28.firebasestorage.app",
  messagingSenderId: "100242854226",
  appId: "1:100242854226:web:b5afb1f1e01b4c42c72a8b",
  measurementId: "G-ZGHDHXSJ1L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Expose auth + firestore globally so script.js can use them
const auth = firebase.auth();
const db   = firebase.firestore();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
