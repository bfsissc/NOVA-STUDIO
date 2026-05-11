// ══════════════════════════════════════════════════════════════════
// ██ NOVA STUDIO — COLLEGE PORTAL ADMIN  (college-portal-admin.js)
// ══════════════════════════════════════════════════════════════════

var CP = {
  currentSlug:      '',
  templateImg:      null,
  templateUrl:      '',
  csvDriveUrl:      '',
  templateWidth:    2480,
  templateHeight:   1754,
  isDragging:       false,
  namePos:          { xPct: 50, yPct: 62 },
  nameStyle:        { fontSize: 60, fontFamily: 'Georgia', color: '#1a1a1a', bold: false, italic: false, align: 'center' },
  students:         [],
  portals:          [],
  step:             1,
};

// ══════════════════════════════════════════════════════════════════
// ── Draft persistence — survives page refresh ──
// ══════════════════════════════════════════════════════════════════
function cpSaveDraft() {
  try {
    var getVal = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var getChk = function(id) { var el = document.getElementById(id); return el ? el.checked : false; };
    var draft = {
      slug:          CP.currentSlug,
      namePos:       CP.namePos,
      nameStyle:     CP.nameStyle,
      templateUrl:   CP.templateUrl,
      templateWidth: CP.templateWidth,
      templateHeight:CP.templateHeight,
      csvDriveUrl:   CP.csvDriveUrl,
      students:      CP.students,
      step:          CP.step,
      fields: {
        collegeName:   getVal('cpCollegeName'),
        cardMessage:   getVal('cpCardMessage'),
        defaultLimit:  getVal('cpDefaultLimit'),
        openAccess:    getChk('cpOpenAccess'),
        headerColor:   getVal('cpHeaderColor'),
        accentColor:   getVal('cpAccentColor'),
        googleFormUrl: getVal('cpGoogleFormUrl'),
      }
    };
    try {
      localStorage.setItem('cp_draft', JSON.stringify(draft));
    } catch(quotaErr) {
      // Template base64 too large — save without it but keep Storage URL
      draft.templateUrl = CP.storageUrl || '';
      localStorage.setItem('cp_draft', JSON.stringify(draft));
    }
  } catch(e) { /* ignore */ }
}

function cpRestoreDraft() {
  try {
    var raw = localStorage.getItem('cp_draft');
    if (!raw) return false;
    var draft = JSON.parse(raw);
    if (!draft) return false;

    CP.currentSlug    = draft.slug          || '';
    CP.namePos        = draft.namePos        || { xPct: 50, yPct: 62 };
    CP.nameStyle      = draft.nameStyle      || { fontSize: 60, fontFamily: 'Georgia', color: '#1a1a1a', bold: false, italic: false, align: 'center' };
    CP.templateUrl    = draft.templateUrl    || '';
    CP.templateWidth  = draft.templateWidth  || 2480;
    CP.templateHeight = draft.templateHeight || 1754;
    CP.csvDriveUrl    = draft.csvDriveUrl    || '';
    CP.students       = draft.students       || [];

    var f = draft.fields || {};
    function _set(id, prop, val) { var el = document.getElementById(id); if (el && val !== undefined) el[prop] = val; }
    _set('cpCollegeName',    'value',       f.collegeName   || '');
    _set('cpSlugPreview',    'textContent', CP.currentSlug  || 'your-college');
    _set('cpCardMessage',    'value',       f.cardMessage   || '');
    _set('cpDefaultLimit',   'value',       f.defaultLimit  || 3);
    _set('cpOpenAccess',     'checked',     f.openAccess    || false);
    _set('cpHeaderColor',    'value',       f.headerColor   || '#1a1a2e');
    _set('cpAccentColor',    'value',       f.accentColor   || '#4f46e5');
    _set('cpGoogleFormUrl',  'value',       f.googleFormUrl || '');
    _set('cpFontSize',       'value',       CP.nameStyle.fontSize   || 60);
    _set('cpFontFamily',     'value',       CP.nameStyle.fontFamily || 'Georgia');
    _set('cpFontColor',      'value',       CP.nameStyle.color      || '#1a1a1a');
    _set('cpFontBold',       'checked',     CP.nameStyle.bold       || false);
    _set('cpFontItalic',     'checked',     CP.nameStyle.italic     || false);
    _set('cpFontAlign',      'value',       CP.nameStyle.align      || 'center');
    _set('cpXPct',           'value',       CP.namePos.xPct != null ? CP.namePos.xPct.toFixed(1) : '50.0');
    _set('cpYPct',           'value',       CP.namePos.yPct != null ? CP.namePos.yPct.toFixed(1) : '62.0');

    // Restore template image from base64 / URL
    if (CP.templateUrl) {
      var img = new Image();
      img.onload = function() {
        CP.templateImg    = img;
        CP.templateWidth  = img.naturalWidth;
        CP.templateHeight = img.naturalHeight;
        var badge = document.getElementById('cpTemplateBadge');
        var wrap  = document.getElementById('cpTemplateBadgeWrap');
        var thumb = document.getElementById('cpTemplateThumb');
        var si    = document.getElementById('cpTemplateLoadStatus');
        if (badge) badge.textContent = 'Template restored (' + img.naturalWidth + '×' + img.naturalHeight + ') ✓';
        if (wrap)  wrap.style.display = 'flex';
        if (thumb) { thumb.src = CP.templateUrl; thumb.style.display = 'block'; }
        if (si)    si.textContent = '✅';
        if (CP.step === 3) cpDrawNameCanvas();
      };
      img.src = CP.templateUrl;
    }

    // Restore CSV badge & table
    if (CP.students.length > 0) {
      var cb = document.getElementById('cpCsvBadge');
      var cw = document.getElementById('cpCsvBadgeWrap');
      if (cb) cb.textContent = CP.students.length + ' students (restored from draft)';
      if (cw) cw.style.display = 'flex';
      cpRenderStudentTable();
    }

    return !!(CP.currentSlug || CP.templateUrl || CP.students.length > 0);
  } catch(e) {
    return false;
  }
}

function cpClearDraft() {
  localStorage.removeItem('cp_draft');
}

// ══════════════════════════════════════════════════════════════════
// ── Delete portal ──
// ══════════════════════════════════════════════════════════════════
async function cpDeletePortal(slug, name) {
  if (!confirm('⚠️ Delete portal "' + name + '"?\n\nThis will permanently delete this portal and ALL student data.\nThis action CANNOT be undone.')) return;

  try {
    cpToast('Deleting portal…', 'info');

    // Must delete subcollection students first (Firestore doesn't cascade)
    var snap = await fbDb.collection('college_portals').doc(slug).collection('students').get();
    if (!snap.empty) {
      var batch = fbDb.batch(), batchCount = 0;
      snap.forEach(function(doc) {
        batch.delete(doc.ref);
        batchCount++;
        if (batchCount >= 490) { batch.commit(); batch = fbDb.batch(); batchCount = 0; }
      });
      if (batchCount > 0) await batch.commit();
    }

    // Delete the portal document itself
    await fbDb.collection('college_portals').doc(slug).delete();

    cpToast('Portal "' + name + '" deleted permanently.', 'ok');
    cpLoadPortalList();
  } catch(e) {
    cpToast('Delete failed: ' + e.message, 'err');
  }
}

// ── Init ──
function cpInit() {
  cpLoadPortalList();

  // Restore any unsaved wizard draft from before the page refresh
  var hasDraft = cpRestoreDraft();
  if (hasDraft) {
    cpRenderStep(CP.step || 1);
    var wiz = document.getElementById('cpWizard');
    if (wiz) wiz.style.display = 'block';
    cpToast('📋 Draft restored — your unsaved work is back!', 'ok');
  } else {
    cpRenderStep(1);
    var cUrl = localStorage.getItem('cp_last_csv_url') || '';
    var ci = document.getElementById('cpCsvDriveUrl');
    if (ci && cUrl) ci.value = cUrl;
  }
}

