// ══════════════════════════════════════════════════════════════════
//  NOVA STUDIO — Drive Manager  (v1.0)
//  Multi-drive Google Drive panel with:
//   • Paste a Drive "master link" to switch/add drives
//   • Browse folders with full breadcrumb navigation
//   • Create folders & sub-folders
//   • Upload files (single or batch)
//   • Drive quota / storage limit bar
//   • File preview grid with inline delete
// ══════════════════════════════════════════════════════════════════

var DM = (function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _drives       = [];          // [{label, token, folderId, email}]
  var _activeDriveIdx = 0;
  var _currentFolderId = null;     // null = Drive root
  var _breadcrumb   = [];          // [{id, name}]
  var _files        = [];          // current folder contents
  var _quota        = null;        // {limit, usage, usageInDrive}
  var _loading      = false;
  var _uploadQueue  = [];

  var STORAGE_KEY   = 'nova_dm_drives';

  // ── Helpers ────────────────────────────────────────────────────
  function _tok() {
    if (_drives[_activeDriveIdx]) return _drives[_activeDriveIdx].token;
    return NOVA_DRIVE_TOKEN || (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
  }

  function _fmtBytes(b) {
    if (!b) return '0 B';
    b = parseInt(b, 10);
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
    return (b/1073741824).toFixed(2) + ' GB';
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  }

  function _mimeIcon(mime) {
    if (!mime) return '📄';
    if (mime === 'application/vnd.google-apps.folder') return '📁';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽️';
    if (mime.includes('document') || mime.includes('word')) return '📝';
    if (mime.includes('zip') || mime.includes('compressed')) return '🗜️';
    if (mime.includes('json')) return '🔣';
    return '📄';
  }

  // ── Persist drives list (tokens stored in sessionStorage only for security) ──
  function _saveDrives() {
    var safe = _drives.map(function(d){ return { label: d.label, email: d.email, folderId: d.folderId }; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch(e){}
  }

  function _loadDrives() {
    try {
      var arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      _drives = arr;
    } catch(e) { _drives = []; }
    // Always ensure the primary drive (from login) is entry 0
    var mainTok = NOVA_DRIVE_TOKEN || (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
    if (mainTok) {
      if (_drives.length === 0 || _drives[0].label === 'My Drive') {
        var primary = { label: 'My Drive', token: mainTok, folderId: null, email: (U && U.email) || '' };
        if (_drives.length === 0) _drives.unshift(primary);
        else { _drives[0].token = mainTok; }
      }
    }
  }

  // ── Drive API calls ────────────────────────────────────────────
  async function _apiFetch(path, opts) {
    var tok = _tok();
    if (!tok) throw new Error('No Drive token. Please sign in with Google.');
    var url = path.startsWith('http') ? path : 'https://www.googleapis.com/drive/v3' + path;
    var headers = Object.assign({ 'Authorization': 'Bearer ' + tok }, (opts && opts.headers) || {});
    var res = await fetch(url, Object.assign({}, opts || {}, { headers: headers }));
    if (!res.ok) {
      if (res.status === 401) throw new Error('Drive session expired. Please sign in again.');
      var err = {}; try { err = await res.json(); } catch(e){}
      throw new Error((err.error && err.error.message) || 'Drive API error ' + res.status);
    }
    return res.json();
  }

  async function _fetchQuota() {
    try {
      var data = await _apiFetch('/about?fields=storageQuota');
      _quota = data.storageQuota;
    } catch(e) { _quota = null; }
    _renderQuota();
  }

  async function _fetchFiles(folderId) {
    _loading = true;
    _renderFileArea();
    try {
      var parent = folderId || 'root';
      var q = '"' + parent + '" in parents and trashed=false';
      var url = '/files?q=' + encodeURIComponent(q) +
        '&fields=files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,parents)' +
        '&orderBy=folder,name&pageSize=100';
      var data = await _apiFetch(url);
      _files = data.files || [];
    } catch(e) {
      _files = [];
      _showError(e.message);
    }
    _loading = false;
    _renderFileArea();
    _fetchQuota();
  }

  // ── Navigate ───────────────────────────────────────────────────
  async function _navTo(folderId, folderName) {
    if (folderId === null) {
      _breadcrumb = [];
      _currentFolderId = null;
    } else {
      // Check if going back in breadcrumb
      var idx = _breadcrumb.findIndex(function(b){ return b.id === folderId; });
      if (idx >= 0) {
        _breadcrumb = _breadcrumb.slice(0, idx + 1);
      } else {
        _breadcrumb.push({ id: folderId, name: folderName || 'Folder' });
      }
      _currentFolderId = folderId;
    }
    _renderBreadcrumb();
    await _fetchFiles(_currentFolderId);
  }

  // ── Create folder ──────────────────────────────────────────────
  async function createFolder(name, parentId) {
    var meta = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || _currentFolderId || 'root']
    };
    await _apiFetch('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    });
    await _fetchFiles(_currentFolderId);
    _showToastLocal('Folder "' + name + '" created ✓', 'ok');
  }

  // ── Upload file ────────────────────────────────────────────────
  async function uploadFile(file, targetFolderId) {
    var tok = _tok();
    if (!tok) { _showToastLocal('No Drive token', 'err'); return; }
    var fid = targetFolderId || _currentFolderId || 'root';
    var meta = JSON.stringify({ name: file.name, parents: [fid] });
    var boundary = 'nova_dm_' + Date.now();
    var delimiter = '\r\n--' + boundary + '\r\n';
    var close     = '\r\n--' + boundary + '--';
    var metaPart  = delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + meta;
    var dataPart  = '\r\n--' + boundary + '\r\nContent-Type: ' + (file.type || 'application/octet-stream') + '\r\n\r\n';
    var metaBytes = new TextEncoder().encode(metaPart + dataPart);
    var closeBytes= new TextEncoder().encode(close);
    var fileBuf   = await file.arrayBuffer();
    var body      = new Uint8Array(metaBytes.byteLength + fileBuf.byteLength + closeBytes.byteLength);
    body.set(metaBytes, 0);
    body.set(new Uint8Array(fileBuf), metaBytes.byteLength);
    body.set(closeBytes, metaBytes.byteLength + fileBuf.byteLength);

    var res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    return res.json();
  }

  // ── Delete file ────────────────────────────────────────────────
  async function _deleteFile(fileId, fileName) {
    if (!confirm('Move "' + fileName + '" to Trash?')) return;
    var tok = _tok();
    await fetch('https://www.googleapis.com/drive/v3/files/' + fileId,
      { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + tok } });
    _files = _files.filter(function(f){ return f.id !== fileId; });
    _renderFileArea();
    _fetchQuota();
    _showToastLocal('"' + fileName + '" moved to Trash', 'ok');
  }

  // ── Add drive via master link ──────────────────────────────────
  async function _addDriveByLink(url) {
    // Extract folder ID from Drive URL patterns:
    // https://drive.google.com/drive/folders/{id}
    // https://drive.google.com/drive/u/0/folders/{id}
    // https://drive.google.com/open?id={id}
    var folderId = null;
    var m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) folderId = m[1];
    if (!folderId) { m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m) folderId = m[1]; }
    if (!folderId && url.match(/^[a-zA-Z0-9_-]{20,}$/)) folderId = url.trim(); // raw ID

    if (!folderId) { _showToastLocal('Could not parse Drive link. Paste the full folder URL or folder ID.', 'err'); return; }

    // Try to fetch folder name
    var label = 'Drive Link';
    try {
      var data = await _apiFetch('/files/' + folderId + '?fields=name');
      label = data.name || label;
    } catch(e) { _showToastLocal('Could not access folder — check sharing permissions.', 'err'); return; }

    // Add to drives list
    var tok = _tok(); // reuse current token (same Google account but different folder root)
    var existing = _drives.findIndex(function(d){ return d.folderId === folderId; });
    if (existing >= 0) {
      _activeDriveIdx = existing;
      _showToastLocal('Switched to "' + label + '"', 'ok');
    } else {
      _drives.push({ label: label, token: tok, folderId: folderId, email: (U && U.email) || '' });
      _activeDriveIdx = _drives.length - 1;
      _saveDrives();
      _showToastLocal('Added "' + label + '" ✓', 'ok');
    }
    _breadcrumb = [{ id: folderId, name: label }];
    _currentFolderId = folderId;
    _renderDriveTabs();
    _renderBreadcrumb();
    await _fetchFiles(folderId);
  }

  // ── Tiny local toast (doesn't depend on global showToast being available) ──
  function _showToastLocal(msg, type) {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    var el = document.getElementById('dmToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'dm-toast dm-toast-' + (type||'info') + ' show';
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 3000);
  }

  function _showError(msg) {
    var area = document.getElementById('dmFileArea');
    if (!area) return;
    area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--coral);font-size:.82rem">⚠️ ' + msg + '</div>';
  }

  // ── RENDER functions ───────────────────────────────────────────

  function _renderDriveTabs() {
    var el = document.getElementById('dmDriveTabs');
    if (!el) return;
    el.innerHTML = _drives.map(function(d, i){
      var active = i === _activeDriveIdx;
      return '<button class="dm-tab' + (active?' active':'') + '" onclick="DM.switchDrive(' + i + ')">' +
        '<span style="font-size:.8rem">☁</span> ' + _esc(d.label) +
        (i > 0 ? '<span class="dm-tab-del" onclick="DM.removeDrive(event,' + i + ')">✕</span>' : '') +
        '</button>';
    }).join('') +
    '<button class="dm-tab dm-tab-add" onclick="DM.openAddDrive()" title="Add Drive">＋ Add Drive</button>';
  }

  function _renderBreadcrumb() {
    var el = document.getElementById('dmBreadcrumb');
    if (!el) return;
    var html = '<span class="dm-bc-item" onclick="DM.navTo(null,\'Root\')">🏠 Root</span>';
    _breadcrumb.forEach(function(b, i){
      html += '<span class="dm-bc-sep">›</span>';
      if (i === _breadcrumb.length - 1) {
        html += '<span class="dm-bc-item active">' + _esc(b.name) + '</span>';
      } else {
        html += '<span class="dm-bc-item" onclick="DM.navTo(\'' + b.id + '\',\'' + _esc(b.name) + '\')">' + _esc(b.name) + '</span>';
      }
    });
    el.innerHTML = html;
  }

  function _renderQuota() {
    var el = document.getElementById('dmQuota');
    if (!el) return;
    if (!_quota) { el.innerHTML = '<span style="color:var(--mist);font-size:.72rem">Storage info unavailable</span>'; return; }
    var used  = parseInt(_quota.usage || 0, 10);
    var limit = parseInt(_quota.limit || 1, 10);
    var pct   = Math.min(100, Math.round(used / limit * 100));
    var color = pct >= 90 ? 'var(--coral)' : pct >= 70 ? '#f59e0b' : 'linear-gradient(90deg,var(--teal),var(--lime))';
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">' +
        '<span style="font-size:.68rem;font-weight:700;color:var(--mist);text-transform:uppercase;letter-spacing:.05em">☁ Drive Storage</span>' +
        '<span style="font-size:.72rem;font-weight:800;color:var(--ink)">' + _fmtBytes(used) + ' / ' + _fmtBytes(limit) + '</span>' +
      '</div>' +
      '<div style="background:var(--fog);border-radius:6px;height:8px;overflow:hidden">' +
        '<div style="height:100%;border-radius:6px;background:' + color + ';width:' + pct + '%;transition:width .5s ease"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px">' +
        '<span style="font-size:.65rem;color:var(--mist)">' + pct + '% used</span>' +
        '<span style="font-size:.65rem;color:var(--mist)">' + _fmtBytes(limit - used) + ' free</span>' +
      '</div>';
  }

  function _renderFileArea() {
    var area = document.getElementById('dmFileArea');
    if (!area) return;

    if (_loading) {
      area.innerHTML = '<div style="padding:50px;text-align:center">' +
        '<div class="dm-spinner"></div>' +
        '<div style="margin-top:12px;font-size:.78rem;color:var(--mist)">Loading files…</div></div>';
      return;
    }

    if (_files.length === 0) {
      area.innerHTML = '<div style="padding:50px;text-align:center;opacity:.5">' +
        '<div style="font-size:2.5rem;margin-bottom:8px">📂</div>' +
        '<div style="font-size:.82rem;font-weight:700">This folder is empty</div>' +
        '<div style="font-size:.72rem;color:var(--mist);margin-top:4px">Upload files or create a sub-folder</div></div>';
      return;
    }

    var folders = _files.filter(function(f){ return f.mimeType === 'application/vnd.google-apps.folder'; });
    var files   = _files.filter(function(f){ return f.mimeType !== 'application/vnd.google-apps.folder'; });

    var html = '';

    if (folders.length) {
      html += '<div class="dm-section-label">Folders (' + folders.length + ')</div>';
      html += '<div class="dm-folder-row">';
      folders.forEach(function(f){
        html += '<div class="dm-folder-card" onclick="DM.navTo(\'' + f.id + '\',\'' + _esc(f.name) + '\')">' +
          '<span style="font-size:1.4rem">📁</span>' +
          '<span class="dm-folder-name">' + _esc(f.name) + '</span>' +
          '<button class="dm-file-del" onclick="event.stopPropagation();DM.deleteFile(\'' + f.id + '\',\'' + _esc(f.name) + '\')" title="Delete">🗑</button>' +
        '</div>';
      });
      html += '</div>';
    }

    if (files.length) {
      html += '<div class="dm-section-label" style="margin-top:14px">Files (' + files.length + ')</div>';
      html += '<div class="dm-file-grid">';
      files.forEach(function(f){
        var icon = _mimeIcon(f.mimeType);
        var isImg = f.mimeType && f.mimeType.startsWith('image/');
        var thumbHtml = (isImg && f.thumbnailLink)
          ? '<img src="' + f.thumbnailLink + '" class="dm-file-thumb" onerror="this.style.display=\'none\'">'
          : '<div class="dm-file-icon">' + icon + '</div>';
        html += '<div class="dm-file-card">' +
          '<div class="dm-file-preview">' + thumbHtml + '</div>' +
          '<div class="dm-file-body">' +
            '<div class="dm-file-name" title="' + _esc(f.name) + '">' + _esc(f.name) + '</div>' +
            '<div class="dm-file-meta">' +
              (f.size ? _fmtBytes(f.size) + ' · ' : '') +
              _fmtDate(f.modifiedTime) +
            '</div>' +
          '</div>' +
          '<div class="dm-file-actions">' +
            (f.webViewLink ? '<a href="' + f.webViewLink + '" target="_blank" class="dm-act-btn" title="Open in Drive">↗</a>' : '') +
            '<button class="dm-act-btn share" onclick="DM.shareFile(\'' + f.id + '\',\'' + _esc(f.name) + '\',\'' + _esc(f.webViewLink||'') + '\')" title="Share">🔗</button>' +
            '<button class="dm-act-btn danger" onclick="DM.deleteFile(\'' + f.id + '\',\'' + _esc(f.name) + '\')" title="Delete">🗑</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    area.innerHTML = html;
  }

  function _esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Upload progress ────────────────────────────────────────────
  function _setUploadProgress(pct, msg) {
    var bar  = document.getElementById('dmUploadBar');
    var fill = document.getElementById('dmUploadFill');
    var txt  = document.getElementById('dmUploadTxt');
    if (!bar) return;
    if (pct === null) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    fill.style.width  = pct + '%';
    if (txt) txt.textContent = msg || '';
  }

  // ── Public API ─────────────────────────────────────────────────

  async function init() {
    _loadDrives();
    _renderDriveTabs();
    _renderBreadcrumb();
    await _fetchFiles(null);
  }

  function openPanel() {
    var panel = document.getElementById('dmPanel');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.classList.add('dm-open');
    init();
  }

  function closePanel() {
    var panel = document.getElementById('dmPanel');
    if (panel) { panel.classList.remove('dm-open'); panel.style.display = 'none'; }
  }

  async function switchDrive(idx) {
    _activeDriveIdx = idx;
    var d = _drives[idx];
    _breadcrumb = d.folderId ? [{ id: d.folderId, name: d.label }] : [];
    _currentFolderId = d.folderId || null;
    _renderDriveTabs();
    _renderBreadcrumb();
    await _fetchFiles(_currentFolderId);
  }

  function removeDrive(e, idx) {
    e.stopPropagation();
    if (idx === 0) return; // can't remove primary
    if (!confirm('Remove "' + _drives[idx].label + '" from the list?')) return;
    _drives.splice(idx, 1);
    if (_activeDriveIdx >= _drives.length) _activeDriveIdx = _drives.length - 1;
    _saveDrives();
    switchDrive(_activeDriveIdx);
  }

  function openAddDrive() {
    var modal = document.getElementById('dmAddModal');
    if (!modal) return;
    document.getElementById('dmLinkInp').value = '';
    modal.style.display = 'flex';
    setTimeout(function(){ document.getElementById('dmLinkInp').focus(); }, 80);
  }

  function closeAddDrive() {
    var modal = document.getElementById('dmAddModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmAddDrive() {
    var url = (document.getElementById('dmLinkInp').value || '').trim();
    if (!url) { _showToastLocal('Please paste a Drive folder link', 'info'); return; }
    closeAddDrive();
    await _addDriveByLink(url);
  }

  function openNewFolder() {
    var modal = document.getElementById('dmFolderModal');
    if (!modal) return;
    document.getElementById('dmFolderInp').value = '';
    modal.style.display = 'flex';
    setTimeout(function(){ document.getElementById('dmFolderInp').focus(); }, 80);
  }

  function closeNewFolder() {
    var modal = document.getElementById('dmFolderModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmNewFolder() {
    var name = (document.getElementById('dmFolderInp').value || '').trim();
    if (!name) { _showToastLocal('Please enter a folder name', 'info'); return; }
    closeNewFolder();
    try { await createFolder(name, _currentFolderId); }
    catch(e) { _showToastLocal('Error: ' + e.message, 'err'); }
  }

  async function navTo(folderId, name) {
    await _navTo(folderId, name);
  }

  async function handleUpload(input) {
    if (!input.files || !input.files.length) return;
    var files = Array.from(input.files);
    var total = files.length;
    _setUploadProgress(0, 'Uploading 0 / ' + total + '…');
    var done = 0;
    for (var i = 0; i < files.length; i++) {
      try {
        await uploadFile(files[i], _currentFolderId);
        done++;
        _setUploadProgress(Math.round(done/total*100), 'Uploading ' + done + ' / ' + total + '…');
      } catch(e) {
        _showToastLocal('Failed: ' + files[i].name + ' — ' + e.message, 'err');
      }
    }
    _setUploadProgress(null);
    _showToastLocal(done + ' file' + (done>1?'s':'') + ' uploaded ✓', 'ok');
    await _fetchFiles(_currentFolderId);
    input.value = '';
  }


  // ── Share file via link ────────────────────────────────────────
  var _shareFileId = null;
  var _shareFileName = null;
  var _shareExistingLink = null;

  async function shareFile(fileId, fileName, existingLink) {
    _shareFileId = fileId;
    _shareFileName = fileName;
    _shareExistingLink = existingLink;
    if (!document.getElementById('dmShareModal')) _buildShareModal();
    // Reset to permission selection step
    document.getElementById('dmSharePermStep').style.display = '';
    document.getElementById('dmShareLinkStep').style.display = 'none';
    var title = document.getElementById('dmShareTitle');
    if (title) title.textContent = '🔗 Share: ' + fileName;
    // Reset permission selection
    document.querySelectorAll('.dm-perm-card').forEach(function(c){ c.classList.remove('dm-perm-selected'); });
    var defaultCard = document.querySelector('.dm-perm-card[data-role="reader"]');
    if (defaultCard) defaultCard.classList.add('dm-perm-selected');
    document.getElementById('dmShareModal').style.display = 'flex';
  }

  async function _applySharePermission() {
    var selected = document.querySelector('.dm-perm-card.dm-perm-selected');
    var role = selected ? selected.getAttribute('data-role') : 'reader';

    // Switch to link step
    document.getElementById('dmSharePermStep').style.display = 'none';
    document.getElementById('dmShareLinkStep').style.display = '';
    var linkBox = document.getElementById('dmShareLinkBox');
    var permLabel = document.getElementById('dmSharePermLabel');
    var labels = { reader: 'Viewer', commenter: 'Commenter', writer: 'Editor' };
    if (permLabel) permLabel.textContent = 'Anyone with the link can ' + (labels[role] || 'view').toLowerCase() + ':';
    if (linkBox) { linkBox.value = 'Applying permission…'; linkBox.style.color = 'var(--mist)'; }

    try {
      var authInst = gapi.auth2 && gapi.auth2.getAuthInstance && gapi.auth2.getAuthInstance();
      var token = authInst ? authInst.currentUser.get().getAuthResponse().access_token : '';
      if (token) {
        await fetch('https://www.googleapis.com/drive/v3/files/' + _shareFileId + '/permissions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role, type: 'anyone' })
        });
      }
      var shareLink = 'https://drive.google.com/file/d/' + _shareFileId + '/view?usp=sharing';
      if (linkBox) { linkBox.value = shareLink; linkBox.style.color = ''; }
      _showToastLocal('Share link ready (' + (labels[role] || role) + ') ✓', 'ok');
    } catch(e) {
      var fallback = _shareExistingLink || ('https://drive.google.com/file/d/' + _shareFileId + '/view?usp=sharing');
      if (linkBox) { linkBox.value = fallback; linkBox.style.color = ''; }
      _showToastLocal('Link ready (set sharing in Drive if needed)', 'info');
    }
  }

  function _buildShareModal() {
    var m = document.createElement('div');
    m.id = 'dmShareModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';

    var permCards = [
      { role: 'reader',    icon: '👁️',  label: 'Viewer',     desc: 'Can view but not edit or comment' },
      { role: 'commenter', icon: '💬',  label: 'Commenter',  desc: 'Can view and add comments' },
      { role: 'writer',    icon: '✏️',  label: 'Editor',     desc: 'Can view, comment and edit' }
    ];

    var cardsHTML = permCards.map(function(p) {
      return '<div class="dm-perm-card' + (p.role === 'reader' ? ' dm-perm-selected' : '') + '" data-role="' + p.role + '" ' +
        'onclick="document.querySelectorAll(\'.dm-perm-card\').forEach(function(c){c.classList.remove(\'dm-perm-selected\')});this.classList.add(\'dm-perm-selected\')" ' +
        'style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px;border:2px solid var(--fog,#e5e7eb);border-radius:12px;cursor:pointer;transition:all .18s;min-width:90px;user-select:none">' +
          '<span style="font-size:1.5rem">' + p.icon + '</span>' +
          '<span style="font-size:.78rem;font-weight:800;color:var(--ink)">' + p.label + '</span>' +
          '<span style="font-size:.67rem;color:var(--mist,#9ca3af);text-align:center;line-height:1.3">' + p.desc + '</span>' +
        '</div>';
    }).join('');

    m.innerHTML =
      '<style>' +
        '.dm-perm-card:hover{border-color:var(--accent,#6366f1)!important;background:var(--fog,#f3f4f6)}' +
        '.dm-perm-selected{border-color:var(--accent,#6366f1)!important;background:rgba(99,102,241,.07)!important}' +
        '.dm-perm-selected span:nth-child(2){color:var(--accent,#6366f1)!important}' +
      '</style>' +
      '<div style="background:var(--bg);border-radius:16px;padding:26px;width:min(440px,94vw);box-shadow:0 8px 48px rgba(0,0,0,.22)">' +
        '<div id="dmShareTitle" style="font-size:.95rem;font-weight:800;color:var(--ink);margin-bottom:4px">🔗 Share File</div>' +
        '<div style="font-size:.72rem;color:var(--mist,#9ca3af);margin-bottom:18px">Choose the access level for people with the link</div>' +

        // ── Step 1: Permission selection ──
        '<div id="dmSharePermStep">' +
          '<div style="display:flex;gap:10px;margin-bottom:20px">' + cardsHTML + '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button onclick="DM.closeShareModal()" style="padding:9px 18px;background:var(--fog,#f3f4f6);color:var(--ink);border:none;border-radius:9px;font-size:.8rem;font-weight:700;cursor:pointer">Cancel</button>' +
            '<button onclick="DM._applySharePermission()" style="padding:9px 18px;background:var(--accent,#6366f1);color:#fff;border:none;border-radius:9px;font-size:.8rem;font-weight:700;cursor:pointer">Generate Link →</button>' +
          '</div>' +
        '</div>' +

        // ── Step 2: Link display ──
        '<div id="dmShareLinkStep" style="display:none">' +
          '<div id="dmSharePermLabel" style="font-size:.73rem;color:var(--mist,#9ca3af);margin-bottom:8px">Anyone with the link can view:</div>' +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">' +
            '<input id="dmShareLinkBox" readonly style="flex:1;padding:9px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;font-size:.76rem;font-family:monospace;background:var(--bg);color:var(--ink);outline:none" />' +
            '<button onclick="DM.copyShareLink()" style="padding:9px 15px;background:var(--ink);color:var(--bg);border:none;border-radius:9px;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap">Copy</button>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center">' +
            '<button onclick="document.getElementById(\'dmSharePermStep\').style.display=\'\';document.getElementById(\'dmShareLinkStep\').style.display=\'none\'" style="padding:8px 14px;background:var(--fog,#f3f4f6);color:var(--ink);border:none;border-radius:9px;font-size:.77rem;font-weight:700;cursor:pointer">← Change</button>' +
            '<div style="display:flex;gap:8px">' +
              '<button onclick="DM.openShareLink()" style="padding:8px 14px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:9px;font-size:.77rem;font-weight:700;cursor:pointer">↗ Open</button>' +
              '<button onclick="DM.closeShareModal()" style="padding:8px 14px;background:var(--fog,#f3f4f6);color:var(--ink);border:none;border-radius:9px;font-size:.77rem;font-weight:700;cursor:pointer">Done</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(m);
    m.addEventListener('click', function(e){ if (e.target === m) DM.closeShareModal(); });
  }

  function closeShareModal() {
    var m = document.getElementById('dmShareModal');
    if (m) m.style.display = 'none';
  }

  function copyShareLink() {
    var box = document.getElementById('dmShareLinkBox');
    if (!box) return;
    navigator.clipboard.writeText(box.value).then(function(){
      _showToastLocal('Link copied to clipboard ✓', 'ok');
    }).catch(function(){
      box.select(); document.execCommand('copy');
      _showToastLocal('Link copied ✓', 'ok');
    });
  }

  function openShareLink() {
    var box = document.getElementById('dmShareLinkBox');
    if (box && box.value && box.value.startsWith('http')) window.open(box.value, '_blank');
  }

  // Refresh current folder
  async function refresh() {
    await _fetchFiles(_currentFolderId);
  }

  return {
    init, openPanel, closePanel,
    switchDrive, removeDrive,
    openAddDrive, closeAddDrive, confirmAddDrive,
    openNewFolder, closeNewFolder, confirmNewFolder,
    navTo,
    handleUpload,
    deleteFile: async function(id, name) {
      try { await _deleteFile(id, name); }
      catch(e) { _showToastLocal('Delete failed: ' + e.message, 'err'); }
    },
    shareFile,
    _applySharePermission,
    closeShareModal,
    copyShareLink,
    openShareLink,
    refresh
  };
})();
