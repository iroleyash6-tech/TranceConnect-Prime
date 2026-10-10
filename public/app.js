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
  setupAuthValidation();

  // Auto-open modal if navigated with hash or path
  if (window.location.hash === '#register' || window.location.pathname.endsWith('/register')) {
    openAuthModal('register');
  } else if (window.location.hash === '#login' || window.location.pathname.endsWith('/login')) {
    openAuthModal('login');
  } else if (window.location.hash === '#tracking') {
    const el = document.getElementById('trackingSearchInput');
    if (el) el.focus();
  }
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

// ===================================================================
// TRANCECONNECT-PRIME: AUTHENTICATION, REGISTRATION & TRACKING
// ===================================================================

let otpCooldownTimer = null;
let otpCooldownSeconds = 60;
let currentRegStep = 1;

function openAuthModal(mode = 'login') {
  setAuthTab(mode === 'register' ? 'register' : 'login');
  openModal('authModal');
}

function setAuthTab(tab) {
  const loginForm = document.getElementById('formLogin');
  const regForm = document.getElementById('formRegister');
  const forgotForm = document.getElementById('formForgot');
  const title = document.getElementById('authModalTitle');
  const subtitle = document.getElementById('authModalSubtitle');

  const btnLogin = document.getElementById('btnAuthTabLogin');
  const btnRegister = document.getElementById('btnAuthTabRegister');
  const btnForgot = document.getElementById('btnAuthTabForgot');

  [btnLogin, btnRegister, btnForgot].forEach(b => {
    if (b) {
      b.classList.remove('btn-primary');
      b.classList.add('btn-glass');
    }
  });

  if (tab === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    forgotForm.style.display = 'none';
    if (title) title.textContent = 'Sign In to TranceConnect';
    if (subtitle) subtitle.textContent = 'Commercial Freight & Fleet Telematics Platform';
    if (btnLogin) {
      btnLogin.classList.add('btn-primary');
      btnLogin.classList.remove('btn-glass');
    }
    setTimeout(() => {
      const el = document.getElementById('loginIdentifier');
      if (el) el.focus();
    }, 150);
  } else if (tab === 'register') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    forgotForm.style.display = 'none';
    if (title) title.textContent = 'Create Verified Business Account';
    if (subtitle) subtitle.textContent = 'Instant Onboarding for Shippers, Mills & Fleet Carriers';
    if (btnRegister) {
      btnRegister.classList.add('btn-primary');
      btnRegister.classList.remove('btn-glass');
    }
    goToRegStep(1);
  } else if (tab === 'forgot') {
    loginForm.style.display = 'none';
    regForm.style.display = 'none';
    forgotForm.style.display = 'block';
    const s1 = document.getElementById('otpStep1');
    const s2 = document.getElementById('otpStep2');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    if (title) title.textContent = 'Reset Account Password';
    if (subtitle) subtitle.textContent = 'Secure 6-Digit OTP Recovery via Registered Email or Mobile';
    if (btnForgot) {
      btnForgot.classList.add('btn-primary');
      btnForgot.classList.remove('btn-glass');
    }
    setTimeout(() => {
      const el = document.getElementById('forgotEmail');
      if (el) el.focus();
    }, 150);
  }
}

// -------------------------------------------------------------
// GUIDED REGISTRATION: ROLE SELECTION & STEP NAVIGATION
// -------------------------------------------------------------
function selectRegistrationRole(role) {
  const roleInput = document.getElementById('regRole');
  if (roleInput) roleInput.value = role;

  const cardDealer = document.getElementById('roleCardDealer');
  const cardTrans = document.getElementById('roleCardTransporter');
  const dealerFields = document.getElementById('dealerProfileFields');
  const transFields = document.getElementById('transporterProfileFields');
  const submitBtn = document.getElementById('btnRegisterSubmit');

  if (role === 'dealer') {
    if (cardDealer) cardDealer.classList.add('active');
    if (cardTrans) cardTrans.classList.remove('active');
    if (dealerFields) dealerFields.style.display = 'block';
    if (transFields) transFields.style.display = 'none';
    if (submitBtn) submitBtn.querySelector('.btn-text').textContent = 'Complete Verified Shipper Registration ✅';
  } else {
    if (cardDealer) cardDealer.classList.remove('active');
    if (cardTrans) cardTrans.classList.add('active');
    if (dealerFields) dealerFields.style.display = 'none';
    if (transFields) transFields.style.display = 'block';
    if (submitBtn) submitBtn.querySelector('.btn-text').textContent = 'Complete Verified Transporter Registration ✅';
  }
}

