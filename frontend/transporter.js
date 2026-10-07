/**
 * TRANCECONNECT-PRIME: FLEET TRANSPORTER ENGINE
 * Real-time operational controller connected directly to MySQL backend.
 */

const authToken = localStorage.getItem('tc_token');
const currentUser = JSON.parse(localStorage.getItem('tc_user') || 'null');

let allTransporterShipments = [];
let allTransporterInvoices = [];
let allTransporterDeliveryOrders = [];
let currentTrackingShipmentId = null;
let currentChatShipmentId = null;
let currentChatCounterpartyId = null;
let trackingMapInstance = null;
let trackingMarkerInstance = null;
let socket = null;
let transConversations = [];
let typingDebounceTimeout = null;
let gpsWatchId = null;
let isGpsBroadcasting = false;

// Auth Guard: Only Transporters allowed
if (!authToken || !currentUser || currentUser.role !== 'transporter') {
  alert('Unauthorized. Please sign in with your Transporter account.');
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  setupEffects();
  setupUserInterface();
  initSocketConnection();
  loadAllTransporterData();
  loadTransporterConversationsAndUnread();
});

function setupEffects() {
  const bg = document.getElementById('parallaxBg');
  const glow = document.getElementById('cursorGlow');

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5);
    const y = (e.clientY / window.innerHeight - 0.5);
    if (bg) bg.style.transform = `translate3d(${x * 20}px, ${y * 20}px, 0)`;
    if (glow) {
      glow.style.left = `${e.clientX}px`;
      glow.style.top = `${e.clientY}px`;
    }
  });

  const fileInput = document.getElementById('directDocFile');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const disp = document.getElementById('uploadFileNameDisplay');
      if (e.target.files.length) {
        disp.textContent = `Selected: ${e.target.files[0].name} (${(e.target.files[0].size / 1024).toFixed(1)} KB)`;
      } else {
        disp.textContent = '';
      }
    });
  }
}

function setupUserInterface() {
  const nameEl = document.getElementById('userDisplayName');
  if (nameEl && currentUser) {
    nameEl.textContent = currentUser.company_name || currentUser.email;
    nameEl.title = `Signed in as ${currentUser.email}`;
  }
  const drawerName = document.getElementById('drawerUserName');
  if (drawerName && currentUser) {
    drawerName.textContent = currentUser.company_name || currentUser.email;
  }
  const titleEl = document.getElementById('transporterHeaderTitle');
  if (titleEl && currentUser) {
    titleEl.textContent = `${currentUser.company_name} — Fleet Operations`;
  }
}

async function loadAllTransporterData() {
  await Promise.all([
    loadStats(),
    loadShipments(),
    loadFleet(),
    loadDrivers(),
    loadTransporterTransitDocs(),
    loadDocuments()
  ]);
}

