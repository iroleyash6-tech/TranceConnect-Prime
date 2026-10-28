# CLICK FUNCTION AUDIT: TRANCECONNECT-PRO
**Interactive UI Elements, Event Handlers, and Action Validation Report**  
**Official Project Account:** `iroleyash6@gmail.com`  

---

## 1. Landing & Authentication Pages (`index.html`, `login.html`, `register.html`)

| Element Name | Expected Action | Event Handler / Listener | Target File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Hero "⚡ Get Started" Button** | Opens professional role selection modal with Dealer vs Transporter choices | `openAuthModal('register')` + `addEventListener` (`#btnHeroGetStarted`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Navbar "Register Business" Button** | Opens role selection modal with Dealer vs Transporter choices | `openAuthModal('register')` + `addEventListener` (`#btnNavRegister`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Drawer "Register Business" Link** | Opens role selection modal and closes drawer | `openAuthModal('register')` + `addEventListener` (`#btnDrawerRegister`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Navbar "Sign In" Button & Link** | Opens authentication modal on 'login' tab | `openAuthModal('login')` + `addEventListener` (`#btnNavSignIn`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Hero "🔐 Sign In" Button** | Opens authentication modal on 'login' tab | `openAuthModal('login')` + `addEventListener` (`#btnHeroSignIn`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Drawer "🔐 Sign In" Link** | Opens authentication modal and closes drawer | `openAuthModal('login')` + `addEventListener` (`#btnDrawerSignIn`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Hero "🌐 Explore Platform"** | Smooth scrolls to Platform Features section | `scrollToSection('features')` (`#btnHeroExplore`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Hero "🛰️ Track Order" Button** | Centers tracking radar and focuses shipment ID input | `openTrackingInterface()` (`#btnHeroTrack`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Hamburger Menu Toggle** | Toggles mobile navigation drawer | `toggleMobileLandingDrawer()` (`.nav-drawer-toggle`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Modal Tab: "⚡ Role Selection"** | Displays interactive role choice cards (Dealer vs Transporter) | `setAuthTab('register')` (`#btnAuthTabSelect`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Role Card: "Register as Dealer"** | Transitions to Dealer registration form with back button | `setAuthTab('dealer')` (`.role-selection-card`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Role Card: "Register as Transporter"** | Transitions to Transporter registration form with back button | `setAuthTab('transporter')` (`.role-selection-card`) | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Modal Tab: "Sign In"** | Switches to login form view | `setAuthTab('login')` | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Modal Tab: "Dealer Reg"** | Switches to shipper signup form view | `setAuthTab('dealer')` | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Modal Tab: "Transporter Reg"** | Switches to carrier signup form view | `setAuthTab('transporter')` | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Modal Tab: "Reset OTP"** | Switches to 6-digit OTP recovery flow | `setAuthTab('forgot')` | `app.js`, `index.html` | **PASS (Verified Live)** |
| **Google Sign-In Button** | Triggers Firebase Google Auth popup & backend sync | `signInWithGoogle('dealer')` | `firebase-config.js` | **PASS (Verified Live)** |
| **Password Eye Toggles (All)** | Toggles password input type (text/password) | `togglePasswordVisibility(...)` | `app.js` | **PASS (Verified Live)** |
| **Login Submit Button** | Dispatches POST to `/api/auth/login` | `handleLoginSubmit(event)` | `app.js` | **PASS (Verified Live)** |
| **Dealer Registration Submit** | Dispatches POST to `/api/auth/register` with owner & company | `handleDealerRegisterSubmit(event)` | `app.js` | **PASS (Verified Live)** |
| **Transporter Register Submit** | Multipart/JSON POST with owner, company & KYC files | `handleTransporterRegisterSubmit(event)` | `app.js` | **PASS (Verified Live)** |
| **Request OTP Button** | Dispatches POST to `/api/auth/forgot-password` | `requestPasswordOtp()` | `app.js` | **PASS (Verified Live)** |
| **Verify OTP Button** | Dispatches POST to `/api/auth/verify-otp` | `verifyOtpCode()` | `app.js` | **PASS (Verified Live)** |
| **Submit New Password Button** | Dispatches POST to `/api/auth/reset-password` | `submitPasswordReset()` | `app.js` | **PASS (Verified Live)** |
| **AI Logistics Specialist Bubble** | Toggles floating AI assistant widget | `toggleAIAssistant()` | `app.js` | **PASS (Verified Live)** |
| **AI Ask Question Action** | Dispatches prompt to `/api/ai/assistant` | `handleSendAiMessage(event)` | `app.js` | **PASS (Verified Live)** |
| **3D 360° Orbit Button** | Toggles vehicle auto-rotation | `toggleAutoRotate()` (`#btnHudAutoRotate`) | `vehicle-3d.js` | **PASS (Verified Live)** |
| **3D Boost Button** | Activates ion thruster boost | `triggerThrusterBoost()` (`#btnHudBoost`) | `vehicle-3d.js` | **PASS (Verified Live)** |
| **3D Neon Palette Button** | Cycles vehicle neon shader lighting tints | `cycleNeonPalette()` (`#btnHudColor`) | `vehicle-3d.js` | **PASS (Verified Live)** |
| **3D Camera Angle Button** | Cycles Three.js camera perspectives | `cycleCameraAngle()` (`#btnHudView`) | `vehicle-3d.js` | **PASS (Verified Live)** |

---

## 2. Dealer Dashboard (`dealer.html`)

| Element Name | Expected Action | Event Handler | Target File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **"Post Load" Header Button** | Opens shipment creation modal | `openCreateShipmentModal()` | `dealer.js` | **PASS (Verified)** |
| **"+ Generate DO & Invoice" Button** | Opens document generator studio | `openDocGenerateModal()` | `dealer.js` | **PASS (Verified)** |
| **Quick Chat: "Bay Ready"** | Populates and sends preset dispatch chat | `sendQuickChatMessage('...')` | `dealer.js` | **PASS (Verified)** |
| **Quick Chat: "Gate Pass OK"** | Populates and sends preset gate status | `sendQuickChatMessage('...')` | `dealer.js` | **PASS (Verified)** |
| **Quick Chat: "Driver Contact?"** | Requests driver phone coordinates | `sendQuickChatMessage('...')` | `dealer.js` | **PASS (Verified)** |
| **Tab Navigation (Overview/Loads/Fleet/Chat/Docs)** | Switches dashboard content sections | `switchTab(tabName)` | `dealer.js` | **PASS (Verified)** |
| **Consignment Track Action** | Opens live Leaflet radar tracking view | `openTrackingModal(shipmentId)` | `dealer.js` | **PASS (Verified)** |
| **Invoice Studio Generator** | Compiles invoice items and generates PDF | `saveAndGenerateInvoice()` | `dealer.js` | **PASS (Verified)** |
| **Delivery Order Studio Generator** | Compiles DO items and creates signed DO | `saveAndGenerateDO()` | `dealer.js` | **PASS (Verified)** |
| **Profile Save Changes** | PUTs updated company info to `/api/auth/profile`| `handleUpdateProfile(event)` | `dealer.js` | **PASS (Verified)** |
| **Sign Out Action** | Clears tokens and redirects to home | `logoutSession()` | `dealer.js` | **PASS (Verified)** |

---

## 3. Transporter Dashboard (`transporter.html`)

| Element Name | Expected Action | Event Handler | Target File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **"Add Vehicle" Button** | Opens vehicle fleet registration modal | `openAddVehicleModal()` | `transporter.js` | **PASS (Verified)** |
| **"Add Driver" Button** | Opens driver license linking modal | `openAddDriverModal()` | `transporter.js` | **PASS (Verified)** |
| **Accept Consignment Button** | Updates shipment to 'Accepted' in DB | `handleAcceptShipment(shipmentId)` | `transporter.js` | **PASS (Verified)** |
| **Update Delivery Status Dropdown**| Transitions consignment milestone | `handleUpdateShipmentStatus(...)` | `transporter.js` | **PASS (Verified)** |
| **Quick Chat Chips** | Sends transporter logistics status | `sendQuickChatMessage('...')` | `transporter.js` | **PASS (Verified)** |
| **Broadcast Live GPS Ping** | Emits live GPS coordinate via Socket/Firestore| `broadcastGpsLocation()` | `transporter.js` | **PASS (Verified)** |
| **Sign Out Action** | Clears transporter session and redirects | `logoutSession()` | `transporter.js` | **PASS (Verified)** |

---

## 4. Admin Dashboard (`admin.html`)

| Element Name | Expected Action | Event Handler | Target File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **View KYC Document Action** | Opens modal with document preview & zoom | `openModal('docViewerModal')` | `admin.js` | **PASS (Verified)** |
| **Close KYC Modal Button** | Closes viewer modal and frees scroll lock | `closeModal('docViewerModal')`| `admin.js` | **PASS (Verified)** |
| **Approve Shipper / Carrier** | Sets verification_status to 'verified' | `approveUserVerification(userId)`| `admin.js` | **PASS (Verified)** |
| **Reject Verification** | Prompts reason and marks rejected | `rejectUserVerification(userId)` | `admin.js` | **PASS (Verified)** |
| **Database Inspector Table Tab** | Fetches live rows from selected SQL table | `inspectDbTable(tableName)` | `admin.js` | **PASS (Verified)** |
| **Fleet Live Radar Refresh** | Refreshes all active vehicle GPS markers | `refreshLiveFleetRadar()` | `admin.js` | **PASS (Verified)** |
| **Admin Logout** | Clears admin token and returns to login | `logoutUser()` | `admin.js` | **PASS (Verified)** |