function goToRegStep(step) {
  // Validate before advancing
  if (step === 2 && currentRegStep === 1) {
    const isCompanyValid = validateCompany();
    const isCityValid = validateCity();
    const isGstValid = validateGst();
    if (!isCompanyValid || !isCityValid || !isGstValid) {
      showToast('Please fix required entity details in Step 1 before proceeding', 'warning');
      focusFirstInvalid(['regCompany', 'regCity', 'regGst']);
      return;
    }
  } else if (step === 3 && currentRegStep === 2) {
    // Step 2 selects are pre-filled with reasonable defaults
  }

  currentRegStep = step;

  // Show only target step section
  [1, 2, 3].forEach(s => {
    const sec = document.getElementById(`regStepSection${s}`);
    const badge = document.getElementById(`regStepBadge${s}`);
    if (sec) sec.style.display = s === step ? 'block' : 'none';
    if (badge) {
      badge.classList.remove('active', 'completed');
      if (s === step) {
        badge.classList.add('active');
      } else if (s < step) {
        badge.classList.add('completed');
      }
    }
  });

  const modalContainer = document.querySelector('#authModal .modal-container');
  if (modalContainer) modalContainer.scrollTop = 0;
}

// -------------------------------------------------------------
// REAL-TIME VALIDATION ENGINE & PASSWORD STRENGTH
// -------------------------------------------------------------
function setupAuthValidation() {
  // Login fields
  const loginIdent = document.getElementById('loginIdentifier');
  if (loginIdent) {
    loginIdent.addEventListener('input', () => validateIdentifier());
    loginIdent.addEventListener('blur', () => validateIdentifier());
  }

  // Register Step 1
  const regComp = document.getElementById('regCompany');
  if (regComp) {
    regComp.addEventListener('input', () => validateCompany());
    regComp.addEventListener('blur', () => validateCompany());
  }
  const regGst = document.getElementById('regGst');
  if (regGst) {
    regGst.addEventListener('input', () => validateGst());
    regGst.addEventListener('blur', () => validateGst());
  }
  const regCity = document.getElementById('regCity');
  if (regCity) {
    regCity.addEventListener('input', () => validateCity());
    regCity.addEventListener('blur', () => validateCity());
  }

  // Register Step 3
  const regMob = document.getElementById('regMobile');
  if (regMob) {
    regMob.addEventListener('input', () => validateMobile());
    regMob.addEventListener('blur', () => validateMobile());
  }
  const regEmail = document.getElementById('regEmail');
  if (regEmail) {
    regEmail.addEventListener('input', () => validateEmail());
    regEmail.addEventListener('blur', () => validateEmail());
  }
  const regPass = document.getElementById('regPassword');
  if (regPass) {
    regPass.addEventListener('input', () => {
      validatePassword();
      validateConfirmPassword();
    });
    regPass.addEventListener('blur', () => validatePassword());
  }
  const regConfPass = document.getElementById('regConfirmPassword');
  if (regConfPass) {
    regConfPass.addEventListener('input', () => validateConfirmPassword());
    regConfPass.addEventListener('blur', () => validateConfirmPassword());
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

function validateIdentifier() {
  const el = document.getElementById('loginIdentifier');
  if (!el) return true;
  const val = el.value.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const isMobile = /^[6-9]\d{9}$/.test(val);
  const ok = val.length > 0 && (isEmail || isMobile);
  return setFieldValidationState('loginIdentifier', ok, 'Enter a valid corporate email or 10-digit mobile number.');
}

function validateCompany() {
  const el = document.getElementById('regCompany');
  if (!el) return true;
  const val = el.value.trim();
  const ok = val.length >= 3;
  return setFieldValidationState('regCompany', ok, 'Company/Firm legal name must be at least 3 characters.');
}

function validateGst() {
  const el = document.getElementById('regGst');
  if (!el) return true;
  const val = el.value.trim().toUpperCase();
  el.value = val;
  if (!val) {
    const wrap = document.getElementById('wrap_regGst');
    if (wrap) {
      wrap.classList.remove('has-invalid', 'has-valid');
    }
    const errEl = document.getElementById('err_regGst');
    if (errEl) errEl.style.display = 'none';
    return true;
  }
  // Standard 15-character Indian GSTIN Regex
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const ok = gstRegex.test(val);
  return setFieldValidationState('regGst', ok, 'GSTIN must be 15 valid alphanumeric characters (e.g. 27AAAAA0000A1Z5).');
}

function validateCity() {
  const el = document.getElementById('regCity');
  if (!el) return true;
  const val = el.value.trim();
  const ok = val.length >= 2;
  return setFieldValidationState('regCity', ok, 'Please specify your primary city and state.');
}

function validateMobile() {
  const el = document.getElementById('regMobile');
  if (!el) return true;
  const val = el.value.trim();
  // Indian 10-digit mobile starting with 6, 7, 8, or 9
  const ok = /^[6-9]\d{9}$/.test(val);
  return setFieldValidationState('regMobile', ok, 'Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
}

function validateEmail() {
  const el = document.getElementById('regEmail');
  if (!el) return true;
  const val = el.value.trim();
  const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  const ok = emailRegex.test(val);
  return setFieldValidationState('regEmail', ok, 'Enter a valid corporate email format (e.g. name@company.com).');
}

function validatePassword() {
  const el = document.getElementById('regPassword');
  if (!el) return true;
  const val = el.value;

  const hasMinLen = val.length >= 6;
  const hasNumber = /[0-9]/.test(val);
  const hasUpperLower = /[a-z]/.test(val) && /[A-Z]/.test(val);
  const hasSpecial = /[^A-Za-z0-9]/.test(val);

  // Update rule indicators
  const updateRule = (id, passed) => {
    const r = document.getElementById(id);
    if (r) {
      if (passed) r.classList.add('rule-passed');
      else r.classList.remove('rule-passed');
    }
  };
  updateRule('ruleMinLen', hasMinLen);
  updateRule('ruleNumber', hasNumber);
  updateRule('ruleUpperLower', hasUpperLower);
  updateRule('ruleSpecial', hasSpecial);

  // Compute strength score
  let score = 0;
  if (hasMinLen) score += 1;
  if (val.length >= 8) score += 1;
  if (hasNumber) score += 1;
  if (hasUpperLower) score += 1;
  if (hasSpecial) score += 1;

  const fill = document.getElementById('regStrengthFill');
  const text = document.getElementById('regStrengthText');

  if (val.length === 0) {
    if (fill) { fill.style.width = '0%'; fill.className = 'meter-bar-fill'; }
    if (text) { text.textContent = 'Enter Password'; text.className = 'meter-strength-text'; }
  } else if (score <= 1) {
    if (fill) { fill.style.width = '25%'; fill.className = 'meter-bar-fill strength-weak'; }
    if (text) { text.textContent = 'Weak'; text.className = 'meter-strength-text strength-weak'; }
  } else if (score <= 2) {
    if (fill) { fill.style.width = '50%'; fill.className = 'meter-bar-fill strength-fair'; }
    if (text) { text.textContent = 'Fair'; text.className = 'meter-strength-text strength-fair'; }
  } else if (score <= 3) {
    if (fill) { fill.style.width = '75%'; fill.className = 'meter-bar-fill strength-good'; }
    if (text) { text.textContent = 'Good'; text.className = 'meter-strength-text strength-good'; }
  } else {
    if (fill) { fill.style.width = '100%'; fill.className = 'meter-bar-fill strength-strong'; }
    if (text) { text.textContent = 'Strong (Optimal)'; text.className = 'meter-strength-text strength-strong'; }
  }

  const ok = hasMinLen;
  return setFieldValidationState('regPassword', ok, 'Password must be at least 6 characters.');
}

function validateConfirmPassword() {
  const p1 = document.getElementById('regPassword');
  const p2 = document.getElementById('regConfirmPassword');
  if (!p1 || !p2) return true;
  const ok = p2.value.length > 0 && p1.value === p2.value;
  return setFieldValidationState('regConfirmPassword', ok, 'Passwords do not match. Please re-type identically.');
}

function focusFirstInvalid(fieldIds) {
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
// SUBMISSIONS: LOGIN & REGISTRATION
// -------------------------------------------------------------
async function handleLoginSubmit(e) {
  e.preventDefault();
  const ident = document.getElementById('loginIdentifier').value.trim();
  const pass = document.getElementById('loginPassword').value;

  if (!validateIdentifier() || !pass) {
    showToast('Please enter both your email/mobile and password', 'warning');
    if (!ident) document.getElementById('loginIdentifier').focus();
    else document.getElementById('loginPassword').focus();
    return;
  }

  const btn = document.getElementById('btnLoginSubmit');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="pulse-dot"></span> Authenticating...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ident, password: pass })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Authentication failed. Please verify credentials.', 'error');
      setFieldValidationState('loginPassword', false, data.error || 'Invalid credentials');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast(`Authentication verified! Welcome, ${data.user.company_name}`, 'success');

    setTimeout(() => {
      if (data.user.role === 'dealer') window.location.href = '/dealer';
      else if (data.user.role === 'transporter') window.location.href = '/transporter';
      else if (data.user.role === 'admin') window.location.href = '/admin';
      else window.location.reload();
    }, 450);
  } catch (err) {
    showToast('Network error during login: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();

  // Validate all fields across all 3 steps
  const validComp = validateCompany();
  const validCity = validateCity();
  const validGst = validateGst();
  const validMob = validateMobile();
  const validEmail = validateEmail();
  const validPass = validatePassword();
  const validConf = validateConfirmPassword();

  if (!validComp || !validCity || !validGst) {
    goToRegStep(1);
    focusFirstInvalid(['regCompany', 'regCity', 'regGst']);
    showToast('Please complete valid business entity details in Step 1', 'warning');
    return;
  }

  if (!validMob || !validEmail || !validPass || !validConf) {
    goToRegStep(3);
    focusFirstInvalid(['regMobile', 'regEmail', 'regPassword', 'regConfirmPassword']);
    showToast('Please fix required credentials and security fields in Step 3', 'warning');
    return;
  }

  const role = document.getElementById('regRole').value;
  const company_name = document.getElementById('regCompany').value.trim();
  const city = document.getElementById('regCity').value.trim();
  const gst_number = document.getElementById('regGst').value.trim().toUpperCase();
  const mobile = document.getElementById('regMobile').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm_password = document.getElementById('regConfirmPassword').value;

  const cargo_type = document.getElementById('regCargoType') ? document.getElementById('regCargoType').value : '';
  const monthly_volume = document.getElementById('regMonthlyVolume') ? document.getElementById('regMonthlyVolume').value : '';
  const fleet_size = document.getElementById('regFleetSize') ? document.getElementById('regFleetSize').value : '';
  const vehicle_types = document.getElementById('regTruckTypes') ? document.getElementById('regTruckTypes').value : '';
  const operating_routes = document.getElementById('regOperatingRoutes') ? document.getElementById('regOperatingRoutes').value.trim() : '';

  const btn = document.getElementById('btnRegisterSubmit');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="pulse-dot"></span> Creating Enterprise Account...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        company_name,
        city,
        gst_number,
        mobile,
        email,
        password,
        confirm_password,
        cargo_type,
        monthly_volume,
        fleet_size,
        vehicle_types,
        operating_routes
      })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Registration failed', 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
      // If error mentions email or mobile, jump to Step 3
      if (data.error && (data.error.includes('email') || data.error.includes('mobile'))) {
        goToRegStep(3);
        if (data.error.includes('mobile')) setFieldValidationState('regMobile', false, data.error);
        if (data.error.includes('email')) setFieldValidationState('regEmail', false, data.error);
      }
      return;
    }

    localStorage.setItem('tc_token', data.token);
    localStorage.setItem('tc_user', JSON.stringify(data.user));

    showToast('Registration successful! Redirecting to your command dashboard...', 'success');

    setTimeout(() => {
      if (role === 'dealer') window.location.href = '/dealer';
      else window.location.href = '/transporter';
    }, 500);
  } catch (err) {
    showToast('Registration network error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// -------------------------------------------------------------
// FORGOT PASSWORD & EXPIRING OTP RECOVERY
// -------------------------------------------------------------
async function requestPasswordOtp() {
  const emailInput = document.getElementById('forgotEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) {
    showToast('Please enter your registered email or 10-digit mobile', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }

  const btn = document.getElementById('btnForgotOtpRequest');
  btn.disabled = true;
  btn.innerHTML = '<span class="pulse-dot"></span> Generating OTP...';

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Generate 6-Digit OTP ➔</span>';

    if (!res.ok) {
      showToast(data.error || 'Could not initiate OTP recovery', 'error');
      return;
    }

    showToast(data.message || '6-Digit OTP sent successfully!', 'success');
    document.getElementById('otpStep1').style.display = 'none';
    document.getElementById('otpStep2').style.display = 'block';

    // Start 60-second cooldown timer for resend
    startOtpCooldownTimer();

    // If development/test environment OTP returned in response, prefill for convenience
    if (data.otp_code) {
      const codeInput = document.getElementById('forgotOtpCode');
      if (codeInput) codeInput.value = data.otp_code;
      showToast(`Verification OTP Code: ${data.otp_code}`, 'info');
    }

    setTimeout(() => {
      const otpInput = document.getElementById('forgotOtpCode');
      if (otpInput && !otpInput.value) otpInput.focus();
      else {
        const passInput = document.getElementById('forgotNewPassword');
        if (passInput) passInput.focus();
      }
    }, 200);
  } catch (err) {
    showToast('Network error requesting OTP: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Generate 6-Digit OTP ➔</span>';
  }
}

function startOtpCooldownTimer() {
  otpCooldownSeconds = 60;
  const resendBtn = document.getElementById('btnResendOtp');
  const timerDisplay = document.getElementById('otpCountdownSeconds');
  if (resendBtn) resendBtn.disabled = true;

  if (otpCooldownTimer) clearInterval(otpCooldownTimer);

  otpCooldownTimer = setInterval(() => {
    otpCooldownSeconds--;
    if (timerDisplay) timerDisplay.textContent = `${otpCooldownSeconds}s`;

    if (otpCooldownSeconds <= 0) {
      clearInterval(otpCooldownTimer);
      if (resendBtn) resendBtn.disabled = false;
      if (timerDisplay) timerDisplay.textContent = 'Now';
    }
  }, 1000);
}

function resendPasswordOtp() {
  requestPasswordOtp();
}

async function submitPasswordReset() {
  const email = document.getElementById('forgotEmail').value.trim();
  const otp_code = document.getElementById('forgotOtpCode').value.trim();
  const new_password = document.getElementById('forgotNewPassword').value;
  const confirm_password = document.getElementById('forgotConfirmPassword').value;

  if (!otp_code || otp_code.length !== 6) {
    showToast('Please enter the exact 6-digit OTP received', 'warning');
    document.getElementById('forgotOtpCode').focus();
    return;
  }

  if (!new_password || new_password.length < 6) {
    showToast('New password must be at least 6 characters', 'warning');
    document.getElementById('forgotNewPassword').focus();
    return;
  }

  if (new_password !== confirm_password) {
    showToast('Passwords do not match. Please re-enter identically.', 'warning');
    document.getElementById('forgotConfirmPassword').focus();
    const errEl = document.getElementById('err_forgotConfirmPassword');
    if (errEl) errEl.style.display = 'flex';
    return;
  }

  const btn = document.getElementById('btnSubmitReset');
  btn.disabled = true;
  btn.innerHTML = '<span class="pulse-dot"></span> Resetting Password...';

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp_code, new_password, confirm_password })
    });
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Confirm & Reset Password ✅</span>';

    if (!res.ok) {
      showToast(data.error || 'Failed to reset password', 'error');
      return;
    }

    showToast('Password updated successfully! Please sign in with your new credentials.', 'success');
    setAuthTab('login');
    const loginIdent = document.getElementById('loginIdentifier');
    if (loginIdent) {
      loginIdent.value = email;
      const pass = document.getElementById('loginPassword');
      if (pass) pass.focus();
    }
  } catch (err) {
    showToast('Password reset network error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Confirm & Reset Password ✅</span>';
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
    const res = await fetch(`/api/tracking/${shipId}`);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || `Consignment #${shipId} not found in database`, 'error');
      return;
    }

    const { shipment, latest_location, history } = data;
    renderTrackingModal(shipment, latest_location, history);
  } catch (err) {
    showToast('Tracking query error: ' + err.message, 'error');
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
    initTrackingMap(latest_location.latitude, latest_location.longitude, latest_location.location_name, shipment.vehicle_image);
  }, 250);
}

function initTrackingMap(lat, lng, locName, vehicleImgUrl) {
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

