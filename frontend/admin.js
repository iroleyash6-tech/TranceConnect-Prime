/**
 * TRANCECONNECT-PRIME: HQ ADMIN ENGINE
 * Master control logic connected directly to MySQL backend.
 */

const authToken = localStorage.getItem('tc_token');
const currentUser = JSON.parse(localStorage.getItem('tc_user') || 'null');

let socket = null;
let adminFleetMap = null;
let fleetMarkers = {};
let liveFleetData = [];
let allAdminInvoices = [];
let allAdminDeliveryOrders = [];

// Auth Guard: Only Admins allowed
if (!authToken || !currentUser || currentUser.role !== 'admin') {
  alert('Unauthorized. Master Admin access required.');
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  setupEffects();
  setupUserInterface();
  initAdminSocket();
  loadLiveFleetMap();
  loadAllAdminData();
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
}

function setupUserInterface() {
  const nameEl = document.getElementById('adminDisplayName');
  if (nameEl && currentUser) {
    nameEl.textContent = currentUser.company_name || 'System Admin';
  }
  const drawerName = document.getElementById('adminDrawerName');
  if (drawerName && currentUser) {
    drawerName.textContent = currentUser.company_name || 'HQ Master Control';
  }
}

// ==========================================
// REAL-TIME FLEET TELEMETRY & LIVE RADAR
// ==========================================
function initAdminSocket() {
  if (typeof io === 'undefined') {
    console.warn('[Admin Socket] Socket.IO library not yet ready.');
    return;
  }
  socket = io();

  socket.on('connect', () => {
    console.log('[Admin Socket] Connected:', socket.id);
    socket.emit('authenticate', { token: authToken });
    socket.emit('join_fleet_tracking');
  });

  socket.on('authenticated', (data) => {
    console.log('[Admin Socket] Authenticated for live fleet stream:', data);
  });

  socket.on('location_updated', (data) => {
    handleAdminLiveLocationUpdate(data);
  });
}

