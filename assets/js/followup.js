// ══════════════════════════════════════════════════════════════════
//  NOVA STUDIO — Followup Tracker  (v3.0)
//  College data-collection tracker with Google Drive integration
// ══════════════════════════════════════════════════════════════════
//
//  NEW in v3.0:
//    • Add Subfolder button on every college card — creates a real Drive
//      subfolder inside the college's folder (e.g. tiss → TISS → Photos)
//    • Subfolder file preview — clicking any subfolder pill in the panel
//      opens a full file list with inline preview (images, PDF, video)
//    • Live tracking — no manual refresh needed; Drive is polled every 15 s
//      AND Firestore onSnapshot fires instantly on any Firestore change;
//      a 🟢 live indicator pulses on the card whenever new files arrive
//
//  Firestore collections:
//    followup_sessions/{userEmail}/sessions/{sessionId}
//      { name, masterFolderId, masterFolderUrl, createdAt }
//    followup_sessions/{userEmail}/sessions/{sessionId}/colleges/{collegeId}
//      { name, folderId, folderUrl, shareLink, status, lastUpload,
//        fileCount, subfolders:[{id,name,url}], createdAt }
//    followup_notifications/{userEmail}/items/{docId}
//      { sessionId, collegeId, collegeName, fileName, ts, read }
//
//  Public API:
//    FU.init()     — called after auth
//    FU.openView() — called when navigating to followup view
// ══════════════════════════════════════════════════════════════════

