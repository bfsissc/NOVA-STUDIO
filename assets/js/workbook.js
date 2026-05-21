// ── Standard column format ──
var WB_COLS = ['Name','Email','Phone','Gender','Department']; // default; overridden per-sheet
// Per-sheet column storage: {sheetId: ['Col1','Col2',...]}
var WB_SHEET_COLS = {};
// Per-cell formatting: {sheetId: {rowId: {col: {bold,italic,bg,important}}}}
var WB_FMT = {};
// Currently focused cell info
var WB_FOCUS = null; // {sheetId, rowId, col, td, input}

// ── Sync + Workbook state ──
var SYNC = {
  rooms: (function(){ try{ return JSON.parse(localStorage.getItem('nova_sync_rooms') || '[]'); }catch(e){ return []; } })(),
  activeRoom: null,
  presenceInterval: null,
  // legacy compat
  unsubscribe: null, columns: [], rows: []
};
var WB = {
  sheets: [],          // [{id, name, isMaster}]
  activeSheetId: null, // string id
  rows: {},            // {sheetId: [{_id, Name, Email, ...}]}
  unsubs: {},          // {sheetId: unsubscribe fn}
  sheetUnsub: null     // sheets list unsubscribe
};

function syncSaveRooms() {
  localStorage.setItem('nova_sync_rooms', JSON.stringify(SYNC.rooms));
}

function syncOnViewOpen() {
  syncRenderRoomList();
}

// ── Toast ──
function syncToast(msg, type) {
  var t = document.getElementById('syncToast');
  t.textContent = msg;
  t.style.background = type === 'err' ? '#dc2626' : type === 'ok' ? '#16a34a' : '#0d0f12';
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

// ── Generate key ──
function syncGenKey() {
  return Math.random().toString(36).slice(2,6).toUpperCase() + '-' +
         Math.random().toString(36).slice(2,6).toUpperCase() + '-' +
         Math.random().toString(36).slice(2,6).toUpperCase();
}

// ── Render sidebar room list ──
function syncRenderRoomList() {
  var list = document.getElementById('syncRoomsList');
  if (!SYNC.rooms.length) {
    list.innerHTML = '<div style="font-size:.72rem;color:var(--mist);padding:10px 8px">No rooms yet. Create or join one.</div>';
    return;
  }
  list.innerHTML = SYNC.rooms.map(function(r) {
    var isActive = SYNC.activeRoom && SYNC.activeRoom.key === r.key;
    return '<div class="sync-room-item' + (isActive ? ' active' : '') + '" onclick="syncEnterRoom(\'' + r.key + '\')">' +
      '<span style="font-size:.85rem">' + (r.role === 'owner' ? '👑' : '👤') + '</span>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.name + '</span>' +
      (isActive ? '<span class="sync-room-badge">Live</span>' : '') +
      '</div>';
  }).join('');
}

// ── Modals ──
function syncShowCreateModal() {
  document.getElementById('syncCreateName').value = '';
  document.getElementById('syncCreateModal').classList.add('show');
  setTimeout(function(){ document.getElementById('syncCreateName').focus(); }, 100);
}
function syncShowJoinModal() {
  document.getElementById('syncJoinKey').value = '';
  document.getElementById('syncJoinModal').classList.add('show');
  setTimeout(function(){ document.getElementById('syncJoinKey').focus(); }, 100);
}

// ── Create room ──
async function syncCreateRoom() {
  var name = document.getElementById('syncCreateName').value.trim();
  if (!name) { syncToast('Enter a room name', 'err'); return; }
  var key = syncGenKey();
  var uid = (U && U.uid) || 'anon';
  var displayName = (U && (U.firstName + ' ' + (U.lastName || '')).trim()) || 'You';

  try {
    // Create the room document in Firestore
    await fbDb.collection('sync_rooms').doc(key).set({
      name: name,
      createdBy: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      columns: [],
      members: { [uid]: { name: displayName, lastSeen: Date.now() } }
    });

    var room = { id: key, name: name, key: key, role: 'owner' };
    SYNC.rooms.unshift(room);
    syncSaveRooms();

    document.getElementById('syncCreateModal').classList.remove('show');
    syncRenderRoomList();
    syncEnterRoom(key);
    syncToast('Room "' + name + '" created! Share the key: ' + key, 'ok');
  } catch(e) {
    syncToast('Error: ' + (e.message || e), 'err');
  }
}

// ── Join room ──
async function syncJoinRoom() {
  var key = document.getElementById('syncJoinKey').value.trim().toUpperCase();
  if (!key) { syncToast('Paste a room key', 'err'); return; }

  try {
    var doc = await fbDb.collection('sync_rooms').doc(key).get();
    if (!doc.exists) { syncToast('Room not found. Check the key.', 'err'); return; }

    var data = doc.data();
    var uid = (U && U.uid) || 'anon';
    var displayName = (U && (U.firstName + ' ' + (U.lastName || '')).trim()) || 'Guest';

    // Add self to members
    await fbDb.collection('sync_rooms').doc(key).update({
      ['members.' + uid]: { name: displayName, lastSeen: Date.now() }
    });

    // Check if already in rooms list
    var existing = SYNC.rooms.find(function(r){ return r.key === key; });
    if (!existing) {
      var room = { id: key, name: data.name, key: key, role: 'member' };
      SYNC.rooms.unshift(room);
      syncSaveRooms();
    }

    document.getElementById('syncJoinModal').classList.remove('show');
    syncRenderRoomList();
    syncEnterRoom(key);
    syncToast('Joined "' + data.name + '"!', 'ok');
  } catch(e) {
    syncToast('Error: ' + (e.message || e), 'err');
  }
}

// ── Enter room (subscribe to live workbook) ──
async function syncEnterRoom(key) {
  // Detach previous listeners
  if (SYNC.unsubscribe) { SYNC.unsubscribe(); SYNC.unsubscribe = null; }
  if (SYNC.presenceInterval) { clearInterval(SYNC.presenceInterval); SYNC.presenceInterval = null; }
  wbDeactivate();

  var room = SYNC.rooms.find(function(r){ return r.key === key; });
  if (!room) return;
  SYNC.activeRoom = room;
  SYNC.rows = []; SYNC.columns = [];

  // Update header UI
  document.getElementById('syncRoomHeaderBar').style.display = '';
  document.getElementById('syncMembersWrap').style.display = '';
  document.getElementById('syncRoomNameDisplay').textContent = room.name;
  document.getElementById('syncRoomKeyDisplay').textContent = room.key + '  📋';
  syncSetStatus('connecting');
  syncRenderRoomList();

  var uid = (typeof U !== 'undefined' && U && U.uid) ? U.uid : 'anon';

  // Presence heartbeat
  SYNC.presenceInterval = setInterval(async function() {
    try { await fbDb.collection('sync_rooms').doc(key).update({ ['members.' + uid + '.lastSeen']: Date.now() }); } catch(e) {}
  }, 15000);

  // Listen to room meta (members)
  fbDb.collection('sync_rooms').doc(key).onSnapshot(function(snap) {
    if (!snap.exists) return;
    syncRenderMembers(snap.data().members || {});
    syncSetStatus('connected');
  });

  // Launch workbook
  wbActivate();
}

// ── Status pill ──
function syncSetStatus(state) {
  var pill = document.getElementById('syncStatusPill');
  var dot  = document.getElementById('syncDotEl');
  var txt  = document.getElementById('syncStatusTxt');
  if (!pill) return;
  pill.className = 'sync-room-pill ' + (state === 'connected' ? 'connected' : state === 'connecting' ? '' : 'disconnected');
  dot.style.background = state === 'connected' ? '#15803d' : state === 'connecting' ? '#d97706' : '#dc2626';
  txt.textContent = state === 'connected' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Not connected';
  // Badge in sidebar
  var badge = document.getElementById('syncLiveDot');
  if (badge) badge.style.display = state === 'connected' ? '' : 'none';
}

// ── Render members ──
function syncRenderMembers(members) {
  var now = Date.now();
  var el = document.getElementById('syncMembersList');
  var html = '';
  Object.keys(members).forEach(function(uid) {
    var m = members[uid];
    var online = (now - (m.lastSeen || 0)) < 30000;
    var initials = (m.name || 'U').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
    html += '<div class="sync-member-row"><div class="sync-member-av">' + initials + '</div>' +
      '<span style="flex:1;font-size:.72rem">' + (m.name || uid) + '</span>' +
      '<div class="sync-member-online" style="background:' + (online ? '#22c55e' : '#d1d5db') + '"></div></div>';
  });
  el.innerHTML = html || '<div style="font-size:.7rem;color:var(--mist)">No members</div>';
}

// ── Render table ──
function syncRenderTable(highlightIds) {
  var thead = document.getElementById('syncTableHead');
  var tbody = document.getElementById('syncTableBody');
  if (!SYNC.columns.length && !SYNC.rows.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="99" style="text-align:center;padding:24px;color:var(--mist);font-size:.75rem">No data yet. Upload a file or use the quick-add bar below.</td></tr>';
    return;
  }
  // Derive columns from rows if not set
  var cols = SYNC.columns.length ? SYNC.columns : (function() {
    var keys = {};
    SYNC.rows.forEach(function(r){ Object.keys(r).forEach(function(k){ if(k !== '_id' && k !== 'pushedAt' && k !== '_pushedBy') keys[k] = 1; }); });
    return Object.keys(keys);
  })();

  thead.innerHTML = '<tr>' + cols.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '<th style="width:40px"></th></tr>';
  tbody.innerHTML = SYNC.rows.map(function(row) {
    var isNew = highlightIds && highlightIds.indexOf(row._id) !== -1;
    return '<tr class="' + (isNew ? 'sync-new-row' : '') + '">' +
      cols.map(function(c){ return '<td title="' + (row[c] || '') + '">' + (row[c] !== undefined ? row[c] : '') + '</td>'; }).join('') +
      '<td style="text-align:center"><button onclick="syncDeleteRow(\'' + row._id + '\')" style="background:none;border:none;color:var(--mist);cursor:pointer;font-size:.7rem;padding:2px 5px;border-radius:4px" title="Delete row">✕</button></td></tr>';
  }).join('');
}

function syncUpdateMeta() {
  var el = document.getElementById('syncTableMeta');
  if (el) el.textContent = SYNC.rows.length + ' row' + (SYNC.rows.length === 1 ? '' : 's') + ' · live';
}

// ── Push quick row ──
async function syncPushQuickRow() {
  if (!SYNC.activeRoom) { syncToast('Join a room first', 'err'); return; }
  var val = document.getElementById('syncQuickRow').value.trim();
  if (!val) return;
  var parts = val.split(',').map(function(s){ return s.trim(); });

  var cols = SYNC.columns.length ? SYNC.columns : parts.map(function(_, i){ return 'Col ' + (i+1); });
  var row = { pushedAt: firebase.firestore.FieldValue.serverTimestamp(), _pushedBy: (U && U.email) || 'anon' };
  cols.forEach(function(c, i){ row[c] = parts[i] !== undefined ? parts[i] : ''; });

  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).collection('rows').add(row);
    // Ensure columns are saved
    if (!SYNC.columns.length) {
      await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).update({ columns: cols });
    }
    document.getElementById('syncQuickRow').value = '';
    syncToast('Row pushed!', 'ok');
  } catch(e) { syncToast('Push failed: ' + e.message, 'err'); }
}

