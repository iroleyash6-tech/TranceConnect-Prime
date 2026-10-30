/**
 * TRANCECONNECT-PRIME: LANDING & ACCESS CONTROLLER
 * Connects to live backend for authentication, registration, and direct tracking.
 */

function getStoredUser() {
  try {
    const raw = localStorage.getItem('tc_user');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

let currentAuthToken = localStorage.getItem('tc_token') || null;
let currentUser = getStoredUser();
let trackingMapInstance = null;
let trackingMarkerInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  setupInteractiveEffects();
  checkExistingSession();
  checkApiHealth();
  initStatsCounters();
  setupAuthValidation();
  initPageButtons();

  // If page was loaded with a pending tab from early user click
  if (window._pendingAuthTab) {
    const p = window._pendingAuthTab;
    window._pendingAuthTab = null;
    openAuthModal(p);
  }

  // Auto-open modal or alert if navigated with hash, path or params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('session_expired')) {
    showToast('Your session has expired. Please sign in again.', 'warning');
    openAuthModal('login');
  } else if (urlParams.get('tab') === 'transporter') {
    openAuthModal('transporter');
  } else if (urlParams.get('tab') === 'dealer') {
    openAuthModal('dealer');
  } else if (urlParams.get('tab') === 'forgot') {
    openAuthModal('forgot');
  } else if (window.location.hash === '#register' || window.location.pathname.endsWith('/register') || window.location.pathname.endsWith('/register.html')) {
    openAuthModal('register');
  } else if (window.location.hash === '#login' || window.location.pathname.endsWith('/login') || window.location.pathname.endsWith('/login.html')) {
    openAuthModal('login');
  } else if (window.location.hash === '#tracking') {
    openTrackingInterface();
  }
});

function initPageButtons() {
  // Delegated global click dispatcher ensures 100% click capture without duplicate collisions
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;

    // 1. Get Started
    if (t.closest('#btnHeroGetStarted, .btn-hero-get-started')) {
      e.preventDefault();
      openAuthModal('register');
      return;
    }

    // 2. Explore Platform
    if (t.closest('#btnHeroExplore')) {
      e.preventDefault();
      scrollToSection('features');
      return;
    }

    // 3. Sign In triggers
    if (t.closest('#btnHeroSignIn, #btnNavSignIn, #navLinkSignIn, #btnDrawerSignIn')) {
      e.preventDefault();
      if (typeof toggleMobileLandingDrawer === 'function') toggleMobileLandingDrawer(false);
      openAuthModal('login');
      return;
    }

    // 4. Register triggers
    if (t.closest('#btnNavRegister, #btnDrawerRegister')) {
      e.preventDefault();
      if (typeof toggleMobileLandingDrawer === 'function') toggleMobileLandingDrawer(false);
      openAuthModal('register');
      return;
    }

    // 5. Track Order / Consignment
    if (t.closest('#btnHeroTrack')) {
      e.preventDefault();
      openTrackingInterface();
      return;
    }

    // 6. Role Selection Cards
    const roleCard = t.closest('.role-selection-card');
    if (roleCard) {
      const isTrans = roleCard.innerText.includes('Transporter') || roleCard.getAttribute('data-role') === 'transporter';
      setAuthTab(isTrans ? 'transporter' : 'dealer');
      return;
    }

    // 7. Modal backdrop click to dismiss
    if (t.classList && t.classList.contains('modal-overlay')) {
      closeModal(t.id);
      return;
    }
  });
}

function setupInteractiveEffects() {
  const bg = document.getElementById('parallaxBg');
  const glow = document.getElementById('cursorGlow');
  let rafId = null;

  document.addEventListener('mousemove', (e) => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      if (bg) bg.style.transform = `translate3d(${x * 24}px, ${y * 24}px, 0)`;
      if (glow) {
        glow.style.left = `${e.clientX}px`;
        glow.style.top = `${e.clientY}px`;
      }
    });
  }, { passive: true });
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

// ===================================================================
// TRANCECONNECT-PRO: PRODUCTION API HELPER & HEALTH CHECK
// ===================================================================

const apiRequest = window.apiRequest || async function(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error("Unable to connect to the server. Please check your internet connection.");
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
};
window.apiRequest = apiRequest;

async function checkApiHealth() {
  try {
    const data = await apiRequest('/api/health');
    const tel = document.getElementById('telemetryStatus');
    if (data.status === 'healthy' || data.success) {
      tel.innerHTML = '● LIVE API & DATABASE LINKED &bull; v' + (data.version || '2.4.0');
      tel.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      tel.innerHTML = '⚠️ DB WARNING: ' + (data.database ? data.database.message : 'Check MySQL');
    }
  } catch (err) {
    const tel = document.getElementById('telemetryStatus');
    if (tel) tel.innerHTML = '● API CONNECTING...';
  }
}

// ===================================================================
// TRANCECONNECT-PRIME: AUTHENTICATION, REGISTRATION & TRACKING
// ===================================================================

let otpCooldownTimer = null;
let otpCooldownSeconds = 60;
let otpExpiryTimer = null;
let otpExpirySeconds = 300;
let currentResetSessionToken = null;

function openAuthModal(initialTab = 'login', mode = null) {
  let target = initialTab;
  if (initialTab === 'register' || initialTab === 'select') {
    target = 'register';
  }
  setAuthTab(target);
  openModal('authModal');
}
window.openAuthModal = openAuthModal;

function openTrackingInterface(shipmentId = null) {
  const sec = document.getElementById('tracking');
  if (sec) {
    sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inp = document.getElementById('trackingSearchInput');
    if (inp) {
      if (shipmentId) inp.value = shipmentId;
      setTimeout(() => {
        inp.focus();
        inp.select();
        inp.classList.add('input-highlight-pulse');
        setTimeout(() => inp.classList.remove('input-highlight-pulse'), 2000);
      }, 350);
    }
  }
}
window.openTrackingInterface = openTrackingInterface;