var FU = (function () {
  'use strict';

  // ─── state ────────────────────────────────────────────────────────
  var _sessions   = [];
  var _curSession = null;
  var _colleges   = [];
  var _unsubCols  = null;
  var _unsubNotif = null;
  var _unreadFU   = 0;
  var _driveToken = null;
  var _pollInterval   = null;
  var _liveActivity   = {};  // collegeId → timestamp of last detected change
  // Subfolder live tracker: { collegeId: { sfId: { imageCount, dataCount, dataFileNames[], totalCount, lastUpload } } }
  var _subfolderState = {};

  // ─── helpers ──────────────────────────────────────────────────────
  function _uid() {
    var u = (typeof U !== 'undefined' && U) ? U : (window.U || null);
    var email = (u && u.email) ? String(u.email).trim() : '';
    return email || null;
  }
  function _requireUid() {
    var uid = _uid();
    if (!uid) throw new Error('Not logged in. Please refresh and log in again.');
    return uid;
  }
  function _sCol() {
    return fbDb.collection('followup_sessions').doc(_requireUid()).collection('sessions');
  }
  function _cCol(sid) {
    return fbDb.collection('followup_sessions').doc(_requireUid()).collection('sessions').doc(sid).collection('colleges');
  }
  function _nCol() {
    return fbDb.collection('followup_notifications').doc(_requireUid()).collection('items');
  }
  function _driveHdr() {
    var tok = _driveToken || window.NOVA_DRIVE_TOKEN ||
              (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
    return tok ? { 'Authorization': 'Bearer ' + tok } : null;
  }
  function _fmt(ts) {
    if (!ts) return '—';
    var d = new Date(ts), now = Date.now(), diff = now - ts;
    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  }
  function _fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function _esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'ok');
    else console.log('[FU]', msg);
  }
  function _extractFolderId(url) {
    var m = (url||'').match(/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }
  function _makeFolderUrl(id) {
    return 'https://drive.google.com/drive/folders/' + id;
  }

  // ─── Drive API helpers ────────────────────────────────────────────
  async function _driveCreateSubfolder(parentId, name) {
    var hdr = _driveHdr();
    if (!hdr) throw new Error('Not connected to Google Drive. Please log in with Google first.');
    var res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, hdr),
      body: JSON.stringify({
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    if (!res.ok) {
      var err = await res.json().catch(function(){ return {}; });
      throw new Error((err.error && err.error.message) || 'Drive API error ' + res.status);
    }
    return await res.json();
  }

  async function _driveShareFolderAnyone(folderId) {
    var hdr = _driveHdr();
    if (!hdr) throw new Error('Not connected to Google Drive.');
    var res = await fetch('https://www.googleapis.com/drive/v3/files/' + folderId + '/permissions', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, hdr),
      body: JSON.stringify({ role: 'writer', type: 'anyone' })
    });
    if (!res.ok) {
      var err = await res.json().catch(function(){ return {}; });
      throw new Error((err.error && err.error.message) || 'Permission error ' + res.status);
    }
    return _makeFolderUrl(folderId);
  }

  async function _driveListFiles(folderId) {
    var hdr = _driveHdr();
    if (!hdr) return [];
    var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
    var res = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,createdTime,mimeType,size,webViewLink,webContentLink,thumbnailLink)&orderBy=createdTime%20desc&pageSize=100',
      { headers: hdr }
    );
    if (!res.ok) return [];
    var data = await res.json();
    return data.files || [];
  }

  async function _driveGetFolderMeta(folderId) {
    var hdr = _driveHdr();
    if (!hdr) return null;
    var res = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + folderId + '?fields=id,name,createdTime',
      { headers: hdr }
    );
    if (!res.ok) return null;
    return await res.json();
  }

  async function _driveDeleteFile(fileId) {
    var hdr = _driveHdr();
    if (!hdr) throw new Error('Not connected to Google Drive.');
    var res = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
      method: 'DELETE',
      headers: hdr
    });
    if (res.status !== 204 && !res.ok) {
      throw new Error('Drive delete error ' + res.status);
    }
  }

  // ─── File type helpers ────────────────────────────────────────────
  function _isImage(mimeType) {
    return mimeType && mimeType.startsWith('image/');
  }

  // ─── Subfolder Live Tracker ───────────────────────────────────────
  // Scans ALL registered subfolders of a college for new files.
  // Differentiates images (photos) vs data files.
  // Updates _subfolderState[col.id][sf.id] and fires notifications on change.
  async function _scanSubfoldersForCollege(col, sessionId) {
    if (!col.folderId) return false;
    var subfolders = col.subfolders || [];
    if (subfolders.length === 0) return false;

    var changed = false;
    if (!_subfolderState[col.id]) _subfolderState[col.id] = {};

    for (var i = 0; i < subfolders.length; i++) {
      var sf = subfolders[i];
      if (!sf.id) continue;
      try {
        var files = await _driveListFiles(sf.id);
        var actualFiles = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });
        var images    = actualFiles.filter(function(f){ return _isImage(f.mimeType); });
        var dataFiles = actualFiles.filter(function(f){ return !_isImage(f.mimeType); });

        var prev = _subfolderState[col.id][sf.id] || { totalCount: -1, imageCount: 0, dataCount: 0, dataFileNames: [] };
        var newTotal = actualFiles.length;

        if (prev.totalCount === -1) {
          // First scan — just record state, no notification (avoid spamming on page load)
          _subfolderState[col.id][sf.id] = {
            totalCount:    newTotal,
            imageCount:    images.length,
            dataCount:     dataFiles.length,
            dataFileNames: dataFiles.slice(0, 5).map(function(f){ return f.name; }),
            lastUpload:    actualFiles.length > 0 ? new Date(actualFiles[0].createdTime).getTime() : null
          };
          if (newTotal > 0) changed = true;
          continue;
        }

        if (newTotal > prev.totalCount) {
          var newlyAddedCount = newTotal - prev.totalCount;
          var newImages    = images.length    - (prev.imageCount || 0);
          var newDataFiles = dataFiles.length - (prev.dataCount  || 0);

          // Notification: photos
          if (newImages > 0) {
            _pushNotification(sessionId || (_curSession && _curSession.id), col, null, {
              type:       'photo',
              subfolder:  sf.name,
              count:      images.length,
              newCount:   newImages
            });
            _liveActivity[col.id] = Date.now();
          }
          // Notification: data files (list up to 3 names)
          if (newDataFiles > 0) {
            var addedDataNames = [];
            dataFiles.forEach(function(f) {
              if ((prev.dataFileNames || []).indexOf(f.name) === -1) addedDataNames.push(f.name);
            });
            _pushNotification(sessionId || (_curSession && _curSession.id), col, null, {
              type:        'data',
              subfolder:   sf.name,
              count:       dataFiles.length,
              newCount:    newDataFiles,
              newNames:    addedDataNames.slice(0, 3)
            });
            _liveActivity[col.id] = Date.now();
          }

          changed = true;
        }

        // Always update state
        _subfolderState[col.id][sf.id] = {
          totalCount:    newTotal,
          imageCount:    images.length,
          dataCount:     dataFiles.length,
          dataFileNames: dataFiles.slice(0, 5).map(function(f){ return f.name; }),
          lastUpload:    actualFiles.length > 0 ? new Date(actualFiles[0].createdTime).getTime() : null
        };

        // Update college status in Firestore if files appeared
        if (newTotal > 0 && col.status !== 'uploaded') {
          var updates = { status: 'uploaded', lastUpload: _subfolderState[col.id][sf.id].lastUpload };
          _cCol(sessionId || (_curSession && _curSession.id)).doc(col.id).update(updates).catch(function(){});
          col.status     = 'uploaded';
          col.lastUpload = updates.lastUpload;
        }

      } catch(e) { console.warn('[FU] scanSf', sf.name, e); }
    }
    return changed;
  }

  // ─── Firestore operations ─────────────────────────────────────────
  async function _loadSessions() {
    if (!_uid()) { _sessions = []; return; }
    try {
      var snap = await _sCol().orderBy('createdAt', 'desc').limit(20).get();
      _sessions = snap.docs.map(function(d){ var o = d.data(); o.id = d.id; return o; });
    } catch(e) {
      console.warn('[FU] loadSessions error', e);
      _sessions = [];
    }
  }

  async function _saveSession(session) {
    var ref = _sCol().doc(session.id);
    await ref.set({
      name: session.name,
      masterFolderId: session.masterFolderId,
      masterFolderUrl: session.masterFolderUrl,
      createdAt: session.createdAt || Date.now()
    }, { merge: true });
  }

  async function _saveCollege(sessionId, college) {
    var ref = _cCol(sessionId).doc(college.id);
    await ref.set({
      name:        college.name,
      folderId:    college.folderId,
      folderUrl:   college.folderUrl,
      shareLink:   college.shareLink  || '',
      status:      college.status     || 'pending',
      lastUpload:  college.lastUpload || null,
      fileCount:   college.fileCount  || 0,
      subfolders:  college.subfolders || [],
      createdAt:   college.createdAt  || Date.now()
    }, { merge: true });
  }

  // ─── Real-time colleges listener ─────────────────────────────────
  function _subscribeColleges(sessionId) {
    if (_unsubCols) _unsubCols();
    _unsubCols = _cCol(sessionId)
      .orderBy('createdAt', 'asc')
      .onSnapshot(async function(snap) {
        var prev = {};
        _colleges.forEach(function(c){ prev[c.id] = c.fileCount || 0; });
        _colleges = snap.docs.map(function(d){ var o = d.data(); o.id = d.id; return o; });

        _colleges = await Promise.all(_colleges.map(async function(col) {
          if (!col.folderId) return col;
          try {
            var files = await _driveListFiles(col.folderId);
            // Filter out subfolders from file count
            var actualFiles = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });
            var newCount = actualFiles.length;
            var oldCount = prev[col.id] !== undefined ? prev[col.id] : col.fileCount;
            if (newCount > oldCount && oldCount !== undefined && prev[col.id] !== undefined) {
              var newFiles = actualFiles.slice(0, newCount - oldCount);
              newFiles.forEach(function(f) {
                _pushNotification(sessionId, col, f.name || 'Unknown file', { type: 'file' });
              });
              _liveActivity[col.id] = Date.now(); // pulse indicator
            }
            if (newCount !== col.fileCount) {
              var updates = { fileCount: newCount, status: newCount > 0 ? 'uploaded' : 'pending' };
              if (newCount > 0 && actualFiles[0]) updates.lastUpload = new Date(actualFiles[0].createdTime).getTime();
              _cCol(sessionId).doc(col.id).update(updates).catch(function(){});
              col.fileCount = newCount;
              if (updates.status)     col.status     = updates.status;
              if (updates.lastUpload) col.lastUpload = updates.lastUpload;
            }
            // Also scan subfolders for live tracking
            await _scanSubfoldersForCollege(col, sessionId);
          } catch(e) {}
          return col;
        }));

        _renderCollegeList();
        _renderStats();
      }, function(e){ console.warn('[FU] college snap', e); });
  }

  // ─── Notifications ────────────────────────────────────────────────
  // opts: { type:'photo'|'data'|'file', subfolder, count, newCount, newNames, fileName }
  async function _pushNotification(sessionId, college, fileName, opts) {
    if (!sessionId || !college) return;
    opts = opts || {};

    // Build human-readable title + body
    var title, body, notifType;
    var sfPrefix = opts.subfolder ? ' → ' + opts.subfolder : '';

    if (opts.type === 'photo') {
      notifType = 'followup_photo';
      title = '📸 ' + college.name + sfPrefix;
      body  = opts.count + ' photo' + (opts.count !== 1 ? 's' : '') + ' uploaded' +
              (opts.newCount > 0 ? ' (+' + opts.newCount + ' new)' : '');
    } else if (opts.type === 'data') {
      notifType = 'followup_data';
      title = '📄 ' + college.name + sfPrefix;
      var nameList = (opts.newNames && opts.newNames.length)
        ? opts.newNames.join(', ') + (opts.count > opts.newNames.length ? ' +more' : '')
        : opts.count + ' file' + (opts.count !== 1 ? 's' : '');
      body = nameList + ' uploaded (' + opts.count + ' total)';
    } else {
      notifType = 'followup';
      title = '📂 ' + college.name + ' uploaded data';
      body  = fileName || 'New file uploaded';
    }

    try {
      await _nCol().add({
        sessionId:   sessionId,
        collegeId:   college.id,
        collegeName: college.name,
        subfolder:   opts.subfolder || null,
        notifType:   notifType,
        fileName:    fileName || (opts.newNames && opts.newNames[0]) || null,
        fileCount:   opts.count || null,
        ts:          Date.now(),
        read:        false
      });
      if (typeof NV !== 'undefined' && NV.pushToUser) {
        await NV.pushToUser(_uid(), {
          type:  notifType,
          title: title,
          body:  body,
          link:  'followup'
        });
      }
    } catch(e) { console.warn('[FU] pushNotification', e); }
  }

  function _subscribeNotifications() {
    if (!_uid()) return;
    if (_unsubNotif) _unsubNotif();
    _unsubNotif = _nCol()
      .where('read', '==', false)
      .onSnapshot(function(snap) {
        _unreadFU = snap.size;
        _updateNotifBadge();
      }, function(e){ console.warn('[FU] notif snap', e); });
  }

  function _updateNotifBadge() {
    var badge = document.getElementById('fuNotifBadge');
    if (badge) {
      badge.textContent = _unreadFU > 0 ? (_unreadFU > 9 ? '9+' : _unreadFU) : '';
      badge.style.display = _unreadFU > 0 ? 'flex' : 'none';
    }
    var sb = document.getElementById('sbFollowup');
    if (sb) {
      var existing = sb.querySelector('.sb-bx.fu-live');
      if (_unreadFU > 0) {
        if (!existing) {
          var bx = document.createElement('span');
          bx.className = 'sb-bx fu-live';
          bx.style.background = '#ef4444';
          bx.textContent = _unreadFU > 9 ? '9+' : _unreadFU;
          sb.appendChild(bx);
        } else {
          existing.textContent = _unreadFU > 9 ? '9+' : _unreadFU;
        }
      } else {
        if (existing) existing.remove();
      }
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  function _renderSessionList() {
    var el = document.getElementById('fuSessionList');
    if (!el) return;
    if (_sessions.length === 0) {
      el.innerHTML = '<div class="fu-empty">No sessions yet. Create your first tracking session above ↑</div>';
      return;
    }
    el.innerHTML = _sessions.map(function(s) {
      return '<div class="fu-session-card" onclick="FU._openSession(\'' + s.id + '\')">' +
        '<div class="fu-sc-icon">📋</div>' +
        '<div class="fu-sc-info">' +
          '<div class="fu-sc-name">' + _esc(s.name) + '</div>' +
          '<div class="fu-sc-sub">Created ' + _fmt(s.createdAt) + '</div>' +
        '</div>' +
        '<button class="fu-btn fu-btn-delete fu-sc-del-btn" title="Delete session" onclick="FU._deleteSession(\'' + s.id + '\',\'' + _esc(s.name) + '\',event)">🗑 Delete</button>' +
        '<div class="fu-sc-arrow">›</div>' +
      '</div>';
    }).join('');
  }

  // ─── Bulk Report Download ────────────────────────────────────────
  var _bulkSelected = new Set(); // set of college IDs currently checked

  function _renderBulkToolbar() {
    var wrap = document.getElementById('fuBulkToolbar');
    if (!wrap) return;
    var total = _colleges.length;
    var selectedCount = _bulkSelected.size;

    wrap.innerHTML =
      '<div class="fu-bulk-bar" style="background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<div class="fu-bulk-search-row">' +
          '<input id="fuBulkSearch" class="fu-bulk-search" type="text" placeholder="🔍 Type college name to filter…" oninput="FU._onBulkSearch(this.value)" autocomplete="off" style="flex:1;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:.82rem;background:#ffffff;color:#111111;outline:none;-webkit-text-fill-color:#111111;">' +
          '<button class="fu-bulk-selall" onclick="FU._bulkSelectAll()">' + (selectedCount === total && total > 0 ? '☑ Deselect All' : '☐ Select All') + '</button>' +
        '</div>' +
        (selectedCount > 0
          ? '<div class="fu-bulk-actions">' +
              '<span class="fu-bulk-count">' + selectedCount + ' college' + (selectedCount !== 1 ? 's' : '') + ' selected</span>' +
              '<button class="fu-bulk-dl-btn" onclick="FU._downloadBulkReport()">⬇ Download Report</button>' +
            '</div>'
          : '<div class="fu-bulk-hint" style="font-size:.74rem;color:#6b7280;">Select colleges using checkboxes, then download a combined report.</div>') +
      '</div>';
  }

  var _bulkSearchQuery = '';

  function _onBulkSearch(val) {
    _bulkSearchQuery = (val || '').trim().toLowerCase();
    _renderCollegeList();
    _renderBulkToolbar();
  }

  function _bulkSelectAll() {
    var visible = _getFilteredColleges();
    var allSelected = visible.every(function(c){ return _bulkSelected.has(c.id); });
    if (allSelected) {
      visible.forEach(function(c){ _bulkSelected.delete(c.id); });
    } else {
      visible.forEach(function(c){ _bulkSelected.add(c.id); });
    }
    _renderCollegeList();
    _renderBulkToolbar();
  }

  function _toggleBulkSelect(collegeId) {
    if (_bulkSelected.has(collegeId)) {
      _bulkSelected.delete(collegeId);
    } else {
      _bulkSelected.add(collegeId);
    }
    _renderBulkToolbar();
    // Just update the checkbox UI without full re-render
    var cb = document.getElementById('fuChk_' + collegeId);
    if (cb) cb.checked = _bulkSelected.has(collegeId);
    var card = document.getElementById('fuCol_' + collegeId);
    if (card) card.classList.toggle('fu-col-selected', _bulkSelected.has(collegeId));
  }

  function _getFilteredColleges() {
    var q = _bulkSearchQuery;
    var list = q
      ? _colleges.filter(function(c){ return (c.name || '').toLowerCase().indexOf(q) !== -1; })
      : _colleges.slice();
    // Alphabetical sort by name
    list.sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });
    return list;
  }

  function _downloadBulkReport() {
    var selected = _colleges.filter(function(c){ return _bulkSelected.has(c.id); });
    if (!selected.length) { _toast('No colleges selected', 'error'); return; }

    // Sort alphabetically
    selected.sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });

    // Build CSV
    var rows = [['College Name','Status','File Count','Last Upload','Subfolders','Drive Folder Link','Share Link']];
    selected.forEach(function(c) {
      var status = c.status || 'pending';
      var subs = (c.subfolders || []).map(function(s){ return s.name; }).join('; ');
      var lastUp = c.lastUpload ? new Date(c.lastUpload).toLocaleString() : '—';
      rows.push([
        c.name || '',
        status,
        c.fileCount || 0,
        lastUp,
        subs || '—',
        c.folderUrl ? 'https://drive.google.com/drive/folders/' + c.folderId : (c.folderId ? 'https://drive.google.com/drive/folders/' + c.folderId : '—'),
        c.shareLink || '—'
      ]);
    });

    var sessionName = (_curSession && _curSession.name) ? _curSession.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'session';
    var dateStr = new Date().toISOString().slice(0, 10);
    var fileName = 'FollowUp_Report_' + sessionName + '_' + dateStr + '.csv';

    // Encode as CSV
    var csvContent = rows.map(function(r) {
      return r.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    _toast('Report downloaded: ' + fileName, 'ok');
  }

  function _renderCollegeList() {
    var el = document.getElementById('fuCollegeList');
    if (!el) return;
    var filtered = _getFilteredColleges();
    if (_colleges.length === 0) {
      el.innerHTML = '<div class="fu-empty">No colleges added yet. Use the form above to add colleges and generate Drive folders.</div>';
      _renderBulkToolbar();
      return;
    }
    if (filtered.length === 0) {
      el.innerHTML = '<div class="fu-empty">No colleges match "<strong>' + _esc(_bulkSearchQuery) + '</strong>". Try a different name.</div>';
      _renderBulkToolbar();
      return;
    }
    el.innerHTML = filtered.map(function(c) {
      var status      = c.status || 'pending';
      var statusLabel = status === 'uploaded' ? '✅ Uploaded' : (status === 'pending' ? '⏳ Pending' : '⚠️ ' + status);
      var statusCls   = status === 'uploaded' ? 'fu-s-up' : (status === 'pending' ? 'fu-s-pend' : 'fu-s-warn');

      // Subfolders pills with live tracker breakdown
      var subfolders  = c.subfolders || [];
      var colSfState  = _subfolderState[c.id] || {};
      var sfHtml = '';
      if (subfolders.length) {
        sfHtml = '<div class="fu-subfolder-list">' +
          subfolders.map(function(sf) {
            var sfSt      = colSfState[sf.id] || {};
            var hasImages = sfSt.imageCount > 0;
            var hasData   = sfSt.dataCount  > 0;
            var isActive  = _liveActivity[c.id] && (Date.now() - _liveActivity[c.id] < 10000);

            // Tracker line under pill
            var trackerLines = [];
            if (hasImages) {
              trackerLines.push('<span class="fu-sf-tracker fu-sf-photo">📸 ' + sfSt.imageCount + ' photo' + (sfSt.imageCount !== 1 ? 's' : '') + '</span>');
            }
            if (hasData) {
              var nameStr = sfSt.dataFileNames.slice(0, 2).join(', ');
              if (sfSt.dataCount > 2) nameStr += ' +' + (sfSt.dataCount - 2) + ' more';
              trackerLines.push('<span class="fu-sf-tracker fu-sf-data">📄 ' + _esc(nameStr) + '</span>');
            }
            if (!hasImages && !hasData && sfSt.totalCount !== undefined) {
              trackerLines.push('<span class="fu-sf-tracker fu-sf-empty">No files yet</span>');
            }

            return '<div class="fu-sf-wrap">' +
              '<span class="fu-sf-pill' + (isActive ? ' fu-sf-pill-pulse' : '') + '" onclick="FU._viewSubfolderFiles(\'' + c.id + '\',\'' + _esc(c.name) + '\',\'' + _esc(sf.id) + '\',\'' + _esc(sf.name) + '\')" title="Click to preview files">📁 ' + _esc(sf.name) + (sfSt.totalCount > 0 ? ' <span class="fu-sf-cnt">' + sfSt.totalCount + '</span>' : '') + ' <span style=\'font-size:.6rem;opacity:.7\'>👁</span></span>' +
              (trackerLines.length ? '<div class="fu-sf-tracker-row">' + trackerLines.join('') + '</div>' : '') +
            '</div>';
          }).join('') +
        '</div>';
      }

      // Live activity pulse
      var wasActive = _liveActivity[c.id] && (Date.now() - _liveActivity[c.id] < 10000);
      var liveDot = '<span class="fu-live-dot' + (wasActive ? ' fu-live-pulse' : '') + '" title="Live tracking active — updates automatically">🟢</span>';
      var isChecked = _bulkSelected.has(c.id);

      return '<div class="fu-college-card' + (isChecked ? ' fu-col-selected' : '') + '" id="fuCol_' + c.id + '">' +
        '<div class="fu-cc-top">' +
          '<label class="fu-bulk-chk-wrap" title="Select for bulk report" onclick="event.stopPropagation()">' +
            '<input type="checkbox" id="fuChk_' + c.id + '" class="fu-bulk-chk"' + (isChecked ? ' checked' : '') + ' onchange="FU._toggleBulkSelect(\'' + c.id + '\')">' +
            '<span class="fu-bulk-chk-box"></span>' +
          '</label>' +
          '<div class="fu-cc-icon">🏫</div>' +
          '<div class="fu-cc-info">' +
            '<div class="fu-cc-name" style="display:flex;align-items:center;gap:6px;">' + _esc(c.name) + liveDot + '</div>' +
            '<div class="fu-cc-meta">' +
              '<span class="fu-tag ' + statusCls + '">' + statusLabel + '</span>' +
              (c.fileCount > 0 ? '<span class="fu-tag fu-s-cnt">' + c.fileCount + ' file' + (c.fileCount !== 1 ? 's' : '') + '</span>' : '') +
              (c.lastUpload ? '<span class="fu-tag fu-s-time">Last: ' + _fmt(c.lastUpload) + '</span>' : '') +
              (c.folderId ? '<a class="fu-tag fu-tag-link" href="https://drive.google.com/drive/folders/' + c.folderId + '" target="_blank" title="Open Drive folder directly">↗ Drive</a>' : '') +
            '</div>' +
            sfHtml +
          '</div>' +
          // Per-card refresh button
          '<button class="fu-btn fu-btn-refresh" title="Refresh now" onclick="FU._refreshOne(\'' + c.id + '\',this)" style="margin-left:auto;flex-shrink:0;">🔄</button>' +
        '</div>' +
        '<div class="fu-cc-actions">' +
          (c.shareLink ? '<button class="fu-btn fu-btn-copy" onclick="FU._copyLink(\'' + _esc(c.shareLink) + '\',this)">📋 Copy Link</button>' : '') +
          (c.shareLink ? '<a class="fu-btn fu-btn-open" href="' + _esc(c.shareLink) + '" target="_blank">↗ Open Folder</a>' : '') +
          '<button class="fu-btn fu-btn-files" onclick="FU._viewFiles(\'' + c.id + '\',\'' + _esc(c.name) + '\',\'' + (c.folderId||'') + '\')">📄 Files</button>' +
          '<button class="fu-btn fu-btn-subfolder" onclick="FU._openSubfolderModal(\'' + c.id + '\')" title="Add subfolder inside this college folder">📁+ Subfolder</button>' +
          '<button class="fu-btn fu-btn-share" onclick="FU._shareViaEmail(\'' + _esc(c.name) + '\',\'' + _esc(c.shareLink||'') + '\')">✉️ Share</button>' +
          '<button class="fu-btn fu-btn-delete" onclick="FU._deleteCollege(\'' + c.id + '\',\'' + _esc(c.name) + '\')">🗑 Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
    _renderBulkToolbar();
  }


  function _renderStats() {
    var total    = _colleges.length;
    var uploaded = _colleges.filter(function(c){ return c.fileCount > 0; }).length;
    var pending  = total - uploaded;
    var pct      = total > 0 ? Math.round((uploaded/total)*100) : 0;

    var el = document.getElementById('fuStats');
    if (!el) return;
    el.innerHTML =
      '<div class="fu-stat"><div class="fu-stat-n">' + total + '</div><div class="fu-stat-l">Total</div></div>' +
      '<div class="fu-stat fu-s-up"><div class="fu-stat-n">' + uploaded + '</div><div class="fu-stat-l">Uploaded</div></div>' +
      '<div class="fu-stat fu-s-pend"><div class="fu-stat-n">' + pending + '</div><div class="fu-stat-l">Pending</div></div>' +
      '<div class="fu-stat-bar"><div class="fu-stat-prog" style="width:' + pct + '%"></div><span class="fu-stat-pct">' + pct + '%</span></div>';
  }

  // ─── Session Management ───────────────────────────────────────────
  async function _createSession() {
    var nameEl   = document.getElementById('fuSessionName');
    var driveEl  = document.getElementById('fuMasterDriveUrl');
    var name     = (nameEl && nameEl.value.trim()) || '';
    var driveUrl = (driveEl && driveEl.value.trim()) || '';

    if (!name)     { _toast('Enter a session name', 'error'); return; }
    if (!driveUrl) { _toast('Paste your master Drive folder link', 'error'); return; }

    var folderId = _extractFolderId(driveUrl);
    if (!folderId) { _toast('Could not extract folder ID from the Drive link. Make sure it looks like drive.google.com/drive/folders/...', 'error'); return; }

    if (!_uid()) { _toast('Not logged in. Please refresh the page.', 'error'); return; }
    var hdr = _driveHdr();
    if (!hdr) { _toast('Connect Google Drive first — log out and log back in with Google', 'error'); return; }

    var btn = document.getElementById('fuCreateSessionBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
      var meta = await _driveGetFolderMeta(folderId);
      if (!meta) throw new Error('Cannot access that Drive folder. Make sure you have access and the link is correct.');

      var id = 'sess_' + Date.now();
      var session = { id: id, name: name, masterFolderId: folderId, masterFolderUrl: driveUrl, createdAt: Date.now() };
      await _saveSession(session);
      _sessions.unshift(session);
      if (nameEl)  nameEl.value  = '';
      if (driveEl) driveEl.value = '';
      _toast('Session "' + name + '" created ✓', 'ok');
      _renderSessionList();
      _openSession(id);
    } catch(e) {
      _toast(e.message || 'Error creating session', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '+ Create Session'; }
    }
  }

  async function _openSession(id) {
    var session = _sessions.find(function(s){ return s.id === id; });
    if (!session) {
      try {
        var doc = await _sCol().doc(id).get();
        if (!doc.exists) { _toast('Session not found', 'error'); return; }
        session = doc.data(); session.id = id;
      } catch(e) { _toast('Error loading session', 'error'); return; }
    }
    _curSession = session;

    var listView   = document.getElementById('fuViewList');
    var detailView = document.getElementById('fuViewDetail');
    if (listView)   listView.style.display   = 'none';
    if (detailView) detailView.style.display = 'flex';

    var titleEl = document.getElementById('fuDetailTitle');
    if (titleEl) titleEl.textContent = session.name;
    var masterEl = document.getElementById('fuMasterLink');
    if (masterEl) { masterEl.href = session.masterFolderUrl; masterEl.textContent = '↗ Master Folder'; }

    _colleges = [];
    _liveActivity = {};
    _subfolderState = {};
    _bulkSelected.clear();
    _bulkSearchQuery = '';
    _renderCollegeList();
    _renderStats();
    _subscribeColleges(id);
    _startPoll();
  }

  function _backToList() {
    _stopPoll();
    if (_unsubCols) { _unsubCols(); _unsubCols = null; }
    _curSession = null;
    _colleges   = [];
    _liveActivity = {};
    _subfolderState = {};
    var listView   = document.getElementById('fuViewList');
    var detailView = document.getElementById('fuViewDetail');
    if (listView)   listView.style.display   = 'flex';
    if (detailView) detailView.style.display = 'none';
  }

  // ─── College Management ───────────────────────────────────────────
  async function _addCollege() {
    if (!_curSession) return;
    if (!_uid()) { _toast('Not logged in. Please refresh.', 'error'); return; }
    var nameEl = document.getElementById('fuCollegeName');
    var name   = (nameEl && nameEl.value.trim()) || '';
    if (!name) { _toast('Enter a college name', 'error'); return; }

    var hdr = _driveHdr();
    if (!hdr) { _toast('Google Drive not connected', 'error'); return; }

    var btn = document.getElementById('fuAddCollegeBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating folder…'; }

    try {
      var folder    = await _driveCreateSubfolder(_curSession.masterFolderId, name);
      var shareLink = await _driveShareFolderAnyone(folder.id);

      var id = 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      var college = {
        id: id, name: name,
        folderId:   folder.id,
        folderUrl:  _makeFolderUrl(folder.id),
        shareLink:  shareLink,
        status:     'pending',
        lastUpload: null,
        fileCount:  0,
        subfolders: [],
        createdAt:  Date.now()
      };
      await _saveCollege(_curSession.id, college);
      if (nameEl) nameEl.value = '';
      _toast('Folder created & shared for ' + name + ' ✓', 'ok');
    } catch(e) {
      _toast(e.message || 'Error adding college', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '+ Add College'; }
    }
  }

  // ─── DELETE SESSION ───────────────────────────────────────────────
  async function _deleteSession(sessionId, sessionName, event) {
    event.stopPropagation();
    if (!confirm('Delete session "' + sessionName + '"?\n\nThis will permanently remove the session and all its tracked colleges from NOVA Studio.\n\nYour Google Drive folders and files will NOT be deleted — they stay safe.')) return;
    try {
      var colSnap = await _cCol(sessionId).get();
      var batch = fbDb.batch();
      colSnap.docs.forEach(function(d){ batch.delete(d.ref); });
      batch.delete(_sCol().doc(sessionId));
      await batch.commit();
      _sessions = _sessions.filter(function(s){ return s.id !== sessionId; });
      _renderSessionList();
      _toast('"' + sessionName + '" session deleted ✓', 'ok');
    } catch(e) {
      _toast('Error deleting session: ' + (e.message || e), 'error');
    }
  }

  // ─── DELETE COLLEGE ───────────────────────────────────────────────
  async function _deleteCollege(collegeId, collegeName) {
    if (!confirm('Delete "' + collegeName + '"?\n\nThis removes the college from your tracker. The Google Drive folder will NOT be deleted (files stay safe).')) return;
    if (!_curSession) return;
    try {
      await _cCol(_curSession.id).doc(collegeId).delete();
      _colleges = _colleges.filter(function(c){ return c.id !== collegeId; });
      _renderCollegeList();
      _renderStats();
      _toast('"' + collegeName + '" removed from tracker ✓', 'ok');
    } catch(e) {
      _toast('Error deleting college: ' + (e.message || e), 'error');
    }
  }

  // ─── SUBFOLDER MANAGEMENT ─────────────────────────────────────────
  function _openSubfolderModal(collegeId) {
    var college = _colleges.find(function(c){ return c.id === collegeId; });
    if (!college) return;

    var existing = document.getElementById('fuSubfolderModal');
    if (existing) existing.remove();

    var subfolders = college.subfolders || [];
    var sfListHtml = subfolders.length
      ? subfolders.map(function(sf, idx) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--fog,#f3f4f6);">' +
            '<span style="font-size:1rem;">📁</span>' +
            '<div style="flex:1;"><div style="font-size:.82rem;font-weight:600;">' + _esc(sf.name) + '</div><div style="font-size:.68rem;color:var(--mist,#9ca3af);">Inside ' + _esc(college.name) + ' folder</div></div>' +
            '<button onclick="FU._viewSubfolderFiles(\'' + _esc(college.id) + '\',\'' + _esc(college.name) + '\',\'' + _esc(sf.id) + '\',\'' + _esc(sf.name) + '\')" style="font-size:.7rem;padding:4px 9px;border:1px solid var(--lime,#9ec000);border-radius:7px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;font-weight:700;">👁 Preview</button>' +
            '<a href="' + _esc(sf.url) + '" target="_blank" style="font-size:.7rem;color:var(--lime-d,#6d8400);font-weight:700;border:1px solid var(--lime,#9ec000);padding:4px 9px;border-radius:7px;text-decoration:none;">↗ Open</a>' +
            '<button onclick="FU._deleteSubfolder(\'' + collegeId + '\',' + idx + ')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#dc2626;font-size:.7rem;padding:4px 9px;cursor:pointer;font-weight:700;">🗑</button>' +
          '</div>';
        }).join('')
      : '<div style="font-size:.78rem;color:var(--mist,#9ca3af);padding:12px 0;text-align:center;">No subfolders yet. Create one below ↓</div>';

    var modal = document.createElement('div');
    modal.id = 'fuSubfolderModal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:9800;background:rgba(13,15,18,.6);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML =
      '<div style="background:var(--card,#fff);border-radius:18px;width:min(440px,100%);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 28px 70px rgba(0,0,0,.22);overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--fog,#e5e7eb);flex-shrink:0;">' +
          '<div>' +
            '<div style="font-size:.9rem;font-weight:800;">📁 Subfolders — ' + _esc(college.name) + '</div>' +
            '<div style="font-size:.68rem;color:var(--mist,#9ca3af);margin-top:2px;">Organise photos, data, docs inside this college folder</div>' +
          '</div>' +
          '<button onclick="document.getElementById(\'fuSubfolderModal\').remove()" style="background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:var(--mist,#9ca3af);">✕</button>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:18px 20px;">' +
          '<div style="font-size:.73rem;font-weight:700;margin-bottom:8px;color:var(--ink,#111);">Existing Subfolders</div>' +
          '<div id="fuSfList">' + sfListHtml + '</div>' +
          '<div style="margin-top:18px;padding-top:14px;border-top:1.5px solid var(--fog,#e5e7eb);">' +
            '<div style="font-size:.73rem;font-weight:700;margin-bottom:8px;color:var(--ink,#111);">➕ Create New Subfolder</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
              '<input id="fuSfName" placeholder="e.g. College Photos" style="flex:1;padding:9px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;font-size:.82rem;outline:none;font-family:inherit;" />' +
              '<button onclick="FU._createSubfolder(\'' + collegeId + '\')" style="padding:9px 16px;background:var(--ink,#111);color:#fff;border:none;border-radius:9px;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">+ Create</button>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
              ['College Photos','College Data','Documents','Certificates','Brochures'].map(function(preset) {
                return '<button onclick="document.getElementById(\'fuSfName\').value=\'' + preset + '\'" style="font-size:.7rem;padding:4px 10px;border:1.5px solid var(--fog,#e5e7eb);border-radius:20px;background:var(--fog,#f9fafb);cursor:pointer;color:var(--ink2,#374151);">' + preset + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('mousedown', function(e){ if (e.target === modal) modal.remove(); });
    document.getElementById('fuSfName').focus();
    document.getElementById('fuSfName').addEventListener('keydown', function(e){
      if (e.key === 'Enter') FU._createSubfolder(collegeId);
    });
  }

  async function _createSubfolder(collegeId) {
    var college = _colleges.find(function(c){ return c.id === collegeId; });
    if (!college || !college.folderId) return;

    var nameEl = document.getElementById('fuSfName');
    var name   = (nameEl && nameEl.value.trim()) || '';
    if (!name) { _toast('Enter a subfolder name', 'error'); return; }

    var btn = document.querySelector('#fuSubfolderModal button[onclick*="_createSubfolder"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
      var folder    = await _driveCreateSubfolder(college.folderId, name);
      var shareLink = await _driveShareFolderAnyone(folder.id);

      var sf = { id: folder.id, name: name, url: shareLink };
      var subfolders = (college.subfolders || []).concat([sf]);

      await _cCol(_curSession.id).doc(collegeId).update({ subfolders: subfolders });
      college.subfolders = subfolders;

      if (nameEl) nameEl.value = '';
      _toast('"' + name + '" subfolder created ✓', 'ok');

      // Refresh modal subfolder list
      var sfList = document.getElementById('fuSfList');
      if (sfList) {
        sfList.innerHTML = subfolders.map(function(s, idx) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--fog,#f3f4f6);">' +
            '<span style="font-size:1rem;">📁</span>' +
            '<div style="flex:1;"><div style="font-size:.82rem;font-weight:600;">' + _esc(s.name) + '</div><div style="font-size:.68rem;color:var(--mist,#9ca3af);">Inside ' + _esc(college.name) + ' folder</div></div>' +
            '<button onclick="FU._viewSubfolderFiles(\'' + _esc(college.id) + '\',\'' + _esc(college.name) + '\',\'' + _esc(s.id) + '\',\'' + _esc(s.name) + '\')" style="font-size:.7rem;padding:4px 9px;border:1px solid var(--lime,#9ec000);border-radius:7px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;font-weight:700;">👁 Preview</button>' +
            '<a href="' + _esc(s.url) + '" target="_blank" style="font-size:.7rem;color:var(--lime-d,#6d8400);font-weight:700;border:1px solid var(--lime,#9ec000);padding:4px 9px;border-radius:7px;text-decoration:none;">↗ Open</a>' +
            '<button onclick="FU._deleteSubfolder(\'' + collegeId + '\',' + idx + ')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#dc2626;font-size:.7rem;padding:4px 9px;cursor:pointer;font-weight:700;">🗑</button>' +
          '</div>';
        }).join('');
      }
      _renderCollegeList();
    } catch(e) {
      _toast(e.message || 'Error creating subfolder', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '+ Create'; }
    }
  }

  async function _deleteSubfolder(collegeId, sfIndex) {
    var college = _colleges.find(function(c){ return c.id === collegeId; });
    if (!college) return;
    var subfolders = college.subfolders || [];
    var sf = subfolders[sfIndex];
    if (!sf) return;
    if (!confirm('Remove "' + sf.name + '" subfolder from tracker?\n\nThe Drive folder will NOT be deleted.')) return;

    subfolders = subfolders.filter(function(_, i){ return i !== sfIndex; });
    try {
      await _cCol(_curSession.id).doc(collegeId).update({ subfolders: subfolders });
      college.subfolders = subfolders;
      _renderCollegeList();
      // Refresh open modal if any
      var modal = document.getElementById('fuSubfolderModal');
      if (modal) { modal.remove(); _openSubfolderModal(collegeId); }
      _toast('"' + sf.name + '" removed ✓', 'ok');
    } catch(e) {
      _toast('Error: ' + (e.message || e), 'error');
    }
  }

  // ─── Per-card manual refresh ──────────────────────────────────────
  async function _refreshOne(collegeId, btn) {
    var college = _colleges.find(function(c){ return c.id === collegeId; });
    if (!college || !college.folderId) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      var files      = await _driveListFiles(college.folderId);
      var actualFiles = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });
      var newCount   = actualFiles.length;
      var changed    = false;
      if (newCount !== college.fileCount) {
        var updates = { fileCount: newCount, status: newCount > 0 ? 'uploaded' : 'pending' };
        if (newCount > 0 && actualFiles[0]) updates.lastUpload = new Date(actualFiles[0].createdTime).getTime();
        await _cCol(_curSession.id).doc(collegeId).update(updates);
        college.fileCount = newCount;
        if (updates.status)     college.status     = updates.status;
        if (updates.lastUpload) college.lastUpload = updates.lastUpload;
        changed = true;
        _toast('Updated: ' + college.name + ' — ' + newCount + ' file(s)', 'ok');
      }
      // Also scan subfolders
      // Reset subfolder state for this college so scan re-initialises counts
      if (_subfolderState[collegeId]) {
        Object.keys(_subfolderState[collegeId]).forEach(function(sfId){
          _subfolderState[collegeId][sfId].totalCount = -1; // force re-detect
        });
      }
      var sfChanged = await _scanSubfoldersForCollege(college, _curSession.id);
      if (sfChanged) changed = true;

      if (changed) {
        _renderCollegeList();
        _renderStats();
      } else {
        _toast('No changes for ' + college.name, 'info');
      }
    } catch(e) {
      _toast('Refresh error: ' + (e.message || e), 'error');
    }
  }

  // ─── Files Modal with Preview ─────────────────────────────────────
  async function _viewFiles(collegeId, collegeName, folderId) {
    var modal   = document.getElementById('fuFilesModal');
    var titleEl = document.getElementById('fuFilesModalTitle');
    var listEl  = document.getElementById('fuFilesModalList');
    if (!modal) return;

    if (titleEl) titleEl.textContent = collegeName + ' — Files';
    if (listEl)  listEl.innerHTML = '<div class="fu-empty">Loading…</div>';

    modal.style.display = 'flex';

    // Mark notifications read for this college
    try {
      var snap = await _nCol().where('collegeId', '==', collegeId).where('read', '==', false).get();
      var batch = fbDb.batch();
      snap.docs.forEach(function(d){ batch.update(d.ref, { read: true }); });
      await batch.commit();
    } catch(e) {}

    try {
      var files = await _driveListFiles(folderId);
      // Separate folders from files
      var subDirs  = files.filter(function(f){ return f.mimeType === 'application/vnd.google-apps.folder'; });
      var fileList = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });

      if (files.length === 0) {
        if (listEl) listEl.innerHTML = '<div class="fu-empty">No files uploaded yet.</div>';
        return;
      }

      // Add a refresh button inside modal
      var refreshHtml = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">' +
        '<button onclick="FU._viewFiles(\'' + collegeId + '\',\'' + _esc(collegeName) + '\',\'' + folderId + '\')" style="font-size:.72rem;padding:5px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:var(--fog,#f9fafb);cursor:pointer;">🔄 Refresh</button>' +
        '<span style="font-size:.68rem;color:var(--mist,#9ca3af);align-self:center;margin-left:8px;">' + fileList.length + ' file(s)' + (subDirs.length ? ', ' + subDirs.length + ' subfolder(s)' : '') + '</span>' +
      '</div>';

      var html = refreshHtml;

      // Subfolders section — clickable to preview uploads inside
      if (subDirs.length) {
        html += '<div style="font-size:.73rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">📁 Subfolders <span style="font-size:.65rem;color:var(--mist,#9ca3af);font-weight:400;">(click to preview uploads inside)</span></div>';
        html += subDirs.map(function(f) {
          return '<div class="fu-file-row" style="background:var(--fog,#f9fafb);cursor:pointer;" onclick="FU._viewSubfolderFiles(\'' + _esc(collegeId) + '\',\'' + _esc(collegeName) + '\',\'' + _esc(f.id) + '\',\'' + _esc(f.name) + '\')">' +
            '<span class="fu-file-icon">📁</span>' +
            '<div class="fu-file-info">' +
              '<div class="fu-file-name">' + _esc(f.name) + '</div>' +
              '<div class="fu-file-meta" style="color:var(--lime-d,#6d8400);font-size:.68rem;">Click to view & preview uploaded files</div>' +
            '</div>' +
            '<button onclick="event.stopPropagation();FU._viewSubfolderFiles(\'' + _esc(collegeId) + '\',\'' + _esc(collegeName) + '\',\'' + _esc(f.id) + '\',\'' + _esc(f.name) + '\')" style="font-size:.7rem;padding:4px 9px;border:1px solid var(--lime,#9ec000);border-radius:7px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;font-weight:700;margin-right:4px;">👁 Preview</button>' +
            '<a class="fu-btn fu-btn-open" href="' + _esc(f.webViewLink || _makeFolderUrl(f.id)) + '" target="_blank" onclick="event.stopPropagation()">↗</a>' +
          '</div>';
        }).join('');
        html += '<div style="margin:10px 0;border-top:1.5px solid var(--fog,#e5e7eb);"></div>';
      }

      // Files section
      if (fileList.length) {
        html += '<div style="font-size:.73rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">📄 Files</div>';
        html += fileList.map(function(f) {
          var icon  = _fileIcon(f.mimeType);
          var size  = f.size ? _fmtSize(parseInt(f.size)) : '—';
          var canPreview = f.mimeType && (
            f.mimeType.startsWith('image/') ||
            f.mimeType === 'application/pdf' ||
            f.mimeType.startsWith('video/')
          );
          var previewBtn = canPreview
            ? '<button onclick="FU._previewFile(\'' + _esc(f.id) + '\',\'' + _esc(f.name) + '\',\'' + _esc(f.mimeType) + '\',\'' + _esc(f.thumbnailLink||'') + '\')" style="font-size:.7rem;padding:4px 8px;border:1px solid var(--lime,#9ec000);border-radius:7px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;font-weight:700;margin-right:4px;">👁 Preview</button>'
            : '';
          return '<div class="fu-file-row">' +
            '<span class="fu-file-icon">' + icon + '</span>' +
            '<div class="fu-file-info">' +
              '<div class="fu-file-name">' + _esc(f.name) + '</div>' +
              '<div class="fu-file-meta">' + size + ' · ' + _fmtDate(new Date(f.createdTime).getTime()) + '</div>' +
            '</div>' +
            previewBtn +
            '<a class="fu-btn fu-btn-open" href="https://drive.google.com/file/d/' + f.id + '/view" target="_blank">↗</a>' +
          '</div>';
        }).join('');
      }

      if (listEl) listEl.innerHTML = html;
    } catch(e) {
      if (listEl) listEl.innerHTML = '<div class="fu-empty">Error loading files: ' + _esc(e.message) + '</div>';
    }
  }

  // ─── View files inside a subfolder (with preview) ───────────────
  async function _viewSubfolderFiles(collegeId, collegeName, subfolderId, subfolderName) {
    // Close subfolder modal if open
    var sfModal = document.getElementById('fuSubfolderModal');
    if (sfModal) sfModal.remove();

    var modal   = document.getElementById('fuFilesModal');
    var titleEl = document.getElementById('fuFilesModalTitle');
    var listEl  = document.getElementById('fuFilesModalList');
    if (!modal) return;

    if (titleEl) titleEl.textContent = collegeName + ' › ' + subfolderName;
    if (listEl)  listEl.innerHTML = '<div class="fu-empty">Loading files from subfolder…</div>';
    modal.style.display = 'flex';

    try {
      var files = await _driveListFiles(subfolderId);
      var subDirs  = files.filter(function(f){ return f.mimeType === 'application/vnd.google-apps.folder'; });
      var fileList = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });

      var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<span style="font-size:.72rem;color:var(--mist,#9ca3af);">📁 ' + _esc(subfolderName) + ' · ' + fileList.length + ' file(s)</span>' +
        '<button onclick="FU._viewSubfolderFiles(\'' + _esc(collegeId) + '\',\'' + _esc(collegeName) + '\',\'' + _esc(subfolderId) + '\',\'' + _esc(subfolderName) + '\')" style="font-size:.72rem;padding:5px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:var(--fog,#f9fafb);cursor:pointer;">🔄 Refresh</button>' +
      '</div>';

      if (files.length === 0) {
        html += '<div class="fu-empty" style="padding:30px 0;text-align:center;">No files uploaded in this subfolder yet.<br><span style="font-size:.75rem;margin-top:6px;display:block;color:var(--mist,#9ca3af);">Share the link below so the college can upload here.</span></div>';
        html += '<div style="margin-top:10px;padding:10px 14px;background:var(--fog,#f9fafb);border-radius:10px;font-size:.75rem;">' +
          '<div style="font-weight:700;margin-bottom:4px;">📋 Subfolder Upload Link</div>' +
          '<code style="font-size:.7rem;color:var(--mist,#9ca3af);word-break:break-all;">' + _esc('https://drive.google.com/drive/folders/' + subfolderId) + '</code>' +
        '</div>';
      } else {
        // Nested sub-sub-folders
        if (subDirs.length) {
          html += '<div style="font-size:.73rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">📁 Nested Folders</div>';
          html += subDirs.map(function(f) {
            return '<div class="fu-file-row" style="background:var(--fog,#f9fafb);">' +
              '<span class="fu-file-icon">📁</span>' +
              '<div class="fu-file-info"><div class="fu-file-name">' + _esc(f.name) + '</div></div>' +
              '<a class="fu-btn fu-btn-open" href="' + _esc(f.webViewLink || _makeFolderUrl(f.id)) + '" target="_blank">↗</a>' +
            '</div>';
          }).join('');
          html += '<div style="margin:10px 0;border-top:1.5px solid var(--fog,#e5e7eb);"></div>';
        }

        // Files with preview
        html += '<div style="font-size:.73rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">📄 Uploaded Files</div>';
        html += fileList.map(function(f) {
          var icon  = _fileIcon(f.mimeType);
          var size  = f.size ? _fmtSize(parseInt(f.size)) : '—';
          var canPreview = f.mimeType && (
            f.mimeType.startsWith('image/') ||
            f.mimeType === 'application/pdf' ||
            f.mimeType.startsWith('video/')
          );
          var previewBtn = canPreview
            ? '<button onclick="FU._previewFile(\'' + _esc(f.id) + '\',\'' + _esc(f.name) + '\',\'' + _esc(f.mimeType) + '\',\'' + _esc(f.thumbnailLink||'') + '\')" style="font-size:.7rem;padding:4px 8px;border:1px solid var(--lime,#9ec000);border-radius:7px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;font-weight:700;margin-right:4px;">👁 Preview</button>'
            : '';
          return '<div class="fu-file-row">' +
            '<span class="fu-file-icon">' + icon + '</span>' +
            '<div class="fu-file-info">' +
              '<div class="fu-file-name">' + _esc(f.name) + '</div>' +
              '<div class="fu-file-meta">' + size + ' · ' + _fmtDate(new Date(f.createdTime).getTime()) + '</div>' +
            '</div>' +
            previewBtn +
            '<a class="fu-btn fu-btn-open" href="https://drive.google.com/file/d/' + f.id + '/view" target="_blank">↗</a>' +
          '</div>';
        }).join('');
      }

      if (listEl) listEl.innerHTML = html;
    } catch(e) {
      if (listEl) listEl.innerHTML = '<div class="fu-empty">Error loading files: ' + _esc(e.message) + '</div>';
    }
  }

  // ─── File Preview ─────────────────────────────────────────────────
  function _previewFile(fileId, fileName, mimeType, thumbnailLink) {
    var existing = document.getElementById('fuPreviewModal');
    if (existing) existing.remove();

    var previewContent = '';
    if (mimeType.startsWith('image/')) {
      // Use Drive thumbnail (large) or fallback to embed
      var src = thumbnailLink
        ? thumbnailLink.replace('=s220', '=s1200')
        : 'https://drive.google.com/uc?export=view&id=' + fileId;
      previewContent = '<img src="' + _esc(src) + '" alt="' + _esc(fileName) + '" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px;display:block;margin:0 auto;box-shadow:0 8px 32px rgba(0,0,0,.2);">';
    } else if (mimeType === 'application/pdf') {
      previewContent = '<iframe src="https://drive.google.com/file/d/' + fileId + '/preview" width="100%" height="500px" style="border:none;border-radius:8px;" allow="autoplay"></iframe>';
    } else if (mimeType.startsWith('video/')) {
      previewContent = '<video controls style="max-width:100%;max-height:60vh;border-radius:8px;display:block;margin:0 auto;"><source src="https://drive.google.com/uc?export=download&id=' + fileId + '" type="' + _esc(mimeType) + '">Your browser does not support video preview.</video>';
    }

    var modal = document.createElement('div');
    modal.id = 'fuPreviewModal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:9900;background:rgba(13,15,18,.82);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML =
      '<div style="background:var(--card,#fff);border-radius:18px;width:min(700px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.35);overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1.5px solid var(--fog,#e5e7eb);flex-shrink:0;">' +
          '<div style="font-size:.82rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">👁 ' + _esc(fileName) + '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<a href="https://drive.google.com/file/d/' + fileId + '/view" target="_blank" style="font-size:.72rem;font-weight:700;padding:6px 12px;border:1.5px solid var(--lime,#9ec000);border-radius:8px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);text-decoration:none;">↗ Open in Drive</a>' +
            '<button onclick="document.getElementById(\'fuPreviewModal\').remove()" style="background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:var(--mist,#9ca3af);">✕</button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;overflow:auto;padding:20px;background:var(--bg,#f8fafc);">' +
          previewContent +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('mousedown', function(e){ if (e.target === modal) modal.remove(); });
  }

  // ─── Utilities ────────────────────────────────────────────────────
  function _copyLink(link, btn) {
    navigator.clipboard.writeText(link).then(function() {
      var orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(function(){ btn.textContent = orig; }, 1800);
    }).catch(function() {
      _toast('Could not copy — try manually', 'error');
    });
  }

  function _closeFilesModal() {
    var modal = document.getElementById('fuFilesModal');
    if (modal) modal.style.display = 'none';
  }

  function _shareViaEmail(collegeName, link) {
    if (!link) { _toast('No share link available', 'error'); return; }
    var subject = encodeURIComponent('NOVA Studio — Data Upload Request: ' + collegeName);
    var body    = encodeURIComponent(
      'Dear ' + collegeName + ',\n\n' +
      'Please upload your data using the following Google Drive link:\n\n' +
      link + '\n\n' +
      'This folder is exclusively for your college. You can upload files directly to it.\n\n' +
      'Once uploaded, your submission will be tracked automatically on our portal.\n\n' +
      'Regards,\nNOVA Studio Team'
    );
    window.open('mailto:?subject=' + subject + '&body=' + body, '_blank');
  }

  function _fileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('image'))        return '🖼️';
    if (mime.includes('pdf'))          return '📕';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation')|| mime.includes('powerpoint')) return '📑';
    if (mime.includes('document')    || mime.includes('word'))  return '📝';
    if (mime.includes('zip') || mime.includes('rar'))  return '🗜️';
    if (mime.includes('video'))        return '🎬';
    if (mime.includes('audio'))        return '🎵';
    if (mime.includes('folder'))       return '📁';
    return '📄';
  }

  function _fmtSize(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
    return (bytes/1073741824).toFixed(2) + ' GB';
  }

  // ─── Poll Drive for updates (every 30s when view is open) ─────────
  function _startPoll() {
    _stopPoll();
    _pollInterval = setInterval(function() {
      if (_curSession && _curSession.id) _refreshCollegesFromDrive();
    }, 15000); // every 15 seconds — live tracking
  }
  function _stopPoll() {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  }

  async function _refreshCollegesFromDrive() {
    if (!_curSession || !_colleges.length) return;
    var changed = false;
    for (var i = 0; i < _colleges.length; i++) {
      var col = _colleges[i];
      if (!col.folderId) continue;
      try {
        var files      = await _driveListFiles(col.folderId);
        var actualFiles = files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });
        var newCount   = actualFiles.length;
        if (newCount !== col.fileCount) {
          var updates = { fileCount: newCount, status: newCount > 0 ? 'uploaded' : 'pending' };
          if (newCount > 0 && actualFiles[0]) updates.lastUpload = new Date(actualFiles[0].createdTime).getTime();
          if (newCount > col.fileCount) {
            var diff     = newCount - col.fileCount;
            var newFiles = actualFiles.slice(0, diff);
            newFiles.forEach(function(f) {
              _pushNotification(_curSession.id, col, f.name || 'Unknown file', { type: 'file' });
            });
            _liveActivity[col.id] = Date.now(); // trigger pulse indicator
          }
          await _cCol(_curSession.id).doc(col.id).update(updates);
          col.fileCount = newCount;
          if (updates.status)     col.status     = updates.status;
          if (updates.lastUpload) col.lastUpload = updates.lastUpload;
          changed = true;
        }
        // Live-track subfolders
        var sfChanged = await _scanSubfoldersForCollege(col, _curSession.id);
        if (sfChanged) changed = true;
      } catch(e) {}
    }
    if (changed) { _renderCollegeList(); _renderStats(); }
  }

  // ─── Inject extra CSS ─────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('fuV2Styles')) return;
    var style = document.createElement('style');
    style.id = 'fuV2Styles';
    style.textContent = [
      /* Subfolder pills wrapper */
      '.fu-subfolder-list { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }',
      '.fu-sf-wrap { display:flex;flex-direction:column;gap:2px; }',
      '.fu-sf-pill { font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:20px;border:1.5px solid var(--lime,#9ec000);background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);cursor:pointer;user-select:none;transition:all .13s;display:inline-flex;align-items:center;gap:4px; }',
      '.fu-sf-pill:hover { background:var(--lime-d,#6d8400);color:#fff; }',
      '.fu-sf-cnt { background:var(--lime-d,#6d8400);color:#fff;font-size:.55rem;padding:1px 5px;border-radius:99px;font-weight:800;margin-left:2px; }',
      '.fu-sf-pill-pulse { animation:fuPillPulse 1.5s ease-in-out 3;box-shadow:0 0 0 0 rgba(158,192,0,.5); }',
      '@keyframes fuPillPulse { 0%,100%{box-shadow:0 0 0 0 rgba(158,192,0,0)} 50%{box-shadow:0 0 0 5px rgba(158,192,0,.25)} }',
      /* Subfolder live tracker row */
      '.fu-sf-tracker-row { display:flex;flex-wrap:wrap;gap:4px;padding-left:4px; }',
      '.fu-sf-tracker { font-size:.62rem;font-weight:600;padding:2px 7px;border-radius:12px;white-space:nowrap; }',
      '.fu-sf-photo { background:#fef3c7;color:#92400e;border:1px solid #fde68a; }',
      '.fu-sf-data  { background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;max-width:220px;overflow:hidden;text-overflow:ellipsis; }',
      '.fu-sf-empty { background:var(--fog,#f3f4f6);color:var(--mist,#9ca3af);border:1px solid var(--fog2,#e5e7eb); }',
      /* Live dot */
      '.fu-live-dot { font-size:.6rem;line-height:1;opacity:.55;transition:opacity .3s; }',
      '.fu-live-dot.fu-live-pulse { animation:fuPulse 1.2s ease-in-out 3;opacity:1; }',
      '@keyframes fuPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.8)} }',
      /* Refresh button on card */
      '.fu-btn-refresh { padding:5px 8px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:var(--fog,#f9fafb);cursor:pointer;font-size:.8rem;color:var(--ink,#111);transition:all .13s; }',
      '.fu-btn-refresh:hover { border-color:var(--lime-d,#6d8400);color:var(--lime-d,#6d8400); }',
      /* Subfolder button */
      '.fu-btn-subfolder { background:var(--lime-p,#f0f7d4)!important;border-color:var(--lime,#9ec000)!important;color:var(--lime-d,#6d8400)!important;font-weight:700; }',
      '.fu-btn-subfolder:hover { background:var(--lime-d,#6d8400)!important;color:#fff!important; }',
      /* Delete button */
      '.fu-btn-delete { background:#fff5f5!important;border-color:#fecaca!important;color:#dc2626!important;font-weight:700; }',
      '.fu-btn-delete:hover { background:#dc2626!important;color:#fff!important; }',
      /* Bulk report toolbar */
      '.fu-bulk-bar { background:var(--fog,#f9fafb);border:1.5px solid var(--fog2,#e5e7eb);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px; }',
      '.fu-bulk-search-row { display:flex;gap:8px;align-items:center; }',
      '.fu-bulk-search { flex:1;padding:8px 12px;border:1.5px solid var(--fog2,#e5e7eb);border-radius:8px;font-size:.82rem;background:#fff;color:#111111;outline:none;transition:border .13s; }',
      '.fu-bulk-search::placeholder { color:#6b7280;opacity:1; }',
      '.fu-bulk-search:focus { border-color:var(--lime,#9ec000);color:#111111; }',
      '.fu-bulk-selall { padding:7px 14px;border:1.5px solid var(--lime,#9ec000);border-radius:8px;background:var(--lime-p,#f0f7d4);color:var(--lime-d,#6d8400);font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .13s; }',
      '.fu-bulk-selall:hover { background:var(--lime-d,#6d8400);color:#fff; }',
      '.fu-bulk-actions { display:flex;align-items:center;gap:10px;flex-wrap:wrap; }',
      '.fu-bulk-count { font-size:.78rem;font-weight:700;color:var(--lime-d,#6d8400);background:var(--lime-p,#f0f7d4);padding:4px 10px;border-radius:20px;border:1.5px solid var(--lime,#9ec000); }',
      '.fu-bulk-dl-btn { padding:8px 18px;background:var(--lime-d,#6d8400);color:#fff;border:none;border-radius:9px;font-size:.82rem;font-weight:700;cursor:pointer;transition:opacity .13s;display:flex;align-items:center;gap:6px; }',
      '.fu-bulk-dl-btn:hover { opacity:.88; }',
      '.fu-bulk-hint { font-size:.74rem;color:var(--mist,#9ca3af); }',
      /* College card checkbox */
      '.fu-bulk-chk-wrap { display:flex;align-items:center;cursor:pointer;flex-shrink:0;margin-right:2px; }',
      '.fu-bulk-chk { position:absolute;opacity:0;width:0;height:0; }',
      '.fu-bulk-chk-box { display:inline-block;width:18px;height:18px;border:2px solid var(--fog2,#d1d5db);border-radius:5px;background:var(--surface,#fff);transition:all .13s;position:relative; }',
      '.fu-bulk-chk:checked + .fu-bulk-chk-box { background:var(--lime-d,#6d8400);border-color:var(--lime-d,#6d8400); }',
      '.fu-bulk-chk:checked + .fu-bulk-chk-box::after { content:"✓";position:absolute;top:-1px;left:2px;font-size:.72rem;color:#fff;font-weight:800; }',
      '.fu-col-selected { border-color:var(--lime,#9ec000)!important;background:rgba(158,192,0,.06)!important; }',
      /* Drive link tag */
      '.fu-tag-link { text-decoration:none;font-weight:700;color:var(--lime-d,#6d8400)!important;border:1.5px solid var(--lime,#9ec000);background:var(--lime-p,#f0f7d4);padding:2px 7px;border-radius:10px;font-size:.68rem; }',
      '.fu-tag-link:hover { background:var(--lime-d,#6d8400);color:#fff!important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ─── Init ─────────────────────────────────────────────────────────
  function init() {
    if (!_uid()) return;
    _injectStyles();
    _driveToken = window.NOVA_DRIVE_TOKEN ||
      (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
    _subscribeNotifications();
  }

  async function openView() {
    _driveToken = window.NOVA_DRIVE_TOKEN ||
      (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
    _injectStyles();
    _backToList();

    if (!_uid()) {
      var waited = 0;
      await new Promise(function(resolve) {
        var iv = setInterval(function() {
          waited += 200;
          if (_uid() || waited >= 3000) { clearInterval(iv); resolve(); }
        }, 200);
      });
    }

    if (!_uid()) {
      var el = document.getElementById('fuSessionList');
      if (el) el.innerHTML = '<div class="fu-empty">⚠️ Could not load user session. Please click Refresh above or reload the page.</div>';
      return;
    }

    await _loadSessions();
    _renderSessionList();
  }

  // ─── Public API ───────────────────────────────────────────────────
  return {
    init:             init,
    openView:         openView,
    _openSession:     _openSession,
    _deleteSession:   _deleteSession,
    _backToList:      _backToList,
    _createSession:   _createSession,
    _addCollege:      _addCollege,
    _deleteCollege:   _deleteCollege,
    _copyLink:        _copyLink,
    _viewFiles:       _viewFiles,
    _closeFilesModal: _closeFilesModal,
    _shareViaEmail:   _shareViaEmail,
    _stopPoll:        _stopPoll,
    _openSubfolderModal: _openSubfolderModal,
    _createSubfolder:    _createSubfolder,
    _deleteSubfolder:    _deleteSubfolder,
    _viewSubfolderFiles: _viewSubfolderFiles,
    _refreshOne:         _refreshOne,
    _previewFile:        _previewFile,
    _toggleBulkSelect:   _toggleBulkSelect,
    _bulkSelectAll:      _bulkSelectAll,
    _onBulkSearch:       _onBulkSearch,
    _downloadBulkReport: _downloadBulkReport,
  };
})();
