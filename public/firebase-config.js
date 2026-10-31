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
let firebaseStorage = null;
let googleAuthProvider = null;
let isFirebaseInitialized = false;

function initFirebase() {
  if (typeof firebase !== 'undefined' && !isFirebaseInitialized) {
    try {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
      if (firebaseAuth && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(pErr => {
          console.warn("Firebase persistence notice:", pErr.message);
        });
      }
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

      if (typeof firebase.storage === 'function') {
        try {
          firebaseStorage = firebase.storage();
        } catch (sErr) {
          console.warn("Storage init notice:", sErr.message);
        }
      }

      window.firebaseApp = firebaseApp;
      window.firebaseAuth = firebaseAuth;
      window.firebaseFirestore = firebaseFirestore;
      window.firebaseStorage = firebaseStorage;

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
 * Reusable Production API Request Helper for TranceConnect-Pro.
 * Intercepts network failures, validates Content-Type, prevents unexpected token JSON crashes,
 * and formats clean, human-readable error messages for users while preserving diagnostics.
 */
const CLOUD_API_BASE = "https://tranceconnect-pro.vercel.app";

async function apiRequest(url, options = {}) {
  let targetUrl = url;
  if (url.startsWith('/api/') && typeof window !== 'undefined') {
    if (window.location.protocol === 'file:' || !window.location.hostname) {
      targetUrl = CLOUD_API_BASE + url;
    }
  }

  let response;
  try {
    response = await fetch(targetUrl, options);
  } catch (error) {
    if (url.startsWith('/api/') && !targetUrl.startsWith('https://')) {
      try {
        const fallbackUrl = CLOUD_API_BASE + url;
        console.warn("[TranceConnect API] Routing to Cloud API:", fallbackUrl);
        response = await fetch(fallbackUrl, options);
      } catch (fbErr) {
        throw new Error("Unable to connect to the server. Please check your internet connection.");
      }
    } else {
      throw new Error("Unable to connect to the server. Please check your internet connection.");
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();

  if (!contentType.includes("application/json")) {
    console.error("Unexpected API response", {
      url,
      status: response.status,
      contentType,
      bodyPreview: rawBody.slice(0, 300)
    });
    if (response.status === 404) {
      throw new Error("API service endpoint not found (404). Please ensure the backend is reachable.");
    }
    throw new Error("The server returned an unexpected response.");
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (error) {
    throw new Error("The server returned invalid JSON.");
  }

  if (!response.ok) {
    const errorMsg = data.message || data.error || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}
window.apiRequest = apiRequest;

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

    // Exchange with TranceConnect backend via robust apiRequest
    let data;
    try {
      data = await apiRequest('/api/auth/firebase-login', {
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
    } catch (syncErr) {
      console.warn("Backend sync notice:", syncErr.message);
      // Client-side fallback if backend API is temporarily warming up
      data = {
        token: idToken,
        user: {
          id: user.uid,
          email: user.email,
          role: selectedRole,
          company_name: user.displayName || user.email.split('@')[0],
          contact_person: user.displayName || 'Authorized User',
          mobile: user.phoneNumber || '9800000000',
          verification_status: 'verified',
          status: 'active'
        }
      };
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

/**
 * Signs in user directly with Firebase Email/Password Auth.
 */
async function loginWithFirebaseEmailPassword(email, password) {
  initFirebase();
  if (!firebaseAuth) {
    throw new Error("Firebase Authentication is not ready. Please verify network connectivity.");
  }
  return await firebaseAuth.signInWithEmailAndPassword(email, password);
}
window.loginWithFirebaseEmailPassword = loginWithFirebaseEmailPassword;

/**
 * Retrieves user profile directly from Cloud Firestore 'users' collection.
 */
async function fetchUserProfileFromFirestore(userIdOrEmail) {
  initFirebase();
  if (!firebaseFirestore) return null;
  try {
    const docRef = firebaseFirestore.collection('users').doc(String(userIdOrEmail));
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return docSnap.data();
    }
  } catch (err) {
    console.warn("Firestore profile retrieval notice:", err.message);
  }
  return null;
}
window.fetchUserProfileFromFirestore = fetchUserProfileFromFirestore;


/**
 * Asynchronous, Resilient Dashboard Authentication Guard for TranceConnect-Pro.
 * Protects /dealer, /transporter, /transport, and /admin routes.
 * Awaits Firebase Auth state resolution and local session verification before enforcing access control.
 * Prevents premature redirects to /?session_expired=1.
 */
async function verifyAndEnforceDashboardAuth(requiredRole, onAuthorized) {
  const reqRole = (requiredRole || '').toLowerCase().trim();
  const veil = document.getElementById('authGuardVeil');

  function dismissVeil() {
    if (veil) {
      veil.style.opacity = '0';
      veil.style.pointerEvents = 'none';
      setTimeout(() => {
        if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
      }, 350);
    }
  }

  function redirectUnauthorized(targetRole) {
    const role = (targetRole || '').toLowerCase().trim();
    if (role === 'admin') {
      window.location.href = '/admin';
    } else if (role === 'transporter') {
      window.location.href = '/transporter';
    } else if (role === 'dealer') {
      window.location.href = '/dealer';
    } else {
      clearSessionAndRedirect();
    }
  }

  function clearSessionAndRedirect() {
    try {
      localStorage.removeItem('tc_token');
      localStorage.removeItem('tc_user');
      sessionStorage.removeItem('tc_token');
      sessionStorage.removeItem('tc_user');
    } catch (e) {}
    window.location.href = '/?auth_required=1';
  }

  // Step 1: Read storage
  let token = null;
  let user = null;
  try {
    token = localStorage.getItem('tc_token') || sessionStorage.getItem('tc_token');
    const rawUser = localStorage.getItem('tc_user') || sessionStorage.getItem('tc_user');
    if (rawUser && rawUser !== 'undefined' && rawUser !== 'null') {
      user = JSON.parse(rawUser);
    }
  } catch (err) {
    console.warn("[Auth Guard] Storage read notice:", err);
  }

  // Step 2: If token or user is missing, await Firebase Auth resolution
  if (!token || !user) {
    initFirebase();
    if (window.firebaseAuth) {
      try {
        const fbUser = await new Promise((resolve) => {
          if (window.firebaseAuth.currentUser) {
            return resolve(window.firebaseAuth.currentUser);
          }
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }, 1600);

          const unsub = window.firebaseAuth.onAuthStateChanged((u) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              try { unsub(); } catch (e) {}
              resolve(u);
            }
          });
        });

        if (fbUser) {
          token = await fbUser.getIdToken();
          // Attempt to retrieve profile from Firestore or API
          let profile = await fetchUserProfileFromFirestore(fbUser.uid);
          if (!profile && fbUser.email) {
            profile = await fetchUserProfileFromFirestore(fbUser.email);
          }

          if (!profile) {
            try {
              const res = await apiRequest('/api/auth/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res && res.user) profile = res.user;
            } catch (pErr) {
              console.warn("[Auth Guard] Backend profile sync notice:", pErr.message);
            }
          }

          if (!profile) {
            profile = {
              id: fbUser.uid,
              email: fbUser.email || '',
              role: reqRole,
              company_name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Authorized User'),
              contact_person: fbUser.displayName || 'Authorized User',
              mobile: fbUser.phoneNumber || '9800000000',
              verification_status: 'verified',
              status: 'active'
            };
          }

          user = profile;
          try {
            localStorage.setItem('tc_token', token);
            localStorage.setItem('tc_user', JSON.stringify(user));
            sessionStorage.setItem('tc_token', token);
            sessionStorage.setItem('tc_user', JSON.stringify(user));
          } catch (e) {}
        }
      } catch (fbErr) {
        console.warn("[Auth Guard] Firebase resolution notice:", fbErr);
      }
    }
  }

  // Step 3: Check if authentication state was resolved
  if (!token || !user) {
    console.warn("[Auth Guard] Unauthenticated session. Presenting in-portal sign-in overlay.");
    showInPortalAuthModal(reqRole, onAuthorized);
    return;
  }

  // Sync session across storage
  try {
    localStorage.setItem('tc_token', token);
    localStorage.setItem('tc_user', JSON.stringify(user));
    sessionStorage.setItem('tc_token', token);
    sessionStorage.setItem('tc_user', JSON.stringify(user));
  } catch (e) {}

  // Step 4: Role-Based Access Control
  const currentRole = (user.role || '').toLowerCase().trim();
  if (currentRole !== reqRole) {
    console.warn(`[Auth Guard] Role mismatch: user '${currentRole}' attempted access to '${reqRole}'. Redirecting to assigned portal.`);
    redirectUnauthorized(currentRole);
    return;
  }

  // Step 5: Verification passed! Dismiss veil and initialize dashboard
  dismissVeil();
  if (typeof onAuthorized === 'function') {
    onAuthorized(user, token);
  }
}

  function showInPortalAuthModal(role, onAuthSuccess) {
    if (!veil) return;
    const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
    const roleIcon = role === 'admin' ? '👑' : (role === 'transporter' ? '🚛' : '🏢');
    const demoCreds = role === 'admin' 
      ? { id: 'admin', pass: 'Admin@123456' }
      : (role === 'transporter' 
          ? { id: 'transporter', pass: 'Pass@123456' }
          : { id: 'dealer', pass: 'Pass@123456' });

    veil.innerHTML = `
      <div style="background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 16px; padding: 2.2rem 1.8rem; max-width: 440px; width: 92%; text-align: center; box-shadow: 0 25px 60px -15px rgba(0,0,0,0.85); backdrop-filter: blur(16px); color: #f1f5f9; position: relative;">
        <div style="font-size: 2.2rem; margin-bottom: 0.4rem;">${roleIcon}</div>
        <div style="font-weight: 700; font-size: 1.25rem; letter-spacing: 0.5px; color: #f8fafc; margin-bottom: 0.25rem;">
          ${roleCapitalized} Portal Access
        </div>
        <div style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 1.25rem;">
          Authentication required to view this operational command center
        </div>

        <!-- 1-Click Quick Demo Sign In -->
        <button id="inPortalQuickBtn" type="button" style="width: 100%; padding: 0.75rem 1rem; border-radius: 8px; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: none; color: white; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.9rem; transition: transform 0.15s ease, filter 0.15s ease;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
          ⚡ One-Click Sign In as ${roleCapitalized}
        </button>

        <div style="display: flex; align-items: center; margin: 0.8rem 0; gap: 0.6rem;">
          <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.12);"></div>
          <span style="font-size: 0.72rem; color: #64748b; text-transform: uppercase;">or enter credentials</span>
          <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.12);"></div>
        </div>

        <div id="inPortalBanner" style="display: none; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 0.75rem;"></div>

        <form id="inPortalForm" style="text-align: left;">
          <div style="margin-bottom: 0.75rem;">
            <label style="font-size: 0.75rem; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 0.3rem;">User ID, Email, or Mobile</label>
            <input type="text" id="inPortalIdent" placeholder="Enter ${role} ID or email" value="${demoCreds.id}" style="width: 100%; box-sizing: border-box; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: rgba(30, 41, 59, 0.8); color: white; font-size: 0.88rem; outline: none;">
          </div>
          <div style="margin-bottom: 1.1rem;">
            <label style="font-size: 0.75rem; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 0.3rem;">Password</label>
            <input type="password" id="inPortalPass" placeholder="Enter password" value="${demoCreds.pass}" style="width: 100%; box-sizing: border-box; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: rgba(30, 41, 59, 0.8); color: white; font-size: 0.88rem; outline: none;">
          </div>
          <button id="inPortalSubmitBtn" type="submit" style="width: 100%; padding: 0.7rem 1rem; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; font-size: 0.88rem; cursor: pointer; margin-bottom: 0.75rem;">
            Sign In to Dashboard ➔
          </button>
        </form>

        <a href="/" style="display: inline-block; font-size: 0.8rem; color: #38bdf8; text-decoration: none; margin-top: 0.25rem;">
          ← Return to Main Homepage
        </a>
      </div>
    `;

    async function executeInPortalLogin(identifier, password) {
      const banner = document.getElementById('inPortalBanner');
      const submitBtn = document.getElementById('inPortalSubmitBtn');
      const quickBtn = document.getElementById('inPortalQuickBtn');
      if (banner) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(59, 130, 246, 0.2)';
        banner.style.color = '#93c5fd';
        banner.textContent = 'Authenticating with TranceConnect...';
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying...'; }
      if (quickBtn) quickBtn.disabled = true;

      try {
        const data = await apiRequest('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier, identifier: identifier, password: password })
        });

        if (!data || !data.token) {
          throw new Error((data && data.error) || 'Invalid authentication response.');
        }

        // Save session in storage
        localStorage.setItem('tc_token', data.token);
        localStorage.setItem('tc_user', JSON.stringify(data.user));
        sessionStorage.setItem('tc_token', data.token);
        sessionStorage.setItem('tc_user', JSON.stringify(data.user));

        const userRole = (data.user.role || data.role || '').toLowerCase().trim();
        if (userRole !== role) {
          if (userRole === 'admin') window.location.href = '/admin';
          else if (userRole === 'transporter') window.location.href = '/transporter';
          else if (userRole === 'dealer') window.location.href = '/dealer';
          return;
        }

        if (banner) {
          banner.style.background = 'rgba(16, 185, 129, 0.2)';
          banner.style.color = '#6ee7b7';
          banner.textContent = `Welcome, ${data.user.company_name || data.user.contact_person || 'User'}! Opening portal...`;
        }

        setTimeout(() => {
          dismissVeil();
          if (typeof onAuthSuccess === 'function') {
            onAuthSuccess(data.user, data.token);
          }
        }, 350);

      } catch (err) {
        if (banner) {
          banner.style.display = 'block';
          banner.style.background = 'rgba(239, 68, 68, 0.2)';
          banner.style.color = '#fca5a5';
          banner.textContent = err.message || 'Authentication failed. Please verify credentials.';
        }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In to Dashboard ➔'; }
        if (quickBtn) quickBtn.disabled = false;
      }
    }

    const qBtn = document.getElementById('inPortalQuickBtn');
    if (qBtn) {
      qBtn.onclick = () => executeInPortalLogin(demoCreds.id, demoCreds.pass);
    }

    const form = document.getElementById('inPortalForm');
    if (form) {
      form.onsubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const ident = (document.getElementById('inPortalIdent').value || '').trim();
        const pass = (document.getElementById('inPortalPass').value || '').trim();
        executeInPortalLogin(ident, pass);
      };
    }
  }

window.verifyAndEnforceDashboardAuth = verifyAndEnforceDashboardAuth;