function setAuthTab(tab) {
  const formLogin = document.getElementById('formLogin');
  const viewSelect = document.getElementById('viewAuthRoleSelect');
  const formDealer = document.getElementById('formDealerRegister');
  const formTransporter = document.getElementById('formTransporterRegister');
  const formForgot = document.getElementById('formForgot');
  const title = document.getElementById('authModalTitle');
  const subtitle = document.getElementById('authModalSubtitle');

  const btnLogin = document.getElementById('btnAuthTabLogin');
  const btnSelect = document.getElementById('btnAuthTabSelect');
  const btnDealer = document.getElementById('btnAuthTabDealer');
  const btnTransporter = document.getElementById('btnAuthTabTransporter');
  const btnForgot = document.getElementById('btnAuthTabForgot');

  [btnLogin, btnSelect, btnDealer, btnTransporter, btnForgot].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (formLogin) formLogin.style.display = 'none';
  if (viewSelect) viewSelect.style.display = 'none';
  if (formDealer) formDealer.style.display = 'none';
  if (formTransporter) formTransporter.style.display = 'none';
  if (formForgot) formForgot.style.display = 'none';

  if (tab === 'register' || tab === 'select' || tab === 'role-select') {
    if (viewSelect) viewSelect.style.display = 'block';
    if (btnSelect) btnSelect.classList.add('active');
    if (title) title.textContent = 'Create Your TranceConnect Account';
    if (subtitle) subtitle.textContent = 'Select your operational role to join the freight network';
  } else if (tab === 'login') {
    if (formLogin) formLogin.style.display = 'block';
    if (btnLogin) btnLogin.classList.add('active');
    if (title) title.textContent = 'Sign In to TranceConnect';
    if (subtitle) subtitle.textContent = 'National Commercial Freight & Telematics Platform';
    setTimeout(() => {
      const el = document.getElementById('loginIdentifier');
      if (el) el.focus();
    }, 120);
  } else if (tab === 'dealer') {
    if (formDealer) formDealer.style.display = 'block';
    if (btnDealer) btnDealer.classList.add('active');
    if (title) title.textContent = 'Shipper & Dealer Registration';
    if (subtitle) subtitle.textContent = 'Instant Onboarding for Manufacturers, Mills & Shippers';
    setTimeout(() => {
      const el = document.getElementById('dealerCompany');
      if (el) el.focus();
    }, 120);
  } else if (tab === 'transporter') {
    if (formTransporter) formTransporter.style.display = 'block';
    if (btnTransporter) btnTransporter.classList.add('active');
    if (title) title.textContent = 'Fleet Transporter Registration';
    if (subtitle) subtitle.textContent = 'Commercial Truck Operators, Fleets & Licensed Drivers';
    setTimeout(() => {
      const el = document.getElementById('transCompany');
      if (el) el.focus();
    }, 120);
  } else if (tab === 'forgot') {
    if (formForgot) formForgot.style.display = 'block';
    if (btnForgot) btnForgot.classList.add('active');
    if (title) title.textContent = 'Reset Account Password';
    if (subtitle) subtitle.textContent = 'Secure 6-Digit Email OTP Verification';

    const s1 = document.getElementById('otpStep1');
    const s2 = document.getElementById('otpStep2');
    const s3 = document.getElementById('otpStep3');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    if (s3) s3.style.display = 'none';

    setTimeout(() => {
      const el = document.getElementById('forgotEmail');
      if (el) el.focus();
    }, 120);
  }
}
window.setAuthTab = setAuthTab;

// -------------------------------------------------------------
// UI HELPERS: ATTACHMENTS, PASSWORD REVEAL & STRENGTH METER
// -------------------------------------------------------------
function handleDocSelection(input, displayId) {
  const disp = document.getElementById(displayId);
  if (!disp) return;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    disp.textContent = `Attached: ${file.name} (${sizeMb} MB)`;
    disp.style.display = 'block';
  } else {
    disp.textContent = '';
    disp.style.display = 'none';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
}

function updatePasswordStrengthMeter(val, fillId, textId) {
  const fill = document.getElementById(fillId);
  const text = document.getElementById(textId);
  if (!fill || !text) return;

  if (!val || val.length === 0) {
    fill.style.width = '0%';
    fill.className = 'meter-bar-fill';
    text.textContent = 'Enter Password';
    text.className = 'meter-strength-text';
    return;
  }

  let score = 0;
  if (val.length >= 6) score += 1;
  if (val.length >= 8) score += 1;
  if (/[0-9]/.test(val)) score += 1;
  if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score += 1;
  if (/[^A-Za-z0-9]/.test(val)) score += 1;

  if (score <= 1) {
    fill.style.width = '25%';
    fill.className = 'meter-bar-fill strength-weak';
    text.textContent = 'Weak';
    text.className = 'meter-strength-text strength-weak';
  } else if (score <= 2) {
    fill.style.width = '50%';
    fill.className = 'meter-bar-fill strength-fair';
    text.textContent = 'Fair';
    text.className = 'meter-strength-text strength-fair';
  } else if (score <= 3) {
    fill.style.width = '75%';
    fill.className = 'meter-bar-fill strength-good';
    text.textContent = 'Good';
    text.className = 'meter-strength-text strength-good';
  } else {
    fill.style.width = '100%';
    fill.className = 'meter-bar-fill strength-strong';
    text.textContent = 'Strong (Optimal)';
    text.className = 'meter-strength-text strength-strong';
  }
}

function setFieldValidationState(fieldId, isValid, errorMsg) {
  const wrap = document.getElementById(`wrap_${fieldId}`);
  const errEl = document.getElementById(`err_${fieldId}`);
  if (!wrap) return isValid;

  if (isValid) {
    wrap.classList.remove('has-invalid');
    wrap.classList.add('has-valid');
    if (errEl) errEl.style.display = 'none';
  } else {
    wrap.classList.remove('has-valid');
    wrap.classList.add('has-invalid');
    if (errEl) {
      if (errorMsg) errEl.textContent = errorMsg;
      errEl.style.display = 'flex';
    }
  }
  return isValid;
}

function focusFirstInvalidField(fieldIds) {
  for (const id of fieldIds) {
    const wrap = document.getElementById(`wrap_${id}`);
    if (wrap && wrap.classList.contains('has-invalid')) {
      const input = document.getElementById(id);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
  }
}

// -------------------------------------------------------------
// REAL-TIME FIELD VALIDATORS
// -------------------------------------------------------------
function validateIdentifier() {
  const el = document.getElementById('loginIdentifier');
  if (!el) return true;
  const val = el.value.trim();
  const ok = val.length > 0;
  return setFieldValidationState('loginIdentifier', ok, 'Please enter your User ID, Email address, or Mobile number.');
}

function validateEmailVal(emailVal, fieldId) {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal.trim());
  return setFieldValidationState(fieldId, ok, 'Enter a valid email address, for example name@example.com.');
}

function validateMobileVal(mobileVal, fieldId) {
  const clean = mobileVal.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '');
  const ok = /^[6-9]\d{9}$/.test(clean);
  return setFieldValidationState(fieldId, ok, 'Please enter a valid 10-digit Indian mobile number.');
}