// ── Wizard navigation ──
function cpRenderStep(n) {
  CP.step = n;
  for (var i = 1; i <= 5; i++) {
    var el  = document.getElementById('cpStep' + i);
    var dot = document.getElementById('cpDot'  + i);
    if (el)  el.style.display = (i === n) ? 'block' : 'none';
    if (dot) dot.className = 'cp-dot' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  var backBtn = document.getElementById('cpBtnBack');
  var nextBtn = document.getElementById('cpBtnNext');
  if (backBtn) backBtn.style.visibility = (n > 1) ? 'visible' : 'hidden';
  if (nextBtn) nextBtn.style.display    = (n === 5) ? 'none' : 'inline-flex';
  if (n === 3 && CP.templateImg) cpDrawNameCanvas();
  if (n === 5) cpRenderPortalLink();
}

function cpNextStep() { if (cpValidateStep(CP.step)) { cpSaveDraft(); cpRenderStep(CP.step + 1); } }
function cpPrevStep() { cpSaveDraft(); cpRenderStep(Math.max(1, CP.step - 1)); }

function cpValidateStep(n) {
  if (n === 1) {
    var name = document.getElementById('cpCollegeName').value.trim();
    if (!name) { cpToast('Please enter a college name.', 'err'); return false; }
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    document.getElementById('cpSlugPreview').textContent = slug;
    CP.currentSlug = slug;
    return true;
  }
  if (n === 2) {
    if (!CP.templateImg) { cpToast('Please load a certificate template first.', 'err'); return false; }
    if (CP.students.length === 0) { cpToast('Please load student CSV data first.', 'err'); return false; }
    return true;
  }
  return true;
}

// ── Step 1: College details ──
function cpSlugFromName() {
  var n = document.getElementById('cpCollegeName').value.trim();
  var s = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  document.getElementById('cpSlugPreview').textContent = s || 'your-college';
  CP.currentSlug = s;
}

// ══════════════════════════════════════════════════════════════════
// ── Step 2: Template upload ──
// ══════════════════════════════════════════════════════════════════

function cpExtractDriveFileId(url) {
  url = (url || '').trim();
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function cpTemplateUrlChanged() {
  var wrap = document.getElementById('cpTemplateBadgeWrap');
  if (wrap) wrap.style.display = 'none';
}

async function cpHandleTemplateFileInput(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { cpToast('Please select an image file (PNG, JPG, etc.)', 'err'); return; }
  if (file.size > 10 * 1024 * 1024) { cpToast('Image is too large (max 10 MB).', 'err'); return; }

  var badge    = document.getElementById('cpTemplateBadge');
  var badgeWrap= document.getElementById('cpTemplateBadgeWrap');
  var statusEl = document.getElementById('cpTemplateLoadStatus');
  badge.textContent = 'Uploading…';
  statusEl.textContent = '⏳';
  badgeWrap.style.display = 'flex';

  try {
    var localUrl = URL.createObjectURL(file);
    var previewImg = new Image();
    previewImg.onload = function() {
      CP.templateImg    = previewImg;
      CP.templateWidth  = previewImg.naturalWidth;
      CP.templateHeight = previewImg.naturalHeight;
      var thumb = document.getElementById('cpTemplateThumb');
      if (thumb) { thumb.src = localUrl; thumb.style.display = 'block'; }
      if (CP.step === 3) cpDrawNameCanvas();
    };
    previewImg.src = localUrl;

    var base64DataUrl = await new Promise(function(res, rej) {
      var r = new FileReader();
      r.onload = function(e) { res(e.target.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    CP.templateUrl = base64DataUrl;

    if (typeof fbStorage === 'undefined') throw new Error('Firebase Storage not initialized');
    var ext      = file.name.split('.').pop() || 'png';
    var uid      = (typeof U !== 'undefined' && U) ? U.uid : 'anon';
    var path     = 'portal-templates/' + uid + '/' + Date.now() + '.' + ext;
    var storageRef = fbStorage.ref(path);

    badge.textContent = 'Uploading… 0%';
    var uploadTask = storageRef.put(file);
    uploadTask.on('state_changed', function(snapshot) {
      var pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      badge.textContent = 'Uploading… ' + pct + '%';
    }, function(err) { throw err; });
    await uploadTask;
    var downloadUrl = await storageRef.getDownloadURL();
    CP.storageUrl = downloadUrl;

    badge.textContent = file.name + ' (' + (CP.templateWidth || '?') + '×' + (CP.templateHeight || '?') + ') — uploaded ✓';
    statusEl.textContent = '✅';
    var urlInput = document.getElementById('cpTemplateDriveUrl');
    if (urlInput) urlInput.value = '';
    cpToast('Template uploaded & ready ✓', 'ok');
    cpSaveDraft();
  } catch(err) {
    statusEl.textContent = '❌';
    badge.textContent = 'Upload failed: ' + err.message;
    cpToast('Upload failed: ' + err.message, 'err');
  }
}

function cpTriggerTemplateUpload() {
  var input = document.getElementById('cpTemplateFileInput');
  if (input) input.click();
}

async function cpFetchTemplateFromUrl() {
  var raw = (document.getElementById('cpTemplateDriveUrl').value || '').trim();
  if (!raw) { cpToast('Please paste a Google Drive link or upload a file.', 'err'); return; }
  var badge    = document.getElementById('cpTemplateBadge');
  var badgeWrap= document.getElementById('cpTemplateBadgeWrap');
  var statusEl = document.getElementById('cpTemplateLoadStatus');
  badge.textContent = 'Loading…';
  statusEl.textContent = '⏳';
  badgeWrap.style.display = 'flex';
  localStorage.setItem('cp_last_tpl_url', raw);
  var fileId = cpExtractDriveFileId(raw);
  var driveUrls = fileId ? [
    'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w2000',
    'https://lh3.googleusercontent.com/d/' + fileId + '=w2000',
    'https://drive.google.com/uc?export=download&id=' + fileId,
  ] : [raw];
  var proxies = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];
  var urlsToTry = [];
  driveUrls.forEach(function(u) { urlsToTry.push(u); });
  proxies.forEach(function(proxy) { driveUrls.forEach(function(u) { urlsToTry.push(proxy + encodeURIComponent(u)); }); });
  var lastErr = '';
  for (var ui = 0; ui < urlsToTry.length; ui++) {
    badge.textContent = 'Trying method ' + (ui + 1) + ' of ' + urlsToTry.length + '…';
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function() { ctrl.abort(); }, 8000);
      var resp = await fetch(urlsToTry[ui], { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html')) throw new Error('Got HTML');
      var blob = await resp.blob();
      if (!blob.type.startsWith('image/') && blob.size < 5000) throw new Error('Wrong type');
      var dataUrl = await new Promise(function(res, rej) {
        var r = new FileReader(); r.onload = function(e) { res(e.target.result); }; r.onerror = rej; r.readAsDataURL(blob);
      });
      var img = new Image();
      await new Promise(function(resolve, reject) { img.onload = resolve; img.onerror = function() { reject(new Error('Decode failed')); }; img.src = dataUrl; });
      CP.templateImg = img; CP.templateWidth = img.naturalWidth; CP.templateHeight = img.naturalHeight; CP.templateUrl = dataUrl;
      badge.textContent = 'Template loaded (' + img.naturalWidth + '×' + img.naturalHeight + ') ✓';
      statusEl.textContent = '✅';
      var thumb = document.getElementById('cpTemplateThumb');
      if (thumb) { thumb.src = dataUrl; thumb.style.display = 'block'; }
      cpToast('Template loaded ✓', 'ok');
      if (CP.step === 3) cpDrawNameCanvas();
      cpSaveDraft();
      return;
    } catch(e) { lastErr = e.message; }
  }
  statusEl.textContent = '❌';
  badge.textContent = 'Could not load (' + lastErr + ')';
  cpToast('Drive URL failed. Try uploading the file directly.', 'err');
}

// ── Step 2: CSV fetch ──
async function cpFetchCsvFromUrl() {
  var raw = (document.getElementById('cpCsvDriveUrl').value || '').trim();
  if (!raw) { cpToast('Please paste a Google Sheets or CSV link first.', 'err'); return; }
  var badge     = document.getElementById('cpCsvBadge');
  var badgeWrap = document.getElementById('cpCsvBadgeWrap');
  badge.textContent = 'Fetching…';
  badgeWrap.style.display = 'flex';
  CP.csvDriveUrl = raw;
  localStorage.setItem('cp_last_csv_url', raw);
  var sheetId = null, fileId = null, gid = 0;
  var sheetMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (sheetMatch) {
    sheetId = sheetMatch[1];
    var gidMatch = raw.match(/[#&?]gid=(\d+)/);
    if (gidMatch) gid = parseInt(gidMatch[1]);
  } else {
    var m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (!m) m = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (m) fileId = m[1];
  }
  var proxies = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];
  var urlsToTry = [];
  if (sheetId) {
    var baseUrls = [
      'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv&gid=' + gid,
      'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:csv&gid=' + gid,
      'https://docs.google.com/spreadsheets/d/' + sheetId + '/pub?output=csv&gid=' + gid,
    ];
    baseUrls.forEach(function(u) { urlsToTry.push(u); });
    proxies.forEach(function(p) { baseUrls.forEach(function(u) { urlsToTry.push(p + encodeURIComponent(u)); }); });
  } else if (fileId) {
    var driveExport = 'https://drive.google.com/uc?export=download&id=' + fileId;
    urlsToTry.push(driveExport);
    proxies.forEach(function(p) { urlsToTry.push(p + encodeURIComponent(driveExport)); });
  } else {
    urlsToTry.push(raw);
    proxies.forEach(function(p) { urlsToTry.push(p + encodeURIComponent(raw)); });
  }
  for (var ui = 0; ui < urlsToTry.length; ui++) {
    try {
      badge.textContent = 'Trying method ' + (ui + 1) + ' of ' + urlsToTry.length + '…';
      var ctrl = new AbortController();
      var timer = setTimeout(function() { ctrl.abort(); }, 8000);
      var resp = await fetch(urlsToTry[ui], { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var text = await resp.text();
      if (!text || text.trim().length < 2) throw new Error('Empty');
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) throw new Error('Got HTML');
      cpParseCsvStudents(text);
      if (CP.students.length === 0) throw new Error('No rows parsed');
      badge.textContent = CP.students.length + ' students loaded ✓';
      cpToast(CP.students.length + ' students loaded ✓', 'ok');
      var p = document.getElementById('cpManualEntryPanel');
      if (p) p.style.display = 'none';
      cpSaveDraft();
      return;
    } catch(err) { /* try next */ }
  }
  badge.textContent = 'Auto-fetch failed — enter data manually below';
  cpToast('Could not load Google Sheet. Enter data manually below.', 'err');
  var manualPanel = document.getElementById('cpManualEntryPanel');
  if (manualPanel) manualPanel.style.display = 'block';
}

function cpRemoveTemplate() {
  CP.templateImg = null; CP.templateUrl = '';
  document.getElementById('cpTemplateBadgeWrap').style.display = 'none';
  var urlInput = document.getElementById('cpTemplateDriveUrl');
  if (urlInput) urlInput.value = '';
  var fileInput = document.getElementById('cpTemplateFileInput');
  if (fileInput) fileInput.value = '';
  var thumb = document.getElementById('cpTemplateThumb');
  if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
}

function cpRemoveCsv() {
  CP.students = []; CP.csvDriveUrl = '';
  document.getElementById('cpCsvBadgeWrap').style.display = 'none';
  document.getElementById('cpCsvDriveUrl').value = '';
  var panel = document.getElementById('cpManualEntryPanel');
  if (panel) panel.style.display = 'none';
  localStorage.removeItem('cp_last_csv_url');
  cpRenderStudentTable();
}

// ── Parse CSV ──
function cpParseCsvStudents(text) {
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) { cpToast('CSV is empty or has only a header.', 'err'); return; }
  var headers  = lines[0].split(',').map(function(h) { return h.trim().replace(/^"|"$/g, '').toLowerCase(); });
  var nameIdx  = headers.findIndex(function(h) { return /^name$/i.test(h); });
  var limitIdx = headers.findIndex(function(h) { return /^(limit|downloads?|max|allowed)$/i.test(h); });
  if (nameIdx === -1) nameIdx = 0;
  CP.students = [];
  for (var i = 1; i < lines.length; i++) {
    var cols  = cpSplitCsvRow(lines[i]);
    var name  = (cols[nameIdx] || '').trim().replace(/^"|"$/g, '');
    if (!name) continue;
    var limit = limitIdx >= 0 ? (parseInt(cols[limitIdx]) || 1) : 1;
    CP.students.push({ name: name, limit: limit });
  }
  cpRenderStudentTable();
}

function cpSplitCsvRow(row) {
  var result = [], cur = '', inQ = false;
  for (var i = 0; i < row.length; i++) {
    var c = row[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function cpRenderStudentTable() {
  var tbody     = document.getElementById('cpStudentTable');
  var countEl   = document.getElementById('cpStudentCount');
  var tableWrap = document.getElementById('cpStudentTableWrap');
  if (!tbody) return;
  if (tableWrap) tableWrap.style.display = 'block';
  if (CP.students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--mist)">No students yet — add rows below or load a CSV</td></tr>';
    if (countEl) countEl.textContent = '0 students';
    return;
  }
  var cellStyle  = 'padding:4px 6px;vertical-align:middle';
  var inputStyle = 'width:100%;padding:4px 7px;border:1px solid var(--fog);border-radius:5px;font-size:.72rem;background:var(--card);color:var(--ink);font-family:inherit';
  var numStyle   = inputStyle + ';width:64px;text-align:center';
  tbody.innerHTML = CP.students.map(function(s, i) {
    return '<tr id="cpStudentRow_' + i + '">'
      + '<td style="' + cellStyle + ';color:var(--mist);font-size:.68rem;width:28px">' + (i + 1) + '</td>'
      + '<td style="' + cellStyle + '"><input type="text" style="' + inputStyle + '" value="' + escH(s.name) + '" oninput="cpStudentEdit(' + i + ',\'name\',this.value)" placeholder="Student name"></td>'
      + '<td style="' + cellStyle + '"><input type="number" style="' + numStyle + '" value="' + (s.limit || 1) + '" min="1" max="99" oninput="cpStudentEdit(' + i + ',\'limit\',+this.value)"></td>'
      + '<td style="' + cellStyle + ';width:28px"><button onclick="cpStudentDelete(' + i + ')" title="Delete row" style="background:none;border:none;cursor:pointer;color:#e05;font-size:.85rem;line-height:1;padding:2px 4px">✕</button></td>'
      + '</tr>';
  }).join('');
  if (countEl) countEl.textContent = CP.students.length + ' student' + (CP.students.length === 1 ? '' : 's');
}

function cpStudentEdit(idx, field, val) {
  if (!CP.students[idx]) return;
  if (field === 'limit') val = parseInt(val) || 1;
  CP.students[idx][field] = val;
  cpSaveDraft();
}

function cpStudentDelete(idx) {
  CP.students.splice(idx, 1);
  cpRenderStudentTable();
  cpSaveDraft();
}

function cpStudentAddRow() {
  CP.students.push({ name: '', limit: 1 });
  cpRenderStudentTable();
  var rows = document.querySelectorAll('#cpStudentTable tr');
  if (rows.length > 0) {
    var lastInput = rows[rows.length - 1].querySelector('input[type="text"]');
    if (lastInput) { lastInput.focus(); lastInput.scrollIntoView({ block: 'nearest' }); }
  }
}

function cpPasteCsvText() {
  var text = (document.getElementById('cpCsvPasteArea') ? document.getElementById('cpCsvPasteArea').value : '').trim();
  if (!text) { cpToast('Please paste CSV text first.', 'err'); return; }
  cpParseCsvStudents(text);
  var badge    = document.getElementById('cpCsvBadge');
  var badgeWrap= document.getElementById('cpCsvBadgeWrap');
  if (badge) badge.textContent = CP.students.length + ' students loaded from pasted CSV';
  if (badgeWrap) badgeWrap.style.display = 'flex';
  cpToast(CP.students.length + ' students loaded ✓', 'ok');
  var panel = document.getElementById('cpManualEntryPanel');
  if (panel) panel.style.display = 'none';
  if (document.getElementById('cpCsvPasteArea')) document.getElementById('cpCsvPasteArea').value = '';
}

function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ══════════════════════════════════════════════════════════════════
// ── Step 3: Name position canvas ──
// ══════════════════════════════════════════════════════════════════
function cpDrawNameCanvas() {
  var canvas = document.getElementById('cpNameCanvas');
  if (!canvas) return;
  var wrap   = canvas.parentElement;
  var wrapW  = wrap.clientWidth || 560;
  var aspect = CP.templateImg ? (CP.templateImg.naturalWidth / CP.templateImg.naturalHeight) : 1.414;
  canvas.width = wrapW; canvas.height = Math.round(wrapW / aspect);
  canvas.style.width = wrapW + 'px'; canvas.style.height = canvas.height + 'px';
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (CP.templateImg) {
    ctx.drawImage(CP.templateImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f0f0ee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  var previewName = (document.getElementById('cpPreviewName').value || '').trim() || 'Sample Name';
  var scale = canvas.width / (CP.templateWidth || 2480);
  var fs = Math.round((CP.nameStyle.fontSize || 60) * scale);
  ctx.font = (CP.nameStyle.italic ? 'italic ' : '') + (CP.nameStyle.bold ? 'bold ' : '') + fs + 'px ' + (CP.nameStyle.fontFamily || 'Georgia');
  ctx.fillStyle = CP.nameStyle.color || '#1a1a1a';
  ctx.textAlign = CP.nameStyle.align || 'center';
  ctx.textBaseline = 'middle';
  var xPx = canvas.width  * (CP.namePos.xPct / 100);
  var yPx = canvas.height * (CP.namePos.yPct / 100);
  ctx.fillText(previewName, xPx, yPx);
  ctx.strokeStyle = 'rgba(79,70,229,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(xPx, 0); ctx.lineTo(xPx, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, yPx); ctx.lineTo(canvas.width, yPx); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(xPx, yPx, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(79,70,229,0.9)'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

function cpCanvasMouseDown(e) { CP.isDragging = true; cpCanvasUpdatePos(e); }
function cpCanvasMouseMove(e) { if (CP.isDragging) cpCanvasUpdatePos(e); }

function cpCanvasUpdatePos(e) {
  var canvas = document.getElementById('cpNameCanvas');
  var rect   = canvas.getBoundingClientRect();
  var clientX = e.touches ? e.touches[0].clientX : e.clientX;
  var clientY = e.touches ? e.touches[0].clientY : e.clientY;
  CP.namePos.xPct = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width  * 100));
  CP.namePos.yPct = Math.max(0, Math.min(100, (clientY - rect.top)  / rect.height * 100));
  document.getElementById('cpXPct').value = CP.namePos.xPct.toFixed(1);
  document.getElementById('cpYPct').value = CP.namePos.yPct.toFixed(1);
  cpDrawNameCanvas();
}

function cpCanvasMouseUp() { CP.isDragging = false; cpSaveDraft(); }

function cpUpdatePosFromInput() {
  CP.namePos.xPct = parseFloat(document.getElementById('cpXPct').value) || 50;
  CP.namePos.yPct = parseFloat(document.getElementById('cpYPct').value) || 62;
  cpDrawNameCanvas();
}

function cpUpdateNameStyle() {
  CP.nameStyle.fontSize   = parseInt(document.getElementById('cpFontSize').value)  || 60;
  CP.nameStyle.fontFamily = document.getElementById('cpFontFamily').value;
  CP.nameStyle.color      = document.getElementById('cpFontColor').value;
  CP.nameStyle.bold       = document.getElementById('cpFontBold').checked;
  CP.nameStyle.italic     = document.getElementById('cpFontItalic').checked;
  CP.nameStyle.align      = document.getElementById('cpFontAlign').value;
  cpDrawNameCanvas();
  cpSaveDraft();
}

// ══════════════════════════════════════════════════════════════════
// ── Step 5: Publish ──
// ══════════════════════════════════════════════════════════════════
async function cpPublishPortal() {
  var btn = document.getElementById('cpPublishBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    var collegeName  = document.getElementById('cpCollegeName').value.trim();
    var cardMessage  = document.getElementById('cpCardMessage').value.trim();
    var defaultLimit = parseInt(document.getElementById('cpDefaultLimit').value) || 1;
    var openAccess   = document.getElementById('cpOpenAccess').checked;
    var headerColor  = document.getElementById('cpHeaderColor').value;
    var accentColor  = document.getElementById('cpAccentColor').value;
    var googleFormUrl= (document.getElementById('cpGoogleFormUrl') ? document.getElementById('cpGoogleFormUrl').value.trim() : '');

    if (!CP.currentSlug || !collegeName) { cpToast('Missing college name.', 'err'); btn.disabled = false; btn.textContent = '🚀 Publish Portal'; return; }
    if (!CP.templateUrl) { cpToast('No template — go back to Step 2 and load a template.', 'err'); btn.disabled = false; btn.textContent = '🚀 Publish Portal'; return; }

    var templateUrlToStore = CP.templateUrl;
    if (templateUrlToStore && templateUrlToStore.startsWith('data:')) {
      var base64Size = Math.round(templateUrlToStore.length * 0.75);
      if (base64Size > 900000) { templateUrlToStore = CP.storageUrl || CP.templateUrl; }
    }

    var portalData = {
      collegeName:    collegeName,
      cardMessage:    cardMessage || 'Enter your full name exactly as registered to download your certificate.',
      defaultLimit:   defaultLimit,
      openAccess:     openAccess,
      headerColor:    headerColor,
      accentColor:    accentColor,
      templateUrl:    templateUrlToStore,
      csvDriveUrl:    CP.csvDriveUrl || '',
      templateWidth:  CP.templateWidth,
      templateHeight: CP.templateHeight,
      namePosition:   { xPct: CP.namePos.xPct, yPct: CP.namePos.yPct },
      nameStyle:      Object.assign({}, CP.nameStyle),
      googleFormUrl:  googleFormUrl,
      active:         true,
      createdAt:      firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:      (typeof U !== 'undefined' && U) ? U.email : 'unknown',
    };

    await fbDb.collection('college_portals').doc(CP.currentSlug).set(portalData, { merge: true });

    // ── Save students: MERGE so download counts are never lost ──
    if (CP.students.length > 0) {
      btn.textContent = 'Saving students…';
      var batch = fbDb.batch(), batchCount = 0;
      for (var i = 0; i < CP.students.length; i++) {
        var s   = CP.students[i];
        if (!s.name || !s.name.trim()) continue;
        var nameLower = s.name.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Firestore doc IDs cannot contain spaces — use underscores for key, keep nameLower (with spaces) for querying
        var key = nameLower.replace(/\s+/g, '_');
        var ref = fbDb.collection('college_portals').doc(CP.currentSlug).collection('students').doc(key);
        // Use merge:true so existing `downloaded` count is preserved
        batch.set(ref, { name: s.name.trim(), nameLower: nameLower, limit: s.limit || 1 }, { merge: true });
        batchCount++;
        if (batchCount === 490) { await batch.commit(); batch = fbDb.batch(); batchCount = 0; }
      }
      if (batchCount > 0) await batch.commit();
    }

    cpToast('Portal published! 🎉', 'ok');
    cpRenderPortalLink();
    cpLoadPortalList();
    cpClearDraft(); // draft fulfilled — clean slate for next portal
    document.getElementById('cpPublishedSuccess').style.display = 'block';
  } catch(err) {
    console.error(err);
    cpToast('Error: ' + err.message, 'err');
  }
  btn.disabled = false; btn.textContent = '🚀 Publish Portal';
}

// ── Share link ──
function cpRenderPortalLink() {
  if (!CP.currentSlug) return;
  var base = location.href.replace(/\/[^/]*$/, '/');
  var link = base + 'college-portal.html?c=' + CP.currentSlug;
  var el   = document.getElementById('cpShareLink');
  if (el) el.value = link;
  var qr = document.getElementById('cpQrWrap');
  if (qr) qr.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(link) + '" alt="QR" style="border-radius:8px">';
}

function cpCopyLink() {
  document.getElementById('cpShareLink').select();
  document.execCommand('copy');
  cpToast('Link copied! 📋', 'ok');
}

// ══════════════════════════════════════════════════════════════════
// ── Portal List ──
// ══════════════════════════════════════════════════════════════════
async function cpLoadPortalList() {
  if (typeof U === 'undefined' || !U) return;
  try {
    var snap = await fbDb.collection('college_portals').where('createdBy', '==', U.email).limit(50).get();
    CP.portals = [];
    snap.forEach(function(doc) { CP.portals.push(Object.assign({ slug: doc.id }, doc.data())); });
    CP.portals.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (CP.portals.length > 20) CP.portals = CP.portals.slice(0, 20);
    cpRenderPortalList();
  } catch(e) { /* ignore */ }
}

function cpRenderPortalList() {
  var wrap = document.getElementById('cpPortalList');
  if (!wrap) return;
  if (CP.portals.length === 0) {
    wrap.innerHTML = '<div style="color:var(--mist);font-size:.8rem;text-align:center;padding:20px">No portals created yet</div>';
    return;
  }
  var base = location.href.replace(/\/[^/]*$/, '/');
  wrap.innerHTML = CP.portals.map(function(p) {
    var link = base + 'college-portal.html?c=' + p.slug;
    var statusDot = p.active !== false
      ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-right:5px"></span>Active'
      : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#9ca3af;margin-right:5px"></span>Paused';
    return '<div class="cp-portal-item" id="cppi-' + p.slug + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
      + '<div>'
      + '<div class="cp-pi-name">' + escH(p.collegeName || p.slug) + '</div>'
      + '<div class="cp-pi-slug" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<span>/' + p.slug + '</span>'
      + '<span style="font-size:.65rem;font-weight:600;color:var(--mist);display:flex;align-items:center">' + statusDot + '</span>'
      + '</div>'
      + '</div>'
      + '<div id="cppi-stats-' + p.slug + '" style="font-size:.7rem;color:var(--mist);text-align:right;flex-shrink:0">Loading…</div>'
      + '</div>'
      + '<div class="cp-pi-actions" style="margin-top:10px">'
      + '<button class="cp-pi-btn" onclick="cpLoadPortal(\'' + p.slug + '\')">✏️ Edit</button>'
      + '<button class="cp-pi-btn" onclick="cpCopyPortalLink(\'' + link + '\')">🔗 Copy Link</button>'
      + '<button class="cp-pi-btn" onclick="cpOpenManage(\'' + p.slug + '\',\'' + escH(p.collegeName || p.slug) + '\')">&#9881;&#65039; Manage Students</button>'
      + '<button class="cp-pi-btn" onclick="cpOpenEditor(\'' + p.slug + '\')">🎨 Edit Settings</button>'
      + '<button class="cp-pi-btn" id="cpReqBtn-' + p.slug + '" onclick="cpOpenRequests(\'' + p.slug + '\',\'' + escH(p.collegeName || p.slug) + '\')">&#x1F514; View Requests <span id="cpReqBadge-' + p.slug + '" style="display:none;background:#ef4444;color:#fff;font-size:.65rem;font-weight:800;padding:1px 6px;border-radius:99px;margin-left:4px">0</span></button>'
      + '<button class="cp-pi-btn danger" onclick="cpToggleActive(\'' + p.slug + '\',' + !p.active + ')">' 
      + (p.active !== false ? '&#x23F8; Pause' : '&#x25B6; Activate') + '</button>'
      + '<button class="cp-pi-btn" onclick="cpDeletePortal(\'' + p.slug + '\',\'' + escH(p.collegeName || p.slug) + '\')" style="background:#fef2f2;color:#dc2626;border-color:#fecaca;border:1.5px solid #fecaca">&#x1F5D1; Delete</button>'
      + '</div>'
      + '<div class="cp-manage-panel" id="cpmp-' + p.slug + '" style="display:none"></div>'
      + '<div class="cp-manage-panel" id="cped-' + p.slug + '" style="display:none"></div>'
      + '<div class="cp-manage-panel" id="cpreq-' + p.slug + '" style="display:none"></div>'
      + '</div>';
  }).join('');
  CP.portals.forEach(function(p) { cpLoadPortalStats(p.slug); });
}


async function cpOpenEditor(slug) {
  // Toggle — if already open, close
  var panel = document.getElementById('cped-' + slug);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  // Close any other open editor panels first
  document.querySelectorAll('[id^="cped-"]').forEach(function(el) { el.style.display = 'none'; });

  panel.style.display = 'block';
  panel.innerHTML = '<div style="padding:14px 0 4px;font-size:.72rem;color:var(--mist)">Loading settings…</div>';

  try {
    var doc = await fbDb.collection('college_portals').doc(slug).get();
    if (!doc.exists) { panel.innerHTML = '<div style="color:var(--error);padding:10px;font-size:.72rem">Portal not found.</div>'; return; }
    var d = doc.data();

    panel.innerHTML =
      '<div style="margin-top:12px;padding:16px;border-top:1.5px solid var(--fog);background:var(--snow);border-radius:0 0 12px 12px">'
      + '<div style="font-size:.82rem;font-weight:800;color:var(--ink);margin-bottom:14px">🎨 Edit Portal Settings: ' + escH(d.collegeName || slug) + '</div>'

      // College name
      + '<div style="margin-bottom:10px">'
      + '<div class="cp-label">College / Institution Name</div>'
      + '<input class="cp-fi" id="cped-name-' + slug + '" value="' + escH(d.collegeName || '') + '" placeholder="College Name">'
      + '</div>'

      // Welcome message
      + '<div style="margin-bottom:10px">'
      + '<div class="cp-label">Welcome Message for Students</div>'
      + '<input class="cp-fi" id="cped-msg-' + slug + '" value="' + escH(d.cardMessage || '') + '" placeholder="Enter your full name to download your certificate.">'
      + '</div>'

      // Download limit + open access
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">'
      + '<div style="flex:1;min-width:120px">'
      + '<div class="cp-label">Default Download Limit</div>'
      + '<input class="cp-fi" id="cped-limit-' + slug + '" type="number" min="1" max="99" value="' + (d.defaultLimit || 1) + '">'
      + '</div>'
      + '<div style="padding-bottom:8px">'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:.77rem;font-weight:600;cursor:pointer">'
      + '<input type="checkbox" id="cped-open-' + slug + '" ' + (d.openAccess ? 'checked' : '') + ' style="width:15px;height:15px"> Open Access</label>'
      + '</div>'
      + '</div>'

      // Colors
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">'
      + '<div style="flex:1;min-width:120px"><div class="cp-label">Header Color</div>'
      + '<input class="cp-fi" id="cped-hcol-' + slug + '" type="color" value="' + (d.headerColor || '#1a1a2e') + '" style="padding:4px;height:38px;cursor:pointer"></div>'
      + '<div style="flex:1;min-width:120px"><div class="cp-label">Accent Color</div>'
      + '<input class="cp-fi" id="cped-acol-' + slug + '" type="color" value="' + (d.accentColor || '#4f46e5') + '" style="padding:4px;height:38px;cursor:pointer"></div>'
      + '</div>'

      // Google Form URL
      + '<div style="margin-bottom:14px">'
      + '<div class="cp-label">Google Form Link (for students who missed download)</div>'
      + '<input class="cp-fi" id="cped-form-' + slug + '" value="' + escH(d.googleFormUrl || '') + '" placeholder="https://forms.gle/…  (leave blank to hide)">'
      + '<div style="font-size:.67rem;color:var(--mist);margin-top:4px">When filled in, a prominent button appears on the student portal letting students submit their name & email to receive their certificate.</div>'
      + '</div>'

      // Actions
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="btn bl btn-sm" onclick="cpEditorSave(\'' + slug + '\')" style="padding:8px 16px;font-size:.73rem">💾 Save Settings</button>'
      + '<button class="btn bo btn-sm" onclick="document.getElementById(\'cped-' + slug + '\').style.display=\'none\'" style="padding:8px 12px;font-size:.73rem">Cancel</button>'
      + '</div>'
      + '</div>';

  } catch(e) {
    panel.innerHTML = '<div style="padding:10px;font-size:.72rem;color:var(--error)">Error: ' + e.message + '</div>';
  }
}

async function cpEditorSave(slug) {
  var getVal = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var getChk = function(id) { var el = document.getElementById(id); return el ? el.checked : false; };

  var collegeName  = getVal('cped-name-' + slug);
  var cardMessage  = getVal('cped-msg-' + slug);
  var defaultLimit = parseInt(getVal('cped-limit-' + slug)) || 1;
  var openAccess   = getChk('cped-open-' + slug);
  var headerColor  = getVal('cped-hcol-' + slug);
  var accentColor  = getVal('cped-acol-' + slug);
  var googleFormUrl= getVal('cped-form-' + slug);

  if (!collegeName) { cpToast('College name is required.', 'err'); return; }

  try {
    await fbDb.collection('college_portals').doc(slug).update({
      collegeName:   collegeName,
      cardMessage:   cardMessage,
      defaultLimit:  defaultLimit,
      openAccess:    openAccess,
      headerColor:   headerColor,
      accentColor:   accentColor,
      googleFormUrl: googleFormUrl,
    });
    cpToast('Settings saved ✓', 'ok');
    document.getElementById('cped-' + slug).style.display = 'none';
    // Update local portals array
    var p = CP.portals.find(function(x) { return x.slug === slug; });
    if (p) { p.collegeName = collegeName; p.googleFormUrl = googleFormUrl; }
    cpRenderPortalList();
  } catch(e) {
    cpToast('Error saving: ' + e.message, 'err');
  }
}

// ══════════════════════════════════════════════════════════════════
// ── Manage Students Panel (inline in portal list) ──
// ══════════════════════════════════════════════════════════════════
async function cpOpenManage(slug, name) {
  var panel = document.getElementById('cpmp-' + slug);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.innerHTML = '<div style="padding:12px 0 4px;font-size:.7rem;color:var(--mist)">Loading…</div>';

  try {
    var snap = await fbDb.collection('college_portals').doc(slug).collection('students').orderBy('nameLower').get();
    var rows = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      rows.push({ id: doc.id, name: d.name || doc.id, limit: d.limit != null ? d.limit : 1, downloaded: d.downloaded || 0 });
    });

    var totalDl = rows.reduce(function(a,r){ return a + r.downloaded; }, 0);
    var studentsDl = rows.filter(function(r){ return r.downloaded > 0; }).length;

    panel.innerHTML =
      '<div style="margin-top:12px;padding:16px;border-top:1.5px solid var(--fog);background:var(--snow);border-radius:0 0 12px 12px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">'
      + '<div style="font-size:.82rem;font-weight:800;color:var(--ink)">⚙️ Manage Students: ' + escH(name) + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn bo btn-sm" onclick="cpMgAddRow(\'' + slug + '\')" style="padding:6px 11px;font-size:.7rem">+ Add Students</button>'
      + '<button class="btn bo btn-sm" onclick="cpMgSaveAll(\'' + slug + '\')" style="padding:6px 11px;font-size:.7rem;display:none" id="cpMgSaveBtn-' + slug + '">💾 Save Changes</button>'
      + '<button class="btn bo btn-sm" onclick="cpMgExportCsv(\'' + slug + '\')" style="padding:6px 11px;font-size:.7rem">⬇ Export CSV</button>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      + cpMgStatChip('👥', 'Total Students', rows.length)
      + cpMgStatChip('📥', 'Total Downloads', totalDl)
      + cpMgStatChip('✅', 'Downloaded By', studentsDl + ' student' + (studentsDl !== 1 ? 's' : ''))
      + cpMgStatChip('⏳', 'Not Yet Downloaded', rows.length - studentsDl)
      + '</div>'
      + '<div style="font-size:.68rem;color:var(--mist);margin-bottom:6px">Click a name or limit cell to edit inline. Changes save when you click <b>Save Changes</b>.</div>'
      + '<div style="max-height:260px;overflow-y:auto;border:1.5px solid var(--fog);border-radius:8px">'
      + '<table style="width:100%;border-collapse:collapse;font-size:.72rem">'
      + '<thead><tr>'
      + '<th style="padding:6px 10px;text-align:left;font-size:.63rem;font-weight:700;color:var(--mist);border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)">#</th>'
      + '<th style="padding:6px 10px;text-align:left;font-size:.63rem;font-weight:700;color:var(--mist);border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)">Name</th>'
      + '<th style="padding:6px 10px;text-align:center;font-size:.63rem;font-weight:700;color:var(--mist);border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)">Limit</th>'
      + '<th style="padding:6px 10px;text-align:center;font-size:.63rem;font-weight:700;color:var(--mist);border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)">Downloaded</th>'
      + '<th style="padding:6px 10px;text-align:center;font-size:.63rem;font-weight:700;color:var(--mist);border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)">Progress</th>'
      + '<th style="padding:6px 10px;border-bottom:1.5px solid var(--fog);position:sticky;top:0;background:var(--card)"></th>'
      + '</tr></thead>'
      + '<tbody id="cpMgTbody-' + slug + '">'
      + rows.map(function(r, i) { return cpMgRowHtml(slug, i, r); }).join('')
      + '</tbody>'
      + '</table>'
      + '</div>'
      + '<div style="margin-top:12px;padding:12px;border:1.5px dashed var(--fog);border-radius:8px;background:var(--surface)" id="cpMgAddPanel-' + slug + '" style="display:none">'
      + '<div style="font-size:.72rem;font-weight:700;margin-bottom:6px">📋 Add More Students</div>'
      + '<div style="font-size:.67rem;color:var(--mist);margin-bottom:8px;line-height:1.5">Paste CSV below (columns: <b>name</b>, <b>limit</b>). Existing download counts are never reset.</div>'
      + '<textarea id="cpMgPasteArea-' + slug + '" placeholder="name,limit&#10;Priya Patel,3&#10;Rahul Gupta,2" style="width:100%;height:80px;padding:8px;border:1.5px solid var(--fog);border-radius:8px;font-size:.71rem;font-family:\'DM Mono\',monospace;background:var(--card);color:var(--ink);resize:vertical;box-sizing:border-box"></textarea>'
      + '<div style="margin-top:8px;display:flex;gap:8px">'
      + '<button class="btn bl btn-sm" onclick="cpMgImportCsv(\'' + slug + '\')" style="padding:7px 14px;font-size:.72rem">📥 Import & Save</button>'
      + '<button class="btn bo btn-sm" onclick="document.getElementById(\'cpMgAddPanel-' + slug + '\').style.display=\'none\'" style="padding:7px 12px;font-size:.72rem">Cancel</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    CP['mgRows_' + slug] = rows;
  } catch(e) {
    panel.innerHTML = '<div style="padding:10px;font-size:.72rem;color:var(--error)">Error: ' + e.message + '</div>';
  }
}

function cpMgStatChip(icon, label, val) {
  return '<div style="flex:1;min-width:90px;background:var(--card);border:1.5px solid var(--fog);border-radius:8px;padding:8px 10px;text-align:center">'
    + '<div style="font-size:1.1rem">' + icon + '</div>'
    + '<div style="font-size:.85rem;font-weight:800;color:var(--ink);margin-top:2px">' + val + '</div>'
    + '<div style="font-size:.62rem;color:var(--mist);margin-top:1px">' + label + '</div>'
    + '</div>';
}

function cpMgRowHtml(slug, i, r) {
  var pct = r.limit > 0 ? Math.min(100, Math.round((r.downloaded / r.limit) * 100)) : 0;
  var barColor = pct >= 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : 'var(--lime-d)';
  return '<tr id="cpMgRow-' + slug + '-' + i + '">'
    + '<td style="padding:5px 8px;color:var(--mist)">' + (i + 1) + '</td>'
    + '<td style="padding:5px 8px"><input style="width:100%;border:1px solid transparent;border-radius:4px;padding:3px 5px;font-size:.72rem;background:transparent;color:var(--ink);font-family:inherit" value="' + escH(r.name) + '" onfocus="this.style.border=\'1px solid var(--lime-d)\';this.style.background=\'var(--card)\'" onblur="this.style.border=\'1px solid transparent\';this.style.background=\'transparent\';cpMgMarkDirty(\'' + slug + '\',' + i + ',\'name\',this.value)"></td>'
    + '<td style="padding:5px 8px;text-align:center"><input type="number" min="1" max="99" style="width:50px;border:1px solid transparent;border-radius:4px;padding:3px 5px;font-size:.72rem;background:transparent;color:var(--ink);font-family:inherit;text-align:center" value="' + r.limit + '" onfocus="this.style.border=\'1px solid var(--lime-d)\';this.style.background=\'var(--card)\'" onblur="this.style.border=\'1px solid transparent\';this.style.background=\'transparent\';cpMgMarkDirty(\'' + slug + '\',' + i + ',\'limit\',this.value)"></td>'
    + '<td style="padding:5px 8px;text-align:center;font-weight:' + (r.downloaded > 0 ? '700' : '400') + ';color:' + (r.downloaded > 0 ? '#059669' : 'var(--mist)') + '">' + r.downloaded + '</td>'
    + '<td style="padding:5px 12px"><div style="background:var(--fog);border-radius:4px;height:5px;min-width:50px"><div style="background:' + barColor + ';height:5px;border-radius:4px;width:' + pct + '%"></div></div><div style="font-size:.58rem;color:var(--mist);margin-top:2px;text-align:center">' + r.downloaded + '/' + r.limit + '</div></td>'
    + '<td style="padding:5px 8px"><button onclick="cpMgDeleteRow(\'' + slug + '\',' + i + ')" style="background:none;border:none;cursor:pointer;font-size:.75rem;color:var(--mist)" title="Delete">🗑</button></td>'
    + '</tr>';
}

function cpMgMarkDirty(slug, idx, field, val) {
  var rows = CP['mgRows_' + slug];
  if (!rows || !rows[idx]) return;
  if (field === 'limit') val = parseInt(val) || 1;
  rows[idx][field] = val;
  rows[idx]._dirty = true;
  var btn = document.getElementById('cpMgSaveBtn-' + slug);
  if (btn) btn.style.display = 'inline-flex';
}

function cpMgAddRow(slug) {
  var panel = document.getElementById('cpMgAddPanel-' + slug);
  if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }
}

function cpMgDeleteRow(slug, idx) {
  var rows = CP['mgRows_' + slug];
  if (!rows || !rows[idx]) return;
  if (!confirm('Delete "' + rows[idx].name + '"?')) return;
  rows[idx]._deleted = true;
  var tr = document.getElementById('cpMgRow-' + slug + '-' + idx);
  if (tr) { tr.style.opacity = '.3'; tr.style.pointerEvents = 'none'; }
  var btn = document.getElementById('cpMgSaveBtn-' + slug);
  if (btn) btn.style.display = 'inline-flex';
}

async function cpMgSaveAll(slug) {
  var rows = CP['mgRows_' + slug];
  if (!rows) return;
  var btn = document.getElementById('cpMgSaveBtn-' + slug);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    var batch = fbDb.batch(), batchCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = (r.name || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!key) continue;
      var ref = fbDb.collection('college_portals').doc(slug).collection('students').doc(key);
      if (r._deleted) { batch.delete(ref); }
      else if (r._dirty || r._new) { batch.set(ref, { name: (r.name||'').trim(), nameLower: key, limit: parseInt(r.limit)||1, downloaded: r.downloaded||0 }, { merge: true }); }
      batchCount++;
      if (batchCount >= 490) { await batch.commit(); batch = fbDb.batch(); batchCount = 0; }
    }
    if (batchCount > 0) await batch.commit();
    cpToast('Changes saved ✓', 'ok');
    cpLoadPortalStats(slug);
    // Refresh panel
    var allPortal = CP.portals.find(function(p){ return p.slug === slug; });
    var panel = document.getElementById('cpmp-' + slug);
    if (panel) panel.style.display = 'none';
    setTimeout(function() {
      cpOpenManage(slug, allPortal ? (allPortal.collegeName || slug) : slug);
    }, 300);
  } catch(e) { cpToast('Error: ' + e.message, 'err'); }
  if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
}

async function cpMgImportCsv(slug) {
  var ta = document.getElementById('cpMgPasteArea-' + slug);
  if (!ta || !ta.value.trim()) { cpToast('Please paste CSV data first.', 'err'); return; }

  // Parse CSV text into an array of {name, limit}
  var text = ta.value.trim();
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  var newStudents = [];
  // Check if first line looks like a header
  var firstLine = lines[0].toLowerCase();
  var startIdx = (firstLine.includes('name') || firstLine.includes('limit')) ? 1 : 0;
  var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/^"|"$/g,'').toLowerCase(); });
  var nameIdx  = headers.findIndex(function(h) { return /^name$/i.test(h); });
  var limitIdx = headers.findIndex(function(h) { return /^(limit|downloads?|max|allowed)$/i.test(h); });
  if (nameIdx === -1) { nameIdx = 0; startIdx = 0; }

  for (var i = startIdx; i < lines.length; i++) {
    var cols = cpSplitCsvRow(lines[i]);
    var name = (cols[nameIdx] || '').trim().replace(/^"|"$/g, '');
    if (!name) continue;
    var limit = limitIdx >= 0 ? (parseInt(cols[limitIdx]) || 1) : 1;
    newStudents.push({ name: name, limit: limit });
  }

  if (newStudents.length === 0) { cpToast('No valid students found in CSV.', 'err'); return; }

  try {
    var batch = fbDb.batch(), count = 0;
    for (var j = 0; j < newStudents.length; j++) {
      var s = newStudents[j];
      var key = s.name.toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!key) continue;
      var ref = fbDb.collection('college_portals').doc(slug).collection('students').doc(key);
      // merge: true — NEVER reset existing download counts
      batch.set(ref, { name: s.name, nameLower: key, limit: s.limit }, { merge: true });
      count++;
      if (count >= 490) { await batch.commit(); batch = fbDb.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
    cpToast(newStudents.length + ' students imported ✓', 'ok');
    ta.value = '';
    cpLoadPortalStats(slug);
    var allPortal = CP.portals.find(function(p){ return p.slug === slug; });
    var panel = document.getElementById('cpmp-' + slug);
    if (panel) panel.style.display = 'none';
    setTimeout(function() {
      cpOpenManage(slug, allPortal ? (allPortal.collegeName || slug) : slug);
    }, 300);
  } catch(e) { cpToast('Import error: ' + e.message, 'err'); }
}

function cpMgExportCsv(slug) {
  var rows = CP['mgRows_' + slug];
  if (!rows || rows.length === 0) { cpToast('No data to export.', 'err'); return; }
  var csv = 'name,limit,downloaded\n' + rows
    .filter(function(r){ return !r._deleted; })
    .map(function(r){ return '"' + (r.name||'').replace(/"/g,'""') + '",' + (r.limit||1) + ',' + (r.downloaded||0); })
    .join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = slug + '-students.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  cpToast('CSV exported ✓', 'ok');
}

function cpCopyPortalLink(link) {
  var ta = document.createElement('textarea');
  ta.value = link; document.body.appendChild(ta);
  ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  cpToast('Link copied! 📋', 'ok');
}

async function cpToggleActive(slug, active) {
  try {
    await fbDb.collection('college_portals').doc(slug).update({ active: active });
    cpToast(active ? 'Portal activated ✓' : 'Portal deactivated', active ? 'ok' : 'info');
    cpLoadPortalList();
  } catch(e) { cpToast('Error: ' + e.message, 'err'); }
}

async function cpLoadPortal(slug) {
  try {
    var doc = await fbDb.collection('college_portals').doc(slug).get();
    if (!doc.exists) { cpToast('Portal not found.', 'err'); return; }
    var d = doc.data();
    CP.currentSlug = slug;
    CP.namePos     = d.namePosition || { xPct: 50, yPct: 62 };
    CP.nameStyle   = d.nameStyle    || { fontSize: 60, fontFamily: 'Georgia', color: '#1a1a1a', bold: false, italic: false, align: 'center' };
    CP.templateUrl = d.templateUrl  || '';
    CP.csvDriveUrl = d.csvDriveUrl  || '';
    CP.templateWidth  = d.templateWidth  || 2480;
    CP.templateHeight = d.templateHeight || 1754;

    function _set(id, prop, val) { var el = document.getElementById(id); if (el) el[prop] = val; }
    _set('cpCollegeName',   'value',       d.collegeName    || '');
    _set('cpSlugPreview',   'textContent', slug);
    _set('cpCardMessage',   'value',       d.cardMessage    || '');
    _set('cpDefaultLimit',  'value',       d.defaultLimit   || 1);
    _set('cpOpenAccess',    'checked',     d.openAccess     || false);
    _set('cpHeaderColor',   'value',       d.headerColor    || '#1a1a2e');
    _set('cpAccentColor',   'value',       d.accentColor    || '#4f46e5');
    _set('cpGoogleFormUrl', 'value',       d.googleFormUrl  || '');
    _set('cpFontSize',      'value',       CP.nameStyle.fontSize   || 60);
    _set('cpFontFamily',    'value',       CP.nameStyle.fontFamily || 'Georgia');
    _set('cpFontColor',     'value',       CP.nameStyle.color      || '#1a1a1a');
    _set('cpFontBold',      'checked',     CP.nameStyle.bold       || false);
    _set('cpFontItalic',    'checked',     CP.nameStyle.italic     || false);
    _set('cpFontAlign',     'value',       CP.nameStyle.align      || 'center');
    _set('cpXPct',          'value',       CP.namePos.xPct.toFixed(1));
    _set('cpYPct',          'value',       CP.namePos.yPct.toFixed(1));
    _set('cpTemplateDriveUrl', 'value',    CP.templateUrl);
    _set('cpCsvDriveUrl',      'value',    CP.csvDriveUrl);

    if (d.templateUrl) {
      CP.templateUrl = d.templateUrl;
      var img = new Image();
      img.onload = function() {
        CP.templateImg = img; CP.templateWidth = img.naturalWidth; CP.templateHeight = img.naturalHeight;
        var badge = document.getElementById('cpTemplateBadge');
        var wrap  = document.getElementById('cpTemplateBadgeWrap');
        var thumb = document.getElementById('cpTemplateThumb');
        if (badge) badge.textContent = 'Loaded (' + img.naturalWidth + '×' + img.naturalHeight + ')';
        if (wrap)  wrap.style.display = 'flex';
        if (thumb) { thumb.src = d.templateUrl; thumb.style.display = 'block'; }
        if (CP.step === 3) cpDrawNameCanvas();
      };
      img.onerror = function() {
        var badge = document.getElementById('cpTemplateBadge');
        var wrap  = document.getElementById('cpTemplateBadgeWrap');
        if (badge) badge.textContent = 'Could not load — please re-upload the template image';
        if (wrap)  wrap.style.display = 'flex';
      };
      img.src = d.templateUrl;
    }

    var studSnap = await fbDb.collection('college_portals').doc(slug).collection('students').limit(500).get();
    CP.students = [];
    studSnap.forEach(function(sdoc) {
      var sd = sdoc.data();
      CP.students.push({ name: sd.name, limit: sd.limit });
    });
    cpRenderStudentTable();
    if (CP.students.length > 0) {
      var cb = document.getElementById('cpCsvBadge');
      var cw = document.getElementById('cpCsvBadgeWrap');
      if (cb) cb.textContent = CP.students.length + ' students loaded from saved portal';
      if (cw) cw.style.display = 'flex';
    }
    cpToast('Portal "' + (d.collegeName || slug) + '" loaded ✓', 'ok');
    cpRenderStep(1);
    // Show wizard
    var wiz = document.getElementById('cpWizard');
    if (wiz) wiz.style.display = 'block';
  } catch(e) { cpToast('Error: ' + e.message, 'err'); }
}

function cpNewPortal() {
  cpClearDraft();
  CP.currentSlug = ''; CP.templateImg = null; CP.templateUrl = ''; CP.csvDriveUrl = ''; CP.students = [];
  CP.namePos   = { xPct: 50, yPct: 62 };
  CP.nameStyle = { fontSize: 60, fontFamily: 'Georgia', color: '#1a1a1a', bold: false, italic: false, align: 'center' };
  function _set(id, prop, val) { var el = document.getElementById(id); if (el) el[prop] = val; }
  _set('cpCollegeName','value',''); _set('cpSlugPreview','textContent','your-college');
  _set('cpCardMessage','value',''); _set('cpDefaultLimit','value',3);
  _set('cpOpenAccess','checked',false); _set('cpGoogleFormUrl','value','');
  _set('cpTemplateDriveUrl','value',''); _set('cpCsvDriveUrl','value','');
  ['cpTemplateBadgeWrap','cpCsvBadgeWrap','cpPublishedSuccess'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; });
  var wiz = document.getElementById('cpWizard'); if (wiz) wiz.style.display = 'block';
  cpRenderStudentTable();
  cpRenderStep(1);
}

// ── Toast ──
function cpToast(msg, type) {
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  console.log('[CP]', msg);
}

// ══════════════════════════════════════════════════════════════════
// ── Portal Stats (downloads + pending requests badge) ──
// ══════════════════════════════════════════════════════════════════
async function cpLoadPortalStats(slug) {
  var el = document.getElementById('cppi-stats-' + slug);
  if (!el) return;
  try {
    var [studentsSnap, reqSnap] = await Promise.all([
      fbDb.collection('college_portals').doc(slug).collection('students').get(),
      fbDb.collection('college_portals').doc(slug).collection('form_requests').where('status','==','pending').get()
    ]);

    var totalStudents = 0, totalDownloaded = 0, studentsDownloaded = 0;
    studentsSnap.forEach(function(doc) {
      var d = doc.data(); totalStudents++;
      var dl = d.downloaded || 0; totalDownloaded += dl;
      if (dl > 0) studentsDownloaded++;
    });

    if (totalStudents === 0) { el.textContent = 'No students yet'; }
    else {
      el.innerHTML = '<span style="font-weight:700;color:var(--ink)">' + totalDownloaded + '</span> downloads'
        + ' &nbsp;&middot;&nbsp; <span style="font-weight:700;color:var(--ink)">' + studentsDownloaded + '</span>/<span>' + totalStudents + '</span> students';
    }

    // Show/update request badge
    var pendingCount = reqSnap.size;
    var badge = document.getElementById('cpReqBadge-' + slug);
    var btn   = document.getElementById('cpReqBtn-' + slug);
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }
    if (btn) {
      btn.style.background = pendingCount > 0 ? '#fef3c7' : '';
      btn.style.borderColor = pendingCount > 0 ? '#f59e0b' : '';
      btn.style.color       = pendingCount > 0 ? '#92400e' : '';
      btn.style.fontWeight  = pendingCount > 0 ? '700' : '';
    }
  } catch(e) { if (el) el.textContent = ''; }
}

// ══════════════════════════════════════════════════════════════════
// ── View / Resolve Requests Panel ──
// ══════════════════════════════════════════════════════════════════
async function cpOpenRequests(slug, name) {
  // Close all other panels first
  document.querySelectorAll('[id^="cpreq-"],[id^="cpmp-"],[id^="cped-"]').forEach(function(el) {
    if (el.id !== 'cpreq-' + slug) el.style.display = 'none';
  });
  var panel = document.getElementById('cpreq-' + slug);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  panel.innerHTML = '<div style="padding:14px 0 4px;font-size:.72rem;color:var(--mist)">Loading requests…</div>';

  try {
    var snap = await fbDb.collection('college_portals').doc(slug)
      .collection('form_requests').orderBy('submittedAt','desc').limit(100).get();

    if (snap.empty) {
      panel.innerHTML = '<div style="padding:16px;text-align:center;font-size:.8rem;color:var(--mist)">No certificate requests yet for <b>' + escH(name) + '</b>.</div>';
      return;
    }

    var rows = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    var pending  = rows.filter(function(r){ return r.status === 'pending'; });
    var resolved = rows.filter(function(r){ return r.status !== 'pending'; });

    function fmtTime(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }

    function rowHtml(r) {
      var isPending = r.status === 'pending';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--fog);flex-wrap:wrap">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:.82rem;font-weight:700;color:var(--ink)">' + escH(r.name || '—') + '</div>'
        + '<div style="font-size:.72rem;color:var(--mist)">' + escH(r.email || '—') + ' &nbsp;&middot;&nbsp; ' + fmtTime(r.submittedAt) + '</div>'
        + '</div>'
        + (isPending
            ? '<button onclick="cpResolveRequest(\'' + slug + '\',\'' + r.id + '\')" style="flex-shrink:0;padding:5px 12px;background:#f0fdf4;color:#166534;border:1.5px solid #bbf7d0;border-radius:7px;font-size:.72rem;font-weight:700;cursor:pointer">&#10003; Mark Sent</button>'
              + '<button onclick="cpCopyEmail(\'' + escH(r.email) + '\')" style="flex-shrink:0;padding:5px 12px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:7px;font-size:.72rem;font-weight:700;cursor:pointer">&#128203; Copy Email</button>'
            : '<span style="flex-shrink:0;font-size:.68rem;color:#6b7280;font-weight:600">Sent &#10003;</span>')
        + '</div>';
    }

    var html = '<div style="padding:12px 14px 6px;display:flex;align-items:center;justify-content:space-between;gap:8px">'
      + '<div style="font-size:.82rem;font-weight:800;color:var(--ink)">&#x1F4CB; Certificate Requests: ' + escH(name) + '</div>'
      + '<div style="font-size:.72rem;color:var(--mist)">'
      + '<span style="color:#dc2626;font-weight:700">' + pending.length + ' pending</span>'
      + (resolved.length > 0 ? ' &nbsp;&middot;&nbsp; ' + resolved.length + ' sent' : '')
      + '</div>'
      + '</div>';

    if (pending.length > 0) {
      html += '<div style="background:#fef2f2;border-radius:0;border-top:1px solid #fecaca;border-bottom:1px solid #fecaca">'
        + pending.map(rowHtml).join('')
        + '</div>';
    }
    if (resolved.length > 0) {
      html += '<div style="padding:8px 14px 2px;font-size:.68rem;font-weight:700;color:var(--mist);text-transform:uppercase;letter-spacing:.05em">Already Sent</div>'
        + '<div>' + resolved.map(rowHtml).join('') + '</div>';
    }

    panel.innerHTML = html;
  } catch(err) {
    panel.innerHTML = '<div style="padding:14px;font-size:.8rem;color:#dc2626">Error loading requests: ' + escH(err.message) + '</div>';
  }
}

async function cpResolveRequest(slug, reqId) {
  try {
    await fbDb.collection('college_portals').doc(slug).collection('form_requests').doc(reqId)
      .update({ status: 'sent', resolvedAt: Date.now() });
    cpOpenRequests(slug); // refresh panel
    cpLoadPortalStats(slug); // refresh badge
    cpToast('Marked as sent!', 'ok');
  } catch(e) { cpToast('Error: ' + e.message, 'err'); }
}

function cpCopyEmail(email) {
  navigator.clipboard.writeText(email).then(function() {
    cpToast('Email copied: ' + email, 'ok');
  }).catch(function() {
    prompt('Copy this email:', email);
  });
}