// ── Delete row ──
async function syncDeleteRow(rowId) {
  if (!SYNC.activeRoom) return;
  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).collection('rows').doc(rowId).delete();
  } catch(e) { syncToast('Delete failed: ' + e.message, 'err'); }
}

// ── Handle file upload (CSV / XLSX) ──
function syncHandleFileUpload(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  var ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    var reader = new FileReader();
    reader.onload = function(e) { syncPushCSVText(e.target.result, file.name); };
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var wb = XLSX.read(e.target.result, { type: 'binary' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var csv = XLSX.utils.sheet_to_csv(ws);
        syncPushCSVText(csv, file.name);
      } catch(err) { syncToast('Excel parse error: ' + err.message, 'err'); }
    };
    reader.readAsBinaryString(file);
  }
}

async function syncPushCSVText(csvText, fileName) {
  if (!SYNC.activeRoom) { syncToast('Join a room first', 'err'); return; }
  var lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) { syncToast('File is empty or has no data rows', 'err'); return; }

  var headers = lines[0].split(',').map(function(h){ return h.trim().replace(/^"|"$/g,''); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cells = lines[i].split(',').map(function(c){ return c.trim().replace(/^"|"$/g,''); });
    var row = { pushedAt: firebase.firestore.FieldValue.serverTimestamp(), _pushedBy: (U && U.email) || 'anon' };
    headers.forEach(function(h, idx){ row[h] = cells[idx] !== undefined ? cells[idx] : ''; });
    rows.push(row);
  }

  syncToast('Uploading ' + rows.length + ' rows from ' + fileName + '…', 'info');

  try {
    // Save columns
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).update({ columns: headers });

    // Batch write rows (max 500 per batch)
    var batch = fbDb.batch();
    var count = 0;
    for (var j = 0; j < rows.length; j++) {
      var ref = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).collection('rows').doc();
      batch.set(ref, rows[j]);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = fbDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
    syncToast('✓ ' + rows.length + ' rows pushed to room!', 'ok');
  } catch(e) { syncToast('Upload failed: ' + e.message, 'err'); }
}

// ── Clear all data ──
async function syncClearData() {
  if (!SYNC.activeRoom) return;
  if (!confirm('Clear ALL rows in "' + SYNC.activeRoom.name + '"? This cannot be undone.')) return;
  try {
    // Delete all rows
    var snap = await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).collection('rows').get();
    var batch = fbDb.batch();
    snap.forEach(function(doc){ batch.delete(doc.ref); });
    await batch.commit();
    // Reset columns
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).update({ columns: [] });
    syncToast('Room data cleared', 'ok');
  } catch(e) { syncToast('Clear failed: ' + e.message, 'err'); }
}

// ── Leave room ──
function syncLeaveRoom() {
  if (!SYNC.activeRoom) return;
  if (!confirm('Leave room "' + SYNC.activeRoom.name + '"? You can rejoin with the key.')) return;
  if (SYNC.unsubscribe) { SYNC.unsubscribe(); SYNC.unsubscribe = null; }
  if (SYNC.presenceInterval) { clearInterval(SYNC.presenceInterval); SYNC.presenceInterval = null; }
  wbDeactivate();
  SYNC.rooms = SYNC.rooms.filter(function(r){ return r.key !== SYNC.activeRoom.key; });
  syncSaveRooms();
  SYNC.activeRoom = null;
  SYNC.rows = []; SYNC.columns = [];
  syncSetStatus('disconnected');
  document.getElementById('syncRoomHeaderBar').style.display = 'none';
  document.getElementById('syncMembersWrap').style.display = 'none';
  syncRenderRoomList();
  syncToast('Left the room', 'ok');
}

// ── Copy room key ──
function syncCopyKey() {
  if (!SYNC.activeRoom) return;
  navigator.clipboard.writeText(SYNC.activeRoom.key).then(function(){
    syncToast('Room key copied: ' + SYNC.activeRoom.key, 'ok');
  }).catch(function(){
    prompt('Copy this room key:', SYNC.activeRoom.key);
  });
}

// ── Export current sheet CSV ──
function syncExportCSV() { wbExportSheet(); }
function syncExportXLSX() { wbExportAll(); }

// ══════════════════════════════════════════
//  WORKBOOK ENGINE
// ══════════════════════════════════════════

// ── Activate workbook UI when room is entered ──
function wbActivate() {
  document.getElementById('syncEmptyState').style.display = 'none';
  document.getElementById('wbArea').style.display = 'flex';
  // Listen for sheets list
  wbListenSheets();
}