function validateGstVal(gstVal, fieldId) {
  const val = gstVal.trim().toUpperCase();
  if (!val) {
    // Optional field
    const wrap = document.getElementById(`wrap_${fieldId}`);
    if (wrap) wrap.classList.remove('has-invalid', 'has-valid');
    const errEl = document.getElementById(`err_${fieldId}`);
    if (errEl) errEl.style.display = 'none';
    return true;
  }
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const ok = gstRegex.test(val);
  return setFieldValidationState(fieldId, ok, 'Please enter a valid 15-character GSTIN (e.g. 27AAAAA0000A1Z5).');
}

function validateDealerCompany() {
  const el = document.getElementById('dealerCompany');
  const val = el ? el.value.trim() : '';
  const ok = val.length >= 2;
  return setFieldValidationState('dealerCompany', ok, 'Please enter your registered company name.');
}

function validateDealerOwner() {
  const el = document.getElementById('dealerOwner');
  const val = el ? el.value.trim() : '';
  const ok = val.length >= 2;
  return setFieldValidationState('dealerOwner', ok, 'Please enter the authorized owner or representative full name.');
}

function validateDealerMobile() {
  const el = document.getElementById('dealerMobile');
  return validateMobileVal(el ? el.value : '', 'dealerMobile');
}

function validateDealerEmail() {
  const el = document.getElementById('dealerEmail');
  return validateEmailVal(el ? el.value : '', 'dealerEmail');
}

function validateDealerGst() {
  const el = document.getElementById('dealerGst');
  return validateGstVal(el ? el.value : '', 'dealerGst');
}

function validateDealerPassword() {
  const p1 = document.getElementById('dealerPassword');
  const val = p1 ? p1.value : '';
  updatePasswordStrengthMeter(val, 'dealerStrengthFill', 'dealerStrengthText');
  const ok = val.length >= 6;
  return setFieldValidationState('dealerPassword', ok, 'Password must be at least 6 characters long.');
}

function validateDealerConfirmPassword() {
  const p1 = document.getElementById('dealerPassword');
  const p2 = document.getElementById('dealerConfirmPassword');
  if (!p1 || !p2) return true;
  const ok = p2.value.length > 0 && p1.value === p2.value;
  return setFieldValidationState('dealerConfirmPassword', ok, 'Your passwords do not match. Please check both password fields.');
}

function validateTransCompany() {
  const el = document.getElementById('transCompany');
  const val = el ? el.value.trim() : '';
  const ok = val.length >= 2;
  return setFieldValidationState('transCompany', ok, 'Please enter your registered transport company name.');
}

function validateTransOwner() {
  const el = document.getElementById('transOwner');
  const val = el ? el.value.trim() : '';
  const ok = val.length >= 2;
  return setFieldValidationState('transOwner', ok, 'Please enter the authorized owner or fleet manager full name.');
}

function validateTransMobile() {
  const el = document.getElementById('transMobile');
  return validateMobileVal(el ? el.value : '', 'transMobile');
}

function validateTransEmail() {
  const el = document.getElementById('transEmail');
  return validateEmailVal(el ? el.value : '', 'transEmail');
}

function validateTransGst() {
  const el = document.getElementById('transGst');
  return validateGstVal(el ? el.value : '', 'transGst');
}

function validateTransPassword() {
  const p1 = document.getElementById('transPassword');
  const val = p1 ? p1.value : '';
  updatePasswordStrengthMeter(val, 'transStrengthFill', 'transStrengthText');
  const ok = val.length >= 6;
  return setFieldValidationState('transPassword', ok, 'Password must be at least 6 characters long.');
}

function validateTransConfirmPassword() {
  const p1 = document.getElementById('transPassword');
  const p2 = document.getElementById('transConfirmPassword');
  if (!p1 || !p2) return true;
  const ok = p2.value.length > 0 && p1.value === p2.value;
  return setFieldValidationState('transConfirmPassword', ok, 'Your passwords do not match. Please check both password fields.');
}

function validateForgotEmail() {
  const el = document.getElementById('forgotEmail');
  return validateEmailVal(el ? el.value : '', 'forgotEmail');
}

function validateForgotNewPassword() {
  const p1 = document.getElementById('forgotNewPassword');
  const val = p1 ? p1.value : '';
  updatePasswordStrengthMeter(val, 'forgotStrengthFill', 'forgotStrengthText');
  const ok = val.length >= 6;
  return setFieldValidationState('forgotNewPassword', ok, 'Password must be at least 6 characters long.');
}

function validateForgotConfirmPassword() {
  const p1 = document.getElementById('forgotNewPassword');
  const p2 = document.getElementById('forgotConfirmPassword');
  if (!p1 || !p2) return true;
  const ok = p2.value.length > 0 && p1.value === p2.value;
  return setFieldValidationState('forgotConfirmPassword', ok, 'Your passwords do not match. Please check both password fields.');
}

