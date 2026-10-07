/**
 * TRANCECONNECT-PRIME: LANDING & ACCESS CONTROLLER
 * Connects to live MySQL database for authentication, registration, and direct tracking.
 */

let currentAuthToken = localStorage.getItem('tc_token') || null;
let currentUser = JSON.parse(localStorage.getItem('tc_user') || 'null');
let trackingMapInstance = null;
let trackingMarkerInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  setupInteractiveEffects();
  checkExistingSession();
  checkApiHealth();
  initStatsCounters();
});

function setupInteractiveEffects() {
  const bg = document.getElementById('parallaxBg');
  const glow = document.getElementById('cursorGlow');

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5);
    const y = (e.clientY / window.innerHeight - 0.5);
    if (bg) bg.style.transform = `translate3d(${x * 24}px, ${y * 24}px, 0)`;
    if (glow) {
      glow.style.left = `${e.clientX}px`;
      glow.style.top = `${e.clientY}px`;
    }
  });
}

function checkExistingSession() {
  if (currentAuthToken && currentUser) {
    const actions = document.querySelector('.nav-actions');
    if (actions) {
      const targetUrl = currentUser.role === 'dealer' ? '/dealer' : (currentUser.role === 'transporter' ? '/transporter' : '/admin');
      actions.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="window.location.href='${targetUrl}'">
          Open ${currentUser.role.toUpperCase()} Dashboard ➔
        </button>
        <button class="btn btn-outline btn-sm" onclick="logoutSession()">Sign Out</button>
      `;
    }
  }
}

async function checkApiHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const tel = document.getElementById('telemetryStatus');
    if (data.status === 'healthy') {
      tel.innerHTML = '● LIVE MYSQL DATABASE LINKED &bull; v' + data.version;
      tel.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      tel.innerHTML = '⚠️ DB WARNING: ' + (data.database ? data.database.message : 'Check MySQL');
    }
  } catch (err) {
    const tel = document.getElementById('telemetryStatus');
    if (tel) tel.innerHTML = '● API CONNECTING...';
  }
}

// AUTH MODAL
function openAuthModal(mode = 'login') {
  setAuthTab(mode === 'register' ? 'reg-dealer' : 'login');
  openModal('authModal');
}

function setAuthTab(tab) {
  const loginForm = document.getElementById('formLogin');
  const regForm = document.getElementById('formRegister');
  const forgotForm = document.getElementById('formForgot');
  const title = document.getElementById('authModalTitle');

  ['btnAuthTabLogin', 'btnAuthTabRegDealer', 'btnAuthTabRegTrans'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('btn-primary');
  });

  if (tab === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    forgotForm.style.display = 'none';
    title.textContent = 'Sign In to TranceConnect';
    document.getElementById('btnAuthTabLogin').classList.add('btn-primary');
  } else if (tab === 'reg-dealer' || tab === 'reg-trans') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    forgotForm.style.display = 'none';
    const isDealer = tab === 'reg-dealer';
    document.getElementById('regRole').value = isDealer ? 'dealer' : 'transporter';
    title.textContent = isDealer ? 'Register as Shipper / Dealer' : 'Register as Fleet Transporter';
    document.getElementById('btnRegisterSubmit').textContent = isDealer ? 'Register Shipper Account' : 'Register Transporter Account';
    document.getElementById(isDealer ? 'btnAuthTabRegDealer' : 'btnAuthTabRegTrans').classList.add('btn-primary');
  } else if (tab === 'forgot') {
    loginForm.style.display = 'none';
    regForm.style.display = 'none';
    forgotForm.style.display = 'block';
    document.getElementById('otpStep1').style.display = 'block';
    document.getElementById('otpStep2').style.display = 'none';
    title.textContent = 'Password Recovery & OTP';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Authentication failed', 'error');
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast(`Authentication successful! Welcome, ${data.user.company_name}`, 'success');

    // Route directly to the role dashboard
    setTimeout(() => {
      if (data.user.role === 'dealer') window.location.href = '/dealer';
      else if (data.user.role === 'transporter') window.location.href = '/transporter';
      else if (data.user.role === 'admin') window.location.href = '/admin';
      else window.location.reload();
    }, 400);
  } catch (err) {
    showToast('Login error: ' + err.message, 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const role = document.getElementById('regRole').value;
  const company_name = document.getElementById('regCompany').value.trim();
  const mobile = document.getElementById('regMobile').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const gst_number = document.getElementById('regGst').value.trim();
  const city = document.getElementById('regCity').value.trim();
  const password = document.getElementById('regPassword').value.trim();

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, company_name, mobile, email, gst_number, city, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Registration failed', 'error');
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast(data.message, 'success');

    setTimeout(() => {
      if (role === 'dealer') window.location.href = '/dealer';
      else window.location.href = '/transporter';
    }, 400);
  } catch (err) {
    showToast('Registration error: ' + err.message, 'error');
  }
}

async function requestPasswordOtp() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) {
    showToast('Please enter your email', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to request OTP', 'error');
      return;
    }

    showToast(data.message, 'success');
    document.getElementById('otpStep1').style.display = 'none';
    document.getElementById('otpStep2').style.display = 'block';

    if (data.otp_code) {
      document.getElementById('forgotOtpCode').value = data.otp_code;
      showToast(`Verification OTP Code: ${data.otp_code}`, 'info');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

async function submitPasswordReset() {
  const email = document.getElementById('forgotEmail').value.trim();
  const otp_code = document.getElementById('forgotOtpCode').value.trim();
  const new_password = document.getElementById('forgotNewPassword').value.trim();

  if (!otp_code || !new_password) {
    showToast('Please enter OTP and new password', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp_code, new_password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to reset password', 'error');
      return;
    }

    showToast(data.message, 'success');
    setAuthTab('login');
  } catch (err) {
    showToast('Reset failed: ' + err.message, 'error');
  }
}

function logoutSession() {
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_user');
  window.location.reload();
}

// LIVE TRACKING SEARCH DIRECT FROM DATABASE
async function handleLiveSearchTracking(e) {
  e.preventDefault();
  const shipId = document.getElementById('trackingSearchInput').value.trim();
  if (!shipId) return;

  try {
    const res = await fetch(`/api/tracking/${shipId}`);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || `Consignment #${shipId} not found in database`, 'error');
      return;
    }

    const { shipment, latest_location } = data;
    document.getElementById('trackModalHeading').textContent = `Consignment #${shipment.id} Radar: ${shipment.product_type}`;
    document.getElementById('trackModalRoute').textContent = `${shipment.pickup_location} ➔ ${shipment.delivery_location}`;
    document.getElementById('trackCurLocation').textContent = latest_location.location_name || shipment.pickup_location;
    document.getElementById('trackSpeed').textContent = `${Number(latest_location.speed_kmh || 0).toFixed(0)} KM/H`;
    document.getElementById('trackStatusNote').textContent = latest_location.status_note || `Status: ${shipment.status}`;

    openModal('trackingModal');
    setTimeout(() => {
      initTrackingMap(latest_location.latitude, latest_location.longitude, latest_location.location_name);
    }, 250);
  } catch (err) {
    showToast('Tracking query error: ' + err.message, 'error');
  }
}

