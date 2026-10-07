/**
 * TRANCECONNECT-PRIME: DEALER / SHIPPER ENGINE
 * Real-time operational controller connected directly to MySQL backend.
 */

const authToken = localStorage.getItem('tc_token');
const currentUser = JSON.parse(localStorage.getItem('tc_user') || 'null');

let allDealerShipments = [];
let allDealerInvoices = [];
let allDealerDeliveryOrders = [];
let currentEditingInvoiceId = null;
let currentEditingDoId = null;
let currentTrackingShipmentId = null;
let currentChatShipmentId = null;
let currentChatCounterpartyId = null;
let trackingMapInstance = null;
let trackingMarkerInstance = null;
let socket = null;
let dealerConversations = [];
let typingDebounceTimeout = null;

// Auth Guard: Only Dealers allowed
if (!authToken || !currentUser || currentUser.role !== 'dealer') {
  alert('Unauthorized. Please sign in with your Dealer / Shipper account.');
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  setupEffects();
  setupUserInterface();
  initSocketConnection();
  loadAllDealerData();
  loadConversationsAndUnread();
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
  const titleEl = document.getElementById('dealerHeaderTitle');
  if (titleEl && currentUser) {
    titleEl.textContent = `${currentUser.company_name} — Shipper Operations`;
  }
}