// -------------------------------------------------------------
// REAL-TIME EVENT ATTACHMENTS
// -------------------------------------------------------------
function setupAuthValidation() {
  // Login
  const loginIdent = document.getElementById('loginIdentifier');
  const loginPass = document.getElementById('loginPassword');
  if (loginIdent) {
    loginIdent.addEventListener('input', validateIdentifier);
    loginIdent.addEventListener('blur', validateIdentifier);
    loginIdent.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (loginPass && !loginPass.value) {
          loginPass.focus();
        } else {
          handleLoginSubmit(e);
        }
      }
    });
  }
  if (loginPass) {
    loginPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLoginSubmit(e);
      }
    });
  }

  // Dealer Form
  const dc = document.getElementById('dealerCompany');
  if (dc) { dc.addEventListener('input', validateDealerCompany); dc.addEventListener('blur', validateDealerCompany); }
  const do_el = document.getElementById('dealerOwner');
  if (do_el) { do_el.addEventListener('input', validateDealerOwner); do_el.addEventListener('blur', validateDealerOwner); }
  const dm = document.getElementById('dealerMobile');
  if (dm) { dm.addEventListener('input', validateDealerMobile); dm.addEventListener('blur', validateDealerMobile); }
  const de = document.getElementById('dealerEmail');
  if (de) { de.addEventListener('input', validateDealerEmail); de.addEventListener('blur', validateDealerEmail); }
  const dg = document.getElementById('dealerGst');
  if (dg) { dg.addEventListener('input', validateDealerGst); dg.addEventListener('blur', validateDealerGst); }
  const dp = document.getElementById('dealerPassword');
  if (dp) {
    dp.addEventListener('input', () => { validateDealerPassword(); validateDealerConfirmPassword(); });
    dp.addEventListener('blur', validateDealerPassword);
  }
  const dcp = document.getElementById('dealerConfirmPassword');
  if (dcp) { dcp.addEventListener('input', validateDealerConfirmPassword); dcp.addEventListener('blur', validateDealerConfirmPassword); }

  // Transporter Form
  const tc = document.getElementById('transCompany');
  if (tc) { tc.addEventListener('input', validateTransCompany); tc.addEventListener('blur', validateTransCompany); }
  const to_el = document.getElementById('transOwner');
  if (to_el) { to_el.addEventListener('input', validateTransOwner); to_el.addEventListener('blur', validateTransOwner); }
  const tm = document.getElementById('transMobile');
  if (tm) { tm.addEventListener('input', validateTransMobile); tm.addEventListener('blur', validateTransMobile); }
  const te = document.getElementById('transEmail');
  if (te) { te.addEventListener('input', validateTransEmail); te.addEventListener('blur', validateTransEmail); }
  const tg = document.getElementById('transGst');
  if (tg) { tg.addEventListener('input', validateTransGst); tg.addEventListener('blur', validateTransGst); }
  const tp = document.getElementById('transPassword');
  if (tp) {
    tp.addEventListener('input', () => { validateTransPassword(); validateTransConfirmPassword(); });
    tp.addEventListener('blur', validateTransPassword);
  }
  const tcp = document.getElementById('transConfirmPassword');
  if (tcp) { tcp.addEventListener('input', validateTransConfirmPassword); tcp.addEventListener('blur', validateTransConfirmPassword); }

  // Forgot Form
  const fe = document.getElementById('forgotEmail');
  if (fe) { fe.addEventListener('input', validateForgotEmail); fe.addEventListener('blur', validateForgotEmail); }
  const fnp = document.getElementById('forgotNewPassword');
  if (fnp) {
    fnp.addEventListener('input', () => { validateForgotNewPassword(); validateForgotConfirmPassword(); });
    fnp.addEventListener('blur', validateForgotNewPassword);
  }
  const fcp = document.getElementById('forgotConfirmPassword');
  if (fcp) { fcp.addEventListener('input', validateForgotConfirmPassword); fcp.addEventListener('blur', validateForgotConfirmPassword); }

  // Setup 6-Box OTP Inputs
  setupOtpInputs();
}

// -------------------------------------------------------------
// 6-BOX OTP AUTO-FOCUS, PASTE & BACKSPACE NAVIGATION
// -------------------------------------------------------------
function setupOtpInputs() {
  const digits = [0, 1, 2, 3, 4, 5].map(i => document.getElementById(`otpDigit${i}`));

  digits.forEach((input, index) => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      const val = input.value.replace(/[^0-9]/g, '');
      input.value = val ? val.slice(-1) : '';

      if (input.value) {
        input.classList.add('filled');
        if (index < 5 && digits[index + 1]) {
          digits[index + 1].focus();
        } else if (index === 5) {
          const fullOtp = digits.map(d => d ? d.value : '').join('');
          if (fullOtp.length === 6) {
            const verifyBtn = document.getElementById('btnVerifyOtp');
            if (verifyBtn) verifyBtn.focus();
          }
        }
      } else {
        input.classList.remove('filled');
      }
      clearOtpDigitErrors();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!input.value && index > 0 && digits[index - 1]) {
          digits[index - 1].focus();
          digits[index - 1].value = '';
          digits[index - 1].classList.remove('filled');
        } else {
          input.value = '';
          input.classList.remove('filled');
        }
        clearOtpDigitErrors();
      } else if (e.key === 'ArrowLeft' && index > 0 && digits[index - 1]) {
        digits[index - 1].focus();
      } else if (e.key === 'ArrowRight' && index < 5 && digits[index + 1]) {
        digits[index + 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      const numOnly = pasteData.replace(/[^0-9]/g, '').slice(0, 6);
      if (numOnly.length > 0) {
        numOnly.split('').forEach((char, i) => {
          if (digits[i]) {
            digits[i].value = char;
            digits[i].classList.add('filled');
          }
        });
        const targetIdx = Math.min(numOnly.length, 5);
        if (digits[targetIdx]) digits[targetIdx].focus();
        clearOtpDigitErrors();
        if (numOnly.length === 6) {
          const verifyBtn = document.getElementById('btnVerifyOtp');
          if (verifyBtn) verifyBtn.focus();
        }
      }
    });

    input.addEventListener('focus', () => {
      input.select();
    });
  });
}

function clearOtpDigitErrors() {
  const errEl = document.getElementById('err_otpDigits');
  if (errEl) errEl.style.display = 'none';
  [0, 1, 2, 3, 4, 5].forEach(i => {
    const el = document.getElementById(`otpDigit${i}`);
    if (el) el.classList.remove('is-invalid');
  });
}

function getEnteredOtp() {
  let otp = '';
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`otpDigit${i}`);
    otp += el ? el.value.trim() : '';
  }
  return otp;
}

// -------------------------------------------------------------
// SUBMISSION: USER LOGIN (EMAIL OR MOBILE)
// -------------------------------------------------------------
let isLoginSubmitting = false;

