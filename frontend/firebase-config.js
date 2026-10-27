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
let firebaseFirestore = null;
let firebaseRealtimeDb = null;
let googleAuthProvider = null;
let isFirebaseInitialized = false;

function initFirebase() {
  if (typeof firebase !== 'undefined' && !isFirebaseInitialized) {
    try {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
      googleAuthProvider = new firebase.auth.GoogleAuthProvider();

      if (typeof firebase.firestore === 'function') {
        try {
          firebaseFirestore = firebase.firestore();
        } catch (fErr) {
          console.warn("Firestore init notice:", fErr.message);
        }
      }

      if (typeof firebase.database === 'function') {
        try {
          firebaseRealtimeDb = firebase.database();
        } catch (dErr) {
          console.warn("Realtime DB init notice:", dErr.message);
        }
      }

      isFirebaseInitialized = true;
      console.log("⚡ Firebase connected to live project:", firebaseConfig.projectId);

      // Listen to Firebase auth state changes
      firebaseAuth.onAuthStateChanged((user) => {
        if (user) {
          window.firebaseCurrentUser = user;
          console.log("Firebase Auth User active:", user.email);
        } else {
          window.firebaseCurrentUser = null;
        }
      });
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
    if (typeof showToast === 'function') {
      showToast("Firebase Auth initializing... Please ensure network connectivity.", "warning");
    }
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
      if (typeof showToast === 'function') {
        showToast(data.error || "Google sign-in backend sync failed", "error");
      }
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));
    if (typeof showToast === 'function') {
      showToast(`Welcome, ${data.user.company_name || data.user.contact_person}!`, "success");
    }

    setTimeout(() => {
      if (data.user.role === 'dealer') window.location.href = '/dealer';
      else if (data.user.role === 'transporter') window.location.href = '/transporter';
      else if (data.user.role === 'admin') window.location.href = '/admin';
      else window.location.reload();
    }, 400);

  } catch (error) {
    console.error("Google Auth Error:", error);
    if (typeof showToast === 'function') {
      if (error.code === 'auth/popup-closed-by-user') {
        showToast("Sign-in cancelled by user.", "info");
      } else if (error.code === 'auth/unauthorized-domain') {
        showToast("Domain unauthorized in Firebase Console. Please notify administrator.", "error");
      } else {
        showToast(error.message || "Firebase Google Authentication failed.", "error");
      }
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

/**
 * Real-time GPS Tracker Listener using Cloud Firestore.
 */
function listenToShipmentLiveTracking(shipmentId, onUpdate) {
  initFirebase();
  if (!firebaseFirestore) return null;
  try {
    return firebaseFirestore.collection('tracking_locations').doc(String(shipmentId))
      .onSnapshot((doc) => {
        if (doc.exists && typeof onUpdate === 'function') {
          onUpdate(doc.data());
        }
      }, (err) => {
        console.warn("Firestore tracking listener notice:", err);
      });
  } catch (err) {
    console.warn("Error attaching Firestore tracking listener:", err);
    return null;
  }
}

/**
 * Real-time Notifications Listener using Cloud Firestore.
 */
function listenToUserNotifications(userId, onNotification) {
  initFirebase();
  if (!firebaseFirestore) return null;
  try {
    return firebaseFirestore.collection('notifications')
      .where('recipient_id', '==', Number(userId))
      .orderBy('timestamp', 'desc')
      .limit(20)
      .onSnapshot((snapshot) => {
        const notifications = [];
        snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
        if (typeof onNotification === 'function') {
          onNotification(notifications);
        }
      }, (err) => {
        console.warn("Firestore notification listener notice:", err);
      });
  } catch (err) {
    console.warn("Error attaching Firestore notification listener:", err);
    return null;
  }
}

/**
 * Firestore Real-time Chat Subscription.
 */
function listenToRoomChat(roomName, onMessageReceived) {
  initFirebase();
  if (!firebaseFirestore) return null;
  try {
    return firebaseFirestore.collection('messages')
      .where('room', '==', roomName)
      .orderBy('timestamp', 'asc')
      .limit(100)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && typeof onMessageReceived === 'function') {
            onMessageReceived({ id: change.doc.id, ...change.doc.data() });
          }
        });
      }, (err) => {
        console.warn("Firestore chat listener notice:", err);
      });
  } catch (err) {
    console.warn("Error attaching Firestore chat listener:", err);
    return null;
  }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebase);
} else {
  initFirebase();
}
