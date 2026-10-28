# CLICK FUNCTION AUDIT: TRANCECONNECT-PRO
**Interactive UI Elements, Event Handlers, and Action Validation Report**  
**Official Project Account:** `iroleyash6@gmail.com`  

---

## 1. Landing & Authentication Pages (`index.html`, `login.html`, `register.html`)

| Element Name | Expected Action | Event Handler | Target File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Navbar "Sign In" Link** | Opens authentication modal on 'login' tab | `openAuthModal('login')` | `app.js` | **PASS (Verified)** |
| **Hero "Post Your Freight Load"** | Opens authentication modal on 'dealer' tab | `openAuthModal('dealer')` | `app.js` | **PASS (Verified)** |
| **Hero "Join Carrier Fleet"** | Opens authentication modal on 'transporter' tab | `openAuthModal('transporter')` | `app.js` | **PASS (Verified)** |
| **Modal Tab: "Sign In"** | Switches to login form view | `setAuthTab('login')` | `app.js` | **PASS (Verified)** |
| **Modal Tab: "Dealer Register"** | Switches to shipper signup form view | `setAuthTab('dealer')` | `app.js` | **PASS (Verified)** |
| **Modal Tab: "Transporter Fleet"** | Switches to carrier signup form view | `setAuthTab('transporter')` | `app.js` | **PASS (Verified)** |
| **Modal Tab: "Forgot Password"** | Switches to 6-digit OTP recovery flow | `setAuthTab('forgot')` | `app.js` | **PASS (Verified)** |
| **Google Sign-In Button** | Triggers Firebase Google Auth popup | `signInWithGoogle('dealer')` | `firebase-config.js` | **PASS (Verified)** |
| **Password Eye Toggles (All)** | Toggles password input type (text/password) | `togglePasswordVisibility(...)` | `app.js` | **PASS (Verified)** |
| **Login Submit Button** | Dispatches POST to `/api/auth/login` | `handleLogin(event)` | `app.js` | **PASS (Verified)** |
| **Dealer Registration Submit** | Dispatches POST to `/api/auth/register` | `handleDealerRegisterSubmit(event)` | `app.js` | **PASS (Verified)** |
| **Transporter Register Submit** | Multipart POST with KYC files to register | `handleTransporterRegisterSubmit(event)` | `app.js` | **PASS (Verified)** |
| **Request OTP Button** | Dispatches POST to `/api/auth/forgot-password` | `requestPasswordOtp()` | `app.js` | **PASS (Verified)** |
| **Verify OTP Button** | Dispatches POST to `/api/auth/verify-otp` | `verifyOtpCode()` | `app.js` | **PASS (Verified)** |
| **Submit New Password Button** | Dispatches POST to `/api/auth/reset-password` | `submitPasswordReset()` | `app.js` | **PASS (Verified)** |
| **AI Logistics Specialist Bubble** | Toggles floating AI assistant widget | `toggleAIAssistant()` | `app.js` | **PASS (Verified)** |
| **3D Camera Angle Selector** | Rotates Three.js 3D vehicle perspective | `cycleCameraAngle()` | `vehicle-3d.js` | **PASS (Verified)** |
| **Neon Palette Switcher** | Cycles vehicle shader lighting tints | `cycleNeonPalette()` | `vehicle-3d.js` | **PASS (Verified)** |

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