function initTrackingMap(lat, lng, locName) {
  const container = document.getElementById('trackingMap');
  if (!container) return;

  const validLat = Number(lat) || 19.0760;
  const validLng = Number(lng) || 72.8777;

  if (!trackingMapInstance) {
    trackingMapInstance = L.map('trackingMap').setView([validLat, validLng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap | TranceConnect GPS Radar'
    }).addTo(trackingMapInstance);
  } else {
    trackingMapInstance.invalidateSize();
    trackingMapInstance.setView([validLat, validLng], 12);
  }

  const truckIcon = L.icon({
    iconUrl: 'assets/truck-marker.svg',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -20]
  });

  if (trackingMarkerInstance) {
    trackingMarkerInstance.setLatLng([validLat, validLng]);
  } else {
    trackingMarkerInstance = L.marker([validLat, validLng], { icon: truckIcon }).addTo(trackingMapInstance);
  }

  trackingMarkerInstance.bindPopup(`<b>${escapeHtml(locName || 'Consignment in Transit')}</b><br>Speed: 52 km/h<br>Coordinates: ${validLat.toFixed(4)}, ${validLng.toFixed(4)}`).openPopup();
}

// AI SPECIALIST
function toggleAIAssistant() {
  document.getElementById('aiWidget').classList.toggle('active');
}

async function handleSendAiMessage(e) {
  e.preventDefault();
  const input = document.getElementById('aiUserInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  askAiQuestion(text);
}

async function askAiQuestion(prompt) {
  const feed = document.getElementById('aiChatFeed');
  if (!feed) return;

  document.getElementById('aiWidget').classList.add('active');
  feed.innerHTML += `
    <div class="chat-bubble bubble-mine">${escapeHtml(prompt)}</div>
    <div id="aiThinking" class="chat-bubble bubble-theirs" style="color: var(--cyan);">
      <span class="pulse-dot"></span> Analyzing freight parameters...
    </div>
  `;
  feed.scrollTop = feed.scrollHeight;

  try {
    const res = await fetch('/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, role: 'shipper' })
    });
    const data = await res.json();

    const t = document.getElementById('aiThinking');
    if (t) t.remove();

    feed.innerHTML += `<div class="chat-bubble bubble-theirs">${formatMarkdown(data.reply)}</div>`;
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    const t = document.getElementById('aiThinking');
    if (t) t.remove();
    feed.innerHTML += `<div class="chat-bubble bubble-theirs" style="color:var(--rose);">AI Assistant error: ${err.message}</div>`;
  }
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || '⚡'}</span> <div>${escapeHtml(message)}</div>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btnEl) btnEl.textContent = '🔒';
  } else {
    input.type = 'password';
    if (btnEl) btnEl.textContent = '👁️';
  }
}

function toggleMobileLandingDrawer(forceState) {
  const drawer = document.getElementById('landingMobileDrawer');
  const overlay = document.getElementById('landingMobileDrawerOverlay');
  const isActive = typeof forceState === 'boolean' ? forceState : (drawer && !drawer.classList.contains('active'));
  if (drawer) drawer.classList.toggle('active', isActive);
  if (overlay) overlay.classList.toggle('active', isActive);
}

function initStatsCounters() {
  const statsBar = document.querySelector('.hero-stats-bar');
  if (!statsBar) return;

  let hasAnimated = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !hasAnimated) {
        hasAnimated = true;
        animateNumber('statTransporters', 0, 250, 1500, '', '+');
        animateFloat('statFreight', 0.5, 3.8, 1800, '₹', 'Cr');
      }
    });
  }, { threshold: 0.3 });

  observer.observe(statsBar);
}

function animateNumber(elementId, start, end, duration, prefix = '', suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1.0);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * easeOut);
    el.innerHTML = `${prefix}${current}<span>${suffix}</span>`;
    if (progress < 1.0) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function animateFloat(elementId, start, end, duration, prefix = '', suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1.0);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = (start + (end - start) * easeOut).toFixed(1);
    el.innerHTML = `${prefix}${current}<span>${suffix}</span>`;
    if (progress < 1.0) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