function wbDeactivate() {
  // unsubscribe all
  Object.values(WB.unsubs).forEach(function(fn){ if(fn) fn(); });
  WB.unsubs = {};
  if (WB.sheetUnsub) { WB.sheetUnsub(); WB.sheetUnsub = null; }
  WB.sheets = []; WB.activeSheetId = null; WB.rows = {};
  document.getElementById('wbArea').style.display = 'none';
  document.getElementById('syncEmptyState').style.display = '';
}

// ── Listen for sheets from Firestore ──
function wbListenSheets() {
  if (!SYNC.activeRoom) return;
  if (WB.sheetUnsub) WB.sheetUnsub();
  WB.sheetUnsub = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
    .collection('sheets').orderBy('createdAt','asc')
    .onSnapshot(function(snap) {
      WB.sheets = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        WB.sheets.push(Object.assign({ id: doc.id }, d));
        // Cache columns from Firestore
        if (d.columns && d.columns.length) WB_SHEET_COLS[doc.id] = d.columns;
      });
      // If no sheets, create Master
      if (WB.sheets.length === 0) {
        wbCreateSheet('Master', true);
        return;
      }
      wbRenderTabs();
      // Auto-select first sheet or keep active
      if (!WB.activeSheetId || !WB.sheets.find(function(s){ return s.id === WB.activeSheetId; })) {
        wbSwitchSheet(WB.sheets[0].id);
      }
    });
}