async function loadAllDealerData() {
  await Promise.all([
    loadStats(),
    loadShipments(),
    loadTransporters(),
    loadDealerInvoices(),
    loadDealerDeliveryOrders(),
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
    document.getElementById('kpiTotal').textContent = stats.total_shipments || 0;
    document.getElementById('kpiPending').textContent = stats.pending_requests || 0;
    document.getElementById('kpiInTransit').textContent = stats.in_transit || 0;
    document.getElementById('kpiDelivered').textContent = stats.delivered || 0;
    document.getElementById('kpiSpend').textContent = '₹' + Number(stats.total_spend || 0).toLocaleString();
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// 2. SHIPMENTS
async function loadShipments() {
  try {
    const res = await fetch('/api/shipments', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allDealerShipments = data.shipments || [];
    renderShipmentsTable(allDealerShipments);
  } catch (err) {
    console.error('Shipments error:', err);
  }
}

function renderShipmentsTable(shipments) {
  const tbody = document.getElementById('shipmentsTableBody');
  if (!tbody) return;

  if (!shipments || shipments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 3rem;">No freight consignments found. Click "Post New Shipment" to create your first load.</td></tr>`;
    return;
  }

  tbody.innerHTML = shipments.map(s => {
    const statusClass = `badge-${s.status.toLowerCase().replace(' ', '_')}`;
    const transporterHtml = s.transporter_company 
      ? `<strong>${escapeHtml(s.transporter_company)}</strong><br><small style="color:var(--text-dim)">📞 ${escapeHtml(s.transporter_mobile || '')}</small>`
      : `<span style="color: var(--amber); font-weight: 600;">Open Pool (Pending)</span>`;

    const vehicleImg = s.vehicle_image || '/assets/vehicles/container-truck.svg';
    return `
      <tr>
        <td><strong>#SHP-${s.id}</strong></td>
        <td>
          <strong>${escapeHtml(s.product_type)}</strong><br>
          <small style="color: var(--cyan);">${s.weight_tons} Tons &bull; ${escapeHtml(s.transport_type)}</small>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <img src="${vehicleImg}" class="vehicle-row-thumb" alt="Truck">
            <div>
              <strong>${escapeHtml(s.vehicle_number || 'TBD')}</strong><br>
              <small style="color: var(--text-dim);">${escapeHtml(s.vehicle_type || s.vehicle_required || 'Multi-Axle Truck')}</small>
            </div>
          </div>
        </td>
        <td>
          <small style="color: var(--text-dim);">FROM:</small> ${escapeHtml(s.pickup_location)}<br>
          <small style="color: var(--text-dim);">TO:</small> ${escapeHtml(s.delivery_location)}
        </td>
        <td><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(s.price_per_trip).toLocaleString()}</strong></td>
        <td>${transporterHtml}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(s.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="openTrackingModal(${s.id})" title="Live GPS Radar">🛰️ Track</button>
            <button class="btn btn-glass btn-sm" onclick="openDealerChatFromShipment(${s.id})" title="Message Transporter">💬 Chat</button>
            <button class="btn btn-primary btn-sm" onclick="openInvoiceStudio(null, ${s.id})" title="Create Commercial Tax Invoice">📑 Invoice</button>
            <button class="btn btn-outline btn-sm" onclick="openDoStudio(null, ${s.id})" title="Issue Delivery Order (DO)">📋 DO</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterShipmentsTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;

  const filtered = allDealerShipments.filter(s => {
    const matchQ = !q || (
      s.id.toString().includes(q) ||
      s.product_type.toLowerCase().includes(q) ||
      s.pickup_location.toLowerCase().includes(q) ||
      s.delivery_location.toLowerCase().includes(q) ||
      (s.transporter_company && s.transporter_company.toLowerCase().includes(q))
    );
    const matchStatus = !status || s.status === status;
    return matchQ && matchStatus;
  });

  renderShipmentsTable(filtered);
}

// 3. TRANSPORTERS
async function loadTransporters() {
  try {
    const res = await fetch('/api/transporters');
    if (!res.ok) return;
    const { transporters } = await res.json();

    // Select dropdown in Create Shipment modal
    const sel = document.getElementById('shipTransporterSelect');
    if (sel) {
      sel.innerHTML = `<option value="">-- Post to Open Transporter Pool --</option>` +
        transporters.map(t => `<option value="${t.id}">${escapeHtml(t.company_name)} (${t.city || 'Verified'} &bull; ${t.available_vehicles || 0} Available Trucks)</option>`).join('');
    }

    // Directory Grid
    const grid = document.getElementById('transportersGrid');
    if (grid) {
      grid.innerHTML = transporters.map(t => `
        <div class="kpi-card" style="display: flex; flex-direction: column;">
          <div style="height: 110px; background: radial-gradient(circle, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.95) 100%); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; margin-bottom: 0.85rem; border: 1px solid rgba(255,255,255,0.05); padding: 0.5rem;">
            <img src="/assets/vehicles/fleet-composite.svg" style="max-height: 85px; max-width: 100%; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));" alt="Commercial Fleet">
          </div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <div>
              <h4 style="font-size: 1.05rem; color: var(--text-main); margin-bottom: 0.2rem;">${escapeHtml(t.company_name)}</h4>
              <small style="color: var(--cyan);">${escapeHtml(t.city || 'Verified Network')}, ${escapeHtml(t.state || 'India')}</small>
            </div>
            <span class="status-badge badge-accepted">ACCREDITED</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.6; flex: 1;">
            📞 <strong>${escapeHtml(t.mobile)}</strong><br>
            ✉️ ${escapeHtml(t.email)}<br>
            🚛 <strong>${t.total_vehicles || 0}</strong> Registered Fleet (${t.available_vehicles || 0} Ready for Load)
          </div>
          <button class="btn btn-primary btn-sm" style="width: 100%; margin-top: auto;" onclick="openCreateShipmentModal(${t.id})">
            Hire Transporter
          </button>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Transporters error:', err);
  }
}

// 4. DOCUMENTS
async function loadDocuments() {
  try {
    const res = await fetch('/api/documents', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { documents } = await res.json();
    const tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;

    if (!documents || documents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No documents uploaded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = documents.map(d => `
      <tr>
        <td><strong>#DOC-${d.id}</strong></td>
        <td><span class="status-badge badge-assigned">${escapeHtml(d.document_type.toUpperCase())}</span></td>
        <td>${escapeHtml(d.file_name)}</td>
        <td>${d.shipment_id ? '#' + d.shipment_id : '-'}</td>
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

// CREATE SHIPMENT
function openCreateShipmentModal(preselectedTransporterId = null) {
  if (preselectedTransporterId) {
    const sel = document.getElementById('shipTransporterSelect');
    if (sel) sel.value = preselectedTransporterId;
  }
  openModal('createShipmentModal');
}

async function handleCreateShipment(e) {
  e.preventDefault();

  const product_type = document.getElementById('shipProductType').value;
  const transport_type = document.getElementById('shipTransportMode').value;
  const weight_tons = document.getElementById('shipWeight').value;
  const vehicle_required = document.getElementById('shipVehicleRequired').value;
  const pickup_location = document.getElementById('shipPickupLocation').value.trim();
  const delivery_location = document.getElementById('shipDeliveryLocation').value.trim();
  const price_per_trip = document.getElementById('shipPrice').value;
  const transporter_id = document.getElementById('shipTransporterSelect').value || null;
  const notes = document.getElementById('shipNotes').value.trim();

  try {
    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        product_type, transport_type, weight_tons, vehicle_required,
        pickup_location, delivery_location, price_per_trip, transporter_id, notes
      })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to post consignment', 'error');
      return;
    }

    const shipId = data.shipment_id;

    // Optional Invoice upload
    const inv = document.getElementById('shipInvoiceFile').files[0];
    if (inv) await uploadDirectFile(inv, 'invoice', shipId);

    // Optional DO upload
    const dof = document.getElementById('shipDoFile').files[0];
    if (dof) await uploadDirectFile(dof, 'delivery_order', shipId);

    closeModal('createShipmentModal');
    document.getElementById('formCreateShipment').reset();
    showToast(`Consignment #${shipId} posted successfully!`, 'success');
    loadAllDealerData();
  } catch (err) {
    showToast('Failed to post consignment: ' + err.message, 'error');
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
    console.log('Dealer Socket.IO connected:', socket.id);
    socket.emit('authenticate', { token: authToken });
  });

  socket.on('new_message', (msg) => {
    onSocketNewMessage(msg);
  });

  socket.on('chat_notification', (msg) => {
    loadConversationsAndUnread();
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

  socket.on('location_updated', (data) => {
    onSocketLocationUpdated(data);
  });
}

function onSocketNewMessage(msg) {
  if (currentChatShipmentId === msg.shipment_id) {
    appendMessageToChatPane(msg);
    if (msg.sender_id !== currentUser.id) {
      socket.emit('mark_read', { shipment_id: currentChatShipmentId });
      fetch(`/api/chat/${currentChatShipmentId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  }

  updateConversationPreview(msg);
  loadConversationsAndUnread();
}

function onSocketUserTyping(data) {
  if (data.shipment_id === currentChatShipmentId && data.user_id !== currentUser.id) {
    const hint = document.getElementById('dealerChatTypingHint');
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
    const dot = document.getElementById('dealerChatActivePresenceDot');
    const txt = document.getElementById('dealerChatActivePresenceText');
    const isOnline = data.status === 'online';
    if (dot) dot.className = `chat-online-dot ${isOnline ? '' : 'offline'}`;
    if (txt) {
      txt.textContent = isOnline ? '● Online' : '○ Offline';
      txt.className = `chat-active-status ${isOnline ? '' : 'offline'}`;
    }
  }
  const convDot = document.getElementById(`conv-presence-${data.user_id}`);
  if (convDot) {
    convDot.className = `chat-online-dot ${data.status === 'online' ? '' : 'offline'}`;
  }
}

function onSocketLocationUpdated(data) {
  if (currentTrackingShipmentId === data.shipment_id) {
    const lat = data.latitude;
    const lng = data.longitude;
    const locName = data.location_name;
    const speed = data.speed_kmh;
    const note = data.status_note;

    document.getElementById('trackCurLocation').textContent = locName;
    document.getElementById('trackSpeed').textContent = `${Number(speed || 0).toFixed(0)} KM/H`;
    document.getElementById('trackStatusNote').textContent = note || 'Live GPS Telemetry';

    if (trackingMarkerInstance) {
      trackingMarkerInstance.setLatLng([lat, lng]);
      trackingMarkerInstance.bindPopup(`<b>${escapeHtml(locName)}</b><br>Speed: ${Number(speed).toFixed(0)} km/h<br>Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openPopup();
      if (trackingMapInstance) {
        trackingMapInstance.panTo([lat, lng]);
      }
    }
  }
}

// ==========================================
// REAL-TIME 2-PANE CHAT SYSTEM
// ==========================================
async function loadConversationsAndUnread() {
  try {
    const res = await fetch('/api/chat/conversations', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    dealerConversations = data.conversations || [];
    renderDealerConversationsList(dealerConversations);

    const totalUnread = dealerConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    const badge = document.getElementById('chatTotalUnreadBadge');
    const bnavBadge = document.getElementById('bnavChatBadge');
    const topBadge = document.getElementById('topNotificationBadge');
    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
    if (bnavBadge) {
      if (totalUnread > 0) {
        bnavBadge.textContent = totalUnread;
        bnavBadge.style.display = 'inline-block';
      } else {
        bnavBadge.style.display = 'none';
      }
    }
    if (topBadge) {
      if (totalUnread > 0) {
        topBadge.textContent = totalUnread;
        topBadge.style.display = 'inline-block';
      } else {
        topBadge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Conversations error:', err);
  }
}

function renderDealerConversationsList(conversations) {
  const container = document.getElementById('dealerConvList');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = `<div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-size: 0.85rem;">No active conversations. Post a shipment and assign a transporter to begin chatting!</div>`;
    return;
  }

  container.innerHTML = conversations.map(c => {
    const isOnline = c.counterparty_online;
    const unreadHtml = c.unread_count > 0 ? `<span class="chat-unread-badge">${c.unread_count}</span>` : '';
    const isActive = currentChatShipmentId === c.shipment_id ? 'active' : '';
    const timeStr = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const vehicleImg = c.vehicle_image || '/assets/vehicles/container-truck.svg';

    return `
      <div class="chat-conv-item ${isActive}" id="conv-item-${c.shipment_id}" onclick="selectDealerConversation(${c.shipment_id})">
        <div class="chat-conv-avatar">
          <img src="${vehicleImg}" alt="Truck">
          <span id="conv-presence-${c.counterparty_id}" class="chat-online-dot ${isOnline ? '' : 'offline'}"></span>
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

function filterDealerConversations() {
  const q = (document.getElementById('dealerConvSearch')?.value || '').toLowerCase();
  const filtered = dealerConversations.filter(c => 
    c.counterparty_name.toLowerCase().includes(q) ||
    c.shipment_id.toString().includes(q) ||
    (c.product_type && c.product_type.toLowerCase().includes(q))
  );
  renderDealerConversationsList(filtered);
}

async function selectDealerConversation(shipmentId) {
  currentChatShipmentId = shipmentId;
  const conv = dealerConversations.find(c => c.shipment_id === shipmentId);
  if (!conv) return;

  currentChatCounterpartyId = conv.counterparty_id;

  document.querySelectorAll('.chat-conv-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`conv-item-${shipmentId}`);
  if (activeEl) activeEl.classList.add('active');

  const emptyPane = document.getElementById('dealerChatEmpty');
  const activeBox = document.getElementById('dealerActiveChatBox');
  if (emptyPane) emptyPane.style.display = 'none';
  if (activeBox) activeBox.style.display = 'flex';

  const cont = document.getElementById('dealerChatContainer');
  if (cont) cont.classList.add('chat-mobile-chat-open');

  document.getElementById('dealerChatActiveAvatar').src = conv.vehicle_image || '/assets/vehicles/container-truck.svg';
  document.getElementById('dealerChatActiveName').textContent = conv.counterparty_name;
  document.getElementById('dealerChatActiveShipmentTag').textContent = `#SHP-${conv.shipment_id} (${conv.product_type})`;
  document.getElementById('dealerChatActiveVehicleTag').textContent = conv.vehicle_number ? `Truck: ${conv.vehicle_number}` : 'Awaiting Truck Allocation';

  const isOnline = conv.counterparty_online;
  const dot = document.getElementById('dealerChatActivePresenceDot');
  const txt = document.getElementById('dealerChatActivePresenceText');
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

  await loadDealerChatHistory(shipmentId);
}

async function loadDealerChatHistory(shipmentId) {
  const container = document.getElementById('dealerChatMessages');
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
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem;">Coordinate dispatch, weighbridge slips, route corridors, and arrival times directly with your transporter.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => renderChatBubble(m)).join('');
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error('Chat history error:', err);
  }
}

function renderChatBubble(m) {
  const isMine = m.sender_id === currentUser.id;
  const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const readStatus = isMine ? (m.is_read ? '<span style="color:var(--cyan)">✓✓</span>' : '<span>✓</span>') : '';

  return `
    <div class="chat-bubble-wrap ${isMine ? 'me' : 'them'}">
      <div class="chat-bubble">
        <small style="display: block; font-weight: 700; margin-bottom: 0.2rem; font-size: 0.72rem; color: ${isMine ? '#bae6fd' : 'var(--cyan)'};">
          ${isMine ? 'You (Shipper)' : escapeHtml(m.sender_name)}
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

function appendMessageToChatPane(msg) {
  const container = document.getElementById('dealerChatMessages');
  if (!container) return;

  if (container.querySelector('strong')?.textContent.includes('Consignment Channel Active')) {
    container.innerHTML = '';
  }

  container.insertAdjacentHTML('beforeend', renderChatBubble(msg));
  container.scrollTop = container.scrollHeight;
}

function updateConversationPreview(msg) {
  const conv = dealerConversations.find(c => c.shipment_id === msg.shipment_id);
  if (conv) {
    conv.last_message = msg.message;
    conv.last_message_at = msg.created_at;
    if (msg.sender_id !== currentUser.id && currentChatShipmentId !== msg.shipment_id) {
      conv.unread_count = (conv.unread_count || 0) + 1;
    }
    renderDealerConversationsList(dealerConversations);
  }
}

async function handleSendDealerMessage(e) {
  e.preventDefault();
  const input = document.getElementById('dealerMsgInput');
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
        appendMessageToChatPane(data.data);
      }
    } catch (err) {
      showToast('Failed to send message: ' + err.message, 'error');
    }
  }
}

function handleDealerTyping() {
  if (socket && currentChatShipmentId) {
    socket.emit('typing', { shipment_id: currentChatShipmentId, is_typing: true });
  }
}

function openDealerChatFromShipment(shipmentId) {
  switchTab('chat');
  setTimeout(() => {
    selectDealerConversation(shipmentId);
  }, 100);
}

function trackFromCurrentChat() {
  if (currentChatShipmentId) {
    openTrackingModal(currentChatShipmentId);
  }
}

// ==========================================
// LIVE GPS RADAR & VEHICLE TRACKING
// ==========================================
async function openTrackingModal(shipmentId) {
  currentTrackingShipmentId = shipmentId;
  openModal('trackingModal');

  if (socket) {
    socket.emit('join_tracking', shipmentId);
  }

  try {
    const res = await fetch(`/api/tracking/${shipmentId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Tracking stream unavailable', 'error');
      return;
    }

    const { shipment, latest_location } = data;
    document.getElementById('trackModalHeading').textContent = `Consignment #${shipment.id} Radar: ${shipment.product_type}`;
    document.getElementById('trackModalRoute').textContent = `${shipment.pickup_location} ➔ ${shipment.delivery_location}`;
    document.getElementById('trackCurLocation').textContent = latest_location.location_name || shipment.pickup_location;
    document.getElementById('trackSpeed').textContent = `${Number(latest_location.speed_kmh || 0).toFixed(0)} KM/H`;
    document.getElementById('trackStatusNote').textContent = latest_location.status_note || 'Active GPS Telemetry';

    // Populate Vehicle & Driver Card
    const vImg = document.getElementById('trackVehicleImg');
    if (vImg) vImg.src = shipment.vehicle_image || '/assets/vehicles/container-truck.svg';
    const vNum = document.getElementById('trackVehicleNumber');
    if (vNum) vNum.textContent = shipment.vehicle_number || 'Awaiting Truck Number';
    const vType = document.getElementById('trackVehicleType');
    if (vType) vType.textContent = shipment.vehicle_type || 'Commercial Multi-Axle Freight';
    const transName = document.getElementById('trackTransporterName');
    if (transName) transName.textContent = shipment.transporter_name || 'Accredited Transporter';
    const dName = document.getElementById('trackDriverName');
    if (dName) dName.textContent = shipment.driver_name || 'Assigned Driver';
    const dMobile = document.getElementById('trackDriverMobile');
    if (dMobile) dMobile.textContent = shipment.driver_mobile ? `+91 ${shipment.driver_mobile}` : 'Available on Dispatch';

    setTimeout(() => {
      initTrackingMap(latest_location.latitude, latest_location.longitude, latest_location.location_name, shipment.vehicle_image);
    }, 250);
  } catch (err) {
    showToast('GPS Radar error: ' + err.message, 'error');
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

  trackingMarkerInstance.bindPopup(`<b>${escapeHtml(locName || 'Active Consignment')}</b><br>Coordinates: ${validLat.toFixed(4)}, ${validLng.toFixed(4)}`).openPopup();
}


// ===================================================================
// COMMERCIAL INVOICE & DELIVERY ORDER (DO) PRODUCTION STUDIO
// ===================================================================

function numberToWordsINR(amount) {
  amount = Math.round(Number(amount) || 0);
  if (amount === 0) return 'Zero Rupees Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return units[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
  }

  function convertThreeDigits(n) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) res += units[hundred] + ' Hundred';
    if (rest > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;
  const hundredAndRest = amount;

  const parts = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (hundredAndRest > 0) parts.push(convertThreeDigits(hundredAndRest));

  return parts.join(' ') + ' Rupees Only';
}

// 1. INVOICES LEDGER
async function loadDealerInvoices() {
  try {
    const res = await fetch('/api/invoices', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allDealerInvoices = data.invoices || [];
    renderDealerInvoicesTable(allDealerInvoices);
  } catch (err) {
    console.error('Invoices load error:', err);
  }
}

function renderDealerInvoicesTable(invoices) {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No commercial invoices found. Click "+ Create Tax Invoice" to issue an official GST invoice.</td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const statusClass = `badge-${inv.status.toLowerCase()}`;
    return `
      <tr>
        <td><strong style="color: var(--cyan); font-family: 'JetBrains Mono', monospace;">${escapeHtml(inv.invoice_number)}</strong></td>
        <td>${escapeHtml(inv.invoice_date || '-')}</td>
        <td><strong>${escapeHtml(inv.buyer_name)}</strong><br><small style="color:var(--text-dim)">GSTIN: ${escapeHtml(inv.buyer_gstin || 'Unregistered')}</small></td>
        <td>${inv.shipment_id ? `<span style="font-family:'JetBrains Mono'; color:var(--emerald);">#SHP-${inv.shipment_id}</span>` : '<span style="color:var(--text-dim)">Standalone</span>'}</td>
        <td>₹${Number(inv.taxable_amount || 0).toLocaleString()}</td>
        <td><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(inv.total_amount || 0).toLocaleString()}</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(inv.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewInvoiceDoc(${inv.id})" title="View Printable A4 Sheet">👁️ View</button>
            <button class="btn btn-primary btn-sm" onclick="downloadInvoiceDocPdf(${inv.id})" title="Download ReportLab Vector PDF">📥 PDF</button>
            <button class="btn btn-glass btn-sm" onclick="printInvoiceDocDirect(${inv.id})" title="Print Document">🖨️ Print</button>
            <button class="btn btn-glass btn-sm" onclick="duplicateInvoiceDoc(${inv.id})" title="Duplicate Invoice">📋 Copy</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterDealerInvoices() {
  const q = (document.getElementById('invoiceSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('invoiceStatusFilter')?.value || '';

  const filtered = allDealerInvoices.filter(inv => {
    const matchQ = !q || (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.buyer_name.toLowerCase().includes(q) ||
      (inv.shipment_id && inv.shipment_id.toString().includes(q))
    );
    const matchStatus = !status || inv.status === status;
    return matchQ && matchStatus;
  });

  renderDealerInvoicesTable(filtered);
}

// 2. DELIVERY ORDERS LEDGER
async function loadDealerDeliveryOrders() {
  try {
    const res = await fetch('/api/delivery-orders', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allDealerDeliveryOrders = data.delivery_orders || [];
    renderDealerDeliveryOrdersTable(allDealerDeliveryOrders);
  } catch (err) {
    console.error('DO load error:', err);
  }
}

function renderDealerDeliveryOrdersTable(dos) {
  const tbody = document.getElementById('deliveryOrdersTableBody');
  if (!tbody) return;

  if (!dos || dos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No delivery orders found. Click "+ Issue Delivery Order" to authorize carrier dispatch.</td></tr>`;
    return;
  }

  tbody.innerHTML = dos.map(d => {
    const statusClass = `badge-${d.status.toLowerCase().replace(' ', '_')}`;
    return `
      <tr>
        <td><strong style="color: var(--cyan); font-family: 'JetBrains Mono', monospace;">${escapeHtml(d.do_number)}</strong></td>
        <td>${escapeHtml(d.issue_date || '-')}</td>
        <td><strong>${escapeHtml(d.consignee_name)}</strong><br><small style="color:var(--text-dim)">${escapeHtml(d.delivery_location || '')}</small></td>
        <td><strong>${escapeHtml(d.vehicle_number || 'TBD')}</strong><br><small style="color:var(--text-dim)">${escapeHtml(d.transporter_name || '')}</small></td>
        <td>${escapeHtml(d.driver_name || '-')}<br><small style="color:var(--text-dim)">📞 ${escapeHtml(d.driver_mobile || '-')}</small></td>
        <td><strong>${Number(d.gross_weight_tons || 0).toFixed(1)} T</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewDoDoc(${d.id})" title="View Printable A4 Sheet">👁️ View</button>
            <button class="btn btn-primary btn-sm" onclick="downloadDoDocPdf(${d.id})" title="Download Official Vector PDF">📥 PDF</button>
            <button class="btn btn-glass btn-sm" onclick="printDoDocDirect(${d.id})" title="Print Document">🖨️ Print</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterDealerDeliveryOrders() {
  const q = (document.getElementById('doSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('doStatusFilter')?.value || '';

  const filtered = allDealerDeliveryOrders.filter(d => {
    const matchQ = !q || (
      d.do_number.toLowerCase().includes(q) ||
      d.consignee_name.toLowerCase().includes(q) ||
      (d.vehicle_number && d.vehicle_number.toLowerCase().includes(q)) ||
      (d.driver_name && d.driver_name.toLowerCase().includes(q))
    );
    const matchStatus = !status || d.status === status;
    return matchQ && matchStatus;
  });

  renderDealerDeliveryOrdersTable(filtered);
}

// 3. COMMERCIAL TAX INVOICE STUDIO
function openInvoiceStudio(invoiceId = null, shipmentId = null) {
  currentEditingInvoiceId = invoiceId;

  // Populate consignment dropdown
  const sel = document.getElementById('invFormShipmentId');
  if (sel) {
    sel.innerHTML = '<option value="">-- Standalone Commercial Invoice (No Link) --</option>' +
      allDealerShipments.map(s => `<option value="${s.id}">#SHP-${s.id} &bull; ${escapeHtml(s.product_type)} (${s.weight_tons}T) &bull; ${escapeHtml(s.delivery_location)}</option>`).join('');
    if (shipmentId) sel.value = shipmentId;
  }

  // Pre-fill Seller info from current user
  document.getElementById('invFormSellerName').value = currentUser.company_name || 'TranceConnect Shipper Corp';
  document.getElementById('invFormSellerGst').value = currentUser.gst_number || '27AABCT8891J1ZP';
  document.getElementById('invFormSellerPan').value = (currentUser.gst_number ? currentUser.gst_number.substring(2, 12) : 'AABCT8891J');
  document.getElementById('invFormSellerAddress').value = `${currentUser.city || 'Navi Mumbai'}, ${currentUser.state || 'Maharashtra'}`;
  document.getElementById('invFormSellerState').value = currentUser.state || 'Maharashtra';
  document.getElementById('invFormSellerStateCode').value = '27';

  // Dates
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
  document.getElementById('invFormInvoiceDate').value = today;
  document.getElementById('invFormDueDate').value = due;

  const invNumEl = document.getElementById('invFormInvoiceNumber');
  const badge = document.getElementById('studioInvNumberBadge');
  const autoNum = 'TC-INV-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 900000);
  invNumEl.value = autoNum;
  if (badge) badge.textContent = autoNum;

  // Clear or initialize item rows
  const tbody = document.getElementById('invItemsTableBody');
  if (tbody) tbody.innerHTML = '';

  if (shipmentId) {
    populateInvoiceFromShipmentSelect();
  } else {
    // Default sample item
    addInvoiceItemRow({
      description: 'Full Truckload Freight Transit Service',
      hsn_code: '996511',
      quantity: 1.0,
      unit: 'Trip',
      unit_price: 28000,
      gst_rate: 18.0
    });
    document.getElementById('invFormBuyerName').value = 'Tata Motors Commercial Logistics';
    document.getElementById('invFormBuyerGst').value = '27AAACT2930H1ZU';
    document.getElementById('invFormBuyerPan').value = 'AAACT2930H';
    document.getElementById('invFormBuyerBillingAddress').value = 'MIDC Bhosari Industrial Area, Pune 411026';
    document.getElementById('invFormBuyerShippingAddress').value = 'Gate #3, Receiving Yard, MIDC Pune';
    document.getElementById('invFormBuyerState').value = 'Maharashtra';
    document.getElementById('invFormBuyerStateCode').value = '27';
    document.getElementById('invFormPlaceOfSupply').value = 'Maharashtra';
    document.getElementById('invFormTransporterName').value = 'Apex Fleet Logistics';
    document.getElementById('invFormVehicleNumber').value = 'MH-04-AB-1234';
    document.getElementById('invFormDriverName').value = 'Ramesh Chandra';
    document.getElementById('invFormLrEway').value = '5410-8892-0193';
  }

  calculateInvoiceTotalsRealtime();
  openModal('invoiceStudioModal');
}

async function populateInvoiceFromShipmentSelect() {
  const sel = document.getElementById('invFormShipmentId');
  if (!sel || !sel.value) return;

  const shipId = parseInt(sel.value, 10);
  try {
    const res = await fetch(`/api/shipments/${shipId}/document-context`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const ctx = await res.json();

    document.getElementById('invFormBuyerName').value = ctx.buyer.name || 'Consignee Enterprise';
    document.getElementById('invFormBuyerGst').value = ctx.buyer.gstin || '';
    document.getElementById('invFormBuyerPan').value = ctx.buyer.pan || '';
    document.getElementById('invFormBuyerBillingAddress').value = ctx.buyer.billing_address || ctx.shipment.delivery_location || '';
    document.getElementById('invFormBuyerShippingAddress').value = ctx.buyer.shipping_address || ctx.shipment.delivery_location || '';
    document.getElementById('invFormBuyerState').value = ctx.buyer.state || 'Maharashtra';
    document.getElementById('invFormBuyerStateCode').value = ctx.buyer.state_code || '27';
    document.getElementById('invFormPlaceOfSupply').value = ctx.buyer.state || 'Maharashtra';

    document.getElementById('invFormTransporterName').value = ctx.transport.transporter_name || '';
    document.getElementById('invFormVehicleNumber').value = ctx.transport.vehicle_number || '';
    document.getElementById('invFormDriverName').value = ctx.transport.driver_name || '';
    document.getElementById('invFormLrEway').value = ctx.transport.lr_number || '';

    // Clear and set shipment line items
    const tbody = document.getElementById('invItemsTableBody');
    if (tbody) tbody.innerHTML = '';

    if (ctx.suggested_items && ctx.suggested_items.length > 0) {
      ctx.suggested_items.forEach(it => addInvoiceItemRow(it));
    } else {
      addInvoiceItemRow({
        description: `Freight Transit: ${ctx.shipment.product_type} (${ctx.shipment.origin} ➔ ${ctx.shipment.destination})`,
        hsn_code: '996511',
        quantity: ctx.shipment.weight_tons || 1.0,
        unit: 'Tons',
        unit_price: ctx.shipment.weight_tons > 0 ? Math.round(ctx.shipment.price / ctx.shipment.weight_tons) : ctx.shipment.price,
        gst_rate: 18.0
      });
    }

    calculateInvoiceTotalsRealtime();
  } catch (err) {
    console.error('Shipment context error:', err);
  }
}

function addInvoiceItemRow(item = null) {
  const tbody = document.getElementById('invItemsTableBody');
  if (!tbody) return;

  const desc = item ? (item.description || '') : 'Commercial Goods Freight Transit';
  const hsn = item ? (item.hsn_code || '996511') : '996511';
  const qty = item ? (item.quantity || 1.0) : 1.0;
  const unit = item ? (item.unit || 'Tons') : 'Tons';
  const rate = item ? (item.unit_price || 25000) : 25000;
  const gst = item ? (item.gst_rate !== undefined ? item.gst_rate : 18.0) : 18.0;

  const row = document.createElement('tr');
  row.className = 'inv-item-row';
  row.innerHTML = `
    <td><input type="text" class="item-desc" value="${escapeHtml(desc)}" placeholder="Item Description" oninput="calculateInvoiceTotalsRealtime()"></td>
    <td><input type="text" class="item-hsn" value="${escapeHtml(hsn)}" placeholder="HSN/SAC" oninput="calculateInvoiceTotalsRealtime()"></td>
    <td><input type="number" step="0.01" class="item-qty" value="${qty}" oninput="calculateInvoiceTotalsRealtime()"></td>
    <td><input type="text" class="item-unit" value="${escapeHtml(unit)}" oninput="calculateInvoiceTotalsRealtime()"></td>
    <td><input type="number" step="0.01" class="item-rate" value="${rate}" oninput="calculateInvoiceTotalsRealtime()"></td>
    <td>
      <select class="item-gst" onchange="calculateInvoiceTotalsRealtime()">
        <option value="18" ${Number(gst) === 18 ? 'selected' : ''}>18%</option>
        <option value="12" ${Number(gst) === 12 ? 'selected' : ''}>12%</option>
        <option value="5" ${Number(gst) === 5 ? 'selected' : ''}>5%</option>
        <option value="0" ${Number(gst) === 0 ? 'selected' : ''}>0%</option>
      </select>
    </td>
    <td style="text-align: center;">
      <button type="button" class="btn-del-row" onclick="removeInvoiceItemRow(this)" title="Delete Item">🗑️</button>
    </td>
  `;
  tbody.appendChild(row);
  calculateInvoiceTotalsRealtime();
}

function removeInvoiceItemRow(btn) {
  const row = btn.closest('tr');
  if (row) {
    const tbody = document.getElementById('invItemsTableBody');
    if (tbody.querySelectorAll('.inv-item-row').length > 1) {
      row.remove();
      calculateInvoiceTotalsRealtime();
    } else {
      showToast('Invoice must have at least one line item', 'warning');
    }
  }
}

function calculateInvoiceTotalsRealtime() {
  const rows = document.querySelectorAll('#invItemsTableBody .inv-item-row');
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const sellerState = (document.getElementById('invFormSellerState')?.value || '').trim().toLowerCase();
  const buyerState = (document.getElementById('invFormBuyerState')?.value || '').trim().toLowerCase();
  const isInterState = sellerState && buyerState && sellerState !== buyerState;

  const notice = document.getElementById('invTaxTypeNotice');
  const splitLabel = document.getElementById('invCalcTaxSplitLabel');

  if (isInterState) {
    if (notice) notice.innerHTML = `🌐 <strong>Inter-State Supply</strong> (${sellerState.toUpperCase()} ➔ ${buyerState.toUpperCase()}): <strong>100% IGST</strong> applies.`;
    if (splitLabel) splitLabel.textContent = 'Integrated GST (IGST)';
  } else {
    if (notice) notice.innerHTML = `🏛️ <strong>Intra-State Supply</strong> (${sellerState ? sellerState.toUpperCase() : 'SAME STATE'}): <strong>CGST (50%) + SGST (50%)</strong> split applies.`;
    if (splitLabel) splitLabel.textContent = 'CGST + SGST (Split)';
  }

  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.item-qty')?.value) || 0;
    const rate = parseFloat(r.querySelector('.item-rate')?.value) || 0;
    const gstRate = parseFloat(r.querySelector('.item-gst')?.value) || 0;

    const lineTaxable = qty * rate;
    totalTaxable += lineTaxable;

    if (isInterState) {
      totalIgst += lineTaxable * (gstRate / 100.0);
    } else {
      const halfRate = (gstRate / 2.0) / 100.0;
      totalCgst += lineTaxable * halfRate;
      totalSgst += lineTaxable * halfRate;
    }
  });

  const totalTax = isInterState ? totalIgst : (totalCgst + totalSgst);
  const rawTotal = totalTaxable + totalTax;
  const grandTotal = Math.round(rawTotal);
  const roundOff = grandTotal - rawTotal;

  document.getElementById('invCalcTaxable').textContent = `₹${totalTaxable.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('invCalcTaxTotal').textContent = `₹${totalTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('invCalcGrandTotal').textContent = `₹${grandTotal.toLocaleString()}`;
  document.getElementById('invCalcWords').textContent = numberToWordsINR(grandTotal);

  updateInvoicePreviewRealtime({
    taxable: totalTaxable,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    roundOff: roundOff,
    grandTotal: grandTotal,
    isInterState: isInterState
  });
}

function updateInvoicePreviewRealtime(calcData = null) {
  const container = document.getElementById('invA4SheetPreview');
  if (!container) return;

  const invNum = document.getElementById('invFormInvoiceNumber')?.value || 'TC-INV-2026-000001';
  const invDate = document.getElementById('invFormInvoiceDate')?.value || '-';
  const dueDate = document.getElementById('invFormDueDate')?.value || '-';
  const pos = document.getElementById('invFormPlaceOfSupply')?.value || 'Maharashtra';

  const sellerName = document.getElementById('invFormSellerName')?.value || 'TranceConnect Shipper Corp';
  const sellerGst = document.getElementById('invFormSellerGst')?.value || '27AABCT8891J1ZP';
  const sellerPan = document.getElementById('invFormSellerPan')?.value || 'AABCT8891J';
  const sellerAddr = document.getElementById('invFormSellerAddress')?.value || 'Navi Mumbai, Maharashtra';
  const sellerState = document.getElementById('invFormSellerState')?.value || 'Maharashtra';
  const sellerStateCode = document.getElementById('invFormSellerStateCode')?.value || '27';

  const buyerName = document.getElementById('invFormBuyerName')?.value || 'Bharat Heavy Logistics Ltd';
  const buyerGst = document.getElementById('invFormBuyerGst')?.value || '27AAACR1234H1Z0';
  const buyerPan = document.getElementById('invFormBuyerPan')?.value || 'AAACR1234H';
  const buyerBilling = document.getElementById('invFormBuyerBillingAddress')?.value || 'Corporate Billing Address, MIDC Bhosari';
  const buyerShipping = document.getElementById('invFormBuyerShippingAddress')?.value || buyerBilling;
  const buyerState = document.getElementById('invFormBuyerState')?.value || 'Maharashtra';
  const buyerStateCode = document.getElementById('invFormBuyerStateCode')?.value || '27';

  const transporter = document.getElementById('invFormTransporterName')?.value || '-';
  const vehicle = document.getElementById('invFormVehicleNumber')?.value || '-';
  const driver = document.getElementById('invFormDriverName')?.value || '-';
  const lrEway = document.getElementById('invFormLrEway')?.value || '-';

  const rows = document.querySelectorAll('#invItemsTableBody .inv-item-row');
  let itemsHtml = '';
  let count = 1;

  rows.forEach(r => {
    const desc = r.querySelector('.item-desc')?.value || '-';
    const hsn = r.querySelector('.item-hsn')?.value || '996511';
    const qty = parseFloat(r.querySelector('.item-qty')?.value) || 0;
    const unit = r.querySelector('.item-unit')?.value || '';
    const rate = parseFloat(r.querySelector('.item-rate')?.value) || 0;
    const gstRate = parseFloat(r.querySelector('.item-gst')?.value) || 0;
    const lineTaxable = qty * rate;

    itemsHtml += `
      <tr>
        <td class="text-center">${count++}</td>
        <td><strong>${escapeHtml(desc)}</strong></td>
        <td class="text-center">${escapeHtml(hsn)}</td>
        <td class="text-center">${qty} ${escapeHtml(unit)}</td>
        <td class="text-right">₹${rate.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-right">₹${lineTaxable.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-center">${gstRate}%</td>
      </tr>
    `;
  });

  const taxable = calcData ? calcData.taxable : 0;
  const cgst = calcData ? calcData.cgst : 0;
  const sgst = calcData ? calcData.sgst : 0;
  const igst = calcData ? calcData.igst : 0;
  const roundOff = calcData ? calcData.roundOff : 0;
  const grandTotal = calcData ? calcData.grandTotal : 0;
  const isInterState = calcData ? calcData.isInterState : false;

  let taxRowsHtml = '';
  if (isInterState) {
    taxRowsHtml = `
      <tr>
        <td>Integrated GST (IGST):</td>
        <td class="text-right">₹${igst.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  } else {
    taxRowsHtml = `
      <tr>
        <td>Central GST (CGST):</td>
        <td class="text-right">₹${cgst.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
      <tr>
        <td>State GST (SGST):</td>
        <td class="text-right">₹${sgst.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  }

  const bankName = document.getElementById('invFormBankName')?.value || 'HDFC Bank Ltd';
  const bankAcc = document.getElementById('invFormBankAccount')?.value || '50200088912345';
  const bankIfsc = document.getElementById('invFormBankIfsc')?.value || 'HDFC0001234';
  const bankBranch = document.getElementById('invFormBankBranch')?.value || 'Corporate Banking';
  const notes = document.getElementById('invFormNotes')?.value || '';

  container.innerHTML = `
    <div class="a4-header">
      <div class="a4-brand">
        <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
        <div class="a4-brand-info">
          <h1>${escapeHtml(sellerName)}</h1>
          <p>GSTIN: <strong>${escapeHtml(sellerGst)}</strong> &bull; PAN: <strong>${escapeHtml(sellerPan)}</strong></p>
          <p>${escapeHtml(sellerAddr)} &bull; State: ${escapeHtml(sellerState)} (${escapeHtml(sellerStateCode)})</p>
        </div>
      </div>
      <div class="a4-doc-type-badge">
        <div class="a4-doc-title">TAX INVOICE</div>
        <div class="a4-doc-subtitle">ORIGINAL FOR RECIPIENT</div>
        <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #0284c7; font-size: 13px;">${escapeHtml(invNum)}</div>
      </div>
    </div>

    <div class="a4-meta-strip">
      <div class="a4-meta-col">
        <span>INVOICE DATE</span>
        <strong>${escapeHtml(invDate)}</strong>
      </div>
      <div class="a4-meta-col">
        <span>PAYMENT DUE</span>
        <strong>${escapeHtml(dueDate)}</strong>
      </div>
      <div class="a4-meta-col">
        <span>PLACE OF SUPPLY</span>
        <strong>${escapeHtml(pos)}</strong>
      </div>
      <div class="a4-meta-col">
        <span>REVERSE CHARGE</span>
        <strong>NO (N/A)</strong>
      </div>
    </div>

    <div class="a4-parties-grid">
      <div class="a4-party-box">
        <div class="a4-party-label">BILLED TO (BUYER / RECIPIENT)</div>
        <div class="a4-party-name">${escapeHtml(buyerName)}</div>
        <div class="a4-party-line">${escapeHtml(buyerBilling)}</div>
        <div class="a4-party-line">GSTIN: <strong>${escapeHtml(buyerGst || 'Unregistered')}</strong></div>
        <div class="a4-party-line">State: ${escapeHtml(buyerState)} (Code: ${escapeHtml(buyerStateCode)})</div>
      </div>
      <div class="a4-party-box">
        <div class="a4-party-label">SHIPPED TO (CONSIGNEE UNLOADING DOCK)</div>
        <div class="a4-party-name">${escapeHtml(buyerName)}</div>
        <div class="a4-party-line">${escapeHtml(buyerShipping)}</div>
        <div class="a4-party-line">Destination Hub: ${escapeHtml(buyerState)}</div>
      </div>
    </div>

    <div class="a4-transport-bar">
      <div><span>CARRIER / TRANSPORTER</span><strong>${escapeHtml(transporter)}</strong></div>
      <div><span>VEHICLE REG NO</span><strong>${escapeHtml(vehicle)}</strong></div>
      <div><span>COMMERCIAL DRIVER</span><strong>${escapeHtml(driver)}</strong></div>
      <div><span>LR / E-WAY BILL NO</span><strong>${escapeHtml(lrEway)}</strong></div>
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
        <div class="a4-words-text">${numberToWordsINR(grandTotal)}</div>
        <div style="margin-top: 10px; font-size: 9.5px; color: #475569;">
          <strong>Remittance Banking Information:</strong><br>
          Bank: <strong>${escapeHtml(bankName)}</strong> &bull; A/C: <strong>${escapeHtml(bankAcc)}</strong><br>
          IFSC: <strong>${escapeHtml(bankIfsc)}</strong> &bull; Branch: ${escapeHtml(bankBranch)}
        </div>
      </div>
      <div>
        <table class="a4-calc-table">
          <tr>
            <td>Total Taxable Value:</td>
            <td class="text-right">₹${taxable.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>
          ${taxRowsHtml}
          <tr>
            <td>Round Off:</td>
            <td class="text-right">${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>GRAND TOTAL (INR):</td>
            <td class="text-right">₹${grandTotal.toLocaleString()}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="a4-footer">
      <div class="a4-terms-box">
        <strong>Terms & Conditions of Transport:</strong>
        <p style="white-space: pre-line; margin: 0;">${escapeHtml(notes)}</p>
      </div>
      <div class="a4-signatory-box">
        <div class="a4-qr-wrap">
          <img src="/api/verify/invoice/${encodeURIComponent(invNum)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
          <div style="font-size: 8.5px; text-align: left; color: #475569;">
            <strong>QR Authenticated</strong><br>
            Scan to verify against<br>
            TranceConnect Registry
          </div>
        </div>
        <div class="a4-sign-line">
          For ${escapeHtml(sellerName)}<br>
          <span style="font-size: 8.5px; color: #64748b;">(Authorized Signatory)</span>
        </div>
      </div>
    </div>
  `;
}

async function saveInvoiceFromStudio(status = 'Issued') {
  const invNumber = document.getElementById('invFormInvoiceNumber').value;
  const shipmentId = document.getElementById('invFormShipmentId').value || null;
  const invoiceDate = document.getElementById('invFormInvoiceDate').value;
  const dueDate = document.getElementById('invFormDueDate').value;
  const placeOfSupply = document.getElementById('invFormPlaceOfSupply').value;

  const sellerName = document.getElementById('invFormSellerName').value;
  const sellerGstin = document.getElementById('invFormSellerGst').value;
  const sellerPan = document.getElementById('invFormSellerPan').value;
  const sellerAddress = document.getElementById('invFormSellerAddress').value;
  const sellerState = document.getElementById('invFormSellerState').value;
  const sellerStateCode = document.getElementById('invFormSellerStateCode').value;

  const buyerName = document.getElementById('invFormBuyerName').value;
  const buyerGstin = document.getElementById('invFormBuyerGst').value;
  const buyerPan = document.getElementById('invFormBuyerPan').value;
  const buyerBilling = document.getElementById('invFormBuyerBillingAddress').value;
  const buyerShipping = document.getElementById('invFormBuyerShippingAddress').value;
  const buyerState = document.getElementById('invFormBuyerState').value;
  const buyerStateCode = document.getElementById('invFormBuyerStateCode').value;

  const transporter = document.getElementById('invFormTransporterName').value;
  const vehicle = document.getElementById('invFormVehicleNumber').value;
  const driver = document.getElementById('invFormDriverName').value;
  const lrEway = document.getElementById('invFormLrEway').value;

  const bankName = document.getElementById('invFormBankName').value;
  const bankAcc = document.getElementById('invFormBankAccount').value;
  const bankIfsc = document.getElementById('invFormBankIfsc').value;
  const bankBranch = document.getElementById('invFormBankBranch').value;
  const notes = document.getElementById('invFormNotes').value;

  if (!buyerName) {
    showToast('Please enter Buyer Legal Name', 'warning');
    return;
  }

  // Gather line items
  const rows = document.querySelectorAll('#invItemsTableBody .inv-item-row');
  const items = [];
  rows.forEach(r => {
    items.push({
      description: r.querySelector('.item-desc')?.value || 'Commercial Freight Transit',
      hsn_sac_code: r.querySelector('.item-hsn')?.value || '996511',
      quantity: parseFloat(r.querySelector('.item-qty')?.value) || 1.0,
      unit: r.querySelector('.item-unit')?.value || 'Trip',
      unit_price: parseFloat(r.querySelector('.item-rate')?.value) || 0.0,
      gst_rate: parseFloat(r.querySelector('.item-gst')?.value) || 18.0
    });
  });

  const payload = {
    invoice_number: invNumber,
    shipment_id: shipmentId ? parseInt(shipmentId, 10) : null,
    status: status,
    invoice_date: invoiceDate,
    due_date: dueDate,
    place_of_supply: placeOfSupply,
    seller_name: sellerName,
    seller_gstin: sellerGstin,
    seller_pan: sellerPan,
    seller_address: sellerAddress,
    seller_state: sellerState,
    seller_state_code: sellerStateCode,
    buyer_name: buyerName,
    buyer_gstin: buyerGstin,
    buyer_pan: buyerPan,
    buyer_billing_address: buyerBilling,
    buyer_shipping_address: buyerShipping,
    buyer_state: buyerState,
    buyer_state_code: buyerStateCode,
    transporter_name: transporter,
    vehicle_number: vehicle,
    driver_name: driver,
    lr_number: lrEway,
    bank_name: bankName,
    bank_account_number: bankAcc,
    bank_ifsc: bankIfsc,
    bank_branch: bankBranch,
    notes: notes,
    terms_and_conditions: notes,
    items: items
  };

  try {
    const url = currentEditingInvoiceId ? `/api/invoices/${currentEditingInvoiceId}` : '/api/invoices';
    const method = currentEditingInvoiceId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save invoice', 'error');
      return;
    }

    showToast(`Invoice ${data.invoice ? data.invoice.invoice_number : invNumber} saved successfully!`, 'success');
    closeModal('invoiceStudioModal');
    await loadDealerInvoices();
  } catch (err) {
    showToast('Network error saving invoice: ' + err.message, 'error');
  }
}

// INVOICE ACTIONS
async function viewInvoiceDoc(id) {
  try {
    const res = await fetch(`/api/invoices/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { invoice, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Commercial Tax Invoice: ${invoice.invoice_number}`;
    document.getElementById('docViewerSub').textContent = `Issued: ${invoice.invoice_date} &bull; Total: ₹${Number(invoice.total_amount).toLocaleString()} INR`;
    document.getElementById('docViewerPdfBtn').href = `/api/invoices/${id}/pdf?token=${authToken}`;
    document.getElementById('docViewerQrBtn').href = `/verify/invoice/${invoice.invoice_number}`;

    const sheet = document.getElementById('docViewerSheet');
    renderInvoiceSheetToElement(sheet, invoice, items);
    openModal('docViewerModal');
  } catch (err) {
    showToast('Error opening invoice: ' + err.message, 'error');
  }
}

function renderInvoiceSheetToElement(container, inv, items) {
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

  const isInterState = Number(inv.igst_amount || 0) > 0;
  let taxRows = '';
  if (isInterState) {
    taxRows = `
      <tr>
        <td>Integrated GST (IGST):</td>
        <td class="text-right">₹${Number(inv.igst_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  } else {
    taxRows = `
      <tr>
        <td>Central GST (CGST):</td>
        <td class="text-right">₹${Number(inv.cgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
      <tr>
        <td>State GST (SGST):</td>
        <td class="text-right">₹${Number(inv.sgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  }

  container.innerHTML = `
    <div class="a4-header">
      <div class="a4-brand">
        <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
        <div class="a4-brand-info">
          <h1>${escapeHtml(inv.seller_name)}</h1>
          <p>GSTIN: <strong>${escapeHtml(inv.seller_gstin)}</strong> &bull; PAN: <strong>${escapeHtml(inv.seller_pan || '')}</strong></p>
          <p>${escapeHtml(inv.seller_address || '')} &bull; State: ${escapeHtml(inv.seller_state)} (${escapeHtml(inv.seller_state_code)})</p>
        </div>
      </div>
      <div class="a4-doc-type-badge">
        <div class="a4-doc-title">TAX INVOICE</div>
        <div class="a4-doc-subtitle">ORIGINAL FOR RECIPIENT</div>
        <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #0284c7; font-size: 13px;">${escapeHtml(inv.invoice_number)}</div>
      </div>
    </div>

    <div class="a4-meta-strip">
      <div class="a4-meta-col"><span>INVOICE DATE</span><strong>${escapeHtml(inv.invoice_date || '-')}</strong></div>
      <div class="a4-meta-col"><span>PAYMENT DUE</span><strong>${escapeHtml(inv.due_date || '-')}</strong></div>
      <div class="a4-meta-col"><span>PLACE OF SUPPLY</span><strong>${escapeHtml(inv.place_of_supply || 'Maharashtra')}</strong></div>
      <div class="a4-meta-col"><span>STATUS</span><strong style="color: #0284c7;">${escapeHtml(inv.status)}</strong></div>
    </div>

    <div class="a4-parties-grid">
      <div class="a4-party-box">
        <div class="a4-party-label">BILLED TO (BUYER / RECIPIENT)</div>
        <div class="a4-party-name">${escapeHtml(inv.buyer_name)}</div>
        <div class="a4-party-line">${escapeHtml(inv.buyer_billing_address || '')}</div>
        <div class="a4-party-line">GSTIN: <strong>${escapeHtml(inv.buyer_gstin || 'Unregistered')}</strong></div>
        <div class="a4-party-line">State: ${escapeHtml(inv.buyer_state)} (${escapeHtml(inv.buyer_state_code)})</div>
      </div>
      <div class="a4-party-box">
        <div class="a4-party-label">SHIPPED TO (CONSIGNEE UNLOADING DOCK)</div>
        <div class="a4-party-name">${escapeHtml(inv.buyer_name)}</div>
        <div class="a4-party-line">${escapeHtml(inv.buyer_shipping_address || inv.buyer_billing_address || '')}</div>
        <div class="a4-party-line">Destination Hub: ${escapeHtml(inv.buyer_state)}</div>
      </div>
    </div>

    <div class="a4-transport-bar">
      <div><span>CARRIER / TRANSPORTER</span><strong>${escapeHtml(inv.transporter_name || '-')}</strong></div>
      <div><span>VEHICLE REG NO</span><strong>${escapeHtml(inv.vehicle_number || '-')}</strong></div>
      <div><span>COMMERCIAL DRIVER</span><strong>${escapeHtml(inv.driver_name || '-')}</strong></div>
      <div><span>LR / E-WAY BILL NO</span><strong>${escapeHtml(inv.lr_number || '-')}</strong></div>
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
        <div class="a4-words-text">${escapeHtml(inv.amount_in_words || numberToWordsINR(inv.total_amount))}</div>
        <div style="margin-top: 10px; font-size: 9.5px; color: #475569;">
          <strong>Remittance Banking Information:</strong><br>
          Bank: <strong>${escapeHtml(inv.bank_name || 'HDFC Bank Ltd')}</strong> &bull; A/C: <strong>${escapeHtml(inv.bank_account_number || '-')}</strong><br>
          IFSC: <strong>${escapeHtml(inv.bank_ifsc || '-')}</strong> &bull; Branch: ${escapeHtml(inv.bank_branch || '-')}
        </div>
      </div>
      <div>
        <table class="a4-calc-table">
          <tr>
            <td>Total Taxable Value:</td>
            <td class="text-right">₹${Number(inv.taxable_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>
          ${taxRows}
          <tr>
            <td>Round Off:</td>
            <td class="text-right">${Number(inv.round_off || 0) >= 0 ? '+' : ''}${Number(inv.round_off || 0).toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>GRAND TOTAL (INR):</td>
            <td class="text-right">₹${Number(inv.total_amount || 0).toLocaleString()}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="a4-footer">
      <div class="a4-terms-box">
        <strong>Terms & Conditions of Transport:</strong>
        <p style="white-space: pre-line; margin: 0;">${escapeHtml(inv.terms_and_conditions || 'Subject to GTA carriage rules.')}</p>
      </div>
      <div class="a4-signatory-box">
        <div class="a4-qr-wrap">
          <img src="/api/verify/invoice/${encodeURIComponent(inv.invoice_number)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
          <div style="font-size: 8.5px; text-align: left; color: #475569;">
            <strong>QR Authenticated</strong><br>
            Scan to verify against<br>
            TranceConnect Registry
          </div>
        </div>
        <div class="a4-sign-line">
          For ${escapeHtml(inv.seller_name)}<br>
          <span style="font-size: 8.5px; color: #64748b;">(Authorized Signatory)</span>
        </div>
      </div>
    </div>
  `;
}

function downloadInvoiceDocPdf(id) {
  window.open(`/api/invoices/${id}/pdf?token=${authToken}`, '_blank');
}

async function printInvoiceDocDirect(id) {
  await viewInvoiceDoc(id);
  setTimeout(() => {
    printStudioDocument('docViewerSheet');
  }, 300);
}

async function duplicateInvoiceDoc(id) {
  try {
    const res = await fetch(`/api/invoices/${id}/duplicate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Duplicated into ${data.invoice.invoice_number}`, 'success');
      await loadDealerInvoices();
    } else {
      showToast(data.error || 'Duplicate failed', 'error');
    }
  } catch (err) {
    showToast('Duplicate error: ' + err.message, 'error');
  }
}

// 4. DELIVERY ORDER (DO) STUDIO
function openDoStudio(doId = null, shipmentId = null) {
  currentEditingDoId = doId;

  const sel = document.getElementById('doFormShipmentId');
  if (sel) {
    sel.innerHTML = '<option value="">-- Standalone Delivery Order --</option>' +
      allDealerShipments.map(s => `<option value="${s.id}">#SHP-${s.id} &bull; ${escapeHtml(s.product_type)} (${s.weight_tons}T) &bull; ${escapeHtml(s.delivery_location)}</option>`).join('');
    if (shipmentId) sel.value = shipmentId;
  }

  const doNumEl = document.getElementById('doFormDoNumber');
  const badge = document.getElementById('studioDoNumberBadge');
  const autoNum = 'TC-DO-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 900000);
  doNumEl.value = autoNum;
  if (badge) badge.textContent = autoNum;

  const today = new Date().toISOString().split('T')[0];
  const validUntil = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
  document.getElementById('doFormIssueDate').value = today;
  document.getElementById('doFormValidUntil').value = validUntil;

  document.getElementById('doFormConsignorName').value = currentUser.company_name || 'TranceConnect Shipper Corp';
  document.getElementById('doFormConsignorGst').value = currentUser.gst_number || '27AABCT8891J1ZP';
  document.getElementById('doFormLoadingPoint').value = 'JNPT Container Terminal Yard 4, Navi Mumbai';

  const tbody = document.getElementById('doItemsTableBody');
  if (tbody) tbody.innerHTML = '';

  if (shipmentId) {
    populateDoFromShipmentSelect();
  } else {
    document.getElementById('doFormConsigneeName').value = 'Tata Motors Receiving Yard MIDC';
    document.getElementById('doFormConsigneeMobile').value = '+91 98765 43210';
    document.getElementById('doFormDeliveryLocation').value = 'Chakan Industrial Area Phase II, Pune';
    document.getElementById('doFormTransporterName').value = 'Apex Fleet Logistics';
    document.getElementById('doFormVehicleNumber').value = 'MH-04-AB-1234';
    document.getElementById('doFormDriverName').value = 'Ramesh Chandra';
    document.getElementById('doFormDriverMobile').value = '+91 98765 43210';
    document.getElementById('doFormDriverLicense').value = 'MH-04-201500912';

    addDoItemRow({
      description: 'Hot Rolled Steel Coils IS 2062 Grade E250',
      packaging: 'Steel Strapped Bundles',
      weight_tons: 24.5,
      remarks: 'Covered Transit Bay 3'
    });
  }

  updateDoPreviewRealtime();
  openModal('doStudioModal');
}

async function populateDoFromShipmentSelect() {
  const sel = document.getElementById('doFormShipmentId');
  if (!sel || !sel.value) return;

  const shipId = parseInt(sel.value, 10);
  try {
    const res = await fetch(`/api/shipments/${shipId}/document-context`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const ctx = await res.json();

    document.getElementById('doFormLoadingPoint').value = ctx.shipment.pickup_location || '';
    document.getElementById('doFormConsigneeName').value = ctx.buyer.name || 'Consignee Plant Receiving';
    document.getElementById('doFormDeliveryLocation').value = ctx.shipment.delivery_location || '';

    document.getElementById('doFormTransporterName').value = ctx.transport.transporter_name || '';
    document.getElementById('doFormVehicleNumber').value = ctx.transport.vehicle_number || '';
    document.getElementById('doFormDriverName').value = ctx.transport.driver_name || '';
    document.getElementById('doFormDriverMobile').value = ctx.transport.driver_mobile || '';

    const tbody = document.getElementById('doItemsTableBody');
    if (tbody) tbody.innerHTML = '';

    addDoItemRow({
      description: `${ctx.shipment.product_type}`,
      packaging: 'Commercial Freight Load',
      weight_tons: ctx.shipment.weight_tons || 1.0,
      remarks: 'Direct Consignment Dispatch'
    });

    updateDoPreviewRealtime();
  } catch (err) {
    console.error('DO context error:', err);
  }
}

function addDoItemRow(item = null) {
  const tbody = document.getElementById('doItemsTableBody');
  if (!tbody) return;

  const desc = item ? (item.description || '') : 'Commercial Cargo Consignment';
  const pack = item ? (item.packaging || 'Bundles / Pallets') : 'Bundles / Pallets';
  const wt = item ? (item.weight_tons || 1.0) : 1.0;
  const rem = item ? (item.remarks || 'Direct Delivery') : 'Direct Delivery';

  const row = document.createElement('tr');
  row.className = 'do-item-row';
  row.innerHTML = `
    <td><input type="text" class="do-item-desc" value="${escapeHtml(desc)}" placeholder="Item Description" oninput="updateDoPreviewRealtime()"></td>
    <td><input type="text" class="do-item-pack" value="${escapeHtml(pack)}" placeholder="Packaging" oninput="updateDoPreviewRealtime()"></td>
    <td><input type="number" step="0.01" class="do-item-wt" value="${wt}" oninput="updateDoPreviewRealtime()"></td>
    <td><input type="text" class="do-item-rem" value="${escapeHtml(rem)}" placeholder="Remarks" oninput="updateDoPreviewRealtime()"></td>
    <td style="text-align: center;">
      <button type="button" class="btn-del-row" onclick="removeDoItemRow(this)" title="Delete Item">🗑️</button>
    </td>
  `;
  tbody.appendChild(row);
  updateDoPreviewRealtime();
}

function removeDoItemRow(btn) {
  const row = btn.closest('tr');
  if (row) {
    const tbody = document.getElementById('doItemsTableBody');
    if (tbody.querySelectorAll('.do-item-row').length > 1) {
      row.remove();
      updateDoPreviewRealtime();
    } else {
      showToast('Delivery Order must have at least one cargo item', 'warning');
    }
  }
}

function updateDoPreviewRealtime() {
  const container = document.getElementById('doA4SheetPreview');
  if (!container) return;

  const doNum = document.getElementById('doFormDoNumber')?.value || 'TC-DO-2026-000001';
  const issueDate = document.getElementById('doFormIssueDate')?.value || '-';
  const validUntil = document.getElementById('doFormValidUntil')?.value || '-';

  const consignor = document.getElementById('doFormConsignorName')?.value || 'TranceConnect Shipper Corp';
  const consignorGst = document.getElementById('doFormConsignorGst')?.value || '27AABCT8891J1ZP';
  const loadingPoint = document.getElementById('doFormLoadingPoint')?.value || 'JNPT Terminal 4';

  const consignee = document.getElementById('doFormConsigneeName')?.value || 'Consignee Plant';
  const consigneeMobile = document.getElementById('doFormConsigneeMobile')?.value || '-';
  const deliveryLoc = document.getElementById('doFormDeliveryLocation')?.value || 'Chakan Pune';

  const transporter = document.getElementById('doFormTransporterName')?.value || '-';
  const vehicle = document.getElementById('doFormVehicleNumber')?.value || '-';
  const driver = document.getElementById('doFormDriverName')?.value || '-';
  const driverMobile = document.getElementById('doFormDriverMobile')?.value || '-';
  const driverLicense = document.getElementById('doFormDriverLicense')?.value || '-';

  const instructions = document.getElementById('doFormInstructions')?.value || '';

  const rows = document.querySelectorAll('#doItemsTableBody .do-item-row');
  let itemsHtml = '';
  let count = 1;
  let totalWt = 0;

  rows.forEach(r => {
    const desc = r.querySelector('.do-item-desc')?.value || '-';
    const pack = r.querySelector('.do-item-pack')?.value || '-';
    const wt = parseFloat(r.querySelector('.do-item-wt')?.value) || 0;
    const rem = r.querySelector('.do-item-rem')?.value || '-';
    totalWt += wt;

    itemsHtml += `
      <tr>
        <td class="text-center">${count++}</td>
        <td><strong>${escapeHtml(desc)}</strong></td>
        <td class="text-center">${escapeHtml(pack)}</td>
        <td class="text-right"><strong>${wt.toFixed(2)} MT</strong></td>
        <td>${escapeHtml(rem)}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="a4-header">
      <div class="a4-brand">
        <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
        <div class="a4-brand-info">
          <h1>${escapeHtml(consignor)}</h1>
          <p>GSTIN: <strong>${escapeHtml(consignorGst)}</strong> &bull; Commercial Dispatch Terminal</p>
          <p>Loading Yard: ${escapeHtml(loadingPoint)}</p>
        </div>
      </div>
      <div class="a4-doc-type-badge">
        <div class="a4-doc-title" style="color: #059669;">DELIVERY ORDER</div>
        <div class="a4-doc-subtitle">CARRIER DISPATCH & GATE PASS</div>
        <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #059669; font-size: 13px;">${escapeHtml(doNum)}</div>
      </div>
    </div>

    <div class="a4-meta-strip">
      <div class="a4-meta-col"><span>ISSUE DATE</span><strong>${escapeHtml(issueDate)}</strong></div>
      <div class="a4-meta-col"><span>VALID UNTIL</span><strong style="color: #dc2626;">${escapeHtml(validUntil)}</strong></div>
      <div class="a4-meta-col"><span>TOTAL GROSS WT</span><strong>${totalWt.toFixed(2)} MT</strong></div>
      <div class="a4-meta-col"><span>GATE PASS AUTH</span><strong style="color: #059669;">VERIFIED</strong></div>
    </div>

    <div class="a4-parties-grid">
      <div class="a4-party-box">
        <div class="a4-party-label" style="color: #059669;">CONSIGNOR (LOADING ORIGIN)</div>
        <div class="a4-party-name">${escapeHtml(consignor)}</div>
        <div class="a4-party-line">Loading Point: <strong>${escapeHtml(loadingPoint)}</strong></div>
        <div class="a4-party-line">GSTIN: ${escapeHtml(consignorGst)}</div>
      </div>
      <div class="a4-party-box">
        <div class="a4-party-label" style="color: #059669;">CONSIGNEE (DELIVERY DOCK)</div>
        <div class="a4-party-name">${escapeHtml(consignee)}</div>
        <div class="a4-party-line">Unloading Bay: <strong>${escapeHtml(deliveryLoc)}</strong></div>
        <div class="a4-party-line">Contact Mobile: ${escapeHtml(consigneeMobile)}</div>
      </div>
    </div>

    <div class="a4-transport-bar" style="background: #f0fdf4; border-color: #bbf7d0;">
      <div><span>AUTHORIZED CARRIER</span><strong>${escapeHtml(transporter)}</strong></div>
      <div><span>VEHICLE NUMBER</span><strong>${escapeHtml(vehicle)}</strong></div>
      <div><span>DRIVER NAME & CONTACT</span><strong>${escapeHtml(driver)} (${escapeHtml(driverMobile)})</strong></div>
      <div><span>COMMERCIAL LICENSE</span><strong>${escapeHtml(driverLicense)}</strong></div>
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
        <p style="white-space: pre-line; margin: 4px 0 0; font-size: 10.5px; color: #1e293b;">${escapeHtml(instructions)}</p>
      </div>
    </div>

    <div class="a4-footer" style="margin-top: 24px;">
      <div style="font-size: 9.5px; color: #64748b; line-height: 1.5;">
        <strong>Tripartite Compliance Declaration:</strong><br>
        Received the specified goods in apparent good order and condition for delivery to the consignee named herein.<br>
        1. Carrier Signature & Stamp: _______________________<br>
        2. Consignee Receiving Signature: _______________________
      </div>
      <div class="a4-signatory-box">
        <div class="a4-qr-wrap">
          <img src="/api/verify/do/${encodeURIComponent(doNum)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
          <div style="font-size: 8.5px; text-align: left; color: #475569;">
            <strong>QR Verified DO</strong><br>
            Scan to inspect manifest<br>
            and security clearance
          </div>
        </div>
        <div class="a4-sign-line">
          For ${escapeHtml(consignor)}<br>
          <span style="font-size: 8.5px; color: #64748b;">(Authorized Dispatcher)</span>
        </div>
      </div>
    </div>
  `;
}

async function saveDoFromStudio(status = 'Issued') {
  const doNumber = document.getElementById('doFormDoNumber').value;
  const shipmentId = document.getElementById('doFormShipmentId').value || null;
  const issueDate = document.getElementById('doFormIssueDate').value;
  const validUntil = document.getElementById('doFormValidUntil').value;

  const consignor = document.getElementById('doFormConsignorName').value;
  const consignorGst = document.getElementById('doFormConsignorGst').value;
  const loadingPoint = document.getElementById('doFormLoadingPoint').value;

  const consignee = document.getElementById('doFormConsigneeName').value;
  const consigneeMobile = document.getElementById('doFormConsigneeMobile').value;
  const deliveryLoc = document.getElementById('doFormDeliveryLocation').value;

  const transporter = document.getElementById('doFormTransporterName').value;
  const vehicle = document.getElementById('doFormVehicleNumber').value;
  const driver = document.getElementById('doFormDriverName').value;
  const driverMobile = document.getElementById('doFormDriverMobile').value;
  const driverLicense = document.getElementById('doFormDriverLicense').value;

  const instructions = document.getElementById('doFormInstructions').value;

  if (!consignee) {
    showToast('Please enter Consignee Receiver Name', 'warning');
    return;
  }

  const rows = document.querySelectorAll('#doItemsTableBody .do-item-row');
  const items = [];
  let totalGross = 0;
  rows.forEach(r => {
    const wt = parseFloat(r.querySelector('.do-item-wt')?.value) || 0;
    totalGross += wt;
    items.push({
      item_name: r.querySelector('.do-item-desc')?.value || 'Commercial Cargo Consignment',
      packaging_type: r.querySelector('.do-item-pack')?.value || 'Bundles',
      weight_tons: wt,
      remarks: r.querySelector('.do-item-rem')?.value || 'Direct Delivery'
    });
  });

  const payload = {
    do_number: doNumber,
    shipment_id: shipmentId ? parseInt(shipmentId, 10) : null,
    status: status,
    issue_date: issueDate,
    valid_until: validUntil,
    consignor_name: consignor,
    consignor_gstin: consignorGst,
    loading_point: loadingPoint,
    consignee_name: consignee,
    consignee_contact: consigneeMobile,
    delivery_location: deliveryLoc,
    transporter_name: transporter,
    vehicle_number: vehicle,
    driver_name: driver,
    driver_mobile: driverMobile,
    driver_license: driverLicense,
    gross_weight_tons: totalGross,
    special_instructions: instructions,
    items: items
  };

  try {
    const res = await fetch('/api/delivery-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to issue Delivery Order', 'error');
      return;
    }

    showToast(`Delivery Order ${data.delivery_order ? data.delivery_order.do_number : doNumber} issued successfully!`, 'success');
    closeModal('doStudioModal');
    await loadDealerDeliveryOrders();
  } catch (err) {
    showToast('Network error issuing Delivery Order: ' + err.message, 'error');
  }
}

// DO ACTIONS
async function viewDoDoc(id) {
  try {
    const res = await fetch(`/api/delivery-orders/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { delivery_order, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Delivery Order: ${delivery_order.do_number}`;
    document.getElementById('docViewerSub').textContent = `Issued: ${delivery_order.issue_date} &bull; Consignee: ${delivery_order.consignee_name}`;
    document.getElementById('docViewerPdfBtn').href = `/api/delivery-orders/${id}/pdf?token=${authToken}`;
    document.getElementById('docViewerQrBtn').href = `/verify/do/${delivery_order.do_number}`;

    const sheet = document.getElementById('docViewerSheet');
    renderDoSheetToElement(sheet, delivery_order, items);
    openModal('docViewerModal');
  } catch (err) {
    showToast('Error opening Delivery Order: ' + err.message, 'error');
  }
}

function renderDoSheetToElement(container, d, items) {
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

  container.innerHTML = `
    <div class="a4-header">
      <div class="a4-brand">
        <img src="/assets/truck-hero.svg" class="a4-brand-logo" alt="Logo">
        <div class="a4-brand-info">
          <h1>${escapeHtml(d.consignor_name)}</h1>
          <p>GSTIN: <strong>${escapeHtml(d.consignor_gstin || '')}</strong> &bull; Commercial Dispatch</p>
          <p>Loading Yard: ${escapeHtml(d.loading_point || '')}</p>
        </div>
      </div>
      <div class="a4-doc-type-badge">
        <div class="a4-doc-title" style="color: #059669;">DELIVERY ORDER</div>
        <div class="a4-doc-subtitle">CARRIER DISPATCH & GATE PASS</div>
        <div style="margin-top: 6px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #059669; font-size: 13px;">${escapeHtml(d.do_number)}</div>
      </div>
    </div>

    <div class="a4-meta-strip">
      <div class="a4-meta-col"><span>ISSUE DATE</span><strong>${escapeHtml(d.issue_date || '-')}</strong></div>
      <div class="a4-meta-col"><span>VALID UNTIL</span><strong style="color: #dc2626;">${escapeHtml(d.valid_until || '-')}</strong></div>
      <div class="a4-meta-col"><span>TOTAL GROSS WT</span><strong>${totalWt.toFixed(2)} MT</strong></div>
      <div class="a4-meta-col"><span>STATUS</span><strong style="color: #059669;">${escapeHtml(d.status)}</strong></div>
    </div>

    <div class="a4-parties-grid">
      <div class="a4-party-box">
        <div class="a4-party-label" style="color: #059669;">CONSIGNOR (LOADING ORIGIN)</div>
        <div class="a4-party-name">${escapeHtml(d.consignor_name)}</div>
        <div class="a4-party-line">Loading Point: <strong>${escapeHtml(d.loading_point || '')}</strong></div>
        <div class="a4-party-line">GSTIN: ${escapeHtml(d.consignor_gstin || '')}</div>
      </div>
      <div class="a4-party-box">
        <div class="a4-party-label" style="color: #059669;">CONSIGNEE (DELIVERY DOCK)</div>
        <div class="a4-party-name">${escapeHtml(d.consignee_name)}</div>
        <div class="a4-party-line">Unloading Bay: <strong>${escapeHtml(d.delivery_location || '')}</strong></div>
        <div class="a4-party-line">Contact: ${escapeHtml(d.consignee_contact || '')}</div>
      </div>
    </div>

    <div class="a4-transport-bar" style="background: #f0fdf4; border-color: #bbf7d0;">
      <div><span>AUTHORIZED CARRIER</span><strong>${escapeHtml(d.transporter_name || '-')}</strong></div>
      <div><span>VEHICLE NUMBER</span><strong>${escapeHtml(d.vehicle_number || '-')}</strong></div>
      <div><span>DRIVER NAME & CONTACT</span><strong>${escapeHtml(d.driver_name || '-')} (${escapeHtml(d.driver_mobile || '-')})</strong></div>
      <div><span>COMMERCIAL LICENSE</span><strong>${escapeHtml(d.driver_license || '-')}</strong></div>
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
        <p style="white-space: pre-line; margin: 4px 0 0; font-size: 10.5px; color: #1e293b;">${escapeHtml(d.special_instructions || 'Standard carrier dispatch conditions apply.')}</p>
      </div>
    </div>

    <div class="a4-footer" style="margin-top: 24px;">
      <div style="font-size: 9.5px; color: #64748b; line-height: 1.5;">
        <strong>Tripartite Compliance Declaration:</strong><br>
        Received the specified goods in apparent good order and condition for delivery to the consignee named herein.<br>
        1. Carrier Signature & Stamp: _______________________<br>
        2. Consignee Receiving Signature: _______________________
      </div>
      <div class="a4-signatory-box">
        <div class="a4-qr-wrap">
          <img src="/api/verify/do/${encodeURIComponent(d.do_number)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
          <div style="font-size: 8.5px; text-align: left; color: #475569;">
            <strong>QR Verified DO</strong><br>
            Scan to inspect manifest<br>
            and security clearance
          </div>
        </div>
        <div class="a4-sign-line">
          For ${escapeHtml(d.consignor_name)}<br>
          <span style="font-size: 8.5px; color: #64748b;">(Authorized Dispatcher)</span>
        </div>
      </div>
    </div>
  `;
}

function downloadDoDocPdf(id) {
  window.open(`/api/delivery-orders/${id}/pdf?token=${authToken}`, '_blank');
}

async function printDoDocDirect(id) {
  await viewDoDoc(id);
  setTimeout(() => {
    printStudioDocument('docViewerSheet');
  }, 300);
}

// 5. UNIVERSAL PRINT ENGINE
function printStudioDocument(elementId) {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  // Invokes native browser vector print with CSS media print rules
  window.print();
}

// DIRECT DOCUMENT UPLOAD
function openDirectUploadModal(cat = 'invoice') {
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

  await uploadDirectFile(file, type);
  closeModal('uploadDocModal');
  document.getElementById('directDocFile').value = '';
  document.getElementById('uploadFileNameDisplay').textContent = '';
  loadDocuments();
}

async function uploadDirectFile(file, docType, shipmentId = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', docType);
  if (shipmentId) formData.append('shipment_id', shipmentId);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      return data;
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
  return null;
}

// PROFILE
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        prompt,
        role: 'dealer',
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
    feed.innerHTML += `<div class="chat-bubble bubble-theirs" style="color:var(--rose);">AI Assistant unavailable: ${err.message}</div>`;
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

// TAB SWITCHER
function switchTab(tabName) {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach(it => it.classList.remove('active'));
  
  if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) {
    event.currentTarget.classList.add('active');
  } else if (tabName === 'chat') {
    const chatLink = document.getElementById('sidebarChatLink');
    if (chatLink) chatLink.classList.add('active');
  } else if (tabName === 'invoices') {
    const invLink = document.getElementById('sidebarInvoicesLink');
    if (invLink) invLink.classList.add('active');
  } else if (tabName === 'deliveryOrders') {
    const doLink = document.getElementById('sidebarDoLink');
    if (doLink) doLink.classList.add('active');
  }

  // Update mobile bottom nav state
  document.querySelectorAll('.bottom-nav-item').forEach(it => it.classList.remove('active'));
  const bnav = document.getElementById('bnav-' + tabName);
  if (bnav) bnav.classList.add('active');

  // Close mobile drawer when switching
  toggleMobileDrawer(false);

  ['tabOverview', 'tabInvoices', 'tabDeliveryOrders', 'tabTransporters', 'tabDocuments', 'tabChat'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });

  const targetId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
  const target = document.getElementById(targetId);
  if (target) target.style.display = 'block';

  if (tabName === 'invoices') {
    loadDealerInvoices();
  } else if (tabName === 'deliveryOrders') {
    loadDealerDeliveryOrders();
  } else if (tabName === 'chat') {
    loadConversationsAndUnread();
    closeDealerMobileChat();
  }
}

function closeDealerMobileChat() {
  const cont = document.getElementById('dealerChatContainer');
  if (cont) cont.classList.remove('chat-mobile-chat-open');
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