async function loadLiveFleetMap() {
  try {
    const res = await fetch('/api/fleet/live', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    liveFleetData = data.fleet || [];

    const badge = document.getElementById('fleetLiveActiveCount');
    if (badge) {
      badge.textContent = `${data.active_count || liveFleetData.length} Trucks Monitored`;
    }

    renderAdminFleetTable(liveFleetData);
    renderAdminFleetMap(liveFleetData);
  } catch (err) {
    console.error('[Admin] Error loading live fleet:', err);
  }
}

function renderAdminFleetMap(fleetList) {
  const container = document.getElementById('adminFleetMap');
  if (!container || typeof L === 'undefined') return;

  if (!adminFleetMap) {
    adminFleetMap = L.map('adminFleetMap', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([21.7679, 78.8718], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(adminFleetMap);
  }

  // Clear existing markers
  Object.values(fleetMarkers).forEach(m => adminFleetMap.removeLayer(m));
  fleetMarkers = {};

  const bounds = [];

  fleetList.forEach(item => {
    const lat = item.latest_tracking ? parseFloat(item.latest_tracking.latitude) : 20.5937;
    const lng = item.latest_tracking ? parseFloat(item.latest_tracking.longitude) : 78.9629;
    if (isNaN(lat) || isNaN(lng)) return;

    bounds.push([lat, lng]);

    const vehicleImg = item.vehicle_image || '/assets/vehicles/container-truck.svg';
    const vehicleIcon = L.divIcon({
      className: 'vehicle-map-marker',
      html: `
        <div class="marker-vehicle-pin">
          <img src="${vehicleImg}" alt="${escapeHtml(item.vehicle_type || 'Truck')}" style="width: 26px; height: 26px; object-fit: contain;">
          <div class="marker-pulse-glow"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    const marker = L.marker([lat, lng], { icon: vehicleIcon }).addTo(adminFleetMap);

    const popupHtml = `
      <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">
          <img src="${vehicleImg}" style="width: 32px; height: 32px; object-fit: contain;">
          <div>
            <strong style="color: #00f0ff; font-size: 0.95rem;">${escapeHtml(item.vehicle_number || 'TRUCK')}</strong>
            <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(item.vehicle_type || 'Commercial Vehicle')}</div>
          </div>
        </div>
        <div style="font-size: 0.82rem; line-height: 1.5; color: #e2e8f0;">
          <div><strong>Transporter:</strong> ${escapeHtml(item.transporter_name || 'Fleet Operator')}</div>
          <div><strong>Route:</strong> ${escapeHtml(item.pickup_location)} ➔ ${escapeHtml(item.delivery_location)}</div>
          <div><strong>Speed:</strong> <span style="color:#10b981; font-weight:700;">${item.latest_tracking ? item.latest_tracking.speed_kmh : 0} KM/H</span></div>
          <div><strong>Checkpoint:</strong> ${escapeHtml(item.latest_tracking ? item.latest_tracking.location_name : 'Depot')}</div>
          <div><strong>Status:</strong> <span style="color:#00f0ff;">${escapeHtml(item.status)}</span></div>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml);
    fleetMarkers[item.shipment_id] = marker;
  });

  if (bounds.length > 0) {
    adminFleetMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
  }

  setTimeout(() => {
    if (adminFleetMap) adminFleetMap.invalidateSize();
  }, 250);
}

function handleAdminLiveLocationUpdate(data) {
  if (!data || !data.shipment_id) return;
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);
  if (isNaN(lat) || isNaN(lng)) return;

  const shipmentId = data.shipment_id;
  const vehicleImg = data.vehicle_image || '/assets/vehicles/container-truck.svg';

  if (fleetMarkers[shipmentId]) {
    const marker = fleetMarkers[shipmentId];
    marker.setLatLng([lat, lng]);
    const popupHtml = `
      <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">
          <img src="${vehicleImg}" style="width: 32px; height: 32px; object-fit: contain;">
          <div>
            <strong style="color: #00f0ff; font-size: 0.95rem;">${escapeHtml(data.vehicle_number || 'TRUCK')}</strong>
            <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(data.vehicle_type || 'Commercial Vehicle')}</div>
          </div>
        </div>
        <div style="font-size: 0.82rem; line-height: 1.5; color: #e2e8f0;">
          <div><strong>Transporter:</strong> ${escapeHtml(data.transporter_name || 'Fleet Operator')}</div>
          <div><strong>Speed:</strong> <span style="color:#10b981; font-weight:700;">${data.speed_kmh} KM/H</span></div>
          <div><strong>Checkpoint:</strong> ${escapeHtml(data.location_name || 'In Transit')}</div>
          <div><strong>Status:</strong> <span style="color:#00f0ff;">${escapeHtml(data.status_note || 'Active')}</span></div>
        </div>
      </div>
    `;
    marker.setPopupContent(popupHtml);
  } else if (adminFleetMap) {
    const vehicleIcon = L.divIcon({
      className: 'vehicle-map-marker',
      html: `
        <div class="marker-vehicle-pin">
          <img src="${vehicleImg}" alt="${escapeHtml(data.vehicle_type || 'Truck')}" style="width: 26px; height: 26px; object-fit: contain;">
          <div class="marker-pulse-glow"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    const marker = L.marker([lat, lng], { icon: vehicleIcon }).addTo(adminFleetMap);
    fleetMarkers[shipmentId] = marker;
  }

  // Update table row if rendered
  const rowLoc = document.getElementById(`fleet-row-loc-${shipmentId}`);
  const rowSpd = document.getElementById(`fleet-row-spd-${shipmentId}`);
  if (rowLoc && rowSpd) {
    rowLoc.textContent = data.location_name || 'En Route';
    rowSpd.textContent = `${data.speed_kmh} KM/H`;
    rowSpd.style.color = '#10b981';
  } else {
    loadLiveFleetMap();
  }
}

function renderAdminFleetTable(fleetList) {
  const tbody = document.getElementById('adminLiveFleetTableBody');
  if (!tbody) return;

  if (!fleetList || fleetList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No vehicles currently streaming live telemetry.</td></tr>`;
    return;
  }

  tbody.innerHTML = fleetList.map(item => {
    const vehicleImg = item.vehicle_image || '/assets/vehicles/container-truck.svg';
    const tracking = item.latest_tracking || {};
    const speed = tracking.speed_kmh !== undefined ? `${tracking.speed_kmh} KM/H` : '0 KM/H';
    const locName = tracking.location_name || item.pickup_location || 'Origin Hub';

    return `
      <tr>
        <td style="display: flex; align-items: center; gap: 8px;">
          <img src="${vehicleImg}" alt="${escapeHtml(item.vehicle_type || 'Truck')}" style="width: 44px; height: 30px; object-fit: contain; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 2px;">
          <div>
            <strong>${escapeHtml(item.vehicle_number || 'Assigned')}</strong>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(item.vehicle_type || 'Truck')}</div>
          </div>
        </td>
        <td><strong>#SHP-${item.shipment_id}</strong></td>
        <td>${escapeHtml(item.transporter_name || 'Unassigned')}</td>
        <td><small>${escapeHtml(item.pickup_location)} ➔ ${escapeHtml(item.delivery_location)}</small></td>
        <td id="fleet-row-loc-${item.shipment_id}"><span style="color: var(--cyan);">${escapeHtml(locName)}</span></td>
        <td id="fleet-row-spd-${item.shipment_id}"><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">${speed}</strong></td>
        <td><span class="status-badge badge-${item.status.toLowerCase().replace(' ', '_')}">${item.status}</span></td>
      </tr>
    `;
  }).join('');
}

async function loadAllAdminData() {
  await Promise.all([
    loadAdminStats(),
    loadAdminDocuments(),
    loadAdminUsers(),
    loadAdminShipments(),
    loadAdminVehicles(),
    loadAdminMasterDocs()
  ]);
}

// 1. STATS
async function loadAdminStats() {
  try {
    const res = await fetch('/api/dashboard/stats', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { stats } = await res.json();
    document.getElementById('kpiDealers').textContent = stats.total_dealers || 0;
    document.getElementById('kpiTransporters').textContent = stats.total_transporters || 0;
    document.getElementById('kpiShipments').textContent = stats.total_shipments || 0;
    document.getElementById('kpiDocs').textContent = stats.pending_docs || 0;
    document.getElementById('kpiVehicles').textContent = stats.total_vehicles || 0;
  } catch (err) {
    console.error('Admin stats error:', err);
  }
}

// 2. DOCUMENTS VERIFICATION
async function loadAdminDocuments() {
  try {
    const res = await fetch('/api/documents', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { documents } = await res.json();
    const tbody = document.getElementById('adminDocsBody');
    if (!tbody) return;

    if (!documents || documents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No documents uploaded in the queue.</td></tr>`;
      return;
    }

    tbody.innerHTML = documents.map(d => `
      <tr>
        <td><strong>#DOC-${d.id}</strong></td>
        <td>
          <strong>${escapeHtml(d.company_name || 'User')}</strong><br>
          <small style="color: var(--cyan);">${escapeHtml(d.user_role ? d.user_role.toUpperCase() : '')} &bull; ${escapeHtml(d.email || '')}</small>
        </td>
        <td><span class="status-badge badge-assigned">${escapeHtml(d.document_type.toUpperCase())}</span></td>
        <td>
          <a class="btn btn-glass btn-sm" href="/api/documents/${d.id}/download?token=${authToken}" target="_blank">📥 ${escapeHtml(d.file_name)}</a>
        </td>
        <td><span class="status-badge badge-${d.verification_status}">${d.verification_status.toUpperCase()}</span></td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-success btn-sm" onclick="verifyDocument(${d.id}, 'verified')">Approve ✅</button>
            <button class="btn btn-danger btn-sm" onclick="verifyDocument(${d.id}, 'rejected')">Reject ❌</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Admin docs error:', err);
  }
}

async function verifyDocument(docId, status) {
  try {
    const res = await fetch(`/api/documents/${docId}/verify`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadAdminDocuments();
      loadAdminStats();
    } else {
      showToast(data.error || 'Failed to update document status', 'error');
    }
  } catch (err) {
    showToast('Verification error: ' + err.message, 'error');
  }
}

// 3. USERS (DEALERS & TRANSPORTERS)
async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { users } = await res.json();

    const dealers = users.filter(u => u.role === 'dealer');
    const transporters = users.filter(u => u.role === 'transporter');

    // Dealers Table
    const dBody = document.getElementById('adminDealersBody');
    if (dBody) {
      dBody.innerHTML = dealers.map(u => `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td><strong>${escapeHtml(u.company_name)}</strong></td>
          <td>${escapeHtml(u.contact_person || u.company_name)}</td>
          <td>${escapeHtml(u.mobile)}<br><small style="color:var(--text-dim)">${escapeHtml(u.email)}</small></td>
          <td><code>${escapeHtml(u.gst_number || '-')}</code></td>
          <td>${escapeHtml(u.city || '-')}, ${escapeHtml(u.state || '-')}</td>
          <td><span class="status-badge badge-${u.status === 'active' ? 'accepted' : 'cancelled'}">${u.status.toUpperCase()}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status === 'active' ? 'blocked' : 'active'}')">
              ${u.status === 'active' ? 'Block' : 'Unblock'}
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Transporters Table
    const tBody = document.getElementById('adminTransportersBody');
    if (tBody) {
      tBody.innerHTML = transporters.map(u => `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td><strong>${escapeHtml(u.company_name)}</strong></td>
          <td>${escapeHtml(u.contact_person || u.company_name)}</td>
          <td>${escapeHtml(u.mobile)}<br><small style="color:var(--text-dim)">${escapeHtml(u.email)}</small></td>
          <td><code>${escapeHtml(u.gst_number || '-')}</code></td>
          <td>${escapeHtml(u.city || '-')}, ${escapeHtml(u.state || '-')}</td>
          <td><span class="status-badge badge-${u.verification_status}">${u.verification_status.toUpperCase()}</span></td>
          <td><span class="status-badge badge-${u.status === 'active' ? 'accepted' : 'cancelled'}">${u.status.toUpperCase()}</span></td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-success btn-sm" onclick="toggleUserVerification(${u.id}, '${u.verification_status === 'verified' ? 'pending' : 'verified'}')">
                ${u.verification_status === 'verified' ? 'Revoke' : 'Accredit'}
              </button>
              <button class="btn btn-outline btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status === 'active' ? 'blocked' : 'active'}')">
                ${u.status === 'active' ? 'Block' : 'Unblock'}
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Admin users error:', err);
  }
}

async function toggleUserStatus(userId, newStatus) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadAdminUsers();
    }
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
  }
}

async function toggleUserVerification(userId, newStatus) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/verification`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ verification_status: newStatus })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadAdminUsers();
    }
  } catch (err) {
    showToast('Failed to update verification: ' + err.message, 'error');
  }
}

// 4. MASTER SHIPMENTS LOG
async function loadAdminShipments() {
  try {
    const res = await fetch('/api/shipments', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { shipments } = await res.json();
    const tbody = document.getElementById('adminShipmentsBody');
    if (!tbody) return;

    tbody.innerHTML = shipments.map(s => `
      <tr>
        <td><strong>#SHP-${s.id}</strong></td>
        <td><strong>${escapeHtml(s.dealer_company || 'Dealer')}</strong></td>
        <td><strong>${escapeHtml(s.transporter_company || 'Unassigned')}</strong></td>
        <td>${escapeHtml(s.product_type)} (${s.weight_tons}T &bull; ${escapeHtml(s.vehicle_required)})</td>
        <td><small>${escapeHtml(s.pickup_location)} ➔ ${escapeHtml(s.delivery_location)}</small></td>
        <td><strong style="color:var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(s.price_per_trip).toLocaleString()}</strong></td>
        <td><span class="status-badge badge-${s.status.toLowerCase().replace(' ', '_')}">${s.status}</span></td>
        <td>
          <a class="btn btn-outline btn-sm" href="/api/tracking/${s.id}" target="_blank">🛰️ Telemetry JSON</a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Admin shipments error:', err);
  }
}

// 5. VEHICLES
async function loadAdminVehicles() {
  try {
    const res = await fetch('/api/vehicles', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { vehicles } = await res.json();
    const tbody = document.getElementById('adminVehiclesBody');
    if (!tbody) return;

    tbody.innerHTML = vehicles.map(v => {
      const vehicleImg = v.image_url || '/assets/vehicles/container-truck.svg';
      return `
        <tr>
          <td style="width: 70px;">
            <img src="${vehicleImg}" alt="${escapeHtml(v.vehicle_type)}" class="vehicle-row-thumb" style="width: 58px; height: 38px; object-fit: contain; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 2px;">
          </td>
          <td><strong>${escapeHtml(v.vehicle_number)}</strong></td>
          <td>${escapeHtml(v.transporter_name || 'Fleet Operator')}</td>
          <td>${escapeHtml(v.vehicle_type)}</td>
          <td><strong style="color:var(--cyan);">${v.capacity_tons} Tons</strong></td>
          <td>${escapeHtml(v.current_location || 'Logistics Depot')}</td>
          <td><span class="status-badge badge-${v.status === 'available' ? 'accepted' : 'in_transit'}">${v.status.toUpperCase()}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Admin fleet error:', err);
  }
}

// 6. HEALTH
async function checkApiHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    alert(`System Diagnostics:\nStatus: ${data.status}\nDatabase: ${data.database.message}\nVersion: ${data.version}\nTimestamp: ${data.timestamp}`);
  } catch (err) {
    alert('API connection failed: ' + err.message);
  }
}

// ===================================================================
// 6. LIVE DATABASE EXPLORER
// ===================================================================
let cachedDbData = null;
let currentSelectedTable = 'users';

async function loadDatabaseExplorer() {
  try {
    const res = await fetch('/api/admin/db-inspect', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      showToast('Failed to inspect database', 'error');
      return;
    }
    cachedDbData = await res.json();

    document.getElementById('dbExpName').textContent = cachedDbData.database_name || 'transconnectlinkx';
    document.getElementById('dbExpHost').textContent = `${cachedDbData.host}:${cachedDbData.port} (MySQL 8.0)`;
    
    const tables = cachedDbData.tables || {};
    const tableKeys = Object.keys(tables);
    document.getElementById('dbExpTableCount').textContent = `${tableKeys.length} Tables`;

    // Render table selector cards
    const grid = document.getElementById('dbTableGrid');
    if (grid) {
      grid.innerHTML = tableKeys.map(tblName => {
        const tbl = tables[tblName];
        const isSel = (tblName === currentSelectedTable);
        const borderStyle = isSel ? 'border-color: var(--cyan); box-shadow: 0 0 15px rgba(0,240,255,0.3); background: rgba(0,240,255,0.08);' : '';
        return `
          <div class="kpi-card" style="padding: 1rem; cursor: pointer; transition: all 0.2s ease; ${borderStyle}" onclick="selectDbTable('${tblName}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <strong style="color: ${isSel ? 'var(--cyan)' : 'var(--text-main)'}; font-size: 0.95rem;">${escapeHtml(tblName)}</strong>
              <span class="status-badge ${tbl.row_count > 0 ? 'badge-accepted' : 'badge-pending'}">${tbl.row_count} rows</span>
            </div>
            <small style="color: var(--text-dim); font-size: 0.75rem;">${tbl.columns.length} columns</small>
          </div>
        `;
      }).join('');
    }

    renderDbTableData(currentSelectedTable);

  } catch (err) {
    console.error('DB Explorer error:', err);
    showToast('Failed to connect to database inspector', 'error');
  }
}

function selectDbTable(tableName) {
  currentSelectedTable = tableName;
  if (!cachedDbData) {
    loadDatabaseExplorer();
    return;
  }

  // Update card styling
  const grid = document.getElementById('dbTableGrid');
  if (grid && cachedDbData.tables) {
    const tableKeys = Object.keys(cachedDbData.tables);
    grid.innerHTML = tableKeys.map(tblName => {
      const tbl = cachedDbData.tables[tblName];
      const isSel = (tblName === currentSelectedTable);
      const borderStyle = isSel ? 'border-color: var(--cyan); box-shadow: 0 0 15px rgba(0,240,255,0.3); background: rgba(0,240,255,0.08);' : '';
      return `
        <div class="kpi-card" style="padding: 1rem; cursor: pointer; transition: all 0.2s ease; ${borderStyle}" onclick="selectDbTable('${tblName}')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <strong style="color: ${isSel ? 'var(--cyan)' : 'var(--text-main)'}; font-size: 0.95rem;">${escapeHtml(tblName)}</strong>
            <span class="status-badge ${tbl.row_count > 0 ? 'badge-accepted' : 'badge-pending'}">${tbl.row_count} rows</span>
          </div>
          <small style="color: var(--text-dim); font-size: 0.75rem;">${tbl.columns.length} columns</small>
        </div>
      `;
    }).join('');
  }

  renderDbTableData(tableName);
}

function renderDbTableData(tableName) {
  if (!cachedDbData || !cachedDbData.tables || !cachedDbData.tables[tableName]) return;

  const tbl = cachedDbData.tables[tableName];
  document.getElementById('dbCurrentTableTitle').textContent = `MySQL Table: \`${tableName}\``;
  document.getElementById('dbCurrentTableSub').textContent = `Total Rows: ${tbl.row_count} | Displaying latest ${tbl.records.length} records`;

  const thead = document.getElementById('dbInspectThead');
  const tbody = document.getElementById('dbInspectTbody');

  // Render headers
  thead.innerHTML = `<tr>${tbl.columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}</tr>`;

  // Render records
  if (!tbl.records || tbl.records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${tbl.columns.length}" style="text-align: center; color: var(--text-dim); padding: 2rem;">Table \`${tableName}\` currently contains 0 records.</td></tr>`;
    return;
  }

  tbody.innerHTML = tbl.records.map(row => {
    return `<tr>${tbl.columns.map(col => {
      let val = row[col];
      if (val === null || val === undefined) {
        return `<td style="color: var(--text-dim); font-style: italic;">NULL</td>`;
      }
      if (col.includes('password')) {
        return `<td style="color: var(--text-dim); font-family: monospace;">•••••••• [Encrypted Hash]</td>`;
      }
      return `<td><small style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(String(val))}</small></td>`;
    }).join('')}</tr>`;
  }).join('');
}

// ===================================================================
// MASTER COMMERCIAL INVOICES & DELIVERY ORDERS (DO) GOVERNANCE
// ===================================================================

async function loadAdminMasterDocs() {
  try {
    const [resInv, resDo] = await Promise.all([
      fetch('/api/invoices', { headers: { 'Authorization': `Bearer ${authToken}` } }),
      fetch('/api/delivery-orders', { headers: { 'Authorization': `Bearer ${authToken}` } })
    ]);

    if (resInv.ok) {
      const dataInv = await resInv.json();
      allAdminInvoices = dataInv.invoices || [];
      renderAdminInvoicesMaster(allAdminInvoices);
    }

    if (resDo.ok) {
      const dataDo = await resDo.json();
      allAdminDeliveryOrders = dataDo.delivery_orders || [];
      renderAdminDeliveryOrdersMaster(allAdminDeliveryOrders);
    }
  } catch (err) {
    console.error('Admin master docs error:', err);
  }
}

function renderAdminInvoicesMaster(invoices) {
  const tbody = document.getElementById('adminInvoicesMasterBody');
  if (!tbody) return;

  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No commercial tax invoices issued in the database.</td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const statusClass = `badge-${inv.status.toLowerCase()}`;
    return `
      <tr>
        <td><strong style="color: var(--cyan); font-family: 'JetBrains Mono', monospace;">${escapeHtml(inv.invoice_number)}</strong></td>
        <td>${escapeHtml(inv.invoice_date || '-')}</td>
        <td><strong>${escapeHtml(inv.seller_name)}</strong><br><small style="color:var(--text-dim)">GST: ${escapeHtml(inv.seller_gstin || '')}</small></td>
        <td><strong>${escapeHtml(inv.buyer_name)}</strong><br><small style="color:var(--text-dim)">GST: ${escapeHtml(inv.buyer_gstin || '')}</small></td>
        <td>${inv.shipment_id ? `<span style="font-family:'JetBrains Mono'; color:var(--emerald);">#SHP-${inv.shipment_id}</span>` : '<span style="color:var(--text-dim)">-</span>'}</td>
        <td>₹${Number(inv.taxable_amount || 0).toLocaleString()}</td>
        <td><strong style="color: var(--emerald); font-family: 'JetBrains Mono', monospace;">₹${Number(inv.total_amount || 0).toLocaleString()}</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(inv.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewAdminInvoice(${inv.id})" title="Inspect Official A4 Sheet">👁️ Inspect</button>
            <a href="/api/invoices/${inv.id}/pdf?token=${authToken}" target="_blank" class="btn btn-primary btn-sm" title="Download ReportLab Vector PDF">📥 PDF</a>
            <a href="/verify/invoice/${encodeURIComponent(inv.invoice_number)}" target="_blank" class="btn btn-glass btn-sm" title="Public Verification Link">🔗 QR</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdminDeliveryOrdersMaster(dos) {
  const tbody = document.getElementById('adminDeliveryOrdersMasterBody');
  if (!tbody) return;

  if (!dos || dos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No delivery orders issued in the database.</td></tr>`;
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
        <td><strong>${escapeHtml(d.vehicle_number || 'TBD')}</strong><br><small style="color:var(--text-dim)">${escapeHtml(d.transporter_name || '')}</small></td>
        <td><strong>${Number(d.gross_weight_tons || 0).toFixed(1)} MT</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewAdminDO(${d.id})" title="Inspect Official A4 Delivery Order">👁️ Inspect</button>
            <a href="/api/delivery-orders/${d.id}/pdf?token=${authToken}" target="_blank" class="btn btn-primary btn-sm" title="Download Official Vector PDF">📥 PDF</a>
            <a href="/verify/do/${encodeURIComponent(d.do_number)}" target="_blank" class="btn btn-glass btn-sm" title="Public Verification Link">🔗 QR</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminMasterDocs() {
  const q = (document.getElementById('adminDocsMasterSearchInput')?.value || '').toLowerCase();

  const filteredInv = allAdminInvoices.filter(inv => {
    return !q || (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.seller_name.toLowerCase().includes(q) ||
      inv.buyer_name.toLowerCase().includes(q) ||
      (inv.shipment_id && inv.shipment_id.toString().includes(q))
    );
  });
  renderAdminInvoicesMaster(filteredInv);

  const filteredDo = allAdminDeliveryOrders.filter(d => {
    return !q || (
      d.do_number.toLowerCase().includes(q) ||
      d.consignor_name.toLowerCase().includes(q) ||
      d.consignee_name.toLowerCase().includes(q) ||
      (d.shipment_id && d.shipment_id.toString().includes(q)) ||
      (d.vehicle_number && d.vehicle_number.toLowerCase().includes(q))
    );
  });
  renderAdminDeliveryOrdersMaster(filteredDo);
}

async function viewAdminInvoice(id) {
  try {
    const res = await fetch(`/api/invoices/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { invoice, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Master Audit: ${invoice.invoice_number}`;
    document.getElementById('docViewerSub').textContent = `Seller: ${invoice.seller_name} &bull; Buyer: ${invoice.buyer_name} &bull; Total: ₹${Number(invoice.total_amount).toLocaleString()} INR`;
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
        <tr><td>Integrated GST (IGST):</td><td class="text-right">₹${Number(invoice.igst_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
      `;
    } else {
      taxRows = `
        <tr><td>Central GST (CGST):</td><td class="text-right">₹${Number(invoice.cgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
        <tr><td>State GST (SGST):</td><td class="text-right">₹${Number(invoice.sgst_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
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
            <tr><td>Total Taxable Value:</td><td class="text-right">₹${Number(invoice.taxable_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
            ${taxRows}
            <tr class="total-row"><td>GRAND TOTAL (INR):</td><td class="text-right">₹${Number(invoice.total_amount || 0).toLocaleString()}</td></tr>
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
    showToast('Error opening invoice: ' + err.message, 'error');
  }
}

async function viewAdminDO(id) {
  try {
    const res = await fetch(`/api/delivery-orders/${id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const { delivery_order, items } = await res.json();

    document.getElementById('docViewerHeading').textContent = `Master Audit: ${delivery_order.do_number}`;
    document.getElementById('docViewerSub').textContent = `Consignor: ${delivery_order.consignor_name} &bull; Consignee: ${delivery_order.consignee_name} &bull; Gross: ${Number(delivery_order.gross_weight_tons).toFixed(1)} MT`;
    document.getElementById('docViewerPdfBtn').href = `/api/delivery-orders/${id}/pdf?token=${authToken}`;
    document.getElementById('docViewerQrBtn').href = `/verify/do/${delivery_order.do_number}`;

    const sheet = document.getElementById('docViewerSheet');
    let itemsHtml = '';
    let count = 1;
    (items || []).forEach(it => {
      itemsHtml += `
        <tr>
          <td class="text-center">${count++}</td>
          <td><strong>${escapeHtml(it.item_name)}</strong></td>
          <td class="text-center">${escapeHtml(it.packaging_type || '-')}</td>
          <td class="text-right"><strong>${Number(it.weight_tons || 0).toFixed(2)} MT</strong></td>
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
            <p>GSTIN: <strong>${escapeHtml(delivery_order.consignor_gstin || '')}</strong> &bull; Commercial Dispatch</p>
            <p>Loading Yard: ${escapeHtml(delivery_order.loading_point || '')}</p>
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
        <div class="a4-meta-col"><span>TOTAL GROSS WT</span><strong>${Number(delivery_order.gross_weight_tons).toFixed(2)} MT</strong></div>
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
        <div><span>DRIVER NAME & CONTACT</span><strong>${escapeHtml(delivery_order.driver_name || '-')} (${escapeHtml(delivery_order.driver_mobile || '-')})</strong></div>
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
          Official record stored and cryptographically verified in TranceConnect registry.
        </div>
        <div class="a4-signatory-box">
          <div class="a4-qr-wrap">
            <img src="/api/verify/do/${encodeURIComponent(delivery_order.do_number)}" onerror="this.src='/assets/truck-hero.svg'" class="a4-qr-img" alt="QR Code">
            <div style="font-size: 8.5px; text-align: left; color: #475569;">
              <strong>QR Verified DO</strong><br>
              Master Audit Log
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

// TABS
function switchTab(tabName) {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach(it => it.classList.remove('active'));
  if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) {
    event.currentTarget.classList.add('active');
  } else if (tabName === 'documentsMaster') {
    const docLink = document.getElementById('sidebarAdminDocsLink');
    if (docLink) docLink.classList.add('active');
  }

  // Update mobile bottom nav state
  document.querySelectorAll('.bottom-nav-item').forEach(it => it.classList.remove('active'));
  const bnav = document.getElementById('admin-bnav-' + tabName);
  if (bnav) bnav.classList.add('active');

  // Close mobile drawer when switching
  toggleMobileDrawer(false);

  ['tabFleetMap', 'tabVerifications', 'tabDealers', 'tabTransporters', 'tabShipments', 'tabDocumentsMaster', 'tabVehicles', 'tabDatabase'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });

  const targetId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
  const target = document.getElementById(targetId);
  if (target) target.style.display = 'block';

  if (tabName === 'fleetMap') {
    loadLiveFleetMap();
    setTimeout(() => {
      if (adminFleetMap) adminFleetMap.invalidateSize();
    }, 200);
  } else if (tabName === 'database') {
    loadDatabaseExplorer();
  } else if (tabName === 'documentsMaster') {
    loadAdminMasterDocs();
  }
}

function toggleMobileDrawer(forceState) {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const isActive = typeof forceState === 'boolean' ? forceState : (drawer && !drawer.classList.contains('active'));
  if (drawer) drawer.classList.toggle('active', isActive);
  if (overlay) overlay.classList.toggle('active', isActive);
}

window.addEventListener('resize', () => {
  if (adminFleetMap) adminFleetMap.invalidateSize();
});

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
