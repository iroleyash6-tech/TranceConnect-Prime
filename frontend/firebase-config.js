/**
 * TRANCECONNECT-PRO: FIREBASE CLIENT INTEGRATION MODULE
 * Production Firebase configuration connected to project: transconnect-2fb2b
 * Official Developer Account: iroleyash6@gmail.com
 */

const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY || "AIzaSyCQuMuJx336ZAbsXhIGydFFF-uQWYX9wg4",
  authDomain: window.FIREBASE_AUTH_DOMAIN || "transconnect-2fb2b.firebaseapp.com",
  projectId: window.FIREBASE_PROJECT_ID || "transconnect-2fb2b",
  storageBucket: window.FIREBASE_STORAGE_BUCKET || "transconnect-2fb2b.firebasestorage.app",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "203796242375",
  appId: window.FIREBASE_APP_ID || "1:203796242375:web:c33a6e95d9d8039e9ac3e2",
  measurementId: window.FIREBASE_MEASUREMENT_ID || "G-N82F7XQC7Z",
  databaseURL: window.FIREBASE_DATABASE_URL || "https://transconnect-2fb2b-default-rtdb.firebaseio.com"
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
      console.log("⚡ Firebase connected to live project:", firebaseConfig.projectId);
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

    // Exchange with TranceConnect backend
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

/**
 * Sends official Firebase password reset email.
 */
async function sendFirebasePasswordReset(email) {
  initFirebase();
  if (!firebaseAuth) {
    throw new Error("Firebase Authentication is not ready. Please verify network connection.");
  }
  await firebaseAuth.sendPasswordResetEmail(email);
}

/**
 * Creates user directly in Firebase Auth (client-side).
 */
async function registerWithFirebaseEmailPassword(email, password) {
  initFirebase();
  if (!firebaseAuth) {
    throw new Error("Firebase Authentication is not ready.");
  }
  return await firebaseAuth.createUserWithEmailAndPassword(email, password);
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebase);
} else {
  initFirebase();
}