// 1. STATS
async function loadStats() {
  try {
    const res = await fetch('/api/dashboard/stats', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { stats } = await res.json();
    document.getElementById('kpiAssigned').textContent = stats.assigned_requests || 0;
    document.getElementById('kpiActive').textContent = stats.in_transit_trips || 0;
    document.getElementById('kpiDelivered').textContent = stats.completed_trips || 0;
    document.getElementById('kpiFleet').textContent = stats.fleet_count || 0;
    document.getElementById('kpiEarnings').textContent = '₹' + Number(stats.total_earnings || 0).toLocaleString();
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// 2. SHIPMENTS & LOADS
async function loadShipments() {
  try {
    const res = await fetch('/api/shipments', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allTransporterShipments = data.shipments || [];
    renderShipmentsTable(allTransporterShipments);

    // Populate active shipment dropdown for GPS broadcasting
    const gpsSelect = document.getElementById('gpsSelectActiveShipment');
    if (gpsSelect) {
      const activeLoads = allTransporterShipments.filter(s => s.status === 'In Transit' || s.status === 'Accepted');
      gpsSelect.innerHTML = `<option value="">-- Select Active Transit Load --</option>` +
        activeLoads.map(s => `<option value="${s.id}">#SHP-${s.id}: ${escapeHtml(s.product_type)} (${escapeHtml(s.pickup_location)} ➔ ${escapeHtml(s.delivery_location)})</option>`).join('');
    }
  } catch (err) {
    console.error('Shipments error:', err);
  }
}

function renderShipmentsTable(shipments) {
  const tbody = document.getElementById('transporterShipmentsBody');
  if (!tbody) return;

  if (!shipments || shipments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 3rem;">No consignment loads currently assigned or available in the network.</td></tr>`;
    return;
  }

  tbody.innerHTML = shipments.map(s => {
    const statusClass = `badge-${s.status.toLowerCase().replace(' ', '_')}`;
    let operationsHtml = '';

    if (s.status === 'Pending' || s.status === 'Assigned') {
      operationsHtml = `
        <button class="btn btn-success btn-sm" onclick="handleUpdateStatus(${s.id}, 'Accepted')">Accept Load</button>
        <button class="btn btn-danger btn-sm" onclick="handleUpdateStatus(${s.id}, 'Cancelled')">Decline</button>
      `;
    } else if (s.status === 'Accepted') {
      operationsHtml = `
        <button class="btn btn-primary btn-sm" onclick="handleUpdateStatus(${s.id}, 'In Transit')">Start Delivery ➔</button>
        <button class="btn btn-outline btn-sm" onclick="viewShipmentTransitDocs(${s.id})" title="Inspect Authorized Invoices & Delivery Orders">📋 Transit Docs</button>
        <button class="btn btn-glass btn-sm" onclick="openTransporterChatFromShipment(${s.id})">💬 Chat</button>
      `;
    } else if (s.status === 'In Transit') {
      operationsHtml = `
        <button class="btn btn-outline btn-sm" onclick="openTrackingModal(${s.id})">🛰️ Dispatch GPS</button>
        <button class="btn btn-outline btn-sm" onclick="viewShipmentTransitDocs(${s.id})" title="Inspect Authorized Invoices & Delivery Orders">📋 Transit Docs</button>
        <button class="btn btn-success btn-sm" onclick="handleUpdateStatus(${s.id}, 'Delivered')">Confirm Delivered ✅</button>
        <button class="btn btn-glass btn-sm" onclick="openTransporterChatFromShipment(${s.id})">💬 Chat</button>
      `;
    } else {
      operationsHtml = `
        <button class="btn btn-outline btn-sm" onclick="viewShipmentTransitDocs(${s.id})" title="Inspect Invoices & Delivery Orders">📋 Docs</button>
        <span style="color: var(--text-dim); font-size: 0.8rem; align-self: center;">Trip Settled</span>
      `;
    }

    const vehicleImg = s.vehicle_image || '/assets/vehicles/container-truck.svg';
    const truckDisplay = s.vehicle_number 
      ? `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <img src="${vehicleImg}" class="vehicle-row-thumb" alt="Truck">
          <div>
            <strong>${escapeHtml(s.vehicle_number)}</strong><br>
            <small style="color:var(--text-dim)">${escapeHtml(s.driver_name || 'Driver Enrolled')}</small>
          </div>
        </div>
      `
      : `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <img src="${vehicleImg}" class="vehicle-row-thumb" alt="Truck">
          <span style="color: var(--text-dim);">Unallocated</span>
        </div>
      `;

    return `
      <tr>
        <td><strong>#SHP-${s.id}</strong></td>
        <td>
          <strong>${escapeHtml(s.dealer_company || 'Shipper')}</strong><br>
          <small style="color: var(--text-dim);">📞 ${escapeHtml(s.dealer_mobile || '')}</small>
        </td>
        <td>
          <strong>${escapeHtml(s.product_type)}</strong><br>
          <small style="color: var(--cyan);">${s.weight_tons}T &bull; ${escapeHtml(s.vehicle_required)}</small>
        </td>
        <td>
          <small style="color: var(--text-dim);">FROM:</small> ${escapeHtml(s.pickup_location)}<br>
          <small style="color: var(--text-dim);">TO:</small> ${escapeHtml(s.delivery_location)}
        </td>
        <td><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(s.price_per_trip).toLocaleString()}</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(s.status)}</span></td>
        <td>${truckDisplay}</td>
        <td><div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">${operationsHtml}</div></td>
      </tr>
    `;
  }).join('');
}

function filterTransporterShipments() {
  const q = document.getElementById('shipmentSearchInput').value.toLowerCase();
  const filtered = allTransporterShipments.filter(s => {
    return !q || (
      s.id.toString().includes(q) ||
      (s.dealer_company && s.dealer_company.toLowerCase().includes(q)) ||
      s.product_type.toLowerCase().includes(q) ||
      s.pickup_location.toLowerCase().includes(q) ||
      s.delivery_location.toLowerCase().includes(q)
    );
  });
  renderShipmentsTable(filtered);
}

async function handleUpdateStatus(shipmentId, status) {
  try {
    const res = await fetch(`/api/shipments/${shipmentId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update status', 'error');
      return;
    }
    showToast(data.message, 'success');
    loadAllTransporterData();
  } catch (err) {
    showToast('Status update error: ' + err.message, 'error');
  }
}

// 3. FLEET
async function loadFleet() {
  try {
    const res = await fetch('/api/vehicles', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { vehicles } = await res.json();
    const tbody = document.getElementById('transporterFleetBody');
    if (!tbody) return;

    if (!vehicles || vehicles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No fleet vehicles enrolled yet. Click "+ Register Vehicle" to add your trucks.</td></tr>`;
      return;
    }

    tbody.innerHTML = vehicles.map(v => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <img src="${v.image_url || '/assets/vehicles/container-truck.svg'}" class="vehicle-row-thumb" alt="Truck">
            <div>
              <strong>${escapeHtml(v.vehicle_number)}</strong>
            </div>
          </div>
        </td>
        <td>${escapeHtml(v.vehicle_type)}</td>
        <td><strong style="color: var(--cyan);">${v.capacity_tons} Tons</strong></td>
        <td>${escapeHtml(v.current_location || 'Logistics Depot')}</td>
        <td><span class="status-badge badge-${v.status === 'available' ? 'accepted' : 'in_transit'}">${v.status.toUpperCase()}</span></td>
        <td><span style="color: var(--emerald); font-weight: 600; font-size: 0.8rem;">RC Verified</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Fleet error:', err);
  }
}

function openAddVehicleModal() { openModal('addVehicleModal'); }

async function handleAddVehicle(e) {
  e.preventDefault();
  const vehicle_number = document.getElementById('vehNumber').value.trim();
  const vehicle_type = document.getElementById('vehType').value;
  const capacity_tons = document.getElementById('vehCapacity').value;
  const current_location = document.getElementById('vehLocation').value.trim();

  try {
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ vehicle_number, vehicle_type, capacity_tons, current_location })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to enroll vehicle', 'error');
      return;
    }
    closeModal('addVehicleModal');
    document.getElementById('vehNumber').value = '';
    showToast(data.message, 'success');
    loadFleet();
    loadStats();
  } catch (err) {
    showToast('Add vehicle error: ' + err.message, 'error');
  }
}

// 4. DRIVERS
async function loadDrivers() {
  try {
    const res = await fetch('/api/drivers', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { drivers } = await res.json();
    const tbody = document.getElementById('transporterDriversBody');
    if (!tbody) return;

    if (!drivers || drivers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No commercial drivers enrolled yet. Click "+ Enroll Driver".</td></tr>`;
      return;
    }

    tbody.innerHTML = drivers.map(d => `
      <tr>
        <td><strong>${escapeHtml(d.name)}</strong></td>
        <td>${escapeHtml(d.mobile)}</td>
        <td><code>${escapeHtml(d.license_number)}</code></td>
        <td>${escapeHtml(d.aadhaar_number || '-')}</td>
        <td>${escapeHtml(d.vehicle_number || 'Available for Dispatch')}</td>
        <td><span class="status-badge badge-accepted">ACTIVE</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Drivers error:', err);
  }
}

function openAddDriverModal() { openModal('addDriverModal'); }

async function handleAddDriver(e) {
  e.preventDefault();
  const name = document.getElementById('drvName').value.trim();
  const mobile = document.getElementById('drvMobile').value.trim();
  const license_number = document.getElementById('drvLicense').value.trim();
  const aadhaar_number = document.getElementById('drvAadhaar').value.trim();

  try {
    const res = await fetch('/api/drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, mobile, license_number, aadhaar_number })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to enroll driver', 'error');
      return;
    }
    closeModal('addDriverModal');
    document.getElementById('drvName').value = '';
    document.getElementById('drvMobile').value = '';
    document.getElementById('drvLicense').value = '';
    showToast(data.message, 'success');
    loadDrivers();
  } catch (err) {
    showToast('Add driver error: ' + err.message, 'error');
  }
}

// 5. DOCUMENTS
async function loadDocuments() {
  try {
    const res = await fetch('/api/documents', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { documents } = await res.json();
    const tbody = document.getElementById('transporterDocsBody');
    if (!tbody) return;

    if (!documents || documents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No compliance documents uploaded yet. Upload your Driving License and Aadhaar to verify account.</td></tr>`;
      return;
    }

    tbody.innerHTML = documents.map(d => `
      <tr>
        <td><strong>#DOC-${d.id}</strong></td>
        <td><span class="status-badge badge-assigned">${escapeHtml(d.document_type.toUpperCase())}</span></td>
        <td>${escapeHtml(d.file_name)}</td>
        <td><span class="status-badge badge-${d.verification_status}">${d.verification_status.toUpperCase()}</span></td>
        <td><small>${new Date(d.uploaded_at).toLocaleDateString()}</small></td>
        <td>
          <a class="btn btn-glass btn-sm" href="/api/documents/${d.id}/download?token=${authToken}" target="_blank">📥 View / Download</a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Docs error:', err);
  }
}

function openDirectUploadModal(cat = 'driving_license') {
  document.getElementById('directDocType').value = cat;
  openModal('uploadDocModal');
}

async function handleDirectUpload(e) {
  e.preventDefault();
  const file = document.getElementById('directDocFile').files[0];
  const type = document.getElementById('directDocType').value;

  if (!file) {
    showToast('Please select a file to upload', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', type);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      closeModal('uploadDocModal');
      document.getElementById('directDocFile').value = '';
      document.getElementById('uploadFileNameDisplay').textContent = '';
      loadDocuments();
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
}

// ==========================================
// SOCKET.IO REAL-TIME INITIALIZATION
// ==========================================
function initSocketConnection() {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO library not loaded, using REST fallback');
    return;
  }

  socket = io({
    auth: { token: authToken }
  });

  socket.on('connect', () => {
    console.log('Transporter Socket.IO connected:', socket.id);
    socket.emit('authenticate', { token: authToken });
  });

  socket.on('new_message', (msg) => {
    onSocketNewMessage(msg);
  });

  socket.on('chat_notification', (msg) => {
    loadTransporterConversationsAndUnread();
    showToast(`New message from ${msg.sender_name}: ${msg.message.slice(0, 45)}...`, 'info');
  });

  socket.on('user_typing', (data) => {
    onSocketUserTyping(data);
  });

  socket.on('user_presence', (data) => {
    onSocketPresence(data);
  });

  socket.on('messages_marked_read', (data) => {
    if (data.shipment_id === currentChatShipmentId) {
      const unreadTicks = document.querySelectorAll('.chat-bubble-wrap.me .tick-unread');
      unreadTicks.forEach(t => {
        t.textContent = '✓✓';
        t.style.color = 'var(--cyan)';
      });
    }
  });

  socket.on('location_acknowledged', (data) => {
    console.log('Location broadcast acknowledged by server:', data);
  });
}

function onSocketNewMessage(msg) {
  if (currentChatShipmentId === msg.shipment_id) {
    appendMessageToTransChatPane(msg);
    if (msg.sender_id !== currentUser.id) {
      socket.emit('mark_read', { shipment_id: currentChatShipmentId });
      fetch(`/api/chat/${currentChatShipmentId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  }

  updateTransConversationPreview(msg);
  loadTransporterConversationsAndUnread();
}

function onSocketUserTyping(data) {
  if (data.shipment_id === currentChatShipmentId && data.user_id !== currentUser.id) {
    const hint = document.getElementById('transChatTypingHint');
    if (hint) {
      hint.textContent = data.is_typing ? `${data.user_name} is typing...` : '';
      if (data.is_typing) {
        clearTimeout(typingDebounceTimeout);
        typingDebounceTimeout = setTimeout(() => { hint.textContent = ''; }, 2500);
      }
    }
  }
}

function onSocketPresence(data) {
  if (data.user_id === currentChatCounterpartyId) {
    const dot = document.getElementById('transChatActivePresenceDot');
    const txt = document.getElementById('transChatActivePresenceText');
    const isOnline = data.status === 'online';
    if (dot) dot.className = `chat-online-dot ${isOnline ? '' : 'offline'}`;
    if (txt) {
      txt.textContent = isOnline ? '● Online' : '○ Offline';
      txt.className = `chat-active-status ${isOnline ? '' : 'offline'}`;
    }
  }
  const convDot = document.getElementById(`trans-conv-presence-${data.user_id}`);
  if (convDot) {
    convDot.className = `chat-online-dot ${data.status === 'online' ? '' : 'offline'}`;
  }
}

// ==========================================
// REAL-TIME 2-PANE CHAT (TRANSPORTER <-> DEALER)
// ==========================================
async function loadTransporterConversationsAndUnread() {
  try {
    const res = await fetch('/api/chat/conversations', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    transConversations = data.conversations || [];
    renderTransporterConversationsList(transConversations);

    const totalUnread = transConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    const badge = document.getElementById('transTotalUnreadBadge');
    const bnavBadge = document.getElementById('transBnavChatBadge');
    const topBadge = document.getElementById('transTopNotificationBadge');

    [badge, bnavBadge, topBadge].forEach(el => {
      if (!el) return;
      if (totalUnread > 0) {
        el.textContent = totalUnread;
        el.style.display = 'inline-block';
      } else {
        el.style.display = 'none';
      }
    });
  } catch (err) {
    console.error('Conversations error:', err);
  }
}

function renderTransporterConversationsList(conversations) {
  const container = document.getElementById('transConvList');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = `<div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-size: 0.85rem;">No active shipper chats. Accept a consignment load to initiate communication!</div>`;
    return;
  }

  container.innerHTML = conversations.map(c => {
    const isOnline = c.counterparty_online;
    const unreadHtml = c.unread_count > 0 ? `<span class="chat-unread-badge">${c.unread_count}</span>` : '';
    const isActive = currentChatShipmentId === c.shipment_id ? 'active' : '';
    const timeStr = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const vehicleImg = c.vehicle_image || '/assets/vehicles/container-truck.svg';

    return `
      <div class="chat-conv-item ${isActive}" id="trans-conv-item-${c.shipment_id}" onclick="selectTransporterConversation(${c.shipment_id})">
        <div class="chat-conv-avatar">
          <img src="${vehicleImg}" alt="Truck">
          <span id="trans-conv-presence-${c.counterparty_id}" class="chat-online-dot ${isOnline ? '' : 'offline'}"></span>
        </div>
        <div class="chat-conv-info">
          <div class="chat-conv-header">
            <span class="chat-conv-name">${escapeHtml(c.counterparty_name)}</span>
            <span class="chat-conv-time">${timeStr}</span>
          </div>
          <div class="chat-conv-preview">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <small style="color: var(--cyan);">#${c.shipment_id}:</small> ${escapeHtml(c.last_message)}
            </span>
            ${unreadHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterTransporterConversations() {
  const q = (document.getElementById('transConvSearch')?.value || '').toLowerCase();
  const filtered = transConversations.filter(c => 
    c.counterparty_name.toLowerCase().includes(q) ||
    c.shipment_id.toString().includes(q) ||
    (c.product_type && c.product_type.toLowerCase().includes(q))
  );
  renderTransporterConversationsList(filtered);
}

async function selectTransporterConversation(shipmentId) {
  currentChatShipmentId = shipmentId;
  const conv = transConversations.find(c => c.shipment_id === shipmentId);
  if (!conv) return;

  currentChatCounterpartyId = conv.counterparty_id;

  document.querySelectorAll('.chat-conv-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`trans-conv-item-${shipmentId}`);
  if (activeEl) activeEl.classList.add('active');

  const emptyPane = document.getElementById('transChatEmpty');
  const activeBox = document.getElementById('transActiveChatBox');
  if (emptyPane) emptyPane.style.display = 'none';
  if (activeBox) activeBox.style.display = 'flex';

  // Mobile 2-pane: Slide in chat screen
  const chatContainer = document.getElementById('transChatContainer');
  if (chatContainer) chatContainer.classList.add('chat-mobile-chat-open');

  document.getElementById('transChatActiveAvatar').src = conv.vehicle_image || '/assets/vehicles/container-truck.svg';
  document.getElementById('transChatActiveName').textContent = conv.counterparty_name;
  document.getElementById('transChatActiveShipmentTag').textContent = `#SHP-${conv.shipment_id} (${conv.product_type})`;
  document.getElementById('transChatActiveVehicleTag').textContent = conv.vehicle_number ? `Truck: ${conv.vehicle_number}` : 'Awaiting Truck Allocation';

  const isOnline = conv.counterparty_online;
  const dot = document.getElementById('transChatActivePresenceDot');
  const txt = document.getElementById('transChatActivePresenceText');
  if (dot) dot.className = `chat-online-dot ${isOnline ? '' : 'offline'}`;
  if (txt) {
    txt.textContent = isOnline ? '● Online' : '○ Offline';
    txt.className = `chat-active-status ${isOnline ? '' : 'offline'}`;
  }

  if (socket) {
    socket.emit('join_chat', { shipment_id: shipmentId });
    socket.emit('mark_read', { shipment_id: shipmentId });
  }

  await fetch(`/api/chat/${shipmentId}/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  await loadTransporterChatHistory(shipmentId);
}

async function loadTransporterChatHistory(shipmentId) {
  const container = document.getElementById('transChatMessages');
  if (!container) return;

  container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem;">Loading encrypted transit chat...</div>`;

  try {
    const res = await fetch(`/api/chat/${shipmentId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { messages } = await res.json();

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); margin-top: 3rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🤝</div>
          <strong>Consignment Channel Active</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem;">Coordinate dispatch, weighbridge slips, route corridors, and arrival times directly with your shipper.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => renderTransChatBubble(m)).join('');
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error('Chat history error:', err);
  }
}

function renderTransChatBubble(m) {
  const isMine = m.sender_id === currentUser.id;
  const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const readStatus = isMine ? (m.is_read ? '<span style="color:var(--cyan)">✓✓</span>' : '<span>✓</span>') : '';

  return `
    <div class="chat-bubble-wrap ${isMine ? 'me' : 'them'}">
      <div class="chat-bubble">
        <small style="display: block; font-weight: 700; margin-bottom: 0.2rem; font-size: 0.72rem; color: ${isMine ? '#bae6fd' : 'var(--cyan)'};">
          ${isMine ? 'You (Fleet Operator)' : escapeHtml(m.sender_name)}
        </small>
        ${escapeHtml(m.message)}
      </div>
      <div class="chat-bubble-meta">
        <span>${timeStr}</span>
        ${readStatus}
      </div>
    </div>
  `;
}

function appendMessageToTransChatPane(msg) {
  const container = document.getElementById('transChatMessages');
  if (!container) return;

  if (container.querySelector('strong')?.textContent.includes('Consignment Channel Active')) {
    container.innerHTML = '';
  }

  container.insertAdjacentHTML('beforeend', renderTransChatBubble(msg));
  container.scrollTop = container.scrollHeight;
}

function updateTransConversationPreview(msg) {
  const conv = transConversations.find(c => c.shipment_id === msg.shipment_id);
  if (conv) {
    conv.last_message = msg.message;
    conv.last_message_at = msg.created_at;
    if (msg.sender_id !== currentUser.id && currentChatShipmentId !== msg.shipment_id) {
      conv.unread_count = (conv.unread_count || 0) + 1;
    }
    renderTransporterConversationsList(transConversations);
  }
}

async function handleSendTransporterMessage(e) {
  e.preventDefault();
  const input = document.getElementById('transMsgInput');
  const message = input.value.trim();
  if (!message || !currentChatShipmentId) return;

  input.value = '';

  if (socket && socket.connected) {
    socket.emit('send_message', {
      shipment_id: currentChatShipmentId,
      message: message,
      message_type: 'text'
    });
  } else {
    try {
      const res = await fetch(`/api/chat/${currentChatShipmentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ message, message_type: 'text' })
      });
      if (res.ok) {
        const data = await res.json();
        appendMessageToTransChatPane(data.data);
      }
    } catch (err) {
      showToast('Failed to send message: ' + err.message, 'error');
    }
  }
}

function handleTransporterTyping() {
  if (socket && currentChatShipmentId) {
    socket.emit('typing', { shipment_id: currentChatShipmentId, is_typing: true });
  }
}

function openTransporterChatFromShipment(shipmentId) {
  switchTab('chat');
  setTimeout(() => {
    selectTransporterConversation(shipmentId);
  }, 100);
}

// ==========================================
// LIVE GPS LOCATION SHARING CONTROLLER
// ==========================================
let gpsLastBroadcastTime = null;
let gpsRelativeTimerInterval = null;

function updateGpsRelativeTimestamp() {
  const el = document.getElementById('gpsLastUpdatedText');
  if (!el) return;
  if (!isGpsBroadcasting) {
    el.innerHTML = `GPS Status: <span style="color:var(--text-muted)">Standby (OFF)</span> &bull; Tap Start to broadcast`;
    return;
  }
  if (!gpsLastBroadcastTime) {
    el.innerHTML = `GPS Status: <span style="color:var(--cyan)">Acquiring GPS fix...</span>`;
    return;
  }
  const diffSec = Math.floor((Date.now() - gpsLastBroadcastTime) / 1000);
  const timeStr = diffSec === 0 ? 'just now' : `${diffSec}s ago`;
  el.innerHTML = `Broadcast: <span style="color:var(--emerald);font-weight:700;">LIVE</span> &bull; <strong>Last updated: ${timeStr}</strong> &bull; (Streaming)`;
}

function toggleGpsLocationBroadcast() {
  if (isGpsBroadcasting) {
    stopGpsLocationBroadcast();
  } else {
    startGpsLocationBroadcast();
  }
}

function startGpsLocationBroadcast() {
  const select = document.getElementById('gpsSelectActiveShipment');
  const shipmentId = select ? select.value : null;

  if (!shipmentId) {
    showToast('Please select an active load to broadcast GPS telemetry for', 'warning');
    return;
  }

  const badge = document.getElementById('gpsBroadcastBadge');
  const btn = document.getElementById('btnToggleGpsBroadcast');
  const desc = document.getElementById('gpsStatusDescription');

  if (!navigator.geolocation) {
    showToast('Browser Geolocation API is not supported. Use Manual Pin.', 'warning');
    return;
  }

  isGpsBroadcasting = true;
  if (badge) {
    badge.className = 'gps-telemetry-badge active';
    badge.textContent = '● BROADCASTING (LIVE)';
  }
  if (btn) {
    btn.textContent = '⏹️ Stop Broadcast';
    btn.className = 'btn btn-danger btn-sm';
  }

  if (gpsRelativeTimerInterval) clearInterval(gpsRelativeTimerInterval);
  gpsRelativeTimerInterval = setInterval(updateGpsRelativeTimestamp, 1000);
  updateGpsRelativeTimestamp();

  showToast(`Initiating real-time GPS telemetry for Consignment #${shipmentId}...`, 'info');

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      gpsLastBroadcastTime = Date.now();
      updateGpsRelativeTimestamp();

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const speed = position.coords.speed ? (position.coords.speed * 3.6) : 58.0;
      const heading = position.coords.heading || 0.0;
      const accuracy = position.coords.accuracy || 8.0;
      const locName = `Live Highway Corridor (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      if (desc) {
        desc.textContent = `Broadcasting: ${lat.toFixed(4)}, ${lng.toFixed(4)} | Speed: ${speed.toFixed(0)} km/h | Accuracy: ±${accuracy.toFixed(0)}m`;
      }

      // Emit over WebSocket
      if (socket && socket.connected) {
        socket.emit('share_location', {
          shipment_id: Number(shipmentId),
          latitude: lat,
          longitude: lng,
          speed_kmh: speed,
          heading: heading,
          accuracy: accuracy,
          location_name: locName,
          status_note: `En Route at ${speed.toFixed(0)} km/h`
        });
      }

      // Also persist to REST
      fetch('/api/tracking/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          shipment_id: Number(shipmentId),
          latitude: lat,
          longitude: lng,
          speed_kmh: speed,
          heading: heading,
          accuracy: accuracy,
          location_name: locName,
          status_note: `En Route at ${speed.toFixed(0)} km/h`
        })
      }).catch(err => console.error('REST GPS sync err:', err));
    },
    (error) => {
      console.warn('Geolocation warning/fallback:', error.message);
      if (error.code === 1) { // PERMISSION_DENIED
        showToast('GPS Permission Denied. Please enable location permissions in browser settings.', 'warning');
      } else {
        showToast('GPS acquiring indoors. Streaming simulated highway telemetry.', 'info');
      }
      simulateGpsCoordinateBroadcast(shipmentId);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function stopGpsLocationBroadcast() {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  isGpsBroadcasting = false;

  if (gpsRelativeTimerInterval) {
    clearInterval(gpsRelativeTimerInterval);
    gpsRelativeTimerInterval = null;
  }
  gpsLastBroadcastTime = null;
  updateGpsRelativeTimestamp();

  const badge = document.getElementById('gpsBroadcastBadge');
  const btn = document.getElementById('btnToggleGpsBroadcast');
  const desc = document.getElementById('gpsStatusDescription');

  if (badge) {
    badge.className = 'gps-telemetry-badge inactive';
    badge.textContent = '● STANDBY (OFF)';
  }
  if (btn) {
    btn.textContent = '📡 Start GPS Broadcast';
    btn.className = 'btn btn-primary btn-sm';
  }
  if (desc) {
    desc.textContent = 'Stream real-time driver coordinates to allocated Dealer & HQ radar during transit.';
  }

  showToast('GPS telemetry broadcast paused.', 'info');
}

let simulatedWaypointStep = 0;
function simulateGpsCoordinateBroadcast(shipmentId) {
  simulatedWaypointStep++;
  gpsLastBroadcastTime = Date.now();
  updateGpsRelativeTimestamp();

  const baseLat = 18.75 + (simulatedWaypointStep * 0.035);
  const baseLng = 73.15 + (simulatedWaypointStep * 0.040);
  const speed = 62.0 + Math.floor(Math.random() * 8);
  const locName = `NH 48 Highway Checkpoint (Km ${simulatedWaypointStep * 24})`;

  const desc = document.getElementById('gpsStatusDescription');
  if (desc) {
    desc.textContent = `Broadcasting: ${baseLat.toFixed(4)}, ${baseLng.toFixed(4)} | Speed: ${speed.toFixed(0)} km/h | Location: ${locName}`;
  }

  if (socket && socket.connected) {
    socket.emit('share_location', {
      shipment_id: Number(shipmentId),
      latitude: baseLat,
      longitude: baseLng,
      speed_kmh: speed,
      heading: 85.0,
      accuracy: 6.0,
      location_name: locName,
      status_note: `In Transit: Passed ${locName}`
    });
  }

  fetch('/api/tracking/live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      shipment_id: Number(shipmentId),
      latitude: baseLat,
      longitude: baseLng,
      speed_kmh: speed,
      heading: 85.0,
      accuracy: 6.0,
      location_name: locName,
      status_note: `In Transit: Passed ${locName}`
    })
  }).catch(() => {});
}

async function manualGpsUpdatePrompt() {
  const select = document.getElementById('gpsSelectActiveShipment');
  const shipmentId = select ? select.value : null;

  if (!shipmentId) {
    showToast('Please select an active load to broadcast manual coordinates for', 'warning');
    return;
  }

  const checkpoint = prompt('Enter Checkpoint / Highway Landmark (e.g. Khalapur Toll Plaza, Pune Expressway):', 'Khalapur Expressway Toll Plaza');
  if (!checkpoint) return;

  const lat = 18.82 + (Math.random() * 0.15);
  const lng = 73.22 + (Math.random() * 0.15);
  const speed = 64.0;

  try {
    const res = await fetch('/api/tracking/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        shipment_id: Number(shipmentId),
        latitude: lat,
        longitude: lng,
        speed_kmh: speed,
        location_name: checkpoint,
        status_note: `Passed ${checkpoint}`
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Manual GPS waypoint "${checkpoint}" broadcasted live!`, 'success');
      if (socket && socket.connected) {
        socket.emit('share_location', {
          shipment_id: Number(shipmentId),
          latitude: lat,
          longitude: lng,
          speed_kmh: speed,
          location_name: checkpoint,
          status_note: `Passed ${checkpoint}`
        });
      }
    }
  } catch (err) {
    showToast('Failed to record checkpoint: ' + err.message, 'error');
  }
}

// ==========================================
// LIVE GPS RADAR & TELEMETRY MODAL
// ==========================================
async function openTrackingModal(shipmentId) {
  currentTrackingShipmentId = shipmentId;
  openModal('trackingModal');

  try {
    const res = await fetch(`/api/tracking/${shipmentId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Tracking details unavailable', 'error');
      return;
    }

    const { shipment, latest_location } = data;
    document.getElementById('trackModalHeading').textContent = `Consignment #${shipment.id} Radar: ${shipment.product_type}`;
    document.getElementById('trackModalRoute').textContent = `${shipment.pickup_location} ➔ ${shipment.delivery_location}`;
    document.getElementById('trackCurLocation').textContent = latest_location.location_name || shipment.pickup_location;
    document.getElementById('trackSpeed').textContent = `${Number(latest_location.speed_kmh || 0).toFixed(0)} KM/H`;
    document.getElementById('trackStatusNote').textContent = latest_location.status_note || 'Active GPS Stream';

    setTimeout(() => {
      initTrackingMap(latest_location.latitude, latest_location.longitude, latest_location.location_name, shipment.vehicle_image);
    }, 250);
  } catch (err) {
    showToast('Radar error: ' + err.message, 'error');
  }
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
      attribution: '&copy; OpenStreetMap | TranceConnect GPS'
    }).addTo(trackingMapInstance);
  } else {
    trackingMapInstance.invalidateSize();
    trackingMapInstance.setView([validLat, validLng], 12);
  }

  const customIcon = L.divIcon({
    className: 'custom-vehicle-div-icon',
    html: `
      <div class="vehicle-map-marker">
        <img src="${vehicleImgUrl || '/assets/vehicles/container-truck.svg'}" alt="Truck">
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
  });

  if (trackingMarkerInstance) {
    trackingMarkerInstance.setLatLng([validLat, validLng]);
    trackingMarkerInstance.setIcon(customIcon);
  } else {
    trackingMarkerInstance = L.marker([validLat, validLng], { icon: customIcon }).addTo(trackingMapInstance);
  }

  trackingMarkerInstance.bindPopup(`<b>${escapeHtml(locName || 'Fleet Vehicle')}</b><br>Coordinates: ${validLat.toFixed(4)}, ${validLng.toFixed(4)}`).openPopup();
}

async function submitQuickLocationPing() {
  if (!currentTrackingShipmentId) return;
  const location_name = document.getElementById('quickLocationName').value.trim();
  const speed_kmh = Number(document.getElementById('quickSpeed').value) || 55.0;

  if (!location_name) {
    showToast('Please specify checkpoint description', 'warning');
    return;
  }

  const baseLat = 18.8 + (Math.random() * 0.2);
  const baseLng = 73.1 + (Math.random() * 0.2);

  try {
    const res = await fetch('/api/tracking/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        shipment_id: currentTrackingShipmentId,
        latitude: baseLat,
        longitude: baseLng,
        location_name,
        speed_kmh,
        status_note: `Passed ${location_name}`
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('GPS checkpoint recorded and streamed to shipper!', 'success');
      document.getElementById('trackCurLocation').textContent = location_name;
      document.getElementById('trackSpeed').textContent = `${speed_kmh} KM/H`;
      document.getElementById('trackStatusNote').textContent = `Passed ${location_name}`;
      initTrackingMap(baseLat, baseLng, location_name);
    }
  } catch (err) {
    showToast('Failed to record checkpoint: ' + err.message, 'error');
  }
}

// 8. PROFILE
function openProfileModal() {
  document.getElementById('profCompany').value = currentUser.company_name || '';
  document.getElementById('profContact').value = currentUser.contact_person || '';
  document.getElementById('profMobile').value = currentUser.mobile || '';
  document.getElementById('profGst').value = currentUser.gst_number || '';
  document.getElementById('profCity').value = currentUser.city || '';
  document.getElementById('profState').value = currentUser.state || '';
  openModal('profileModal');
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const company_name = document.getElementById('profCompany').value.trim();
  const contact_person = document.getElementById('profContact').value.trim();
  const mobile = document.getElementById('profMobile').value.trim();
  const gst_number = document.getElementById('profGst').value.trim();
  const city = document.getElementById('profCity').value.trim();
  const state = document.getElementById('profState').value.trim();

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ company_name, contact_person, mobile, gst_number, city, state })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Profile updated successfully!', 'success');
      currentUser.company_name = company_name;
      currentUser.contact_person = contact_person;
      currentUser.mobile = mobile;
      currentUser.gst_number = gst_number;
      currentUser.city = city;
      currentUser.state = state;
      localStorage.setItem('tc_user', JSON.stringify(currentUser));
      setupUserInterface();
      closeModal('profileModal');
    } else {
      showToast(data.error || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Profile update error: ' + err.message, 'error');
  }
}

// 9. AI SPECIALIST
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
      <span class="pulse-dot"></span> Analyzing fleet query...
    </div>
  `;
  feed.scrollTop = feed.scrollHeight;

  try {
    const res = await fetch('/api/ai/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        prompt,
        role: 'transporter',
        company_name: currentUser.company_name
      })
    });
    const data = await res.json();

    const t = document.getElementById('aiThinking');
    if (t) t.remove();

    feed.innerHTML += `<div class="chat-bubble bubble-theirs">${formatMarkdown(data.reply)}</div>`;
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    const t = document.getElementById('aiThinking');
    if (t) t.remove();
    feed.innerHTML += `<div class="chat-bubble bubble-theirs" style="color:var(--rose);">AI Specialist unavailable: ${err.message}</div>`;
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

// ===================================================================
// TRANSIT DOCUMENTS (DELIVERY ORDERS & INVOICES) FOR TRANSPORTER
// ===================================================================

async function loadTransporterTransitDocs() {
  try {
    const [resDo, resInv] = await Promise.all([
      fetch('/api/delivery-orders', { headers: { 'Authorization': `Bearer ${authToken}` } }),
      fetch('/api/invoices', { headers: { 'Authorization': `Bearer ${authToken}` } })
    ]);

    if (resDo.ok) {
      const dataDo = await resDo.json();
      allTransporterDeliveryOrders = dataDo.delivery_orders || [];
      renderTransporterDeliveryOrders(allTransporterDeliveryOrders);
    }

    if (resInv.ok) {
      const dataInv = await resInv.json();
      allTransporterInvoices = dataInv.invoices || [];
      renderTransporterInvoices(allTransporterInvoices);
    }
  } catch (err) {
    console.error('Transporter docs error:', err);
  }
}

function renderTransporterDeliveryOrders(dos) {
  const tbody = document.getElementById('transporterDeliveryOrdersBody');
  if (!tbody) return;

  if (!dos || dos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">No Delivery Orders currently issued for your allocated loads.</td></tr>`;
    return;
  }

  tbody.innerHTML = dos.map(d => {
    const statusClass = `badge-${d.status.toLowerCase().replace(' ', '_')}`;
    return `
      <tr>
        <td><strong style="color: var(--cyan); font-family: 'JetBrains Mono', monospace;">${escapeHtml(d.do_number)}</strong></td>
        <td>${escapeHtml(d.issue_date || '-')}</td>
        <td><strong>${escapeHtml(d.consignor_name)}</strong></td>
        <td><strong>${escapeHtml(d.consignee_name)}</strong><br><small style="color:var(--text-dim)">${escapeHtml(d.delivery_location || '')}</small></td>
        <td><strong>${escapeHtml(d.vehicle_number || 'TBD')}</strong></td>
        <td><strong>${Number(d.gross_weight_tons || 0).toFixed(1)} MT</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewDoDocTransporter(${d.id})" title="Inspect Official A4 Delivery Order">👁️ View</button>
            <button class="btn btn-primary btn-sm" onclick="downloadDoDocPdf(${d.id})" title="Download Official Vector PDF">📥 PDF</button>
            <button class="btn btn-glass btn-sm" onclick="printTransporterDoDirect(${d.id})" title="Print Delivery Order">🖨️ Print</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTransporterInvoices(invoices) {
  const tbody = document.getElementById('transporterInvoicesBody');
  if (!tbody) return;

  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No commercial tax invoices issued yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const statusClass = `badge-${inv.status.toLowerCase()}`;
    return `
      <tr>
        <td><strong style="color: var(--cyan); font-family: 'JetBrains Mono', monospace;">${escapeHtml(inv.invoice_number)}</strong></td>
        <td>${escapeHtml(inv.invoice_date || '-')}</td>
        <td><strong>${escapeHtml(inv.seller_name)}</strong></td>
        <td><strong>${escapeHtml(inv.buyer_name)}</strong></td>
        <td><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(inv.total_amount || 0).toLocaleString()}</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(inv.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewInvoiceDocTransporter(${inv.id})" title="Inspect Official Tax Invoice">👁️ View</button>
            <button class="btn btn-primary btn-sm" onclick="downloadInvoiceDocPdf(${inv.id})" title="Download Official Vector PDF">📥 PDF</button>
            <button class="btn btn-glass btn-sm" onclick="printTransporterInvoiceDirect(${inv.id})" title="Print Invoice">🖨️ Print</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterTransporterTransitDocs() {
  const q = (document.getElementById('transDocsSearchInput')?.value || '').toLowerCase();

  const filteredDo = allTransporterDeliveryOrders.filter(d => {
    return !q || (
      d.do_number.toLowerCase().includes(q) ||
      d.consignor_name.toLowerCase().includes(q) ||
      d.consignee_name.toLowerCase().includes(q) ||
      (d.shipment_id && d.shipment_id.toString().includes(q)) ||
      (d.vehicle_number && d.vehicle_number.toLowerCase().includes(q))
    );
  });
  renderTransporterDeliveryOrders(filteredDo);

  const filteredInv = allTransporterInvoices.filter(inv => {
    return !q || (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.seller_name.toLowerCase().includes(q) ||
      inv.buyer_name.toLowerCase().includes(q) ||
      (inv.shipment_id && inv.shipment_id.toString().includes(q))
    );
  });
  renderTransporterInvoices(filteredInv);
}

function viewShipmentTransitDocs(shipmentId) {
  switchTab('transitDocs');
  const input = document.getElementById('transDocsSearchInput');
  if (input) {
    input.value = shipmentId.toString();
    filterTransporterTransitDocs();
  }
}

async function viewDoDocTransporter(id) {
  try {
    const res = await fetch(`/api/delivery-orders/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { delivery_order, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Delivery Order: ${delivery_order.do_number}`;
    document.getElementById('docViewerSub').textContent = `Carrier Gate Pass &bull; Issued: ${delivery_order.issue_date} &bull; Destination: ${delivery_order.delivery_location}`;
    document.getElementById('docViewerPdfBtn').href = `/api/delivery-orders/${id}/pdf?token=${authToken}`;
    document.getElementById('docViewerQrBtn').href = `/verify/do/${delivery_order.do_number}`;

    const sheet = document.getElementById('docViewerSheet');
    let itemsHtml = '';
    let count = 1;
    let totalWt = 0;
    (items || []).forEach(it => {
      const wt = Number(it.weight_tons || 0);
      totalWt += wt;
      itemsHtml += `
        <tr>
          <td class="text-center">${count++}</td>
          <td><strong>${escapeHtml(it.item_name)}</strong></td>
          <td class="text-center">${escapeHtml(it.packaging_type || '-')}</td>
          <td class="text-right"><strong>${wt.toFixed(2)} MT</strong></td>
          <td>${escapeHtml(it.remarks || '-')}</td>
        </tr>
      `;
    });

    sheet.innerHTML = `
      <div class="a4-header">
        <div class="a4-brand">
          <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
          <div class="a4-brand-info">
            <h1>${escapeHtml(delivery_order.consignor_name)}</h1>
            <p>GSTIN: <strong>${escapeHtml(delivery_order.consignor_gstin || '')}</strong> &bull; Carrier Clearance Terminal</p>
            <p>Loading Point: ${escapeHtml(delivery_order.loading_point || '')}</p>
          </div>
        </div>
        <div class="a4-doc-type-badge">
          <div class="a4-doc-title" style="color: #059669;">DELIVERY ORDER</div>
          <div class="a4-doc-subtitle">CARRIER DISPATCH & GATE PASS</div>
          <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #059669; font-size: 13px;">${escapeHtml(delivery_order.do_number)}</div>
        </div>
      </div>

      <div class="a4-meta-strip">
        <div class="a4-meta-col"><span>ISSUE DATE</span><strong>${escapeHtml(delivery_order.issue_date || '-')}</strong></div>
        <div class="a4-meta-col"><span>VALID UNTIL</span><strong style="color: #dc2626;">${escapeHtml(delivery_order.valid_until || '-')}</strong></div>
        <div class="a4-meta-col"><span>TOTAL GROSS WT</span><strong>${totalWt.toFixed(2)} MT</strong></div>
        <div class="a4-meta-col"><span>STATUS</span><strong style="color: #059669;">${escapeHtml(delivery_order.status)}</strong></div>
      </div>

      <div class="a4-parties-grid">
        <div class="a4-party-box">
          <div class="a4-party-label" style="color: #059669;">CONSIGNOR (LOADING ORIGIN)</div>
          <div class="a4-party-name">${escapeHtml(delivery_order.consignor_name)}</div>
          <div class="a4-party-line">Loading Point: <strong>${escapeHtml(delivery_order.loading_point || '')}</strong></div>
          <div class="a4-party-line">GSTIN: ${escapeHtml(delivery_order.consignor_gstin || '')}</div>
        </div>
        <div class="a4-party-box">
          <div class="a4-party-label" style="color: #059669;">CONSIGNEE (DELIVERY DOCK)</div>
          <div class="a4-party-name">${escapeHtml(delivery_order.consignee_name)}</div>
          <div class="a4-party-line">Unloading Bay: <strong>${escapeHtml(delivery_order.delivery_location || '')}</strong></div>
          <div class="a4-party-line">Contact: ${escapeHtml(delivery_order.consignee_contact || '')}</div>
        </div>
      </div>

      <div class="a4-transport-bar" style="background: #f0fdf4; border-color: #bbf7d0;">
        <div><span>AUTHORIZED CARRIER</span><strong>${escapeHtml(delivery_order.transporter_name || '-')}</strong></div>
        <div><span>VEHICLE NUMBER</span><strong>${escapeHtml(delivery_order.vehicle_number || '-')}</strong></div>
        <div><span>DRIVER DETAILS</span><strong>${escapeHtml(delivery_order.driver_name || '-')} (${escapeHtml(delivery_order.driver_mobile || '-')})</strong></div>
        <div><span>COMMERCIAL LICENSE</span><strong>${escapeHtml(delivery_order.driver_license || '-')}</strong></div>
      </div>

      <table class="a4-table">
        <thead>
          <tr style="background: #065f46;">
            <th style="width: 5%;" class="text-center">#</th>
            <th style="width: 45%;">Cargo Specifications & Manifest</th>
            <th style="width: 20%;" class="text-center">Packaging / Unit</th>
            <th style="width: 15%;" class="text-right">Gross Weight</th>
            <th style="width: 15%;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="a4-totals-section" style="grid-template-columns: 1fr;">
        <div class="a4-words-box" style="background: #f0fdf4; border-color: #bbf7d0;">
          <div class="a4-words-label" style="color: #059669;">SPECIAL INSTRUCTIONS & GATE CLEARANCES</div>
          <p style="white-space: pre-line; margin: 4px 0 0; font-size: 10.5px; color: #1e293b;">${escapeHtml(delivery_order.special_instructions || 'Standard carrier dispatch conditions apply.')}</p>
        </div>
      </div>

      <div class="a4-footer" style="margin-top: 24px;">
        <div style="font-size: 9.5px; color: #64748b; line-height: 1.5;">
          <strong>Tripartite Compliance Declaration:</strong><br>
          Authorized for highway transit and delivery to consignee dock.<br>
          Carrier Seal: _______________________
        </div>
        <div class="a4-signatory-box">
          <div class="a4-qr-wrap">
            <img src="/api/verify/do/${encodeURIComponent(delivery_order.do_number)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
            <div style="font-size: 8.5px; text-align: left; color: #475569;">
              <strong>QR Verified DO</strong><br>
              Scan to inspect manifest<br>
              and security clearance
            </div>
          </div>
          <div class="a4-sign-line">
            For ${escapeHtml(delivery_order.consignor_name)}<br>
            <span style="font-size: 8.5px; color: #64748b;">(Authorized Dispatcher)</span>
          </div>
        </div>
      </div>
    `;

    openModal('docViewerModal');
  } catch (err) {
    showToast('Error opening Delivery Order: ' + err.message, 'error');
  }
}

async function viewInvoiceDocTransporter(id) {
  try {
    const res = await fetch(`/api/invoices/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { invoice, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Tax Invoice: ${invoice.invoice_number}`;
    document.getElementById('docViewerSub').textContent = `Shipper: ${invoice.seller_name} &bull; Total Freight: ₹${Number(invoice.total_amount).toLocaleString()} INR`;
    document.getElementById('docViewerPdfBtn').href = `/api/invoices/${id}/pdf?token=${authToken}`;
    document.getElementById('docViewerQrBtn').href = `/verify/invoice/${invoice.invoice_number}`;

    const sheet = document.getElementById('docViewerSheet');
    let itemsHtml = '';
    (items || []).forEach((it, idx) => {
      itemsHtml += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td><strong>${escapeHtml(it.description)}</strong></td>
          <td class="text-center">${escapeHtml(it.hsn_sac_code || '996511')}</td>
          <td class="text-center">${it.quantity} ${escapeHtml(it.unit || '')}</td>
          <td class="text-right">₹${Number(it.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          <td class="text-right">₹${Number(it.taxable_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          <td class="text-center">${it.gst_rate}%</td>
        </tr>
      `;
    });

    const isInterState = Number(invoice.igst_amount || 0) > 0;
    let taxRows = '';
    if (isInterState) {
      taxRows = `
        <tr>
          <td>Integrated GST (IGST):</td>
          <td class="text-right">₹${Number(invoice.igst_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
      `;
    } else {
      taxRows = `
        <tr>
          <td>Central GST (CGST):</td>
          <td class="text-right">₹${Number(invoice.cgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
        <tr>
          <td>State GST (SGST):</td>
          <td class="text-right">₹${Number(invoice.sgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
      `;
    }

    sheet.innerHTML = `
      <div class="a4-header">
        <div class="a4-brand">
          <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
          <div class="a4-brand-info">
            <h1>${escapeHtml(invoice.seller_name)}</h1>
            <p>GSTIN: <strong>${escapeHtml(invoice.seller_gstin)}</strong> &bull; PAN: <strong>${escapeHtml(invoice.seller_pan || '')}</strong></p>
            <p>${escapeHtml(invoice.seller_address || '')} &bull; State: ${escapeHtml(invoice.seller_state)} (${escapeHtml(invoice.seller_state_code)})</p>
          </div>
        </div>
        <div class="a4-doc-type-badge">
          <div class="a4-doc-title">TAX INVOICE</div>
          <div class="a4-doc-subtitle">ORIGINAL FOR RECIPIENT</div>
          <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #0284c7; font-size: 13px;">${escapeHtml(invoice.invoice_number)}</div>
        </div>
      </div>

      <div class="a4-meta-strip">
        <div class="a4-meta-col"><span>INVOICE DATE</span><strong>${escapeHtml(invoice.invoice_date || '-')}</strong></div>
        <div class="a4-meta-col"><span>PAYMENT DUE</span><strong>${escapeHtml(invoice.due_date || '-')}</strong></div>
        <div class="a4-meta-col"><span>PLACE OF SUPPLY</span><strong>${escapeHtml(invoice.place_of_supply || 'Maharashtra')}</strong></div>
        <div class="a4-meta-col"><span>STATUS</span><strong style="color: #0284c7;">${escapeHtml(invoice.status)}</strong></div>
      </div>

      <div class="a4-parties-grid">
        <div class="a4-party-box">
          <div class="a4-party-label">BILLED TO (BUYER / RECIPIENT)</div>
          <div class="a4-party-name">${escapeHtml(invoice.buyer_name)}</div>
          <div class="a4-party-line">${escapeHtml(invoice.buyer_billing_address || '')}</div>
          <div class="a4-party-line">GSTIN: <strong>${escapeHtml(invoice.buyer_gstin || 'Unregistered')}</strong></div>
        </div>
        <div class="a4-party-box">
          <div class="a4-party-label">SHIPPED TO (CONSIGNEE UNLOADING DOCK)</div>
          <div class="a4-party-name">${escapeHtml(invoice.buyer_name)}</div>
          <div class="a4-party-line">${escapeHtml(invoice.buyer_shipping_address || invoice.buyer_billing_address || '')}</div>
        </div>
      </div>

      <div class="a4-transport-bar">
        <div><span>CARRIER / TRANSPORTER</span><strong>${escapeHtml(invoice.transporter_name || '-')}</strong></div>
        <div><span>VEHICLE REG NO</span><strong>${escapeHtml(invoice.vehicle_number || '-')}</strong></div>
        <div><span>COMMERCIAL DRIVER</span><strong>${escapeHtml(invoice.driver_name || '-')}</strong></div>
        <div><span>LR / E-WAY BILL NO</span><strong>${escapeHtml(invoice.lr_number || '-')}</strong></div>
      </div>

      <table class="a4-table">
        <thead>
          <tr>
            <th style="width: 5%;" class="text-center">#</th>
            <th style="width: 38%;">Description of Goods / Services</th>
            <th style="width: 12%;" class="text-center">HSN/SAC</th>
            <th style="width: 15%;" class="text-center">Quantity</th>
            <th style="width: 12%;" class="text-right">Rate</th>
            <th style="width: 12%;" class="text-right">Taxable Val</th>
            <th style="width: 6%;" class="text-center">GST</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="a4-totals-section">
        <div class="a4-words-box">
          <div class="a4-words-label">AMOUNT IN WORDS (INR)</div>
          <div class="a4-words-text">${escapeHtml(invoice.amount_in_words || 'Indian Rupees')}</div>
        </div>
        <div>
          <table class="a4-calc-table">
            <tr>
              <td>Total Taxable Value:</td>
              <td class="text-right">₹${Number(invoice.taxable_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            </tr>
            ${taxRows}
            <tr class="total-row">
              <td>GRAND TOTAL (INR):</td>
              <td class="text-right">₹${Number(invoice.total_amount || 0).toLocaleString()}</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="a4-footer">
        <div class="a4-terms-box">
          <strong>Terms & Conditions of Carriage:</strong>
          <p style="margin: 0;">${escapeHtml(invoice.terms_and_conditions || 'GTA carriage rules apply.')}</p>
        </div>
        <div class="a4-signatory-box">
          <div class="a4-qr-wrap">
            <img src="/api/verify/invoice/${encodeURIComponent(invoice.invoice_number)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
            <div style="font-size: 8.5px; text-align: left; color: #475569;">
              <strong>QR Verified</strong><br>
              TranceConnect Official
            </div>
          </div>
          <div class="a4-sign-line">
            For ${escapeHtml(invoice.seller_name)}<br>
            <span style="font-size: 8.5px; color: #64748b;">(Authorized Signatory)</span>
          </div>
        </div>
      </div>
    `;

    openModal('docViewerModal');
  } catch (err) {
    showToast('Error opening Tax Invoice: ' + err.message, 'error');
  }
}

function printTransporterDoDirect(id) {
  viewDoDocTransporter(id);
  setTimeout(() => {
    printTransporterDocument('docViewerSheet');
  }, 300);
}

function printTransporterInvoiceDirect(id) {
  viewInvoiceDocTransporter(id);
  setTimeout(() => {
    printTransporterDocument('docViewerSheet');
  }, 300);
}

function downloadDoDocPdf(id) {
  window.open(`/api/delivery-orders/${id}/pdf?token=${authToken}`, '_blank');
}

function downloadInvoiceDocPdf(id) {
  window.open(`/api/invoices/${id}/pdf?token=${authToken}`, '_blank');
}

function printTransporterDocument(elementId) {
  window.print();
}

// TAB SWITCHER
function switchTab(tabName) {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach(it => it.classList.remove('active'));
  
  if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) {
    event.currentTarget.classList.add('active');
  } else if (tabName === 'chat') {
    const chatLink = document.getElementById('sidebarTransChatLink');
    if (chatLink) chatLink.classList.add('active');
  } else if (tabName === 'transitDocs') {
    const docLink = document.getElementById('sidebarTransitDocsLink');
    if (docLink) docLink.classList.add('active');
  }

  // Update mobile bottom nav state
  document.querySelectorAll('.bottom-nav-item').forEach(it => it.classList.remove('active'));
  const bnavId = 'trans-bnav-' + (tabName === 'requests' ? 'loads' : tabName);
  const bnav = document.getElementById(bnavId);
  if (bnav) bnav.classList.add('active');

  // Close mobile drawer when switching
  toggleMobileDrawer(false);

  ['tabRequests', 'tabFleet', 'tabDrivers', 'tabTransitDocs', 'tabDocuments', 'tabChat'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });

  const targetId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
  const target = document.getElementById(targetId);
  if (target) target.style.display = 'block';

  if (tabName === 'transitDocs') {
    loadTransporterTransitDocs();
  } else if (tabName === 'chat') {
    loadTransporterConversationsAndUnread();
    closeTransporterMobileChat();
  }
}

function closeTransporterMobileChat() {
  const cont = document.getElementById('transChatContainer');
  if (cont) cont.classList.remove('chat-mobile-chat-open');
}

function focusTransporterGps() {
  switchTab('requests');
  const card = document.getElementById('transGpsBroadcastCard');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.4)';
    setTimeout(() => { card.style.boxShadow = ''; }, 1800);
  }
}

function toggleMobileDrawer(forceState) {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const isActive = typeof forceState === 'boolean' ? forceState : (drawer && !drawer.classList.contains('active'));
  if (drawer) drawer.classList.toggle('active', isActive);
  if (overlay) overlay.classList.toggle('active', isActive);
}

function toggleNotificationsPanel(forceState) {
  const panel = document.getElementById('notificationsPanel');
  const isActive = typeof forceState === 'boolean' ? forceState : (panel && !panel.classList.contains('active'));
  if (panel) panel.classList.toggle('active', isActive);
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
  if (id === 'chatModal' && chatPollingInterval) {
    clearInterval(chatPollingInterval);
  }
}

function logoutUser() {
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_user');
  window.location.href = '/';
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