async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (isLoginSubmitting) return;

  const identEl = document.getElementById('loginIdentifier');
  const passEl = document.getElementById('loginPassword');
  const ident = identEl ? identEl.value.trim() : '';
  const pass = passEl ? passEl.value : '';

  if (!ident) {
    showToast('Please enter your User ID, Email address, or Mobile number.', 'warning');
    setFieldValidationState('loginIdentifier', false, 'Please enter your User ID, Email, or Mobile number.');
    if (identEl) identEl.focus();
    return;
  }
  setFieldValidationState('loginIdentifier', true);

  if (!pass) {
    showToast('Please enter your account password.', 'warning');
    setFieldValidationState('loginPassword', false, 'Password is required.');
    if (passEl) passEl.focus();
    return;
  }
  setFieldValidationState('loginPassword', true);

  const btn = document.getElementById('btnLoginSubmit');
  const originalText = btn ? btn.innerHTML : '<span class="btn-text">Sign In to Dashboard ➔</span>';
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = '<span class="pulse-dot"></span> Authenticating with TranceConnect...';
  }

  isLoginSubmitting = true;

  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ident, identifier: ident, password: pass })
    });

    if (!data || !data.token) {
      throw new Error(data && data.error ? data.error : 'Invalid response from authentication server.');
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    // Optional background Firebase Auth session synchronization
    if (typeof firebase !== 'undefined' && firebase.auth) {
      try {
        if (typeof initFirebase === 'function') initFirebase();
        const fbAuth = window.firebaseAuth || firebase.auth();
        if (fbAuth && data.user && data.user.email) {
          fbAuth.signInWithEmailAndPassword(data.user.email, pass).catch(() => {});
        }
      } catch (fbSyncErr) {}
    }

    showToast(`Authentication verified! Welcome back, ${data.user.company_name || data.user.contact_person || 'User'}!`, 'success');

    const targetUrl = data.redirect || (data.user.role === 'dealer' ? '/dealer' : (data.user.role === 'transporter' ? '/transporter' : '/admin'));
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 350);

  } catch (err) {
    let errMsg = err.message || 'Authentication failed. Please verify credentials.';
    if (err.status === 401) {
      errMsg = 'The User ID, Email, or Password is incorrect.';
    } else if (err.status === 403) {
      errMsg = 'This account is suspended or inactive. Please contact support.';
    }
    showToast(errMsg, 'error');
    setFieldValidationState('loginPassword', false, errMsg);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.innerHTML = originalText;
    }
  } finally {
    isLoginSubmitting = false;
  }
}
window.handleLoginSubmit = handleLoginSubmit;

async function handleFirebasePasswordReset() {
  const emailInput = document.getElementById('forgotEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email || !validateForgotEmail()) {
    if (emailInput) emailInput.focus();
    showToast('Please enter a valid registered email address.', 'warning');
    return;
  }

  showToast('Requesting Firebase password reset link...', 'info');
  try {
    if (typeof sendFirebasePasswordReset === 'function') {
      await sendFirebasePasswordReset(email);
      showToast('A secure password reset link has been dispatched to your email via Firebase Authentication. Check your inbox to set a new password.', 'success');
    } else {
      showToast('Firebase client is initializing. Please try again.', 'warning');
    }
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      showToast('No account found with this email address.', 'error');
    } else {
      showToast(err.message || 'Could not send Firebase reset email.', 'error');
    }
  }
}

// -------------------------------------------------------------
// SUBMISSION: STREAMLINED DEALER REGISTRATION
// -------------------------------------------------------------
async function handleDealerRegisterSubmit(e) {
  e.preventDefault();

  const validComp = validateDealerCompany();
  const validOwner = validateDealerOwner();
  const validMob = validateDealerMobile();
  const validEmail = validateDealerEmail();
  const validGst = validateDealerGst();
  const validPass = validateDealerPassword();
  const validConf = validateDealerConfirmPassword();

  if (!validComp || !validOwner || !validMob || !validEmail || !validGst || !validPass || !validConf) {
    showToast('Please fill all required registration fields correctly.', 'warning');
    focusFirstInvalidField([
      'dealerCompany', 'dealerOwner', 'dealerMobile', 'dealerEmail', 'dealerGst', 'dealerPassword', 'dealerConfirmPassword'
    ]);
    return;
  }

  const company_name = document.getElementById('dealerCompany').value.trim();
  const owner_name = (document.getElementById('dealerOwner') ? document.getElementById('dealerOwner').value.trim() : '') || company_name;
  const mobile = document.getElementById('dealerMobile').value.trim();
  const email = document.getElementById('dealerEmail').value.trim();
  const gst_number = document.getElementById('dealerGst').value.trim().toUpperCase();
  const password = document.getElementById('dealerPassword').value;
  const confirm_password = document.getElementById('dealerConfirmPassword').value;

  const btn = document.getElementById('btnDealerSubmit');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="pulse-dot"></span> Creating Verified Dealer Account...';

  // 1. Firebase Authentication Hybrid Creation
  let firebaseUid = null;
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      if (typeof initFirebase === 'function') initFirebase();
      if (typeof firebaseAuth !== 'undefined' && firebaseAuth) {
        try {
          const fbCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
          if (fbCred && fbCred.user) {
            firebaseUid = fbCred.user.uid;
            if (fbCred.user.updateProfile) {
              await fbCred.user.updateProfile({ displayName: owner_name || company_name });
            }
          }
        } catch (fbErr) {
          console.warn('Firebase user creation note:', fbErr.message);
        }
      }
    } catch (fbE) {
      console.warn('Firebase init note:', fbE.message);
    }
  }

  try {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'dealer',
        company_name,
        owner_name,
        contact_person: owner_name,
        mobile,
        email,
        gstin: gst_number,
        password,
        confirm_password,
        firebase_uid: firebaseUid
      })
    });

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast('Dealer account created successfully! Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = '/dealer';
    }, 450);
  } catch (err) {
    const errMsg = err.message || 'Registration could not be completed.';
    showToast(errMsg, 'error');
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;

    if (err.data && (err.data.field === 'email' || errMsg.toLowerCase().includes('email'))) {
      setFieldValidationState('dealerEmail', false, 'This email is already registered. Please log in or reset your password.');
      document.getElementById('dealerEmail').focus();
    } else if (err.data && (err.data.field === 'mobile' || errMsg.toLowerCase().includes('mobile'))) {
      setFieldValidationState('dealerMobile', false, 'This mobile number is already registered. Please log in or reset your password.');
      document.getElementById('dealerMobile').focus();
    }
  }
}
window.handleDealerRegisterSubmit = handleDealerRegisterSubmit;