// ── Create a sheet ──
async function wbCreateSheet(name, isMaster, initialRows, customCols) {
  if (!SYNC.activeRoom) return;
  try {
    var ref = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key).collection('sheets').doc();
    var defaultCols = customCols && customCols.length ? customCols : ['Name','Email','Phone','Gender','Department'];
    var INITIAL_ROWS = isMaster ? 0 : Math.min(5000, Math.max(1, initialRows || 20));
    await ref.set({
      name: name || 'Sheet',
      isMaster: !!isMaster,
      columns: isMaster ? [] : defaultCols,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Pre-populate the requested number of empty rows
    if (!isMaster && INITIAL_ROWS > 0) {
      var BATCH_SIZE = 400;
      var now = Date.now();
      for (var bStart = 0; bStart < INITIAL_ROWS; bStart += BATCH_SIZE) {
        var batch = fbDb.batch();
        var bEnd = Math.min(bStart + BATCH_SIZE, INITIAL_ROWS);
        for (var r = bStart; r < bEnd; r++) {
          var rowRef = ref.collection('rows').doc();
          var row = { _order: now + r, pushedAt: firebase.firestore.FieldValue.serverTimestamp(), _pushedBy: (U && U.email) || 'anon' };
          defaultCols.forEach(function(c){ row[c] = ''; });
          batch.set(rowRef, row);
        }
        await batch.commit();
      }
    }
    syncToast('Sheet "' + name + '" created with ' + INITIAL_ROWS + ' rows × ' + defaultCols.length + ' cols', 'ok');
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Column preset definitions ──
var WB_COL_PRESETS = {
  default:  ['Name','Email','Phone','Gender','Department'],
  basic:    ['Name','Email'],
  extended: ['Name','Email','Phone','DOB','Course','Year','City']
};

function wbGetPresetCols() {
  var preset = document.getElementById('wbNewSheetColPreset').value;
  if (preset === 'custom') {
    var raw = document.getElementById('wbCustomCols').value;
    var cols = raw.split(',').map(function(c){ return c.trim(); }).filter(Boolean);
    return cols.length ? cols : WB_COL_PRESETS['default'];
  }
  return WB_COL_PRESETS[preset] || WB_COL_PRESETS['default'];
}

function wbUpdateColPreview() {
  var preset = document.getElementById('wbNewSheetColPreset').value;
  var customWrap = document.getElementById('wbCustomColsWrap');
  customWrap.style.display = preset === 'custom' ? 'block' : 'none';
  wbUpdateSheetPreview();
}

function wbUpdateSheetPreview() {
  var rows = parseInt(document.getElementById('wbNewSheetRows').value) || 20;
  var cols = wbGetPresetCols();
  var tip = document.getElementById('wbColPreviewTip');
  var prev = document.getElementById('wbSheetPreviewText');
  if (tip) tip.textContent = cols.length + ' column' + (cols.length === 1 ? '' : 's');
  if (prev) prev.textContent = rows + ' row' + (rows === 1 ? '' : 's') + ' · ' + cols.length + ' column' + (cols.length === 1 ? '' : 's') + ' (' + cols.slice(0,4).join(', ') + (cols.length > 4 ? ', …' : '') + ')';
}

// ── Prompt user to add a college sheet ──
function wbPromptAddSheet() {
  document.getElementById('wbNewSheetName').value = '';
  document.getElementById('wbNewSheetRows').value = '20';
  document.getElementById('wbNewSheetColPreset').value = 'default';
  document.getElementById('wbCustomColsWrap').style.display = 'none';
  document.getElementById('wbCustomCols').value = '';
  wbUpdateSheetPreview();
  document.getElementById('wbAddSheetModal').classList.add('show');
  setTimeout(function(){ document.getElementById('wbNewSheetName').focus(); }, 100);
}

async function wbConfirmAddSheet() {
  var name = document.getElementById('wbNewSheetName').value.trim();
  if (!name) { syncToast('Enter a college name', 'err'); return; }
  var rows = Math.min(5000, Math.max(1, parseInt(document.getElementById('wbNewSheetRows').value) || 20));
  var cols  = wbGetPresetCols();
  document.getElementById('wbAddSheetModal').classList.remove('show');
  await wbCreateSheet(name, false, rows, cols);
}

// ── Delete a sheet ──
async function wbDeleteSheet(sheetId) {
  var sheet = WB.sheets.find(function(s){ return s.id === sheetId; });
  if (!sheet) return;
  if (sheet.isMaster) { syncToast('Cannot delete the Master sheet', 'err'); return; }
  if (!confirm('Delete sheet "' + sheet.name + '" and all its data?')) return;
  try {
    // Delete all rows first
    var snap = await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).collection('rows').get();
    var batch = fbDb.batch();
    snap.forEach(function(doc){ batch.delete(doc.ref); });
    await batch.commit();
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).delete();
    syncToast('Sheet deleted', 'ok');
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Switch active sheet ──
function wbSwitchSheet(sheetId) {
  WB.activeSheetId = sheetId;
  wbRenderTabs();
  // Unsubscribe previous rows listener if different sheet
  if (!WB.unsubs[sheetId]) {
    wbListenRows(sheetId);
  } else {
    wbRenderGrid();
  }
}

// ── Listen for rows in a sheet ──
function wbListenRows(sheetId) {
  if (!SYNC.activeRoom) return;
  if (WB.unsubs[sheetId]) WB.unsubs[sheetId]();
  WB.unsubs[sheetId] = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
    .collection('sheets').doc(sheetId).collection('rows')
    .orderBy('_order','asc')
    .onSnapshot(function(snap) {
      var rows = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        rows.push(d);
      });
      WB.rows[sheetId] = rows;
      if (WB.activeSheetId === sheetId) wbRenderGrid();
    }, function(err) {
      // If no _order index, fall back without ordering
      if (WB.unsubs[sheetId]) WB.unsubs[sheetId]();
      WB.unsubs[sheetId] = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
        .collection('sheets').doc(sheetId).collection('rows')
        .onSnapshot(function(snap2) {
          var rows2 = [];
          snap2.forEach(function(doc) {
            var d = doc.data(); d._id = doc.id; rows2.push(d);
          });
          WB.rows[sheetId] = rows2;
          if (WB.activeSheetId === sheetId) wbRenderGrid();
        });
    });
}

// ── Render sheet tabs ──
function wbRenderTabs() {
  var list = document.getElementById('wbTabsList');
  if (!list) return;
  list.innerHTML = '';
  WB.sheets.forEach(function(sheet) {
    var isActive = sheet.id === WB.activeSheetId;
    var div = document.createElement('div');
    div.className = 'wb-tab' + (isActive ? ' active' : '') + (sheet.isMaster ? ' wb-tab-master' : '');
    div.onclick = function(e) {
      if (!e.target.classList.contains('wb-tab-x')) wbSwitchSheet(sheet.id);
    };
    div.innerHTML = (sheet.isMaster
      ? '🗂 ' + wbEsc(sheet.name) + ' <span class="wb-master-tag">MASTER</span>'
      : '🏫 ' + wbEsc(sheet.name)) +
      (!sheet.isMaster ? '<button class="wb-tab-x" onclick="wbDeleteSheet(\'' + sheet.id + '\')" title="Delete sheet">✕</button>' : '');
    list.appendChild(div);
  });

  // Update toolbar title
  var active = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  var el = document.getElementById('wbToolbarTitle');
  if (el && active) el.textContent = active.isMaster ? 'Master View (all colleges)' : active.name;
}

// ── Get columns for a sheet ──
function wbGetCols(sheetId) {
  if (WB_SHEET_COLS[sheetId] && WB_SHEET_COLS[sheetId].length) return WB_SHEET_COLS[sheetId];
  var sheet = WB.sheets.find(function(s){ return s.id === sheetId; });
  if (sheet && sheet.columns && sheet.columns.length) {
    WB_SHEET_COLS[sheetId] = sheet.columns;
    return sheet.columns;
  }
  var rows = WB.rows[sheetId] || [];
  if (rows.length) {
    var keys = {};
    rows.forEach(function(r){ Object.keys(r).forEach(function(k){ if(k[0]!=='_' && k!=='pushedAt') keys[k]=1; }); });
    var derived = Object.keys(keys);
    if (derived.length) { WB_SHEET_COLS[sheetId] = derived; return derived; }
  }
  WB_SHEET_COLS[sheetId] = WB_COLS.slice();
  return WB_SHEET_COLS[sheetId];
}

// ── Render the spreadsheet grid ──
function wbRenderGrid() {
  // Don't blow away the DOM while the user is actively typing — wait for blur
  if (_wbEditing) return;
  var head = document.getElementById('wbGridHead');
  var body = document.getElementById('wbGridBody');
  var meta = document.getElementById('wbToolbarMeta');
  if (!head || !body) return;
  var sheetId = WB.activeSheetId;
  var rows = (WB.rows[sheetId] || []);
  var sheet = WB.sheets.find(function(s){ return s.id === sheetId; });
  var isMaster = sheet && sheet.isMaster;

  if (isMaster) {
    rows = [];
    WB.sheets.forEach(function(s) {
      if (!s.isMaster && WB.rows[s.id]) {
        (WB.rows[s.id] || []).forEach(function(r) {
          rows.push(Object.assign({}, r, { _college: s.name }));
        });
        if (!WB.unsubs[s.id]) wbListenRows(s.id);
      }
    });
  }

  var cols = isMaster ? ['Name','Email','Phone','Gender','Department','College'] : wbGetCols(sheetId);

  // Render header with column menu
  head.innerHTML = '<tr><th class="wb-num-col">#</th>' +
    cols.map(function(c, ci) {
      if (isMaster || c === 'College') return '<th>' + wbEsc(c) + '</th>';
      return '<th><div class="wb-col-th">' +
        '<span class="wb-col-th-name">' + wbEsc(c) + '</span>' +
        '<button class="wb-col-menu-btn" data-ci="' + ci + '" data-col="' + wbEsc(c) + '" onclick="wbShowColMenuBtn(event,this)" title="Column options">&#9660;</button>' +
        '</div></th>';
    }).join('') +
    (!isMaster ? '<th class="wb-add-col-th" onclick="wbPromptAddCol()" title="Add column">+</th>' : '<th class="wb-del-col"></th>') +
    '</tr>';

  // Render rows with formatting
  var fmt = WB_FMT[sheetId] || {};
  var html = '';
  rows.forEach(function(row, i) {
    var rowFmt = fmt[row._id] || {};
    html += '<tr data-rid="' + wbEsc(row._id || '') + '">';
    html += '<td class="wb-num-td">' + (i+1) + '</td>';
    cols.forEach(function(col) {
      var cf = rowFmt[col] || {};
      var tdCls = '';
      if (cf.bg) tdCls += ' fmt-bg-' + cf.bg;
      if (cf.important) tdCls += ' fmt-imp';
      var inCls = 'wb-cell-in';
      if (cf.bold) inCls += ' fmt-bold';
      if (cf.italic) inCls += ' fmt-italic';
      if (col === 'College') {
        html += '<td><input class="wb-cell-in" value="' + wbEsc(row._college || '') + '" readonly style="color:var(--mist);background:var(--snow)" tabindex="-1"></td>';
      } else {
        var val = row[col] !== undefined ? row[col] : '';
        html += '<td class="' + tdCls + '" data-col="' + wbEsc(col) + '" data-rid="' + wbEsc(row._id || '') + '"' +
          ' onmousedown="wbCellMouseDown(event,this)" onmouseenter="wbCellMouseEnter(this)">' +
          '<input class="' + inCls + '" value="' + wbEsc(val) + '"' +
          (isMaster ? ' readonly style="cursor:default"' : ' onfocus="wbCellFocus(this)" onblur="wbCellBlur(this)"') +
          ' data-col="' + wbEsc(col) + '" tabindex="0"></td>';
      }
    });
    html += '<td class="wb-del-td">' + (isMaster ? '' : '<button class="wb-del-btn" onclick="wbDeleteRow(this)" title="Delete row">x</button>') + '</td>';
    html += '</tr>';
  });

  // Show placeholder rows if no data
  if (!rows.length && !isMaster) {
    for (var ei = 0; ei < 5; ei++) {
      html += '<tr><td class="wb-num-td">' + (ei+1) + '</td>';
      cols.forEach(function(col) {
        html += '<td data-col="' + wbEsc(col) + '" onmousedown="wbCellMouseDown(event,this)" onmouseenter="wbCellMouseEnter(this)"><input class="wb-cell-in" tabindex="0" data-col="' + wbEsc(col) + '" onfocus="wbCellFocus(this)" onblur="wbCellBlur(this)"></td>';
      });
      html += '<td class="wb-del-td"></td></tr>';
    }
  } else if (!rows.length && isMaster) {
    html = '<tr><td colspan="' + (cols.length + 2) + '" style="padding:24px;text-align:center;color:var(--mist);font-size:.8rem">No data yet. Add college sheets and fill them in.</td></tr>';
  }

  body.innerHTML = html;
  if (meta) meta.textContent = rows.length + ' row' + (rows.length !== 1 ? 's' : '') + (isMaster ? ' total' : ' · ' + (sheet ? sheet.name : ''));

  var addBtn = document.querySelector('.wb-add-row-btn');
  if (addBtn) addBtn.style.display = isMaster ? 'none' : '';

  wbLoadFmt(sheetId);
}
// ══════════════════════════════════════════
//  EXCEL-LIKE MULTI-SELECT + COPY/PASTE
// ══════════════════════════════════════════

var WB_SEL = {
  active: false,
  startRow: -1, startCol: -1,   // anchor cell indices (row index in tbody, col index)
  endRow: -1,   endCol: -1,     // end of drag/shift selection
  mouseDown: false
};

// Highlight selected cells
function wbApplySelection() {
  var tbody = document.getElementById('wbGridBody');
  if (!tbody) return;
  var r1 = Math.min(WB_SEL.startRow, WB_SEL.endRow);
  var r2 = Math.max(WB_SEL.startRow, WB_SEL.endRow);
  var c1 = Math.min(WB_SEL.startCol, WB_SEL.endCol);
  var c2 = Math.max(WB_SEL.startCol, WB_SEL.endCol);
  // Only clear previously selected cells (don't iterate all rows)
  tbody.querySelectorAll('td.wb-sel').forEach(function(td){ td.classList.remove('wb-sel'); });
  var rows = tbody.querySelectorAll('tr');
  for (var ri = r1; ri <= r2; ri++) {
    var tr = rows[ri]; if (!tr) break;
    var cells = Array.from(tr.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
    for (var ci = c1; ci <= c2; ci++) {
      if (cells[ci]) cells[ci].classList.add('wb-sel');
    }
  }
}

function wbClearSelection() {
  document.querySelectorAll('#wbGridBody td.wb-sel').forEach(function(td){ td.classList.remove('wb-sel'); });
  WB_SEL.active = false; WB_SEL.startRow=-1; WB_SEL.startCol=-1; WB_SEL.endRow=-1; WB_SEL.endCol=-1;
}

function wbGetCellIndices(td) {
  var tr = td.closest('tr');
  var tbody = document.getElementById('wbGridBody');
  if (!tr || !tbody) return null;
  var rows = Array.from(tbody.querySelectorAll('tr'));
  var ri = rows.indexOf(tr);
  var cells = Array.from(tr.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
  var ci = cells.indexOf(td);
  return { ri: ri, ci: ci };
}

// Called from cell mousedown
function wbCellMouseDown(e, td) {
  if (e.button !== 0) return;
  var idx = wbGetCellIndices(td);
  if (!idx) return;
  if (e.shiftKey && WB_SEL.active) {
    // Extend selection
    WB_SEL.endRow = idx.ri; WB_SEL.endCol = idx.ci;
  } else {
    WB_SEL.active = true;
    WB_SEL.startRow = idx.ri; WB_SEL.startCol = idx.ci;
    WB_SEL.endRow   = idx.ri; WB_SEL.endCol   = idx.ci;
  }
  WB_SEL.mouseDown = true;
  wbApplySelection();
  wbUpdateSelectionInfo();
}

function wbCellMouseEnter(td) {
  if (!WB_SEL.mouseDown) return;
  var idx = wbGetCellIndices(td);
  if (!idx) return;
  WB_SEL.endRow = idx.ri; WB_SEL.endCol = idx.ci;
  wbApplySelection();
  wbUpdateSelectionInfo();
}

document.addEventListener('mouseup', function() { WB_SEL.mouseDown = false; });

// Show selection count + delete button in toolbar
function wbUpdateSelectionInfo() {
  var el = document.getElementById('wbSelInfo');
  var delBtn = document.getElementById('wbDelSelBtn');
  if (!el) return;
  if (!WB_SEL.active || WB_SEL.startRow < 0) {
    el.textContent = '';
    if (delBtn) delBtn.style.display = 'none';
    return;
  }
  var numRows = Math.abs(WB_SEL.endRow - WB_SEL.startRow) + 1;
  var numCols = Math.abs(WB_SEL.endCol - WB_SEL.startCol) + 1;
  el.textContent = numRows + 'R x ' + numCols + 'C selected';
  if (delBtn) {
    var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
    delBtn.style.display = (sheet && sheet.isMaster) ? 'none' : '';
    delBtn.textContent = 'Delete ' + numRows + ' row' + (numRows > 1 ? 's' : '');
  }
}

// Delete all selected rows from Firestore
async function wbDeleteSelectedRows() {
  if (!WB_SEL.active || WB_SEL.startRow < 0) { syncToast('Select rows first', 'err'); return; }
  if (!SYNC.activeRoom || !WB.activeSheetId) return;
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Master sheet is read-only', 'err'); return; }
  var tbody = document.getElementById('wbGridBody');
  if (!tbody) return;
  var r1 = Math.min(WB_SEL.startRow, WB_SEL.endRow);
  var r2 = Math.max(WB_SEL.startRow, WB_SEL.endRow);
  var numRows = r2 - r1 + 1;
  if (!confirm('Delete ' + numRows + ' selected row' + (numRows > 1 ? 's' : '') + '? This cannot be undone.')) return;
  var trows = tbody.querySelectorAll('tr');
  var rowIds = [];
  for (var ri = r1; ri <= r2; ri++) {
    var tr = trows[ri]; if (!tr) continue;
    var rid = tr.getAttribute('data-rid');
    if (rid) rowIds.push(rid);
  }
  if (!rowIds.length) { syncToast('No rows to delete', 'err'); return; }
  try {
    var batch = fbDb.batch(); var cnt = 0;
    rowIds.forEach(function(rowId) {
      batch.delete(fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
        .collection('sheets').doc(WB.activeSheetId).collection('rows').doc(rowId));
      cnt++;
      if (cnt === 400) { batch.commit(); batch = fbDb.batch(); cnt = 0; }
    });
    if (cnt > 0) await batch.commit();
    wbClearSelection();
    var delBtn = document.getElementById('wbDelSelBtn');
    if (delBtn) delBtn.style.display = 'none';
    syncToast('Deleted ' + rowIds.length + ' row' + (rowIds.length > 1 ? 's' : ''), 'ok');
  } catch(e) { syncToast('Delete failed: ' + e.message, 'err'); }
}

// Copy selected cells (Ctrl+C)
function wbCopySelection() {
  if (!WB_SEL.active || WB_SEL.startRow < 0) return false;
  var tbody = document.getElementById('wbGridBody');
  if (!tbody) return false;
  var r1 = Math.min(WB_SEL.startRow, WB_SEL.endRow);
  var r2 = Math.max(WB_SEL.startRow, WB_SEL.endRow);
  var c1 = Math.min(WB_SEL.startCol, WB_SEL.endCol);
  var c2 = Math.max(WB_SEL.startCol, WB_SEL.endCol);
  var rows = tbody.querySelectorAll('tr');
  var lines = [];
  for (var ri = r1; ri <= r2; ri++) {
    var tr = rows[ri]; if (!tr) continue;
    var cells = Array.from(tr.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
    var vals = [];
    for (var ci = c1; ci <= c2; ci++) {
      var td = cells[ci];
      var inp = td && td.querySelector('.wb-cell-in');
      vals.push(inp ? inp.value : '');
    }
    lines.push(vals.join('\t'));
  }
  var text = lines.join('\n');
  navigator.clipboard.writeText(text).catch(function() {
    // Fallback
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.top='-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  syncToast('✓ Copied ' + (r2-r1+1) + ' row(s) × ' + (c2-c1+1) + ' col(s)', 'ok');
  return true;
}

// Paste into selected range (Ctrl+V)
async function wbPasteSelection(text) {
  if (!SYNC.activeRoom || !WB.activeSheetId) return;
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Master is read-only', 'err'); return; }
  var tbody = document.getElementById('wbGridBody');
  if (!tbody) return;
  var r1 = WB_SEL.active && WB_SEL.startRow >= 0 ? Math.min(WB_SEL.startRow, WB_SEL.endRow) : 0;
  var c1 = WB_SEL.active && WB_SEL.startCol >= 0 ? Math.min(WB_SEL.startCol, WB_SEL.endCol) : 0;
  var pasteRows = text.split('\n').map(function(l){ return l.split('\t'); });
  var trows = tbody.querySelectorAll('tr');
  var cols = wbGetCols(WB.activeSheetId);
  var updates = [];
  pasteRows.forEach(function(prow, pri) {
    var tr = trows[r1 + pri]; if (!tr) return;
    var rowId = tr.getAttribute('data-rid'); if (!rowId) return;
    var update = { _editedAt: firebase.firestore.FieldValue.serverTimestamp(),
      _editedBy: (typeof U !== 'undefined' && U && U.email) ? U.email : 'anon' };
    prow.forEach(function(val, pci) {
      var colIdx = c1 + pci;
      var col = cols[colIdx]; if (!col) return;
      update[col] = val;
      // Also update DOM immediately for snappiness
      var cells = Array.from(tr.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
      var td = cells[colIdx];
      var inp = td && td.querySelector('.wb-cell-in');
      if (inp) inp.value = val;
    });
    updates.push({ rowId: rowId, update: update });
  });
  // Write to Firestore in batches
  var batch = fbDb.batch();
  var cnt = 0;
  for (var i = 0; i < updates.length; i++) {
    var ref = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(WB.activeSheetId).collection('rows').doc(updates[i].rowId);
    batch.update(ref, updates[i].update);
    cnt++;
    if (cnt === 400) { await batch.commit(); batch = fbDb.batch(); cnt = 0; }
  }
  if (cnt > 0) await batch.commit();
  syncToast('✓ Pasted ' + pasteRows.length + ' row(s)', 'ok');
}

// Global keyboard handler for the grid
document.addEventListener('keydown', function(e) {
  var gridWrap = document.getElementById('wbGridWrap') || document.querySelector('.wb-grid-wrap');
  if (!gridWrap) return;
  // Only intercept when focus is inside the grid
  var active = document.activeElement;
  var inGrid = active && (active.classList.contains('wb-cell-in') || gridWrap.contains(active));
  if (!inGrid) return;

  // Ctrl+C — copy
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (wbCopySelection()) e.preventDefault();
    return;
  }
  // Ctrl+V — paste
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault();
    navigator.clipboard.readText().then(function(text) { wbPasteSelection(text); }).catch(function(){});
    return;
  }
  // Escape -- clear selection
  if (e.key === 'Escape') { wbClearSelection(); wbUpdateSelectionInfo(); return; }
  // Ctrl+Delete -- delete selected rows
  if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wbDeleteSelectedRows(); return; }

  // Arrow key navigation (only when NOT editing text inside input)
  var isInput = active && active.classList.contains('wb-cell-in');
  if (!isInput) return;

  var td = active.closest('td');
  var tr = active.closest('tr');
  if (!td || !tr) return;
  var idx = wbGetCellIndices(td);
  if (!idx) return;

  var moved = false;
  var rows = document.querySelectorAll('#wbGridBody tr');
  var cells = Array.from(tr.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
  var colIdx = cells.indexOf(td);

  function focusCell(ri, ci) {
    var targetRow = rows[ri]; if (!targetRow) return false;
    var targetCells = Array.from(targetRow.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)'));
    var targetTd = targetCells[ci]; if (!targetTd) return false;
    var inp = targetTd.querySelector('.wb-cell-in'); if (!inp) return false;
    inp.focus(); inp.select();
    if (e.shiftKey) {
      WB_SEL.endRow = ri; WB_SEL.endCol = ci;
    } else {
      WB_SEL.active = true;
      WB_SEL.startRow = ri; WB_SEL.startCol = ci;
      WB_SEL.endRow = ri;   WB_SEL.endCol = ci;
    }
    wbApplySelection(); wbUpdateSelectionInfo();
    return true;
  }

  if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
    e.preventDefault();
    if (!focusCell(idx.ri + 1, idx.ci) && e.key === 'Enter') wbAddRow();
    moved = true;
  } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
    e.preventDefault();
    focusCell(Math.max(0, idx.ri - 1), idx.ci);
    moved = true;
  } else if (e.key === 'ArrowRight' || e.key === 'Tab' && !e.shiftKey) {
    if (e.key === 'Tab') e.preventDefault();
    focusCell(idx.ri, idx.ci + 1) || focusCell(idx.ri + 1, 0);
    moved = true;
  } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    if (e.key === 'Tab') e.preventDefault();
    if (idx.ci > 0) { focusCell(idx.ri, idx.ci - 1); }
    else if (idx.ri > 0) {
      var prevRow = rows[idx.ri - 1];
      var prevCells = prevRow ? Array.from(prevRow.querySelectorAll('td:not(.wb-num-td):not(.wb-del-td)')) : [];
      focusCell(idx.ri - 1, prevCells.length - 1);
    }
    moved = true;
  }
});

// ── Cell focus tracking ──
function wbCellFocus(input) {
  _wbEditing = true;
  var td = input.closest('td');
  var tr = input.closest('tr');
  if (!td || !tr) return;
  WB_FOCUS = {
    sheetId: WB.activeSheetId,
    rowId: tr.getAttribute('data-rid'),
    col: input.getAttribute('data-col'),
    td: td,
    input: input
  };
  // Single-click focus updates selection anchor (if not extending)
  var idx = wbGetCellIndices(td);
  if (idx && !WB_SEL.mouseDown) {
    WB_SEL.active = true;
    WB_SEL.startRow = idx.ri; WB_SEL.startCol = idx.ci;
    WB_SEL.endRow   = idx.ri; WB_SEL.endCol   = idx.ci;
    wbApplySelection(); wbUpdateSelectionInfo();
  }
}

// ── Cell editing ──
// Debounce timer map: rowId+col -> timer
var _wbSaveTimers = {};
// Track if any cell is currently focused (suppress live re-renders while editing)
var _wbEditing = false;

function wbCellBlur(input) {
  _wbEditing = false;
  var tr = input.closest('tr');
  if (!tr) return;
  var rowId = tr.getAttribute('data-rid');
  var col = input.getAttribute('data-col');
  var val = input.value;
  if (!rowId || !col || !SYNC.activeRoom || !WB.activeSheetId) return;
  // Debounce: clear any pending save for this cell
  var key = rowId + '|' + col;
  if (_wbSaveTimers[key]) { clearTimeout(_wbSaveTimers[key]); delete _wbSaveTimers[key]; }
  // Save to Firestore (immediate on blur is fine — blur is not frequent)
  var update = {};
  update[col] = val;
  update._editedAt = firebase.firestore.FieldValue.serverTimestamp();
  update._editedBy = (typeof U !== 'undefined' && U && U.email) ? U.email : 'anon';
  fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
    .collection('sheets').doc(WB.activeSheetId)
    .collection('rows').doc(rowId)
    .update(update)
    .catch(function(e){ syncToast('Save error: ' + e.message, 'err'); });
}

function wbCellKeydown(e, input) {
  // Handled by global keydown listener above
  // Keep this stub so existing onkeydown= attributes don't break
}

// ── Add empty row ──
async function wbAddRow() {
  if (!SYNC.activeRoom || !WB.activeSheetId) { syncToast('No sheet selected', 'err'); return; }
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Master is read-only. Edit college sheets.', 'err'); return; }
  try {
    var shCols = wbGetCols(WB.activeSheetId);
    var row = { _order: Date.now(), pushedAt: firebase.firestore.FieldValue.serverTimestamp(),
      _pushedBy: (typeof U !== 'undefined' && U && U.email) ? U.email : 'anon' };
    shCols.forEach(function(c){ row[c] = ''; });
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(WB.activeSheetId).collection('rows').add(row);
    // Focus the new row Name cell
    setTimeout(function() {
      var rows = document.querySelectorAll('#wbGridBody tr');
      if (rows.length) {
        var last = rows[rows.length - 1];
        var inp = last.querySelector('.wb-cell-in');
        if (inp) { inp.focus(); inp.select(); }
      }
    }, 300);
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Delete row ──
async function wbDeleteRow(btn) {
  var tr = btn.closest('tr');
  if (!tr || !SYNC.activeRoom || !WB.activeSheetId) return;
  var rowId = tr.getAttribute('data-rid');
  if (!rowId) return;
  if (!confirm('Delete this row?')) return;
  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(WB.activeSheetId).collection('rows').doc(rowId).delete();
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Clear all rows in active sheet ──
async function wbClearSheet() {
  if (!SYNC.activeRoom || !WB.activeSheetId) return;
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Master sheet cannot be cleared directly.', 'err'); return; }
  if (!confirm('Clear all rows in "' + (sheet ? sheet.name : 'this sheet') + '"?')) return;
  try {
    var snap = await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(WB.activeSheetId).collection('rows').get();
    var batch = fbDb.batch();
    snap.forEach(function(doc){ batch.delete(doc.ref); });
    await batch.commit();
    syncToast('Sheet cleared', 'ok');
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Import CSV/Excel into active sheet ──
function wbImportFile(input) {
  var file = input.files[0]; if (!file) return;
  if (!SYNC.activeRoom || !WB.activeSheetId) { syncToast('Select a sheet first', 'err'); return; }
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Cannot import into Master. Choose a college sheet.', 'err'); input.value=''; return; }
  var isCsv = file.name.toLowerCase().endsWith('.csv');
  var reader = new FileReader();
  if (isCsv) {
    reader.onload = function(e) { wbImportCSVText(e.target.result, file.name); };
    reader.readAsText(file);
  } else {
    reader.onload = function(e) {
      try {
        var wb2 = XLSX.read(e.target.result, { type:'array' });
        var ws = wb2.Sheets[wb2.SheetNames[0]];
        var data = XLSX.utils.sheet_to_json(ws, { defval:'' });
        if (!data.length) { syncToast('No data found in file', 'err'); return; }
        wbImportRows(data, file.name);
      } catch(err) { syncToast('Parse error: ' + err.message, 'err'); }
    };
    reader.readAsArrayBuffer(file);
  }
  input.value = '';
}

async function wbImportCSVText(csvText, fileName) {
  var lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) { syncToast('File is empty or has no data', 'err'); return; }
  var headers = lines[0].split(',').map(function(h){ return h.trim().replace(/^"|"$/g,'').replace(/^\uFEFF/,''); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cells = lines[i].split(',').map(function(c){ return c.trim().replace(/^"|"$/g,''); });
    var obj = {};
    headers.forEach(function(h, idx){ obj[h] = cells[idx] !== undefined ? cells[idx] : ''; });
    rows.push(obj);
  }
  await wbImportRows(rows, fileName);
}

async function wbImportRows(rawRows, fileName) {
  var headers = Object.keys(rawRows[0] || {});
  var sheetId = WB.activeSheetId;
  WB_SHEET_COLS[sheetId] = headers;
  syncToast('Clearing sheet & importing ' + rawRows.length + ' rows...', 'info');
  try {
    // Step 1: Delete ALL existing rows first (fixes empty rows before imported data)
    var existingSnap = await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).collection('rows').get();
    if (!existingSnap.empty) {
      var delBatch = fbDb.batch(); var delCnt = 0;
      existingSnap.forEach(function(doc) {
        delBatch.delete(doc.ref); delCnt++;
        if (delCnt === 400) { delBatch.commit(); delBatch = fbDb.batch(); delCnt = 0; }
      });
      if (delCnt > 0) await delBatch.commit();
    }
    // Step 2: Save columns
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).update({ columns: headers });
    // Step 3: Insert imported rows cleanly from row 1
    var batch = fbDb.batch(); var count = 0; var now = Date.now();
    for (var j = 0; j < rawRows.length; j++) {
      var r = rawRows[j];
      var row = { _order: now + j, pushedAt: firebase.firestore.FieldValue.serverTimestamp(), _pushedBy: (typeof U !== 'undefined' && U && U.email) ? U.email : 'anon' };
      headers.forEach(function(h){ row[h] = (r[h] !== undefined ? String(r[h]) : '').trim(); });
      var ref = fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
        .collection('sheets').doc(sheetId).collection('rows').doc();
      batch.set(ref, row); count++;
      if (count === 400) { await batch.commit(); batch = fbDb.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
    syncToast('Imported ' + rawRows.length + ' rows!', 'ok');
  } catch(e) { syncToast('Import failed: ' + e.message, 'err'); }
}

// ── Download empty template CSV ──
function wbDownloadTemplate() {
  var cols = WB.activeSheetId ? wbGetCols(WB.activeSheetId) : WB_COLS;
  var csv = cols.join(',') + '\n' +
    ',,,,\n,,,,\n,,,,';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = 'nova_data_template.csv';
  a.click();
  syncToast('Template downloaded — fill and import per college sheet', 'ok');
}

// ── Export active sheet to CSV ──
function wbExportSheet() {
  var sheetId = WB.activeSheetId;
  var sheet = WB.sheets.find(function(s){ return s.id === sheetId; });
  var rows = WB.rows[sheetId] || [];
  var isMaster = sheet && sheet.isMaster;
  if (isMaster) { wbExportAll(); return; }
  if (!rows.length) { syncToast('No data to export', 'err'); return; }
  var cols = wbGetCols(sheetId);
  var csv = cols.join(',') + '\n' + rows.map(function(r){
    return cols.map(function(c){ return '"' + (r[c]||'').replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = (sheet ? sheet.name : 'sheet') + '.csv';
  a.click();
  syncToast('Exported ' + rows.length + ' rows', 'ok');
}

// ── Export all sheets as multi-tab Excel ──
function wbExportAll() {
  if (!WB.sheets.length) { syncToast('No sheets to export', 'err'); return; }
  try {
    var wbx = XLSX.utils.book_new();
    var hasData = false;
    WB.sheets.forEach(function(sheet) {
      var rows = WB.rows[sheet.id] || [];
      var cols = wbGetCols(sheet.id);
      var aoa = [cols].concat(rows.map(function(r){ return cols.map(function(c){ return r[c]||''; }); }));
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var shName = (sheet.name || 'Sheet').replace(/[\[\]:*?\/\\]/g,'').slice(0,31);
      XLSX.utils.book_append_sheet(wbx, ws, shName);
      if (rows.length) hasData = true;
    });
    if (!hasData) { syncToast('No data to export yet', 'err'); return; }
    XLSX.writeFile(wbx, (SYNC.activeRoom ? SYNC.activeRoom.name : 'workbook') + '.xlsx');
    syncToast('All sheets exported as Excel ✓', 'ok');
  } catch(e) { syncToast('Export failed: ' + e.message, 'err'); }
}

// ── Add Column prompt ──
function wbPromptAddCol() {
  var sheet = WB.sheets.find(function(s){ return s.id === WB.activeSheetId; });
  if (sheet && sheet.isMaster) { syncToast('Cannot add columns to Master sheet', 'err'); return; }
  document.getElementById('wbNewColName').value = '';
  document.getElementById('wbAddColModal').classList.add('show');
  setTimeout(function(){ document.getElementById('wbNewColName').focus(); }, 100);
}

async function wbConfirmAddCol() {
  var name = document.getElementById('wbNewColName').value.trim();
  if (!name) { syncToast('Enter a column name', 'err'); return; }
  document.getElementById('wbAddColModal').classList.remove('show');
  var sheetId = WB.activeSheetId;
  if (!sheetId || !SYNC.activeRoom) return;
  var cols = wbGetCols(sheetId);
  if (cols.indexOf(name) !== -1) { syncToast('Column "' + name + '" already exists', 'err'); return; }
  var newCols = cols.concat([name]);
  WB_SHEET_COLS[sheetId] = newCols;
  // Save to Firestore
  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).update({ columns: newCols });
    // Add field to all existing rows
    var rows = WB.rows[sheetId] || [];
    if (rows.length) {
      var batch = fbDb.batch();
      rows.forEach(function(r) {
        if (r._id) {
          var update = {}; update[name] = '';
          batch.update(fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
            .collection('sheets').doc(sheetId).collection('rows').doc(r._id), update);
        }
      });
      await batch.commit();
    }
    syncToast('Column "' + name + '" added', 'ok');
    wbRenderGrid();
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── Column header dropdown menu ──
function wbShowColMenuBtn(e, btn) {
  var ci = parseInt(btn.getAttribute('data-ci'));
  var col = btn.getAttribute('data-col');
  wbShowColMenu(e, ci, col);
}

function wbShowColMenu(e, colIdx, colName) {
  e.stopPropagation();
  var existing = document.getElementById('wbColDropdown');
  if (existing) existing.remove();

  var dd = document.createElement('div');
  dd.id = 'wbColDropdown';
  dd.className = 'wb-col-dropdown';
  dd.setAttribute('data-ci', colIdx);
  dd.setAttribute('data-col', colName);

  var renameItem = document.createElement('div');
  renameItem.className = 'wb-col-dd-item';
  renameItem.textContent = 'Rename column';
  renameItem.onclick = function() { dd.remove(); wbRenameCol(colIdx, colName); };

  var sep = document.createElement('div');
  sep.className = 'wb-col-dd-sep';

  var deleteItem = document.createElement('div');
  deleteItem.className = 'wb-col-dd-item danger';
  deleteItem.textContent = 'Delete column';
  deleteItem.onclick = function() { dd.remove(); wbDeleteCol(colIdx, colName); };

  dd.appendChild(renameItem);
  dd.appendChild(sep);
  dd.appendChild(deleteItem);
  document.body.appendChild(dd);

  var rect = e.target.getBoundingClientRect();
  dd.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';
  dd.style.top = (rect.bottom + 4) + 'px';

  setTimeout(function() {
    document.addEventListener('click', function close(ev) {
      if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

async function wbRenameCol(colIdx, colName) {
  var dd = document.getElementById('wbColDropdown'); if (dd) dd.remove();
  var newName = prompt('Rename column "' + colName + '" to:', colName);
  if (!newName || !newName.trim() || newName.trim() === colName) return;
  newName = newName.trim();
  var sheetId = WB.activeSheetId;
  var cols = wbGetCols(sheetId).slice();
  cols[colIdx] = newName;
  WB_SHEET_COLS[sheetId] = cols;
  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).update({ columns: cols });
    // Rename field in all rows
    var rows = WB.rows[sheetId] || [];
    if (rows.length) {
      var batch = fbDb.batch();
      rows.forEach(function(r) {
        if (r._id) {
          var update = {}; update[newName] = r[colName] || ''; update[colName] = firebase.firestore.FieldValue.delete();
          batch.update(fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
            .collection('sheets').doc(sheetId).collection('rows').doc(r._id), update);
        }
      });
      await batch.commit();
    }
    syncToast('Column renamed to "' + newName + '"', 'ok');
    wbRenderGrid();
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

async function wbDeleteCol(colIdx, colName) {
  var dd = document.getElementById('wbColDropdown'); if (dd) dd.remove();
  if (!confirm('Delete column "' + colName + '"? All data in this column will be lost.')) return;
  var sheetId = WB.activeSheetId;
  var cols = wbGetCols(sheetId).slice();
  if (cols.length <= 1) { syncToast('Cannot delete the only column', 'err'); return; }
  cols.splice(colIdx, 1);
  WB_SHEET_COLS[sheetId] = cols;
  try {
    await fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
      .collection('sheets').doc(sheetId).update({ columns: cols });
    var rows = WB.rows[sheetId] || [];
    if (rows.length) {
      var batch = fbDb.batch();
      rows.forEach(function(r) {
        if (r._id) {
          var update = {}; update[colName] = firebase.firestore.FieldValue.delete();
          batch.update(fbDb.collection('sync_rooms').doc(SYNC.activeRoom.key)
            .collection('sheets').doc(sheetId).collection('rows').doc(r._id), update);
        }
      });
      await batch.commit();
    }
    syncToast('Column "' + colName + '" deleted', 'ok');
    wbRenderGrid();
  } catch(e) { syncToast('Error: ' + e.message, 'err'); }
}

// ── FORMATTING ENGINE ──
// Stores in localStorage keyed by room+sheet
function wbFmtKey(sheetId) {
  return 'wbfmt_' + (SYNC.activeRoom ? SYNC.activeRoom.key : 'x') + '_' + sheetId;
}

function wbSaveFmt(sheetId) {
  try { localStorage.setItem(wbFmtKey(sheetId), JSON.stringify(WB_FMT[sheetId] || {})); } catch(e) {}
}

function wbLoadFmt(sheetId) {
  try {
    var raw = localStorage.getItem(wbFmtKey(sheetId));
    if (raw) WB_FMT[sheetId] = JSON.parse(raw);
    // Apply to DOM
    wbApplyFmtToDom(sheetId);
  } catch(e) {}
}

function wbApplyFmtToDom(sheetId) {
  var fmt = WB_FMT[sheetId] || {};
  Object.keys(fmt).forEach(function(rowId) {
    var rowFmt = fmt[rowId];
    Object.keys(rowFmt).forEach(function(col) {
      var cf = rowFmt[col];
      // Find the td
      var tr = document.querySelector('#wbGridBody tr[data-rid="' + rowId + '"]');
      if (!tr) return;
      var td = tr.querySelector('td[data-col="' + col + '"]');
      if (!td) return;
      var inp = td.querySelector('.wb-cell-in');
      // Apply classes
      td.className = td.className.replace(/fmt-bg-\w+|fmt-imp/g, '').trim();
      if (cf.bg) td.classList.add('fmt-bg-' + cf.bg);
      if (cf.important) td.classList.add('fmt-imp');
      if (inp) {
        inp.className = inp.className.replace(/fmt-bold|fmt-italic/g, '').trim();
        if (cf.bold) inp.classList.add('fmt-bold');
        if (cf.italic) inp.classList.add('fmt-italic');
      }
    });
  });
}

function wbGetFocusTd() {
  // Get the currently focused td or the last focused cell
  if (WB_FOCUS && WB_FOCUS.td && document.body.contains(WB_FOCUS.td)) return WB_FOCUS;
  // Fallback: find focused input
  var active = document.activeElement;
  if (active && active.classList.contains('wb-cell-in')) {
    var td = active.closest('td');
    var tr = active.closest('tr');
    if (td && tr) return { sheetId: WB.activeSheetId, rowId: tr.getAttribute('data-rid'), col: active.getAttribute('data-col'), td: td, input: active };
  }
  return null;
}

function wbFmt(type) {
  var f = WB_FOCUS || wbGetFocusTd();
  if (!f || !f.rowId || !f.col) { syncToast('Click a cell first', 'err'); return; }
  var sheetId = f.sheetId || WB.activeSheetId;
  if (!WB_FMT[sheetId]) WB_FMT[sheetId] = {};
  if (!WB_FMT[sheetId][f.rowId]) WB_FMT[sheetId][f.rowId] = {};
  var cf = WB_FMT[sheetId][f.rowId][f.col] || {};
  if (type === 'bold') cf.bold = !cf.bold;
  if (type === 'italic') cf.italic = !cf.italic;
  if (type === 'important') cf.important = !cf.important;
  WB_FMT[sheetId][f.rowId][f.col] = cf;
  wbSaveFmt(sheetId);
  // Apply to DOM immediately
  var td = f.td;
  var inp = f.input;
  if (type === 'bold' && inp) { inp.classList.toggle('fmt-bold', !!cf.bold); }
  if (type === 'italic' && inp) { inp.classList.toggle('fmt-italic', !!cf.italic); }
  if (type === 'important') {
    td.classList.toggle('fmt-imp', !!cf.important);
    document.getElementById('fmtImp') && document.getElementById('fmtImp').classList.toggle('active', !!cf.important);
  }
  if (inp) inp.focus();
}

function wbFmtBg(color) {
  var f = WB_FOCUS || wbGetFocusTd();
  if (!f || !f.rowId || !f.col) { syncToast('Click a cell first', 'err'); return; }
  var sheetId = f.sheetId || WB.activeSheetId;
  if (!WB_FMT[sheetId]) WB_FMT[sheetId] = {};
  if (!WB_FMT[sheetId][f.rowId]) WB_FMT[sheetId][f.rowId] = {};
  var cf = WB_FMT[sheetId][f.rowId][f.col] || {};
  cf.bg = color || '';
  WB_FMT[sheetId][f.rowId][f.col] = cf;
  wbSaveFmt(sheetId);
  // Apply to td
  var td = f.td;
  td.className = td.className.replace(/fmt-bg-\w+/g, '').trim();
  if (color) td.classList.add('fmt-bg-' + color);
  if (f.input) f.input.focus();
}

function wbFmtClear() {
  var f = WB_FOCUS || wbGetFocusTd();
  if (!f || !f.rowId || !f.col) { syncToast('Click a cell first', 'err'); return; }
  var sheetId = f.sheetId || WB.activeSheetId;
  if (WB_FMT[sheetId] && WB_FMT[sheetId][f.rowId]) {
    delete WB_FMT[sheetId][f.rowId][f.col];
  }
  wbSaveFmt(sheetId);
  var td = f.td;
  var inp = f.input;
  td.className = td.className.replace(/fmt-bg-\w+|fmt-imp/g, '').trim();
  if (inp) {
    inp.className = inp.className.replace(/fmt-bold|fmt-italic/g, '').trim();
    inp.focus();
  }
}

function wbEsc(str) {
  return (str||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
