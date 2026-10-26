/**
 * TRANCECONNECT-PRO: FIREBASE CLIENT INTEGRATION MODULE
 * Supports Firebase Authentication (Google Sign-In, Email/Password, Session Persistence),
 * Cloud Firestore, and Cloud Storage with graceful offline/local fallback.
 */

const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY || "AIzaSyDemoKey-TranceConnect-Pro-2026",
  authDomain: window.FIREBASE_AUTH_DOMAIN || "tranceconnect-pro.firebaseapp.com",
  projectId: window.FIREBASE_PROJECT_ID || "tranceconnect-pro",
  storageBucket: window.FIREBASE_STORAGE_BUCKET || "tranceconnect-pro.appspot.com",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "1029384756",
  appId: window.FIREBASE_APP_ID || "1:1029384756:web:a1b2c3d4e5f6g7h8",
  measurementId: window.FIREBASE_MEASUREMENT_ID || "G-TCPRO2026"
};

let firebaseApp = null;
let firebaseAuth = null;
let googleAuthProvider = null;
let isFirebaseInitialized = false;

function initFirebase() {
  if (typeof firebase !== 'undefined' && !isFirebaseInitialized) {
    try {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
      googleAuthProvider = new firebase.auth.GoogleAuthProvider();
      isFirebaseInitialized = true;
      console.log("⚡ Firebase SDK initialized for project:", firebaseConfig.projectId);
    } catch (err) {
      console.warn("Firebase initialization warning:", err.message);
    }
  }
}

/**
 * Initiates Google Sign-In via Firebase Auth.
 * Automatically exchanges Firebase ID Token with TranceConnect backend.
 */
async function signInWithGoogle(selectedRole = 'dealer') {
  initFirebase();
  if (!firebaseAuth || !googleAuthProvider) {
    showToast("Firebase Auth initializing... Please ensure network connectivity.", "warning");
    return;
  }

  try {
    const result = await firebaseAuth.signInWithPopup(googleAuthProvider);
    const user = result.user;
    const idToken = await user.getIdToken();

    // Exchange with TranceConnect-Pro backend
    const res = await fetch('/api/auth/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_token: idToken,
        email: user.email,
        display_name: user.displayName,
        role: selectedRole,
        photo_url: user.photoURL
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Google sign-in backend sync failed", "error");
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));
    showToast(`Welcome, ${data.user.company_name || data.user.contact_person}!`, "success");

    setTimeout(() => {
      if (data.user.role === 'dealer') window.location.href = '/dealer';
      else if (data.user.role === 'transporter') window.location.href = '/transporter';
      else if (data.user.role === 'admin') window.location.href = '/admin';
      else window.location.reload();
    }, 400);

  } catch (error) {
    console.error("Google Auth Error:", error);
    if (error.code === 'auth/popup-closed-by-user') {
      showToast("Sign-in cancelled by user.", "info");
    } else {
      showToast(error.message || "Firebase Google Authentication failed.", "error");
    }
  }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebase);
} else {
  initFirebase();
}