// -------------------------------------------------------------
// SUBMISSION: TRANSPORTER REGISTRATION (WITH KYC ATTACHMENTS)
// -------------------------------------------------------------
async function handleTransporterRegisterSubmit(e) {
  e.preventDefault();

  const validComp = validateTransCompany();
  const validOwner = validateTransOwner();
  const validMob = validateTransMobile();
  const validEmail = validateTransEmail();
  const validGst = validateTransGst();
  const validPass = validateTransPassword();
  const validConf = validateTransConfirmPassword();

  if (!validComp || !validOwner || !validMob || !validEmail || !validGst || !validPass || !validConf) {
    showToast('Please fill all required registration fields correctly.', 'warning');
    focusFirstInvalidField([
      'transCompany', 'transOwner', 'transMobile', 'transEmail', 'transGst', 'transPassword', 'transConfirmPassword'
    ]);
    return;
  }

  const company_name = document.getElementById('transCompany').value.trim();
  const owner_name = (document.getElementById('transOwner') ? document.getElementById('transOwner').value.trim() : '') || company_name;
  const mobile = document.getElementById('transMobile').value.trim();
  const email = document.getElementById('transEmail').value.trim();
  const gst_number = document.getElementById('transGst').value.trim().toUpperCase();
  const password = document.getElementById('transPassword').value;
  const confirm_password = document.getElementById('transConfirmPassword').value;

  const aadhaarInput = document.getElementById('transAadhaarFile');
  const licenseInput = document.getElementById('transLicenseFile');

  const btn = document.getElementById('btnTransSubmit');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="pulse-dot"></span> Onboarding Transporter Fleet...';

  // 1. Firebase Authentication Hybrid Creation
  let firebaseUid = null;
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      if (typeof initFirebase === 'function') initFirebase();
      if (typeof firebaseAuth !== 'undefined' && firebaseAuth) {
        try {
          const fbCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
          if (fbCred && fbCred.user) {
            firebaseUid = fbCred.user.uid;
            if (fbCred.user.updateProfile) {
              await fbCred.user.updateProfile({ displayName: owner_name || company_name });
            }
          }
        } catch (fbErr) {
          console.warn('Firebase user creation note:', fbErr.message);
        }
      }
    } catch (fbE) {
      console.warn('Firebase init note:', fbE.message);
    }
  }

  try {
    let data;
    const hasFiles = (aadhaarInput && aadhaarInput.files && aadhaarInput.files[0]) ||
                     (licenseInput && licenseInput.files && licenseInput.files[0]);

    if (hasFiles) {
      const formData = new FormData();
      formData.append('role', 'transporter');
      formData.append('company_name', company_name);
      formData.append('owner_name', owner_name);
      formData.append('contact_person', owner_name);
      formData.append('mobile', mobile);
      formData.append('email', email);
      formData.append('gstin', gst_number);
      formData.append('password', password);
      formData.append('confirm_password', confirm_password);
      if (firebaseUid) formData.append('firebase_uid', firebaseUid);

      if (aadhaarInput && aadhaarInput.files[0]) {
        formData.append('aadhaar_file', aadhaarInput.files[0]);
      }
      if (licenseInput && licenseInput.files[0]) {
        formData.append('license_file', licenseInput.files[0]);
      }

      data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: formData
      });
    } else {
      data = await apiRequest('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'transporter',
          company_name,
          owner_name,
          contact_person: owner_name,
          mobile,
          email,
          gstin: gst_number,
          password,
          confirm_password,
          firebase_uid: firebaseUid
        })
      });
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast('Transporter profile registered! Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = '/transporter';
    }, 450);
  } catch (err) {
    const errMsg = err.message || 'Transporter registration failed.';
    showToast(errMsg, 'error');
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;

    if (err.data && (err.data.field === 'email' || errMsg.toLowerCase().includes('email'))) {
      setFieldValidationState('transEmail', false, 'This email is already registered. Please log in or reset your password.');
      document.getElementById('transEmail').focus();
    } else if (err.data && (err.data.field === 'mobile' || errMsg.toLowerCase().includes('mobile'))) {
      setFieldValidationState('transMobile', false, 'This mobile number is already registered. Please log in or reset your password.');
      document.getElementById('transMobile').focus();
    }
  }
}
window.handleTransporterRegisterSubmit = handleTransporterRegisterSubmit;

// -------------------------------------------------------------
// FORGOT PASSWORD: STEP 1 (REQUEST OTP)
// -------------------------------------------------------------
async function requestPasswordOtp() {
  const emailInput = document.getElementById('forgotEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email || !validateForgotEmail()) {
    if (emailInput) emailInput.focus();
    return;
  }

  const btn = document.getElementById('btnForgotOtpRequest');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="pulse-dot"></span> Generating OTP...';

  try {
    const data = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;

    showToast(data.message || '6-Digit OTP sent successfully!', 'success');

    const recip = document.getElementById('otpRecipientDisplay');
    if (recip) recip.textContent = `Dispatched to: ${email}`;

    document.getElementById('otpStep1').style.display = 'none';
    document.getElementById('otpStep2').style.display = 'block';

    // Start 5-minute expiration countdown & 60-second cooldown
    startOtpExpirationTimer();
    startOtpCooldownTimer();

    // Clear digit boxes
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById(`otpDigit${i}`);
      if (el) { el.value = ''; el.classList.remove('filled', 'is-invalid'); }
    }

    // Prefill in local testing if returned
    if (data.otp_code) {
      const digits = data.otp_code.split('');
      digits.forEach((d, i) => {
        const box = document.getElementById(`otpDigit${i}`);
        if (box) { box.value = d; box.classList.add('filled'); }
      });
      showToast(`Verification OTP Code: ${data.otp_code}`, 'info');
    }

    setTimeout(() => {
      const box0 = document.getElementById('otpDigit0');
      if (box0) box0.focus();
    }, 150);
  } catch (err) {
    showToast(err.message || 'Could not initiate OTP recovery', 'error');
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;
  }
}

function startOtpExpirationTimer() {
  otpExpirySeconds = 300; // 5 minutes
  const timerDisplay = document.getElementById('otpCountdownMinutes');
  const verifyBtn = document.getElementById('btnVerifyOtp');
  if (verifyBtn) verifyBtn.disabled = false;

  if (otpExpiryTimer) clearInterval(otpExpiryTimer);

  otpExpiryTimer = setInterval(() => {
    otpExpirySeconds--;
    const mins = Math.floor(otpExpirySeconds / 60);
    const secs = otpExpirySeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (timerDisplay) timerDisplay.textContent = formatted;

    if (otpExpirySeconds <= 0) {
      clearInterval(otpExpiryTimer);
      if (timerDisplay) timerDisplay.textContent = 'Expired';
      if (verifyBtn) verifyBtn.disabled = true;
      const errEl = document.getElementById('err_otpDigits');
      if (errEl) {
        errEl.textContent = 'OTP has expired. Please click Resend OTP to request a fresh code.';
        errEl.style.display = 'flex';
      }
    }
  }, 1000);
}

