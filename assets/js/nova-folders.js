// ══════════════════════════════════════════════════════════════════
//  NOVA STUDIO — Folder System for My Projects  (v1.0)
// ══════════════════════════════════════════════════════════════════
//
//  Firestore: users/{email}/proj_folders/{id}
//    { id, name, parentId (null = root), createdAt, color }
//
//  Projects get a new field: folderId (null = root)
//
//  Public API:
//    NF.init()            — call after login (called from boot)
//    NF.openManager()     — open full folder manager
//    NF.getCurrentPath()  — returns current breadcrumb path array
// ══════════════════════════════════════════════════════════════════

var NF = (function () {
  'use strict';

  var _currentFolderId = null;   // null = root
  var _folders = [];             // all user folders

  // ── Firestore helpers ──────────────────────────────────────────
  function _folCol() {
    return fbDb.collection('users').doc(U.email).collection('proj_folders');
  }

  function _esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Colour palette for folders ─────────────────────────────────
  var COLOURS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#f472b6','#14b8a6'];

  // ── Load all folders ───────────────────────────────────────────
  async function loadFolders() {
    if (!U || !U.email || U.email === 'demo@nova.studio') {
      _folders = JSON.parse(localStorage.getItem('nova_proj_folders') || '[]');
      return _folders;
    }
    try {
      var snap = await _folCol().orderBy('createdAt', 'asc').get();
      _folders = snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
    } catch (e) {
      _folders = JSON.parse(localStorage.getItem('nova_proj_folders') || '[]');
    }
    return _folders;
  }

  // ── Save one folder ────────────────────────────────────────────
  async function saveFolder(folder) {
    if (!U || !U.email || U.email === 'demo@nova.studio') {
      var arr = JSON.parse(localStorage.getItem('nova_proj_folders') || '[]');
      var idx = arr.findIndex(function (f) { return f.id === folder.id; });
      if (idx >= 0) arr[idx] = folder; else arr.push(folder);
      localStorage.setItem('nova_proj_folders', JSON.stringify(arr));
      return;
    }
    try { await _folCol().doc(folder.id).set(folder); } catch (e) { console.warn('NF saveFolder', e); }
  }

  // ── Delete folder (and move its children to parent) ────────────
  async function deleteFolder(id) {
    var folder = _folders.find(function (f) { return f.id === id; });
    if (!folder) return;

    // Re-parent immediate child folders to this folder's parent
    var children = _folders.filter(function (f) { return f.parentId === id; });
    for (var i = 0; i < children.length; i++) {
      children[i].parentId = folder.parentId;
      await saveFolder(children[i]);
    }

    // Move projects in this folder to parent folder
    try {
      var projs = await projLoad();
      for (var j = 0; j < projs.length; j++) {
        if (projs[j].folderId === id) {
          projs[j].folderId = folder.parentId;
          await projSaveOne(projs[j]);
        }
      }
    } catch (e) {}

    // Delete folder doc
    if (!U || !U.email || U.email === 'demo@nova.studio') {
      var arr = JSON.parse(localStorage.getItem('nova_proj_folders') || '[]');
      localStorage.setItem('nova_proj_folders', JSON.stringify(arr.filter(function (f) { return f.id !== id; })));
    } else {
      try { await _folCol().doc(id).delete(); } catch (e) { console.warn('NF deleteFolder', e); }
    }

    _folders = _folders.filter(function (f) { return f.id !== id; });
  }

  // ── Create new folder ──────────────────────────────────────────
  async function createFolder(name, parentId) {
    var id = 'fld_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var colour = COLOURS[_folders.length % COLOURS.length];
    var folder = {
      id: id,
      name: name.trim(),
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      color: colour
    };
    _folders.push(folder);
    await saveFolder(folder);
    return folder;
  }

  // ── Rename folder ──────────────────────────────────────────────
  async function renameFolder(id) {
    var folder = _folders.find(function (f) { return f.id === id; });
    if (!folder) return;
    var newName = prompt('Rename folder:', folder.name);
    if (!newName || !newName.trim()) return;
    folder.name = newName.trim();
    await saveFolder(folder);
    await projRender();
  }

  // ── Get breadcrumb path for a folder ──────────────────────────
  function getBreadcrumb(folderId) {
    var path = [];
    var id = folderId;
    var safety = 0;
    while (id && safety < 10) {
      var f = _folders.find(function (x) { return x.id === id; });
      if (!f) break;
      path.unshift(f);
      id = f.parentId;
      safety++;
    }
    return path;
  }

  // ── Navigate into a folder ─────────────────────────────────────
  async function navigateTo(folderId) {
    _currentFolderId = folderId;
    await projRender();
    _renderBreadcrumb();
  }

  // ── Render breadcrumb bar ──────────────────────────────────────
  function _renderBreadcrumb() {
    var bar = document.getElementById('nfBreadcrumb');
    if (!bar) return;
    var path = getBreadcrumb(_currentFolderId);
    var html = '<span class="nf-bc-item" onclick="NF.navigateTo(null)" style="cursor:pointer;color:var(--lime-d,#6d8400);font-weight:700;">🏠 All Projects</span>';
    path.forEach(function (f) {
      html += '<span style="color:var(--mist,#9ca3af);margin:0 5px">/</span>';
      html += '<span class="nf-bc-item" onclick="NF.navigateTo(\'' + f.id + '\')" style="cursor:pointer;color:var(--lime-d,#6d8400);font-weight:700;">' + _esc(f.name) + '</span>';
    });
    bar.innerHTML = html;
  }

  // ── Inject breadcrumb + new-folder bar above project grid ──────
  function _injectProjectBar() {
    var projGrid = document.getElementById('projGrid');
    if (!projGrid) return;
    var existing = document.getElementById('nfBar');
    if (existing) return;

    var bar = document.createElement('div');
    bar.id = 'nfBar';
    bar.style.cssText = 'margin-bottom:14px;display:flex;flex-direction:column;gap:10px;';
    bar.innerHTML =
      // Breadcrumb
      '<div id="nfBreadcrumb" style="font-size:.8rem;padding:8px 12px;background:var(--card,#fff);border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">🏠 All Projects</div>' +
      // New folder button
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<button onclick="NF.promptCreateFolder()" style="font-size:.72rem;font-weight:700;padding:7px 14px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:var(--card,#fff);cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--ink,#111);transition:all .13s;" onmouseover="this.style.borderColor=\'var(--lime-d,#6d8400)\'" onmouseout="this.style.borderColor=\'var(--fog,#e5e7eb)\'">📁 New Folder</button>' +
      '</div>';

    var parent = projGrid.parentNode;
    parent.insertBefore(bar, projGrid);
  }

  // ── Prompt to create folder ────────────────────────────────────
  async function promptCreateFolder() {
    _openCreateFolderModal();
  }

  function _openCreateFolderModal() {
    var existing = document.getElementById('nfCreateModal');
    if (existing) { existing.style.display = 'flex'; return; }

    var modal = document.createElement('div');
    modal.id = 'nfCreateModal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:3000;background:rgba(13,15,18,.55);backdrop-filter:blur(5px);align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML =
      '<div style="background:var(--card,#fff);border-radius:16px;border:1.5px solid var(--fog,#e5e7eb);padding:24px;width:min(380px,100%);box-shadow:0 20px 60px rgba(0,0,0,.18);">' +
        '<div style="font-size:.92rem;font-weight:800;margin-bottom:16px;">📁 New Folder</div>' +
        '<div style="font-size:.72rem;font-weight:700;margin-bottom:5px;color:var(--ink,#111)">Folder Name</div>' +
        '<input id="nfCreateName" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;font-size:.82rem;margin-bottom:14px;outline:none;font-family:inherit;" placeholder="e.g. College Projects" />' +
        '<div style="font-size:.72rem;font-weight:700;margin-bottom:5px;color:var(--ink,#111)">Create Inside</div>' +
        '<select id="nfCreateParent" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;font-size:.82rem;margin-bottom:18px;background:var(--card,#fff);color:var(--ink,#111);font-family:inherit;">' +
          '<option value="">— Root (top level) —</option>' +
        '</select>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button onclick="document.getElementById(\'nfCreateModal\').style.display=\'none\'" style="padding:8px 16px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:transparent;cursor:pointer;font-size:.78rem;font-weight:700;">Cancel</button>' +
          '<button onclick="NF._confirmCreateFolder()" style="padding:8px 18px;background:var(--ink,#111);color:#fff;border:none;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;">✓ Create</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Populate parent dropdown
    _populateParentSelect('nfCreateParent', null);

    document.getElementById('nfCreateName').focus();
    document.getElementById('nfCreateName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') NF._confirmCreateFolder();
      if (e.key === 'Escape') document.getElementById('nfCreateModal').style.display = 'none';
    });
  }

  function _populateParentSelect(selectId, excludeId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    // Keep first "root" option, remove others
    while (sel.options.length > 1) sel.remove(1);
    _folders.forEach(function (f) {
      if (f.id === excludeId) return;
      var opt = document.createElement('option');
      opt.value = f.id;
      // Show nested level
      var depth = getBreadcrumb(f.id).length - 1;
      opt.textContent = ('  '.repeat(depth)) + '📁 ' + f.name;
      sel.appendChild(opt);
    });
    // Set current folder as default
    if (_currentFolderId) {
      sel.value = _currentFolderId;
    }
  }

  async function _confirmCreateFolder() {
    var nameEl = document.getElementById('nfCreateName');
    var parentEl = document.getElementById('nfCreateParent');
    var name = nameEl ? nameEl.value.trim() : '';
    var parentId = parentEl ? (parentEl.value || null) : _currentFolderId;
    if (!name) { if (nameEl) nameEl.focus(); return; }

    var modal = document.getElementById('nfCreateModal');
    if (modal) modal.style.display = 'none';

    await createFolder(name, parentId);
    showToast('Folder "' + name + '" created ✓', 'ok');
    await projRender();
  }

  // ── Move project to folder modal ───────────────────────────────
  async function openMoveModal(projId) {
    var existing = document.getElementById('nfMoveModal');
    if (existing) existing.remove();

    var projs = await projLoad();
    var proj = projs.find(function (p) { return p.id === projId; });
    if (!proj) return;

    var modal = document.createElement('div');
    modal.id = 'nfMoveModal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:3000;background:rgba(13,15,18,.55);backdrop-filter:blur(5px);align-items:center;justify-content:center;padding:20px;';

    var options = '<option value="">— Root (no folder) —</option>';
    _folders.forEach(function (f) {
      var depth = getBreadcrumb(f.id).length - 1;
      var selected = proj.folderId === f.id ? ' selected' : '';
      options += '<option value="' + f.id + '"' + selected + '>'+('  '.repeat(depth))+'📁 ' + _esc(f.name) + '</option>';
    });

    modal.innerHTML =
      '<div style="background:var(--card,#fff);border-radius:16px;border:1.5px solid var(--fog,#e5e7eb);padding:24px;width:min(380px,100%);box-shadow:0 20px 60px rgba(0,0,0,.18);">' +
        '<div style="font-size:.92rem;font-weight:800;margin-bottom:4px;">📂 Move Project</div>' +
        '<div style="font-size:.76rem;color:var(--mist,#9ca3af);margin-bottom:16px;">"' + _esc(proj.name) + '"</div>' +
        '<div style="font-size:.72rem;font-weight:700;margin-bottom:6px;">Move to folder:</div>' +
        '<select id="nfMoveTarget" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--fog,#e5e7eb);border-radius:9px;font-size:.82rem;margin-bottom:18px;background:var(--card,#fff);color:var(--ink,#111);font-family:inherit;">' + options + '</select>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button onclick="document.getElementById(\'nfMoveModal\').remove()" style="padding:8px 16px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:transparent;cursor:pointer;font-size:.78rem;font-weight:700;">Cancel</button>' +
          '<button onclick="NF._confirmMove(\'' + projId + '\')" style="padding:8px 18px;background:var(--lime-d,#6d8400);color:var(--ink,#111);border:none;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;">✓ Move Here</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  async function _confirmMove(projId) {
    var sel = document.getElementById('nfMoveTarget');
    var targetFolderId = sel ? (sel.value || null) : null;
    var modal = document.getElementById('nfMoveModal');
    if (modal) modal.remove();

    var projs = await projLoad();
    var proj = projs.find(function (p) { return p.id === projId; });
    if (!proj) return;
    proj.folderId = targetFolderId;
    proj.updatedAt = new Date().toISOString();
    await projSaveOne(proj);
    showToast('Project moved ✓', 'ok');
    await projRender();
  }

  // ── Preview modal (like Teams) ─────────────────────────────────
  function openPreview(proj) {
    var existing = document.getElementById('nfPreviewModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'nfPreviewModal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:4000;background:rgba(13,15,18,.75);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px;';

    var date = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var thumbContent = proj.thumb
      ? '<img src="' + proj.thumb + '" alt="' + _esc(proj.name) + '" style="max-width:100%;max-height:420px;object-fit:contain;border-radius:10px;display:block;margin:0 auto;box-shadow:0 8px 32px rgba(0,0,0,.25);">'
      : '<div style="width:100%;height:300px;display:flex;align-items:center;justify-content:center;font-size:5rem;opacity:.3;">📄</div>';

    modal.innerHTML =
      '<div style="background:var(--card,#fff);border-radius:20px;border:1.5px solid var(--fog,#e5e7eb);width:min(620px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.25);">' +
        // Header
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1.5px solid var(--fog,#e5e7eb);flex-shrink:0;">' +
          '<div>' +
            '<div style="font-size:.95rem;font-weight:800;letter-spacing:-.01em;">' + _esc(proj.name) + '</div>' +
            '<div style="font-size:.7rem;color:var(--mist,#9ca3af);margin-top:2px;">Last modified: ' + date + '</div>' +
          '</div>' +
          '<button onclick="document.getElementById(\'nfPreviewModal\').remove()" style="background:transparent;border:none;font-size:1.3rem;cursor:pointer;color:var(--mist,#9ca3af);line-height:1;padding:4px;">✕</button>' +
        '</div>' +
        // Preview
        '<div style="flex:1;overflow-y:auto;padding:24px;background:var(--bg,#f8fafc);">' +
          '<div style="background:var(--card,#fff);border-radius:12px;padding:20px;border:1.5px solid var(--fog,#e5e7eb);">' +
            thumbContent +
          '</div>' +
        '</div>' +
        // Actions
        '<div style="padding:14px 20px;border-top:1.5px solid var(--fog,#e5e7eb);flex-shrink:0;display:flex;gap:8px;justify-content:flex-end;background:var(--card,#fff);">' +
          '<button onclick="NF._previewMove(\''+proj.id+'\')" style="padding:8px 14px;border:1.5px solid var(--fog,#e5e7eb);border-radius:8px;background:transparent;cursor:pointer;font-size:.76rem;font-weight:700;">📂 Move to Folder</button>' +
          '<button onclick="NF._previewDelete(\''+proj.id+'\')" style="padding:8px 14px;border:1.5px solid #fecaca;border-radius:8px;background:#fff5f5;cursor:pointer;font-size:.76rem;font-weight:700;color:#dc2626;">🗑 Delete</button>' +
          '<button onclick="projLoadDesign(\''+proj.id+'\');document.getElementById(\'nfPreviewModal\').remove()" style="padding:8px 18px;background:var(--ink,#111);color:#fff;border:none;border-radius:8px;font-size:.76rem;font-weight:700;cursor:pointer;">✏️ Open & Edit</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('mousedown', function (e) {
      if (e.target === modal) modal.remove();
    });
  }

  async function _previewMove(projId) {
    document.getElementById('nfPreviewModal').remove();
    await openMoveModal(projId);
  }

  async function _previewDelete(projId) {
    document.getElementById('nfPreviewModal').remove();
    await projDeleteTobin(projId);
  }

  // ── Render folder cards + filtered project cards ───────────────
  // Called by the patched projRender()
  async function renderFolderView(projects, grid) {
    await loadFolders();
    _injectProjectBar();
    _renderBreadcrumb();

    // Sub-folders in current level
    var subFolders = _folders.filter(function (f) { return (f.parentId || null) === (_currentFolderId || null); });
    // Projects in current folder
    var filteredProjs = projects.filter(function (p) { return (p.folderId || null) === (_currentFolderId || null); });

    var html = '';

    // Folder cards
    subFolders.forEach(function (f) {
      var projsInside = _countProjectsInFolder(f.id, projects);
      html +=
        '<div class="proj-card nf-folder-card" style="cursor:pointer;" onclick="NF.navigateTo(\'' + f.id + '\')">' +
          '<div style="height:100px;background:linear-gradient(135deg,' + f.color + '22,' + f.color + '44);display:flex;align-items:center;justify-content:center;font-size:3rem;border-bottom:1.5px solid var(--fog,#e5e7eb);">📁</div>' +
          '<div class="proj-body" style="padding:10px 14px;">' +
            '<div class="proj-name" style="font-size:.82rem;">' + _esc(f.name) + '</div>' +
            '<div class="proj-meta"><span>' + projsInside + ' item' + (projsInside !== 1 ? 's' : '') + '</span></div>' +
          '</div>' +
          '<div class="proj-actions">' +
            '<button class="proj-act-btn" onclick="event.stopPropagation();NF.navigateTo(\'' + f.id + '\')" style="font-size:.68rem;">📂 Open</button>' +
            '<button class="proj-act-btn" onclick="event.stopPropagation();NF.renameFolder(\'' + f.id + '\')" style="font-size:.68rem;">✏ Rename</button>' +
            '<button class="proj-act-btn danger" onclick="event.stopPropagation();NF.confirmDeleteFolder(\'' + f.id + '\')" style="font-size:.68rem;">🗑 Delete</button>' +
          '</div>' +
        '</div>';
    });

    // Project cards
    filteredProjs.forEach(function (p) {
      var date = new Date(p.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      var thumbHtml = p.thumb
        ? '<img src="' + p.thumb + '" alt="' + _esc(p.name) + '">'
        : '<div class="proj-thumb-placeholder">📄</div>';
      html +=
        '<div class="proj-card">' +
          '<div class="proj-thumb" onclick="NF.openPreview(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')" style="cursor:pointer;">' +
            thumbHtml +
            '<div class="proj-thumb-overlay">' +
              '<button class="proj-thumb-btn" onclick="event.stopPropagation();NF.openPreview(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">👁 Preview</button>' +
              '<button class="proj-thumb-btn" onclick="event.stopPropagation();projLoadDesign(\'' + p.id + '\')">✏️ Open</button>' +
            '</div>' +
          '</div>' +
          '<div class="proj-body">' +
            '<div class="proj-name">' + _esc(p.name) + '</div>' +
            '<div class="proj-meta"><span>Certificate</span><span class="proj-meta-dot"></span><span>' + date + '</span></div>' +
          '</div>' +
          '<div class="proj-actions">' +
            '<button class="proj-act-btn" onclick="projLoadDesign(\'' + p.id + '\')">✏️ Open</button>' +
            '<button class="proj-act-btn" onclick="NF.openMoveModal(\'' + p.id + '\')" style="font-size:.68rem;">📂 Move</button>' +
            '<button class="proj-act-btn" onclick="projRename(\'' + p.id + '\')">✏ Rename</button>' +
            '<button class="proj-act-btn danger" onclick="projDeleteTobin(\'' + p.id + '\')">🗑</button>' +
          '</div>' +
        '</div>';
    });

    grid.innerHTML = html;

    // Show/hide empty state
    var empty = document.getElementById('projEmpty');
    if (empty) {
      if (subFolders.length === 0 && filteredProjs.length === 0) {
        empty.style.display = 'flex';
        grid.style.display = 'none';
      } else {
        empty.style.display = 'none';
        grid.style.display = 'grid';
      }
    }
  }

  function _countProjectsInFolder(folderId, projects) {
    // Count direct + recursive
    var directProjs = projects.filter(function (p) { return p.folderId === folderId; }).length;
    var childFolders = _folders.filter(function (f) { return f.parentId === folderId; });
    var childCount = 0;
    childFolders.forEach(function (cf) { childCount += _countProjectsInFolder(cf.id, projects); });
    // Also count sub-folders themselves
    return directProjs + childFolders.length + childCount;
  }

  // ── Confirm delete folder ──────────────────────────────────────
  async function confirmDeleteFolder(id) {
    var folder = _folders.find(function (f) { return f.id === id; });
    if (!folder) return;
    var childFolders = _folders.filter(function (f) { return f.parentId === id; });
    var msg = 'Delete folder "' + folder.name + '"?';
    if (childFolders.length > 0) msg += '\n\nSub-folders and projects inside will be moved up to the parent level.';
    if (!confirm(msg)) return;
    await deleteFolder(id);
    showToast('"' + folder.name + '" folder deleted ✓', 'info');
    // If we were inside this folder, go to its parent
    if (_currentFolderId === id) {
      _currentFolderId = folder.parentId;
    }
    await projRender();
  }

  // ── Patch projRender to use folder view ────────────────────────
  function _patchProjRender() {
    var origRender = window.projRender;
    if (!origRender) { setTimeout(_patchProjRender, 200); return; }

    window.projRender = async function () {
      var projects = await projLoad();
      var bin      = await projBinLoad();
      var grid     = document.getElementById('projGrid');
      var empty    = document.getElementById('projEmpty');
      var binEmpty = document.getElementById('projBinEmpty');
      var limitBar = document.getElementById('projLimitBar');
      var binBar   = document.getElementById('projBinBar');
      var binBtn   = document.getElementById('projBinBtn');

      if (!grid) return;

      // Update bin badge
      var binCountEl = document.getElementById('projBinCount');
      if (binCountEl) {
        if (bin.length > 0) { binCountEl.textContent = bin.length; binCountEl.style.display = 'inline'; }
        else binCountEl.style.display = 'none';
      }

      if (binBar) binBar.style.display = projShowBin ? 'flex' : 'none';
      if (limitBar) {
        limitBar.style.display = projects.length > 0 ? 'flex' : 'none';
        document.getElementById('projLimitFill').style.width = (projects.length / PROJ_LIMIT * 100) + '%';
        document.getElementById('projLimitFill').style.background = projects.length >= 18 ? 'var(--coral)' : projects.length >= 15 ? '#f59e0b' : 'linear-gradient(90deg,var(--lime),var(--teal))';
        document.getElementById('projLimitTxt').textContent = projects.length + ' / ' + PROJ_LIMIT;
      }

      if (projShowBin) {
        // Standard bin render (no folders in bin)
        var nfBar = document.getElementById('nfBar');
        if (nfBar) nfBar.style.display = 'none';
        if (bin.length === 0) {
          grid.innerHTML = '';
          grid.style.display = 'none';
          if (binEmpty) binEmpty.style.display = 'flex';
          if (empty) empty.style.display = 'none';
          return;
        }
        if (binEmpty) binEmpty.style.display = 'none';
        if (empty) empty.style.display = 'none';
        grid.style.display = 'grid';
        grid.innerHTML = bin.map(function (p) {
          var date = new Date(p.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          var thumbHtml = p.thumb ? '<img src="' + p.thumb + '" alt="' + _esc(p.name) + '">' : '<div class="proj-thumb-placeholder">📄</div>';
          return '<div class="proj-card">' +
            '<div class="proj-thumb">' + thumbHtml + '</div>' +
            '<div class="proj-body">' +
              '<div class="proj-name">' + _esc(p.name) + '</div>' +
              '<div class="proj-meta"><span>Deleted</span><span class="proj-meta-dot"></span><span>' + date + '</span></div>' +
            '</div>' +
            '<div class="proj-actions">' +
              '<button class="proj-act-btn restore" onclick="projRestore(\'' + p.id + '\')">↩ Restore</button>' +
              '<button class="proj-act-btn danger" onclick="projPermDelete(\'' + p.id + '\')">🗑 Delete</button>' +
            '</div>' +
          '</div>';
        }).join('');
        return;
      }

      // Show folder bar
      var nfBar = document.getElementById('nfBar');
      if (nfBar) nfBar.style.display = 'flex';

      // Folder view render
      await renderFolderView(projects, grid);

      // Update settings data counts
      var sc = document.getElementById('stgProjCount');
      var bc = document.getElementById('stgBinCount');
      if (sc) sc.textContent = projects.length;
      if (bc) bc.textContent = bin.length;
    };
  }

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    if (!U || !U.email) return;
    loadFolders().then(function () {
      _patchProjRender();
    });
  }

  // ── Expose public API ──────────────────────────────────────────
  return {
    init: init,
    navigateTo: navigateTo,
    promptCreateFolder: promptCreateFolder,
    openPreview: openPreview,
    openMoveModal: openMoveModal,
    renameFolder: renameFolder,
    confirmDeleteFolder: confirmDeleteFolder,
    getBreadcrumb: getBreadcrumb,
    // internal (called from modal buttons)
    _confirmCreateFolder: _confirmCreateFolder,
    _confirmMove: _confirmMove,
    _previewMove: _previewMove,
    _previewDelete: _previewDelete
  };
})();