function startOtpCooldownTimer() {
  otpCooldownSeconds = 60;
  const resendBtn = document.getElementById('btnResendOtp');
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend OTP (${otpCooldownSeconds}s)`;
  }

  if (otpCooldownTimer) clearInterval(otpCooldownTimer);

  otpCooldownTimer = setInterval(() => {
    otpCooldownSeconds--;
    if (resendBtn) {
      if (otpCooldownSeconds > 0) {
        resendBtn.textContent = `Resend OTP (${otpCooldownSeconds}s)`;
      } else {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend OTP ➔';
      }
    }

    if (otpCooldownSeconds <= 0) {
      clearInterval(otpCooldownTimer);
    }
  }, 1000);
}

function resendPasswordOtp() {
  requestPasswordOtp();
}

// -------------------------------------------------------------
// FORGOT PASSWORD: STEP 2 (VERIFY OTP)
// -------------------------------------------------------------
async function verifyOtpCode() {
  const email = document.getElementById('forgotEmail').value.trim();
  const otp_code = getEnteredOtp();

  if (otp_code.length !== 6) {
    const errEl = document.getElementById('err_otpDigits');
    if (errEl) {
      errEl.textContent = 'Please enter all 6 digits of the verification code.';
      errEl.style.display = 'flex';
    }
    for (let i = 0; i < 6; i++) {
      const box = document.getElementById(`otpDigit${i}`);
      if (box && !box.value) { box.focus(); break; }
    }
    return;
  }

  const btn = document.getElementById('btnVerifyOtp');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="pulse-dot"></span> Verifying Code...';

  try {
    const data = await apiRequest('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp_code })
    });

    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;

    currentResetSessionToken = data.reset_session_token;
    if (otpExpiryTimer) clearInterval(otpExpiryTimer);

    showToast('OTP verified successfully! Create your new password.', 'success');

    document.getElementById('otpStep2').style.display = 'none';
    document.getElementById('otpStep3').style.display = 'block';

    setTimeout(() => {
      const passInput = document.getElementById('forgotNewPassword');
      if (passInput) passInput.focus();
    }, 150);
  } catch (err) {
    const errMsg = err.message || 'Invalid or expired OTP code.';
    const errEl = document.getElementById('err_otpDigits');
    if (errEl) {
      errEl.textContent = errMsg;
      errEl.style.display = 'flex';
    }
    for (let i = 0; i < 6; i++) {
      const box = document.getElementById(`otpDigit${i}`);
      if (box) box.classList.add('is-invalid');
    }
    showToast(errMsg, 'error');
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;
  }
}

// -------------------------------------------------------------
// FORGOT PASSWORD: STEP 3 (SAVE NEW PASSWORD)
// -------------------------------------------------------------
async function submitPasswordReset() {
  const email = document.getElementById('forgotEmail').value.trim();
  const validPass = validateForgotNewPassword();
  const validConf = validateForgotConfirmPassword();

  if (!validPass || !validConf) {
    if (!validPass) document.getElementById('forgotNewPassword').focus();
    else document.getElementById('forgotConfirmPassword').focus();
    return;
  }

  if (!currentResetSessionToken) {
    showToast('Reset authorization expired. Please restart OTP verification.', 'warning');
    setAuthTab('forgot');
    return;
  }

  const new_password = document.getElementById('forgotNewPassword').value;
  const confirm_password = document.getElementById('forgotConfirmPassword').value;

  const btn = document.getElementById('btnSubmitReset');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="pulse-dot"></span> Updating Password...';

  try {
    const data = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        reset_session_token: currentResetSessionToken,
        new_password,
        confirm_password
      })
    });

    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;

    currentResetSessionToken = null;
    showToast('Your password has been changed successfully. Please log in using your new password.', 'success');

    setAuthTab('login');
    const loginIdent = document.getElementById('loginIdentifier');
    if (loginIdent) {
      loginIdent.value = email;
      const passBox = document.getElementById('loginPassword');
      if (passBox) passBox.focus();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update password.', 'error');
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalText;
  }
}

function logoutSession() {
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_user');
  window.location.reload();
}

// -------------------------------------------------------------
// LIVE RADAR TRACKING SEARCH & INTERACTIVE MILESTONES
// -------------------------------------------------------------
async function handleLiveSearchTracking(e) {
  e.preventDefault();
  let shipId = document.getElementById('trackingSearchInput').value.trim();
  if (!shipId) return;

  // Clean formatted IDs like "#SHP-12" or "12"
  shipId = shipId.replace(/[^0-9]/g, '');
  if (!shipId) {
    showToast('Please enter a valid numeric Shipment ID (e.g. 1 or 12)', 'warning');
    return;
  }

  try {
    const data = await apiRequest(`/api/tracking/${shipId}`);
    const { shipment, latest_location, history } = data;
    renderTrackingModal(shipment, latest_location, history);
  } catch (err) {
    showToast(err.message || `Consignment #${shipId} not found in database`, 'error');
  }
}

function renderTrackingModal(shipment, latest_location, history = []) {
  document.getElementById('trackModalHeading').textContent = `Consignment #${shipment.id} Radar: ${shipment.product_type}`;
  document.getElementById('trackModalRoute').textContent = `${shipment.pickup_location} ➔ ${shipment.delivery_location}`;
  document.getElementById('trackCurLocation').textContent = latest_location.location_name || shipment.pickup_location;
  document.getElementById('trackSpeed').textContent = `${Number(latest_location.speed_kmh || 0).toFixed(0)} KM/H`;
  document.getElementById('trackStatusNote').textContent = latest_location.status_note || `Status: ${shipment.status}`;

  // Badge
  const badgeEl = document.getElementById('trackModalBadge');
  if (badgeEl) {
    badgeEl.textContent = shipment.status.toUpperCase();
    badgeEl.className = `status-badge badge-${shipment.status.toLowerCase().replace(/ /g, '_')}`;
  }

  // Header Cards
  const vImg = document.getElementById('trackVehicleImg');
  if (vImg) vImg.src = shipment.vehicle_image || '/assets/vehicles/container-truck.svg';
  const vNum = document.getElementById('trackVehicleNumber');
  if (vNum) vNum.textContent = shipment.vehicle_number || 'Awaiting Allocation';
  const vType = document.getElementById('trackVehicleType');
  if (vType) vType.textContent = `${shipment.weight_tons}T • ${shipment.vehicle_type || 'Commercial Freight Carrier'}`;
  const dName = document.getElementById('trackDriverDisplay');
  if (dName) {
    dName.textContent = shipment.driver_name 
      ? `Assigned Driver: ${shipment.driver_name} (${shipment.driver_mobile || 'En Route'})` 
      : 'Driver Assignment in Progress';
  }
  const transName = document.getElementById('trackTransporterName');
  if (transName) transName.textContent = shipment.transporter_name || 'Accredited Transporter';

  // Logistics Milestones Stepper
  const milestonesOrder = ['Pending', 'Assigned', 'Accepted', 'Pickup', 'In Transit', 'Out for Delivery', 'Delivered'];
  const curStatus = shipment.status;
  const curIdx = milestonesOrder.indexOf(curStatus);
  const activeIdx = curIdx >= 0 ? curIdx : (curStatus === 'Exception' ? 4 : 0);

  const fillPercentage = Math.min(100, Math.round((activeIdx / (milestonesOrder.length - 1)) * 100));
  const progressFill = document.getElementById('timelineProgressFill');
  if (progressFill) progressFill.style.width = `${fillPercentage}%`;

  const countEl = document.getElementById('trackMilestoneCount');
  if (countEl) countEl.textContent = `Stage ${activeIdx + 1} of 7: ${curStatus}`;

  const nodeMap = {
    0: 'tNodeRegistered',
    1: 'tNodeAssigned',
    2: 'tNodeAccepted',
    3: 'tNodePickup',
    4: 'tNodeInTransit',
    5: 'tNodeOutForDelivery',
    6: 'tNodeDelivered'
  };

  Object.keys(nodeMap).forEach(idxStr => {
    const idx = parseInt(idxStr, 10);
    const nodeEl = document.getElementById(nodeMap[idx]);
    if (nodeEl) {
      nodeEl.classList.remove('done', 'current', 'delayed');
      if (idx < activeIdx) {
        nodeEl.classList.add('done');
      } else if (idx === activeIdx) {
        if (curStatus === 'Exception') nodeEl.classList.add('delayed');
        else nodeEl.classList.add('current');
      }
    }
  });

  // Recorded Checkpoints History List
  const historyList = document.getElementById('trackMilestonesHistoryList');
  if (historyList) {
    if (history && history.length > 0) {
      historyList.innerHTML = history.map((rec, i) => {
        const timeFormatted = rec.recorded_at ? new Date(rec.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'Logged';
        const isLatest = i === 0;
        return `
          <div class="milestone-log-entry ${isLatest ? 'active' : 'completed'}">
            <div class="milestone-entry-icon">${isLatest ? '🛰️' : '📍'}</div>
            <div class="milestone-entry-details">
              <div class="milestone-entry-title">
                <span>${escapeHtml(rec.location_name || 'Checkpoint')}</span>
                <span class="milestone-entry-time">${timeFormatted}</span>
              </div>
              <div class="milestone-entry-desc">
                ${escapeHtml(rec.status_note || 'Corridor waypoint passed')} &bull; Speed: ${Number(rec.speed_kmh || 0).toFixed(0)} km/h
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      historyList.innerHTML = `
        <div class="milestone-log-entry active">
          <div class="milestone-entry-icon">📦</div>
          <div class="milestone-entry-details">
            <div class="milestone-entry-title">
              <span>${escapeHtml(shipment.pickup_location)}</span>
              <span class="milestone-entry-time">${shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : 'Initial'}</span>
            </div>
            <div class="milestone-entry-desc">Consignment Registered: ${escapeHtml(shipment.status)}</div>
          </div>
        </div>
      `;
    }
  }

  openModal('trackingModal');
  setTimeout(() => {
    initTrackingMap(latest_location ? latest_location.latitude : null, latest_location ? latest_location.longitude : null, latest_location ? latest_location.location_name : null, shipment.vehicle_image, Boolean(latest_location && latest_location.latitude != null));
  }, 250);
}

function initTrackingMap(lat, lng, locName, vehicleImgUrl, hasGps = true) {
  const container = document.getElementById('trackingMap');
  if (!container) return;

  if (!hasGps || lat === null || lat === undefined || lng === null || lng === undefined) {
    if (trackingMapInstance) {
      try { trackingMapInstance.remove(); } catch (e) {}
      trackingMapInstance = null;
      trackingMarkerInstance = null;
    }
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); text-align: center; padding: 1.5rem; background: rgba(10, 18, 34, 0.6); border-radius: var(--radius-sm);">
        <span style="font-size: 2.2rem; margin-bottom: 0.5rem;">🛰️</span>
        <strong style="color: var(--text-main); font-size: 0.95rem;">Live GPS Telemetry Awaiting Vehicle Departure</strong>
        <p style="font-size: 0.8rem; margin-top: 0.35rem; max-width: 480px; line-height: 1.5; color: var(--text-muted);">
          Real-time GPS coordinates stream once the assigned carrier begins transit and broadcasts location. Checkpoint milestones are logged in the timeline above.
        </p>
      </div>
    `;
    return;
  }

  const validLat = Number(lat);
  const validLng = Number(lng);

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
    iconUrl: vehicleImgUrl || 'assets/truck-marker.svg',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20]
  });

  if (trackingMarkerInstance) {
    trackingMarkerInstance.setLatLng([validLat, validLng]);
    trackingMarkerInstance.setIcon(truckIcon);
  } else {
    trackingMarkerInstance = L.marker([validLat, validLng], { icon: truckIcon }).addTo(trackingMapInstance);
  }

  trackingMarkerInstance.bindPopup(`<b>${escapeHtml(locName || 'Consignment in Transit')}</b><br>GPS Coordinates: ${validLat.toFixed(4)}, ${validLng.toFixed(4)}`).openPopup();
}

// AI SPECIALIST
function toggleAIAssistant() {
  const w = document.getElementById('aiWidget');
  if (w) w.classList.toggle('active');
}

async function handleSendAiMessage(e) {
  e.preventDefault();
  const input = document.getElementById('aiUserInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  askAiQuestion(text);
}

async function askAiQuestion(prompt) {
  const feed = document.getElementById('aiChatFeed');
  if (!feed) return;

  const w = document.getElementById('aiWidget');
  if (w) w.classList.add('active');
  feed.innerHTML += `
    <div class="chat-bubble bubble-mine">${escapeHtml(prompt)}</div>
    <div id="aiThinking" class="chat-bubble bubble-theirs" style="color: var(--cyan);">
      <span class="pulse-dot"></span> Analyzing freight parameters...
    </div>
  `;
  feed.scrollTop = feed.scrollHeight;

  try {
    const data = await apiRequest('/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, role: 'shipper' })
    });

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
  if (!m) return;
  m.style.display = 'flex';
  void m.offsetHeight; // Force layout recalculation
  m.classList.add('active');
  document.body.classList.add('modal-open');
}
window.openModal = openModal;

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('active');
  setTimeout(() => {
    if (!m.classList.contains('active')) {
      m.style.display = 'none';
    }
  }, 220);
  document.body.classList.remove('modal-open');
}
window.closeModal = closeModal;

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

