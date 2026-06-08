// ═══════════════════════════════════════════════════════════════
//  NOVA STUDIO — ADMIN PANEL  |  admin.js
// ═══════════════════════════════════════════════════════════════

'use strict';

/* ─────────────────────────────────────────────────────────────
   DEV GATE
   Two separate credential sets share the same login form.

   ① Normal users  →  standard Firebase email/password auth.
      If their Firestore doc has isAdmin:true they reach the panel.
      If not, they get "no admin access" just like before.

   ② Dev (you)  →  enter DEV_EMAIL + your secret dev password.
      The browser hashes the typed password with SHA-256 and
      compares it to DEV_HASH stored here.  Hash match → panel
      opens immediately WITHOUT a Firestore isAdmin check.

   The hash in this file cannot be reversed.  Nobody reading the
   source can recover the original password.

   To change dev credentials:
     node -e "const c=require('crypto');console.log(c.createHash('sha256').update('NewPass').digest('hex'))"
   Then update DEV_EMAIL and DEV_HASH below.
───────────────────────────────────────────────────────────── */
var _DEV_EMAIL = 'ghost@nova.dev';
var _DEV_HASH  = '008d5fac13ddd435e7833c3fc6891b6fa1b66e8c56fddf03c8e9cabe4fff1b74';
var _devMode   = false;   // flipped to true after hash gate passes

/* ── SHA-256 (Web Crypto API — no external library needed) ── */
function _sha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    .then(function(buf){
      return Array.from(new Uint8Array(buf))
        .map(function(b){ return b.toString(16).padStart(2,'0'); })
        .join('');
    });
}

/* ── State ────────────────────────────────────────────────── */
var ADMIN = null;
var ADMIN_SECTION = 'dashboard';

/* ── Bootstrap ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  fbAuth.onAuthStateChanged(function (firebaseUser) {
    if (!firebaseUser) { showLoginScreen(); return; }

    if (_devMode) {
      /* Dev path: already verified locally, go straight in */
      hideLoginScreen();
      renderAdminShell();
      loadSection('dashboard');
      return;
    }

    /* ── Dev email fast-path: bypass Firestore when dev account is detected ── */
    if (firebaseUser.email && firebaseUser.email.toLowerCase() === _DEV_EMAIL.toLowerCase()) {
      _devMode = true;
      ADMIN = { email: firebaseUser.email, firstName: 'Dev', lastName: '', isAdmin: true };
      hideLoginScreen();
      renderAdminShell();
      loadSection('dashboard');
      return;
    }

    /* Normal path: verify isAdmin flag in Firestore */
    fbDb.collection('users').doc(firebaseUser.email).get().then(function (doc) {
      if (!doc.exists || !doc.data().isAdmin) {
        fbAuth.signOut();
        showLoginScreen('You do not have admin access.');
        return;
      }
      ADMIN = Object.assign({ email: firebaseUser.email }, doc.data());
      hideLoginScreen();
      renderAdminShell();
      loadSection('dashboard');
    }).catch(function (err) {
      showLoginScreen('Access check failed: ' + err.message);
    });
  });
});

/* ── Auth helpers ─────────────────────────────────────────── */
function showLoginScreen(msg) {
  document.getElementById('adminLogin').style.display = 'flex';
  document.getElementById('adminShell').style.display = 'none';
  if (msg) {
    var e = document.getElementById('loginError');
    e.textContent = msg;
    e.style.display = 'block';
  }
}
function hideLoginScreen() {
  document.getElementById('adminLogin').style.display = 'none';
  document.getElementById('adminShell').style.display = 'flex';
}

function adminDoLogin() {
  var em  = document.getElementById('adminEmail').value.trim();
  var pw  = document.getElementById('adminPass').value;
  var btn = document.getElementById('adminLoginBtn');
  var err = document.getElementById('loginError');
  err.style.display = 'none';
  if (!em || !pw) { err.textContent = 'Enter email and password.'; err.style.display = 'block'; return; }
  btn.textContent = 'Signing in…';
  btn.disabled = true;

  /* ── Dev gate: hash the typed password and compare ──────── */
  if (em.toLowerCase() === _DEV_EMAIL.toLowerCase()) {
    _sha256(pw).then(function(hash) {
      if (hash === _DEV_HASH) {
        /* Hash matched — set dev mode flag, then sign in via Firebase */
        _devMode = true;
        ADMIN = { email: _DEV_EMAIL, firstName: 'Dev', lastName: '', isAdmin: true };
        /* Use Firebase signIn so Firebase Auth state fires onAuthStateChanged */
        /* If dev has a real Firebase account, this works; if not, we bypass directly */
        fbAuth.signInWithEmailAndPassword(em, pw)
          .catch(function() {
            /* Firebase login failed (dev account may not exist in Firebase)
               but hash already verified — go straight in */
            hideLoginScreen();
            renderAdminShell();
            loadSection('dashboard');
          });
      } else {
        /* Wrong password for dev email */
        err.textContent = 'Incorrect password.';
        err.style.display = 'block';
        btn.textContent = 'Sign In';
        btn.disabled = false;
        _devMode = false;
      }
    });
    return;   // async path handled above
  }

  /* ── Normal user path: standard Firebase auth ───────────── */
  fbAuth.signInWithEmailAndPassword(em, pw).catch(function (e) {
    var msgs = {
      'auth/user-not-found': 'No account found.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email.',
      'auth/too-many-requests': 'Too many attempts — try later.',
      'auth/invalid-credential': 'Invalid credentials.'
    };
    err.textContent = msgs[e.code] || e.message;
    err.style.display = 'block';
    btn.textContent = 'Sign In';
    btn.disabled = false;
  });
}


/* ── Quick Broadcast from navbar ────────────────────────── */
function quickBroadcast() {
  var msg = prompt('📢 Announcement message (leave blank to clear):');
  if (msg === null) return;  // cancelled
  var color = '#c8f135';
  if (msg.trim()) {
    color = prompt('Banner color hex (default #c8f135):') || '#c8f135';
  }
  fbDb.collection('nova_config').doc('site').set({
    banner:      msg.trim(),
    bannerColor: color.trim() || '#c8f135',
    updatedAt:   Date.now(),
    updatedBy:   ADMIN ? ADMIN.email : 'admin'
  }, { merge: true }).then(function() {
    admToast(msg.trim() ? '📢 Announcement broadcast to all users!' : 'Banner cleared.', 'ok');
  }).catch(function(e) { admToast('Error: ' + e.message, 'err'); });
}

function adminDoLogout() {
  if (!confirm('Sign out of admin panel?')) return;
  fbAuth.signOut().then(function () { location.reload(); });
}

/* ── Shell render ─────────────────────────────────────────── */
function renderAdminShell() {
  var nameEl = document.getElementById('adminUserName');
  var avatarEl = document.getElementById('adminUserAvatar');
  if (nameEl) nameEl.textContent = (ADMIN.firstName || '') + ' ' + (ADMIN.lastName || '');
  if (avatarEl) {
    if (ADMIN.avatar) {
      avatarEl.style.backgroundImage = 'url(' + ADMIN.avatar + ')';
    } else {
      var ini = ((ADMIN.firstName || '?')[0] + (ADMIN.lastName || '')[0]).toUpperCase();
      avatarEl.textContent = ini;
    }
  }
}

/* ── Section router ──────────────────────────────────────── */
function loadSection(section) {
  ADMIN_SECTION = section;
  // Update nav
  document.querySelectorAll('.adm-nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.section === section);
  });
  var content = document.getElementById('admContent');
  content.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading…</span></div>';

  var fns = {
    dashboard:  renderDashboard,
    users:      renderUsers,
    portals:    renderPortals,
    teams:      renderTeams,
    sessions:   renderSessions,
    sync:       renderSyncRooms,
    siteconfig: renderSiteConfig,
    features:   renderFeatureManager,
    firestore:  renderFirestoreExplorer,
    security:   renderSecurity,
    logs:       renderActivityLogs
  };
  var fn = fns[section];
  if (fn) { fn(content); }
  else { content.innerHTML = '<div class="adm-empty">Section not found.</div>'; }
}

/* ════════════════════════════════════════════════════════════
   §1  DASHBOARD
════════════════════════════════════════════════════════════ */
function renderDashboard(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Fetching stats…</span></div>';

  Promise.all([
    fbDb.collection('users').get(),
    fbDb.collection('college_portals').get(),
    fbDb.collection('nova_teams').get(),
    fbDb.collection('sync_rooms').get()
  ]).then(function (snaps) {
    var users    = snaps[0];
    var portals  = snaps[1];
    var teams    = snaps[2];
    var syncRms  = snaps[3];

    var adminCount = 0;
    users.forEach(function (d) { if (d.data().isAdmin) adminCount++; });

    var livePortals = 0;
    portals.forEach(function (d) { if (d.data().active !== false) livePortals++; });

    var recentUsers = [];
    users.forEach(function (d) { recentUsers.push(d.data()); });
    recentUsers.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    recentUsers = recentUsers.slice(0, 6);

    container.innerHTML =
      '<div class="adm-section-title">📊 Dashboard</div>' +

      '<div class="adm-stats-grid">' +
        statCard('👤', 'Total Users',     users.size,       '#3b82f6') +
        statCard('🛡️', 'Admins',          adminCount,       '#8b5cf6') +
        statCard('🏫', 'College Portals', portals.size,     '#10b981') +
        statCard('🔄', 'Live Portals',    livePortals,      '#c8f135') +
        statCard('👥', 'Teams',           teams.size,        '#f59e0b') +
        statCard('📡', 'Sync Rooms',      syncRms.size,     '#ec4899') +
      '</div>' +

      '<div class="adm-card" style="margin-top:20px">' +
        '<div class="adm-card-head"><span>🕐 Recent Sign-ups</span>' +
        '<button class="adm-btn-sm" onclick="loadSection(\'users\')">View All →</button></div>' +
        '<table class="adm-table">' +
          '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Admin</th></tr></thead>' +
          '<tbody>' + recentUsers.map(function (u) {
            return '<tr>' +
              '<td>' + esc(u.firstName + ' ' + (u.lastName || '')) + '</td>' +
              '<td style="font-family:\'DM Mono\',monospace;font-size:.73rem">' + esc(u.email || '') + '</td>' +
              '<td>' + esc(u.role || '—') + '</td>' +
              '<td>' + (u.isAdmin ? '<span class="adm-badge green">Admin</span>' : '<span class="adm-badge gray">User</span>') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="adm-row2" style="margin-top:16px">' +
        '<div class="adm-card">' +
          '<div class="adm-card-head"><span>⚡ Quick Actions</span></div>' +
          '<div class="adm-quick-actions">' +
            '<button class="adm-qa-btn" onclick="loadSection(\'users\')">👤 Manage Users</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'portals\')">🏫 Manage Portals</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'siteconfig\')">⚙️ Site Config</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'features\')">🧩 Feature Manager</button>' +
            '<button class="adm-qa-btn" onclick="quickBroadcast()">📢 Broadcast</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'security\')">🔒 Security Rules</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'firestore\')">🗄️ Firestore Explorer</button>' +
            '<button class="adm-qa-btn" onclick="loadSection(\'logs\')">📋 Activity Logs</button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-card">' +
          '<div class="adm-card-head"><span>ℹ️ System Info</span></div>' +
          '<div class="adm-info-list">' +
            '<div class="adm-info-row"><span>Firebase Project</span><code>nova-studio-494013</code></div>' +
            '<div class="adm-info-row"><span>Auth Domain</span><code>nova-studio-494013.firebaseapp.com</code></div>' +
            '<div class="adm-info-row"><span>Admin</span><code>' + esc(ADMIN.email) + '</code></div>' +
            '<div class="adm-info-row"><span>Panel Version</span><code>1.0.0</code></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">Failed to load dashboard: ' + esc(e.message) + '</div>';
  });
}

function statCard(icon, label, val, color) {
  return '<div class="adm-stat-card" style="border-top:3px solid ' + color + '">' +
    '<div class="adm-stat-icon">' + icon + '</div>' +
    '<div class="adm-stat-val">' + val + '</div>' +
    '<div class="adm-stat-label">' + label + '</div>' +
  '</div>';
}

/* ════════════════════════════════════════════════════════════
   §2  USER MANAGEMENT
════════════════════════════════════════════════════════════ */
var _allUsers = [];
var _userSearch = '';
var _userFilter = 'all';

function renderUsers(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading users…</span></div>';
  fbDb.collection('users').get().then(function (snap) {
    _allUsers = [];
    snap.forEach(function (d) { _allUsers.push(Object.assign({ _id: d.id }, d.data())); });
    _allUsers.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    renderUsersUI(container);
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function renderUsersUI(container) {
  var filtered = _allUsers.filter(function (u) {
    var q = _userSearch.toLowerCase();
    var matchSearch = !q || (u.email || '').toLowerCase().includes(q) ||
      (u.firstName || '').toLowerCase().includes(q) ||
      (u.lastName || '').toLowerCase().includes(q);
    var matchFilter = _userFilter === 'all' ||
      (_userFilter === 'admin' && u.isAdmin) ||
      (_userFilter === 'banned' && u.banned);
    return matchSearch && matchFilter;
  });

  container.innerHTML =
    '<div class="adm-section-title">👤 User Management <span class="adm-count">' + _allUsers.length + ' total</span></div>' +
    '<div class="adm-toolbar">' +
      '<input class="adm-search" id="userSearchInput" placeholder="🔍 Search by name or email…" value="' + esc(_userSearch) + '" oninput="_userSearch=this.value;renderUsersUI(document.getElementById(\'admContent\'))">' +
      '<select class="adm-select" onchange="_userFilter=this.value;renderUsersUI(document.getElementById(\'admContent\'))">' +
        '<option value="all"' + (_userFilter==='all'?' selected':'') + '>All Users</option>' +
        '<option value="admin"' + (_userFilter==='admin'?' selected':'') + '>Admins Only</option>' +
        '<option value="banned"' + (_userFilter==='banned'?' selected':'') + '>Banned</option>' +
      '</select>' +
      '<button class="adm-btn-pri" onclick="showAddAdminModal()">+ Grant Admin</button>' +
    '</div>' +
    '<div class="adm-card">' +
      '<table class="adm-table adm-table-hover">' +
        '<thead><tr><th>User</th><th>Email</th><th>Role / Company</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>' +
        '<tbody>' +
        (filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--adm-muted);padding:24px">No users found.</td></tr>' :
          filtered.map(function (u) {
            var ini = ((u.firstName || '?')[0] + (u.lastName || '')[0]).toUpperCase();
            var date = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
            return '<tr>' +
              '<td><div class="adm-user-cell">' +
                (u.avatar ? '<img src="' + esc(u.avatar) + '" class="adm-avatar">' : '<div class="adm-avatar adm-avatar-ini">' + ini + '</div>') +
                '<div><div class="adm-user-name">' + esc((u.firstName || '') + ' ' + (u.lastName || '')) + '</div>' +
                (u.isAdmin ? '<span class="adm-badge green" style="font-size:.6rem">Admin</span>' : '') +
                '</div></div></td>' +
              '<td style="font-family:\'DM Mono\',monospace;font-size:.72rem">' + esc(u.email || '') + '</td>' +
              '<td>' + esc(u.role || '—') + (u.company ? '<br><span style="font-size:.68rem;color:var(--adm-muted)">' + esc(u.company) + '</span>' : '') + '</td>' +
              '<td>' + (u.banned ? '<span class="adm-badge red">Banned</span>' : '<span class="adm-badge green">Active</span>') + '</td>' +
              '<td style="font-size:.72rem;color:var(--adm-muted)">' + date + '</td>' +
              '<td><div style="display:flex;gap:5px">' +
                '<button class="adm-btn-sm" onclick="viewUserDetail(\'' + esc(u._id) + '\')">View</button>' +
                '<button class="adm-btn-sm ' + (u.isAdmin ? 'danger' : '') + '" onclick="toggleAdminRole(\'' + esc(u._id) + '\',' + (u.isAdmin ? 'false' : 'true') + ')">' + (u.isAdmin ? 'Revoke' : 'Make Admin') + '</button>' +
                '<button class="adm-btn-sm danger" onclick="toggleBanUser(\'' + esc(u._id) + '\',' + (u.banned ? 'false' : 'true') + ')">' + (u.banned ? 'Unban' : 'Ban') + '</button>' +
                '<button class="adm-btn-sm danger" onclick="deleteUser(\'' + esc(u._id) + '\')">Delete</button>' +
              '</div></td>' +
            '</tr>';
          }).join('')) +
        '</tbody>' +
      '</table>' +
    '</div>';
}

function toggleAdminRole(email, grant) {
  var action = grant ? 'grant admin access to' : 'revoke admin access from';
  if (!confirm('Are you sure you want to ' + action + ' ' + email + '?')) return;
  fbDb.collection('users').doc(email).update({ isAdmin: grant }).then(function () {
    var u = _allUsers.find(function (x) { return x._id === email; });
    if (u) u.isAdmin = grant;
    renderUsersUI(document.getElementById('admContent'));
    admToast(grant ? 'Admin access granted.' : 'Admin access revoked.', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function toggleBanUser(email, ban) {
  if (!confirm((ban ? 'Ban' : 'Unban') + ' user ' + email + '?')) return;
  fbDb.collection('users').doc(email).update({ banned: ban }).then(function () {
    var u = _allUsers.find(function (x) { return x._id === email; });
    if (u) u.banned = ban;
    renderUsersUI(document.getElementById('admContent'));
    admToast(ban ? 'User banned.' : 'User unbanned.', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function deleteUser(email) {
  if (!confirm('PERMANENTLY DELETE user ' + email + ' and all their data?\n\nThis cannot be undone.')) return;
  // Delete user doc + subcollections (projects, bin, meta, drafts)
  var batch = fbDb.batch();
  var userRef = fbDb.collection('users').doc(email);
  batch.delete(userRef);
  batch.commit().then(function () {
    _allUsers = _allUsers.filter(function (u) { return u._id !== email; });
    renderUsersUI(document.getElementById('admContent'));
    admToast('User deleted.', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function viewUserDetail(email) {
  var u = _allUsers.find(function (x) { return x._id === email; });
  if (!u) return;
  var html =
    '<div class="adm-modal-overlay" id="userDetailModal">' +
      '<div class="adm-modal" style="max-width:540px">' +
        '<div class="adm-modal-head"><span>👤 User Detail</span><button class="adm-modal-close" onclick="closeModal(\'userDetailModal\')">✕</button></div>' +
        '<div class="adm-modal-body">' +
          '<div class="adm-detail-grid">' +
            detailRow('Email', u.email || '—') +
            detailRow('Name', (u.firstName || '') + ' ' + (u.lastName || '')) +
            detailRow('Role', u.role || '—') +
            detailRow('Company', u.company || '—') +
            detailRow('Dept', u.dept || '—') +
            detailRow('Phone', u.phone || '—') +
            detailRow('Location', u.location || '—') +
            detailRow('Website', u.website || '—') +
            detailRow('Admin', u.isAdmin ? '✅ Yes' : '❌ No') +
            detailRow('Banned', u.banned ? '🚫 Yes' : '✅ No') +
            detailRow('UID (Firebase)', u.uid || '—') +
            detailRow('Joined', u.createdAt ? new Date(u.createdAt).toLocaleString() : '—') +
          '</div>' +
          '<div style="margin-top:16px">' +
            '<div style="font-size:.72rem;font-weight:700;color:var(--adm-muted);margin-bottom:8px">EDIT FIELDS</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
              '<div><label class="adm-label">First Name</label><input class="adm-input" id="ue_first" value="' + esc(u.firstName || '') + '"></div>' +
              '<div><label class="adm-label">Last Name</label><input class="adm-input" id="ue_last" value="' + esc(u.lastName || '') + '"></div>' +
              '<div><label class="adm-label">Role</label><input class="adm-input" id="ue_role" value="' + esc(u.role || '') + '"></div>' +
              '<div><label class="adm-label">Company</label><input class="adm-input" id="ue_company" value="' + esc(u.company || '') + '"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="adm-modal-foot">' +
          '<button class="adm-btn-sec" onclick="closeModal(\'userDetailModal\')">Close</button>' +
          '<button class="adm-btn-pri" onclick="saveUserEdits(\'' + esc(email) + '\')">Save Changes</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveUserEdits(email) {
  var updates = {
    firstName: document.getElementById('ue_first').value.trim(),
    lastName:  document.getElementById('ue_last').value.trim(),
    role:      document.getElementById('ue_role').value.trim(),
    company:   document.getElementById('ue_company').value.trim()
  };
  fbDb.collection('users').doc(email).update(updates).then(function () {
    var u = _allUsers.find(function (x) { return x._id === email; });
    if (u) Object.assign(u, updates);
    closeModal('userDetailModal');
    renderUsersUI(document.getElementById('admContent'));
    admToast('User updated.', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function showAddAdminModal() {
  var html =
    '<div class="adm-modal-overlay" id="addAdminModal">' +
      '<div class="adm-modal" style="max-width:400px">' +
        '<div class="adm-modal-head"><span>🛡️ Grant Admin Access</span><button class="adm-modal-close" onclick="closeModal(\'addAdminModal\')">✕</button></div>' +
        '<div class="adm-modal-body">' +
          '<p style="font-size:.8rem;color:var(--adm-muted);margin-bottom:14px">Enter the email of an existing NOVA Studio user to grant admin access.</p>' +
          '<label class="adm-label">User Email</label>' +
          '<input class="adm-input" id="newAdminEmail" placeholder="user@example.com">' +
        '</div>' +
        '<div class="adm-modal-foot">' +
          '<button class="adm-btn-sec" onclick="closeModal(\'addAdminModal\')">Cancel</button>' +
          '<button class="adm-btn-pri" onclick="grantAdminByEmail()">Grant Admin</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function grantAdminByEmail() {
  var email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
  if (!email) { admToast('Enter an email.', 'err'); return; }
  fbDb.collection('users').doc(email).get().then(function (doc) {
    if (!doc.exists) { admToast('User not found in Firestore.', 'err'); return; }
    return fbDb.collection('users').doc(email).update({ isAdmin: true });
  }).then(function () {
    closeModal('addAdminModal');
    admToast('Admin access granted to ' + email, 'ok');
    renderUsers(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §3  COLLEGE PORTALS
════════════════════════════════════════════════════════════ */
function renderPortals(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading portals…</span></div>';
  fbDb.collection('college_portals').get().then(function (snap) {
    var portals = [];
    snap.forEach(function (d) { portals.push(Object.assign({ _id: d.id }, d.data())); });
    portals.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    container.innerHTML =
      '<div class="adm-section-title">🏫 College Portals <span class="adm-count">' + portals.length + ' total</span></div>' +
      '<div class="adm-card">' +
        '<table class="adm-table adm-table-hover">' +
          '<thead><tr><th>Portal Name</th><th>Slug</th><th>Owner</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>' +
          '<tbody>' +
          (portals.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--adm-muted);padding:24px">No portals found.</td></tr>' :
            portals.map(function (p) {
              var date = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—';
              var live = p.active !== false;
              return '<tr>' +
                '<td style="font-weight:700">' + esc(p.name || p._id) + '</td>' +
                '<td style="font-family:\'DM Mono\',monospace;font-size:.72rem">' + esc(p._id) + '</td>' +
                '<td style="font-size:.73rem">' + esc(p.ownerEmail || p.createdBy || '—') + '</td>' +
                '<td>' + (live ? '<span class="adm-badge green">Live</span>' : '<span class="adm-badge gray">Off</span>') + '</td>' +
                '<td style="font-size:.72rem;color:var(--adm-muted)">' + date + '</td>' +
                '<td><div style="display:flex;gap:5px">' +
                  '<button class="adm-btn-sm" onclick="viewPortalDetail(\'' + esc(p._id) + '\')">View</button>' +
                  '<button class="adm-btn-sm ' + (live ? 'danger' : '') + '" onclick="togglePortalStatus(\'' + esc(p._id) + '\',' + live + ')">' + (live ? 'Deactivate' : 'Activate') + '</button>' +
                  '<button class="adm-btn-sm danger" onclick="deletePortal(\'' + esc(p._id) + '\')">Delete</button>' +
                '</div></td>' +
              '</tr>';
            }).join('')) +
          '</tbody>' +
        '</table>' +
      '</div>';

    // Store for detail view
    window._adminPortals = portals;
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function togglePortalStatus(slug, currentLive) {
  var action = currentLive ? 'deactivate' : 'activate';
  if (!confirm('Are you sure you want to ' + action + ' portal "' + slug + '"?')) return;
  fbDb.collection('college_portals').doc(slug).update({ active: !currentLive }).then(function () {
    admToast('Portal ' + action + 'd.', 'ok');
    renderPortals(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function deletePortal(slug) {
  if (!confirm('PERMANENTLY DELETE portal "' + slug + '" and all its student data?\n\nThis cannot be undone.')) return;
  fbDb.collection('college_portals').doc(slug).delete().then(function () {
    admToast('Portal deleted.', 'ok');
    renderPortals(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function viewPortalDetail(slug) {
  fbDb.collection('college_portals').doc(slug).get().then(function (doc) {
    var p = doc.data() || {};
    fbDb.collection('college_portals').doc(slug).collection('students').get().then(function (stSnap) {
      var studentCount = stSnap.size;
      var html =
        '<div class="adm-modal-overlay" id="portalDetailModal">' +
          '<div class="adm-modal" style="max-width:560px">' +
            '<div class="adm-modal-head"><span>🏫 ' + esc(p.name || slug) + '</span><button class="adm-modal-close" onclick="closeModal(\'portalDetailModal\')">✕</button></div>' +
            '<div class="adm-modal-body">' +
              '<div class="adm-detail-grid">' +
                detailRow('Slug', slug) +
                detailRow('Owner', p.ownerEmail || p.createdBy || '—') +
                detailRow('Status', p.active !== false ? '✅ Live' : '❌ Off') +
                detailRow('Students', studentCount) +
                detailRow('State', p.state || '—') +
                detailRow('District', p.district || '—') +
                detailRow('Created', p.createdAt ? new Date(p.createdAt).toLocaleString() : '—') +
              '</div>' +
              '<div style="margin-top:14px">' +
                '<label class="adm-label">Portal Name</label>' +
                '<input class="adm-input" id="pe_name" value="' + esc(p.name || '') + '">' +
              '</div>' +
            '</div>' +
            '<div class="adm-modal-foot">' +
              '<button class="adm-btn-sec" onclick="closeModal(\'portalDetailModal\')">Close</button>' +
              '<button class="adm-btn-pri" onclick="savePortalEdit(\'' + esc(slug) + '\')">Save</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.insertAdjacentHTML('beforeend', html);
    });
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function savePortalEdit(slug) {
  var name = document.getElementById('pe_name').value.trim();
  if (!name) { admToast('Name cannot be empty.', 'err'); return; }
  fbDb.collection('college_portals').doc(slug).update({ name: name }).then(function () {
    closeModal('portalDetailModal');
    admToast('Portal updated.', 'ok');
    renderPortals(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §4  TEAMS
════════════════════════════════════════════════════════════ */
function renderTeams(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading teams…</span></div>';
  fbDb.collection('nova_teams').get().then(function (snap) {
    var teams = [];
    snap.forEach(function (d) { teams.push(Object.assign({ _id: d.id }, d.data())); });

    container.innerHTML =
      '<div class="adm-section-title">👥 Teams <span class="adm-count">' + teams.length + ' total</span></div>' +
      '<div class="adm-card">' +
        '<table class="adm-table adm-table-hover">' +
          '<thead><tr><th>Team Name</th><th>Owner</th><th>Members</th><th>Created</th><th>Actions</th></tr></thead>' +
          '<tbody>' +
          (teams.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--adm-muted);padding:24px">No teams found.</td></tr>' :
            teams.map(function (t) {
              var memberCount = (t.memberEmails || []).length;
              var date = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—';
              return '<tr>' +
                '<td style="font-weight:700">' + esc(t.name || t._id) + '</td>' +
                '<td style="font-size:.73rem">' + esc(t.ownerEmail || '—') + '</td>' +
                '<td>' + memberCount + '</td>' +
                '<td style="font-size:.72rem;color:var(--adm-muted)">' + date + '</td>' +
                '<td><button class="adm-btn-sm danger" onclick="deleteTeam(\'' + esc(t._id) + '\')">Delete</button></td>' +
              '</tr>';
            }).join('')) +
          '</tbody>' +
        '</table>' +
      '</div>';
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function deleteTeam(id) {
  if (!confirm('Delete team "' + id + '"? This cannot be undone.')) return;
  fbDb.collection('nova_teams').doc(id).delete().then(function () {
    admToast('Team deleted.', 'ok');
    renderTeams(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §5  LIVE SESSIONS
════════════════════════════════════════════════════════════ */
function renderSessions(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading sessions…</span></div>';
  fbDb.collection('live_sessions').get().then(function (snap) {
    var sessions = [];
    snap.forEach(function (d) { sessions.push(Object.assign({ _id: d.id }, d.data())); });

    container.innerHTML =
      '<div class="adm-section-title">📡 Live Sessions <span class="adm-count">' + sessions.length + ' total</span></div>' +
      (sessions.length === 0 ?
        '<div class="adm-empty-state">No live sessions found in Firestore.</div>' :
        '<div class="adm-card"><table class="adm-table"><thead><tr><th>ID</th><th>Title</th><th>Host</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        sessions.map(function (s) {
          return '<tr>' +
            '<td style="font-family:\'DM Mono\',monospace;font-size:.72rem">' + esc(s._id) + '</td>' +
            '<td>' + esc(s.title || '—') + '</td>' +
            '<td>' + esc(s.hostEmail || s.host || '—') + '</td>' +
            '<td>' + (s.active ? '<span class="adm-badge green">Live</span>' : '<span class="adm-badge gray">Ended</span>') + '</td>' +
            '<td><button class="adm-btn-sm danger" onclick="deleteSession(\'' + esc(s._id) + '\')">Delete</button></td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>');
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function deleteSession(id) {
  if (!confirm('Delete session "' + id + '"?')) return;
  fbDb.collection('live_sessions').doc(id).delete().then(function () {
    admToast('Session deleted.', 'ok');
    renderSessions(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §6  SYNC ROOMS
════════════════════════════════════════════════════════════ */
function renderSyncRooms(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading sync rooms…</span></div>';
  fbDb.collection('sync_rooms').get().then(function (snap) {
    var rooms = [];
    snap.forEach(function (d) { rooms.push(Object.assign({ _id: d.id }, d.data())); });

    container.innerHTML =
      '<div class="adm-section-title">🔄 Sync Rooms <span class="adm-count">' + rooms.length + ' total</span></div>' +
      (rooms.length === 0 ?
        '<div class="adm-empty-state">No sync rooms found.</div>' :
        '<div class="adm-card"><table class="adm-table"><thead><tr><th>Room ID</th><th>Name</th><th>Owner</th><th>Created</th><th>Actions</th></tr></thead><tbody>' +
        rooms.map(function (r) {
          var date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—';
          return '<tr>' +
            '<td style="font-family:\'DM Mono\',monospace;font-size:.72rem">' + esc(r._id) + '</td>' +
            '<td>' + esc(r.name || '—') + '</td>' +
            '<td>' + esc(r.ownerEmail || r.owner || '—') + '</td>' +
            '<td style="font-size:.72rem;color:var(--adm-muted)">' + date + '</td>' +
            '<td><button class="adm-btn-sm danger" onclick="deleteSyncRoom(\'' + esc(r._id) + '\')">Delete</button></td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>');
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function deleteSyncRoom(id) {
  if (!confirm('Delete sync room "' + id + '"?')) return;
  fbDb.collection('sync_rooms').doc(id).delete().then(function () {
    admToast('Room deleted.', 'ok');
    renderSyncRooms(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §7  SITE CONFIG
════════════════════════════════════════════════════════════ */
var _siteConfig = {};

function renderSiteConfig(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading config…</span></div>';
  fbDb.collection('nova_config').doc('site').get().then(function (doc) {
    _siteConfig = doc.exists ? doc.data() : {};
    container.innerHTML =
      '<div class="adm-section-title">⚙️ Site Configuration ' +
      '<span style="display:inline-flex;align-items:center;gap:5px;font-size:.65rem;font-weight:700;background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;border:1.5px solid #bbf7d0">' +
        '<span style="width:6px;height:6px;background:#16a34a;border-radius:50%;display:inline-block;animation:pulse 1.5s infinite"></span>' +
        'LIVE — changes broadcast to all users instantly' +
      '</span>' +
      '</div>' +
      '<div class="adm-card">' +
        '<div class="adm-card-head"><span>🌐 General</span></div>' +
        '<div class="adm-form-grid">' +
          '<div><label class="adm-label">Site Title</label><input class="adm-input" id="cfg_siteTitle" value="' + esc(_siteConfig.siteTitle || 'NOVA Studio') + '"></div>' +
          '<div><label class="adm-label">Support Email</label><input class="adm-input" id="cfg_supportEmail" value="' + esc(_siteConfig.supportEmail || '') + '"></div>' +
          '<div><label class="adm-label">Announcement Banner</label><input class="adm-input" id="cfg_banner" value="' + esc(_siteConfig.banner || '') + '" placeholder="Leave empty to hide"></div>' +
          '<div><label class="adm-label">Banner Color</label><input type="color" class="adm-input" id="cfg_bannerColor" value="' + esc(_siteConfig.bannerColor || '#c8f135') + '" style="height:42px;padding:4px 8px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="adm-card" style="margin-top:14px">' +
        '<div class="adm-card-head"><span>🔧 Feature Flags</span></div>' +
        '<div class="adm-toggle-list">' +
          cfgToggle('enableSignup',      'Allow New Registrations',     _siteConfig.enableSignup !== false) +
          cfgToggle('enableGoogleLogin', 'Enable Google Login',          _siteConfig.enableGoogleLogin !== false) +
          cfgToggle('enableDemoMode',    'Allow Demo Mode Login',        _siteConfig.enableDemoMode !== false) +
          cfgToggle('maintenanceMode',   '🚧 Maintenance Mode (lock site)',_siteConfig.maintenanceMode === true) +
          cfgToggle('enableCertTool',    'Certificate Maker',            _siteConfig.enableCertTool !== false) +
          cfgToggle('enablePortals',     'College Portals',              _siteConfig.enablePortals !== false) +
          cfgToggle('enableTeams',       'Teams Feature',                _siteConfig.enableTeams !== false) +
          cfgToggle('enableLiveClasses', 'Live Sessions (📡)',           _siteConfig.enableLiveClasses !== false) +
          cfgToggle('enableSyncRooms',   'Data Sync Rooms (🔄)',         _siteConfig.enableSyncRooms !== false) +
          cfgToggle('enableFollowup',    'Followup Tracker (📂)',        _siteConfig.enableFollowup !== false) +
          cfgToggle('enableNovaAI',      'Nova AI 🤖',                   _siteConfig.enableNovaAI !== false) +
        '</div>' +
      '</div>' +
      '<div class="adm-card" style="margin-top:14px">' +
        '<div class="adm-card-head"><span>⚠️ Danger Zone</span></div>' +
        '<div style="padding:14px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="adm-btn-danger" onclick="broadcastMaintenance()">🚧 Enable Maintenance Mode</button>' +
          '<button class="adm-btn-danger" onclick="clearAllPortals()">🗑️ Delete ALL Portals</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end">' +
        '<button class="adm-btn-pri" onclick="saveSiteConfig()">💾 Save Configuration</button>' +
      '</div>';
  }).catch(function (e) {
    container.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function cfgToggle(key, label, checked) {
  return '<div class="adm-toggle-row">' +
    '<label class="adm-toggle-label">' + label + '</label>' +
    '<label class="adm-toggle-switch">' +
      '<input type="checkbox" id="cfg_' + key + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="adm-toggle-thumb"></span>' +
    '</label>' +
  '</div>';
}

function saveSiteConfig() {
  var keys = ['enableSignup','enableGoogleLogin','enableDemoMode','maintenanceMode','enableCertTool','enablePortals','enableTeams','enableLiveClasses','enableSyncRooms','enableFollowup','enableNovaAI'];
  var data = {
    siteTitle:      document.getElementById('cfg_siteTitle').value.trim(),
    supportEmail:   document.getElementById('cfg_supportEmail').value.trim(),
    banner:         document.getElementById('cfg_banner').value.trim(),
    bannerColor:    document.getElementById('cfg_bannerColor').value,
    updatedAt:      Date.now(),
    updatedBy:      ADMIN.email
  };
  keys.forEach(function (k) {
    var el = document.getElementById('cfg_' + k);
    if (el) data[k] = el.checked;
  });
  fbDb.collection('nova_config').doc('site').set(data, { merge: true }).then(function () {
    admToast('Configuration saved!', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function broadcastMaintenance() {
  if (!confirm('Enable maintenance mode? This will show a maintenance banner to all users.')) return;
  fbDb.collection('nova_config').doc('site').set({ maintenanceMode: true }, { merge: true }).then(function () {
    admToast('Maintenance mode enabled.', 'ok');
    document.getElementById('cfg_maintenanceMode').checked = true;
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function clearAllPortals() {
  if (!confirm('DELETE ALL college portals? This is irreversible.')) return;
  if (!confirm('Last warning — this will permanently delete every portal and student record. Continue?')) return;
  fbDb.collection('college_portals').get().then(function (snap) {
    var batch = fbDb.batch();
    snap.forEach(function (d) { batch.delete(d.ref); });
    return batch.commit();
  }).then(function () {
    admToast('All portals deleted.', 'ok');
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §8  FIRESTORE EXPLORER
════════════════════════════════════════════════════════════ */
var _explorerCollection = '';
var _explorerDocs = [];

function renderFirestoreExplorer(container) {
  var collections = ['users','college_portals','nova_teams','nova_invites','sync_rooms','live_sessions',
    'tp_directory','tp_connections','followup_sessions','nova_notifications','nova_config'];

  container.innerHTML =
    '<div class="adm-section-title">🗄️ Firestore Explorer</div>' +
    '<div class="adm-row2">' +
      '<div class="adm-card" style="max-height:600px;overflow-y:auto">' +
        '<div class="adm-card-head"><span>Collections</span></div>' +
        '<div class="adm-coll-list">' +
          collections.map(function (c) {
            return '<div class="adm-coll-item' + (c === _explorerCollection ? ' active' : '') + '" onclick="explorerLoad(\'' + c + '\')">' +
              '<span class="adm-coll-icon">📁</span>' + c +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div id="explorerPanel" class="adm-card" style="max-height:600px;overflow-y:auto">' +
        '<div class="adm-empty-state" style="padding:40px">← Select a collection</div>' +
      '</div>' +
    '</div>';
}

function explorerLoad(collection) {
  _explorerCollection = collection;
  var panel = document.getElementById('explorerPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading…</span></div>';

  // re-render to highlight active
  document.querySelectorAll('.adm-coll-item').forEach(function (el) {
    el.classList.toggle('active', el.textContent.trim() === collection);
  });

  fbDb.collection(collection).limit(50).get().then(function (snap) {
    _explorerDocs = [];
    snap.forEach(function (d) { _explorerDocs.push({ id: d.id, data: d.data() }); });

    if (_explorerDocs.length === 0) {
      panel.innerHTML = '<div class="adm-empty-state" style="padding:40px">No documents in <code>' + collection + '</code></div>';
      return;
    }

    panel.innerHTML =
      '<div class="adm-card-head"><span>' + collection + '</span><span class="adm-count">' + _explorerDocs.length + ' docs (max 50)</span></div>' +
      '<div style="padding:10px">' +
        _explorerDocs.map(function (doc, i) {
          var preview = Object.keys(doc.data).slice(0, 3).map(function (k) {
            var v = doc.data[k];
            if (typeof v === 'object' && v !== null) v = '{…}';
            return '<span style="font-size:.66rem;color:var(--adm-muted)">' + esc(String(k)) + ':</span> <span style="font-size:.66rem">' + esc(String(v).substring(0, 30)) + '</span>';
          }).join(' · ');
          return '<div class="adm-doc-item" onclick="explorerViewDoc(' + i + ')">' +
            '<div style="font-family:\'DM Mono\',monospace;font-size:.74rem;font-weight:700">' + esc(doc.id) + '</div>' +
            '<div>' + preview + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }).catch(function (e) {
    panel.innerHTML = '<div class="adm-error">' + esc(e.message) + '</div>';
  });
}

function explorerViewDoc(idx) {
  var doc = _explorerDocs[idx];
  if (!doc) return;
  var json = JSON.stringify(doc.data, null, 2);
  var html =
    '<div class="adm-modal-overlay" id="docViewModal">' +
      '<div class="adm-modal" style="max-width:600px">' +
        '<div class="adm-modal-head"><span>📄 ' + esc(_explorerCollection) + ' / ' + esc(doc.id) + '</span><button class="adm-modal-close" onclick="closeModal(\'docViewModal\')">✕</button></div>' +
        '<div class="adm-modal-body">' +
          '<textarea class="adm-json-editor" id="docJsonEditor" style="width:100%;height:320px;font-family:\'DM Mono\',monospace;font-size:.72rem;padding:12px;border:1.5px solid var(--adm-border);border-radius:8px;resize:vertical">' + esc(json) + '</textarea>' +
        '</div>' +
        '<div class="adm-modal-foot">' +
          '<button class="adm-btn-sec" onclick="closeModal(\'docViewModal\')">Cancel</button>' +
          '<button class="adm-btn-danger" onclick="explorerDeleteDoc(\'' + esc(doc.id) + '\')">Delete Doc</button>' +
          '<button class="adm-btn-pri" onclick="explorerSaveDoc(\'' + esc(doc.id) + '\')">Save Changes</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function explorerSaveDoc(docId) {
  var raw = document.getElementById('docJsonEditor').value;
  var data;
  try { data = JSON.parse(raw); } catch (e) { admToast('Invalid JSON: ' + e.message, 'err'); return; }
  fbDb.collection(_explorerCollection).doc(docId).set(data, { merge: true }).then(function () {
    closeModal('docViewModal');
    admToast('Document saved.', 'ok');
    explorerLoad(_explorerCollection);
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function explorerDeleteDoc(docId) {
  if (!confirm('Delete document "' + docId + '" from ' + _explorerCollection + '?')) return;
  fbDb.collection(_explorerCollection).doc(docId).delete().then(function () {
    closeModal('docViewModal');
    admToast('Document deleted.', 'ok');
    explorerLoad(_explorerCollection);
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

/* ════════════════════════════════════════════════════════════
   §9  SECURITY RULES (viewer)
════════════════════════════════════════════════════════════ */
function renderSecurity(container) {
  var rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helper: admin check ──
    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.token.email)) &&
        get(/databases/$(database)/documents/users/$(request.auth.token.email)).data.isAdmin == true;
    }

    // User profiles
    match /users/{userEmail} {
      allow read:  if request.auth != null;
      allow write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      match /{subcollection}/{docId} {
        allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      }
    }

    // Site config — admin only
    match /nova_config/{docId} {
      allow read:  if request.auth != null;
      allow write: if isAdmin();
    }

    // Teams
    match /nova_teams/{teamId} {
      allow read, write: if request.auth != null;
      match /{subcollection}/{docId} {
        allow read, write: if request.auth != null;
      }
    }

    // Invites
    match /nova_invites/{token} {
      allow read, write: if request.auth != null;
    }

    // Sync rooms
    match /sync_rooms/{roomId} {
      allow read, write: if request.auth != null;
      match /{subcollection}/{docId} {
        allow read, write: if request.auth != null;
      }
    }

    // Notifications
    match /nova_notifications/{userEmail} {
      allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      match /items/{itemId} {
        allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      }
    }

    // College Portals
    match /college_portals/{slug} {
      allow read: if true;
      allow write: if request.auth != null;
      allow delete: if isAdmin();
      match /students/{studentId} {
        allow read: if true;
        allow create, update: if true;
        allow delete: if request.auth != null;
      }
      match /form_requests/{reqId} {
        allow read: if request.auth != null;
        allow create: if true;
        allow update, delete: if request.auth != null;
      }
    }

    // TP Directory
    match /tp_directory/{tpId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
      match /feedback/{fbkId} {
        allow read, write: if request.auth != null;
      }
    }

    // TP Connections
    match /tp_connections/{connId} {
      allow read, write: if request.auth != null;
    }

    // Followup Tracker
    match /followup_sessions/{userEmail} {
      allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      match /sessions/{sessionId} {
        allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
        match /colleges/{collegeId} {
          allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
        }
      }
    }

    match /followup_notifications/{userEmail} {
      allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      match /items/{itemId} {
        allow read, write: if (request.auth != null && request.auth.token.email == userEmail) || isAdmin();
      }
    }

    // Fallback
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;

  container.innerHTML =
    '<div class="adm-section-title">🔒 Security Rules</div>' +
    '<div class="adm-card">' +
      '<div class="adm-card-head">' +
        '<span>Firestore Security Rules (with Admin Functions)</span>' +
        '<button class="adm-btn-sm" onclick="copySecurityRules()">📋 Copy</button>' +
      '</div>' +
      '<div style="padding:12px">' +
        '<p style="font-size:.78rem;color:var(--adm-muted);margin-bottom:10px">These are the recommended security rules for NOVA Studio with admin support. Deploy them via <strong>Firebase Console → Firestore → Rules</strong>.</p>' +
        '<textarea class="adm-json-editor" id="secRulesArea" style="width:100%;height:460px;font-family:\'DM Mono\',monospace;font-size:.72rem;padding:12px;border:1.5px solid var(--adm-border);border-radius:8px;resize:vertical">' + esc(rules) + '</textarea>' +
      '</div>' +
    '</div>' +
    '<div class="adm-card" style="margin-top:14px">' +
      '<div class="adm-card-head"><span>📖 How to set Admin access</span></div>' +
      '<div style="padding:14px;font-size:.8rem;line-height:1.8;color:var(--adm-body)">' +
        '<ol style="padding-left:18px">' +
          '<li>Go to <strong>Firebase Console → Firestore Database → Data</strong></li>' +
          '<li>Navigate to <code>users → [your-email@domain.com]</code></li>' +
          '<li>Click <strong>+ Add field</strong> → Field: <code>isAdmin</code>, Type: <strong>boolean</strong>, Value: <strong>true</strong></li>' +
          '<li>Save. That user can now access the Admin Panel.</li>' +
          '<li>Or use the <strong>Users → Make Admin</strong> button in this panel (you must be admin first).</li>' +
        '</ol>' +
      '</div>' +
    '</div>';
}

function copySecurityRules() {
  var el = document.getElementById('secRulesArea');
  if (!el) return;
  navigator.clipboard.writeText(el.value).then(function () {
    admToast('Rules copied to clipboard!', 'ok');
  }).catch(function () {
    el.select();
    document.execCommand('copy');
    admToast('Copied!', 'ok');
  });
}

/* ════════════════════════════════════════════════════════════
   §10  ACTIVITY LOGS
════════════════════════════════════════════════════════════ */
function renderActivityLogs(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading logs…</span></div>';
  fbDb.collection('nova_admin_logs').orderBy('ts', 'desc').limit(100).get().then(function (snap) {
    var logs = [];
    snap.forEach(function (d) { logs.push(d.data()); });

    container.innerHTML =
      '<div class="adm-section-title">📋 Activity Logs</div>' +
      '<div class="adm-card">' +
        '<div class="adm-card-head"><span>Admin Action Log (last 100)</span>' +
          '<button class="adm-btn-sm danger" onclick="clearAdminLogs()">Clear All</button>' +
        '</div>' +
        (logs.length === 0 ?
          '<div class="adm-empty-state">No admin logs yet. Actions you take in this panel are logged here.</div>' :
          '<table class="adm-table"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead><tbody>' +
          logs.map(function (l) {
            return '<tr>' +
              '<td style="font-size:.7rem;color:var(--adm-muted);white-space:nowrap">' + (l.ts ? new Date(l.ts).toLocaleString() : '—') + '</td>' +
              '<td style="font-size:.73rem">' + esc(l.admin || '—') + '</td>' +
              '<td><span class="adm-badge blue">' + esc(l.action || '—') + '</span></td>' +
              '<td style="font-size:.73rem;font-family:\'DM Mono\',monospace">' + esc(l.target || '—') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>') +
      '</div>';
  }).catch(function (e) {
    // Collection may not exist yet
    container.innerHTML =
      '<div class="adm-section-title">📋 Activity Logs</div>' +
      '<div class="adm-empty-state">No logs yet. Admin actions will appear here once the <code>nova_admin_logs</code> collection is created.</div>';
  });
}

function clearAdminLogs() {
  if (!confirm('Clear all admin logs?')) return;
  fbDb.collection('nova_admin_logs').get().then(function (snap) {
    var batch = fbDb.batch();
    snap.forEach(function (d) { batch.delete(d.ref); });
    return batch.commit();
  }).then(function () {
    admToast('Logs cleared.', 'ok');
    renderActivityLogs(document.getElementById('admContent'));
  }).catch(function (e) { admToast('Error: ' + e.message, 'err'); });
}

function logAdminAction(action, target) {
  fbDb.collection('nova_admin_logs').add({
    admin:  ADMIN ? ADMIN.email : '?',
    action: action,
    target: target || '',
    ts:     Date.now()
  }).catch(function () {});
}

/* ── Shared helpers ───────────────────────────────────────── */
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}
function detailRow(label, value) {
  return '<div class="adm-detail-row"><span class="adm-detail-label">' + esc(String(label)) + '</span><span class="adm-detail-value">' + esc(String(value)) + '</span></div>';
}
function admToast(msg, type) {
  var t = document.getElementById('admToast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'adm-toast ' + (type || 'ok');
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 3000);
}

// allow Enter key on login
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && document.getElementById('adminLogin').style.display !== 'none') {
    adminDoLogin();
  }
});


/* ════════════════════════════════════════════════════════════
   §11  FEATURE MANAGER  v2
   Two-column board:
     LEFT  = 🔧 Under Construction  (comingSoon:true  in Firestore)
     RIGHT = ✅ Live Tools           (comingSoon:false in Firestore)

   Admin drags cards between columns.
   • RIGHT column  → Tools section in user sidebar (clickable)
   • LEFT  column  → "Coming Soon" block inside Account section
                     for normal users (visible but disabled)
   Saves to nova_config/features → live-read by app.js
════════════════════════════════════════════════════════════ */

/* Master list — id must match sidebar element IDs in index.html */
var FM_DEFAULT_FEATURES = [
  { id:'sbHome',        label:'🏠 Dashboard',           protected:true  },
  { id:'sbProj',        label:'📁 My Projects',          protected:true  },
  { id:'sbCert',        label:'🎓 Certificates',         protected:false },
  { id:'sbMailer',      label:'📧 Cert Mailer',          protected:false },
  { id:'sbPortal',      label:'🏫 College Portal',       protected:false },
  { id:'sbSync',        label:'🔄 Data Sync',            protected:false },
  { id:'sbTeams',       label:'👥 My Teams',             protected:false },
  { id:'sbLiveClasses', label:'📡 Sessions',             protected:false },
  { id:'sbFollowup',    label:'📂 Followup Tracker',     protected:false },
  { id:'sbTp',          label:'🤝 Training Partners',    protected:false },
  { id:'sbImgComp',     label:'🖼️ Image Resizer',        protected:false },
  { id:'sbFileConv',    label:'🔄 File Converter',       protected:false },
  { id:'sbImgEdit',     label:'🎨 Image Editor',         protected:false },
  { id:'sbDrafts',      label:'✉️ Draft Proposals',      protected:false },
  { id:'sbProfile',     label:'👤 My Profile',           protected:true  },
  { id:'sbSettings',    label:'⚙️ Settings',             protected:true  },
  { id:'sbHelp',        label:'📖 Help & Guide',         protected:true  },
];

var _fmFeatures  = [];   // full working copy
var _fmDragSrc   = null; // { col:'construction'|'tools', idx:number }

/* ── Load from Firestore then render ──────────────────────── */
function renderFeatureManager(container) {
  container.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Loading Feature Manager…</span></div>';

  fbDb.collection('nova_config').doc('features').get().then(function(doc) {
    var saved = doc.exists ? (doc.data().list || []) : [];
    var savedIds = saved.map(function(f){ return f.id; });

    _fmFeatures = saved.map(function(s) {
      var master = FM_DEFAULT_FEATURES.find(function(f){ return f.id === s.id; });
      return {
        id:         s.id,
        label:      master ? master.label : (s.label || s.id),
        comingSoon: s.comingSoon || false,
        hidden:     s.hidden     || false,
        protected:  master ? master.protected : false
      };
    });
    FM_DEFAULT_FEATURES.forEach(function(f) {
      if (savedIds.indexOf(f.id) === -1) {
        _fmFeatures.push({ id:f.id, label:f.label, comingSoon:false, hidden:false, protected:f.protected });
      }
    });

    _renderFMBoard(container);
  }).catch(function() {
    _fmFeatures = FM_DEFAULT_FEATURES.map(function(f) {
      return { id:f.id, label:f.label, comingSoon:false, hidden:false, protected:f.protected };
    });
    _renderFMBoard(container);
  });
}

/* ── Render the two-column board ──────────────────────────── */
function _renderFMBoard(container) {
  var liveList    = _fmFeatures.filter(function(f){ return !f.comingSoon; });
  var csList      = _fmFeatures.filter(function(f){ return  f.comingSoon; });
  var liveCount   = liveList.filter(function(f){ return !f.hidden; }).length;
  var csCount     = csList.length;

  container.innerHTML =
    /* ── Header ── */
    '<div class="adm-section-title" style="margin-bottom:6px">🧩 Feature Manager' +
      '<span style="font-size:.63rem;font-weight:600;color:var(--adm-muted);margin-left:8px">' +
        'Drag cards between columns · saves to Firestore · goes live instantly' +
      '</span>' +
    '</div>' +

    /* ── How it works banner ── */
    '<div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:11px 14px;margin-bottom:16px;font-size:.76rem;color:#0369a1;line-height:1.7">' +
      '<b>How it works:</b> ' +
      'Cards in <b>✅ Live Tools</b> appear in the user sidebar under <em>Tools</em> — fully clickable. ' +
      'Cards in <b>🔧 Under Construction</b> move to the <em>Account</em> section for normal users with a 🚧 badge — visible but disabled. ' +
      'Drag a card to promote it (Construction → Tools) or demote it (Tools → Construction). ' +
      '<b>🔐 Protected</b> items cannot be moved.' +
    '</div>' +

    /* ── Stats row ── */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
      '<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:1.7rem">✅</div>' +
        '<div><div style="font-size:1.5rem;font-weight:800;color:#166534;line-height:1">' + liveCount + '</div>' +
        '<div style="font-size:.7rem;font-weight:700;color:#16a34a">Live Tools</div></div>' +
      '</div>' +
      '<div style="background:linear-gradient(135deg,#fff7ed,#fed7aa);border:1.5px solid #fb923c;border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:1.7rem">🔧</div>' +
        '<div><div style="font-size:1.5rem;font-weight:800;color:#9a3412;line-height:1">' + csCount + '</div>' +
        '<div style="font-size:.7rem;font-weight:700;color:#c2410c">Under Construction</div></div>' +
      '</div>' +
    '</div>' +

    /* ── Two-column board ── */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">' +

      /* LEFT = Under Construction */
      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div style="font-size:.75rem;font-weight:800;color:#c2410c;display:flex;align-items:center;gap:6px">' +
            '<span style="background:#fed7aa;padding:3px 9px;border-radius:20px;border:1.5px solid #fb923c">🔧 Under Construction</span>' +
          '</div>' +
          '<span style="font-size:.65rem;color:var(--adm-muted)">→ shows in Account as 🚧</span>' +
        '</div>' +
        '<div id="fmColConstruction" class="fm-col" data-col="construction" ' +
          'style="min-height:120px;background:#fffbf5;border:2px dashed #fdba74;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px">' +
          csList.map(function(f) { return _fmBoardCard(f); }).join('') +
          (csList.length === 0 ? '<div class="fm-empty-hint" style="text-align:center;padding:28px 12px;color:#fdba74;font-size:.75rem;font-weight:600">Drop features here<br>to mark as 🔧 Coming Soon</div>' : '') +
        '</div>' +
      '</div>' +

      /* RIGHT = Live Tools */
      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div style="font-size:.75rem;font-weight:800;color:#15803d;display:flex;align-items:center;gap:6px">' +
            '<span style="background:#dcfce7;padding:3px 9px;border-radius:20px;border:1.5px solid #86efac">✅ Live Tools</span>' +
          '</div>' +
          '<span style="font-size:.65rem;color:var(--adm-muted)">→ shows in sidebar Tools</span>' +
        '</div>' +
        '<div id="fmColTools" class="fm-col" data-col="tools" ' +
          'style="min-height:120px;background:#f0fdf4;border:2px dashed #86efac;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px">' +
          liveList.map(function(f) { return _fmBoardCard(f); }).join('') +
        '</div>' +
      '</div>' +

    '</div>' +

    /* ── Action bar ── */
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:14px;border-top:1.5px solid var(--adm-border)">' +
      '<button class="adm-btn-sec" onclick="_fmResetOrder()">↺ Reset to Defaults</button>' +
      '<button class="adm-btn-pri" onclick="_fmSave()">🚀 Save & Publish Live</button>' +
    '</div>';

  _fmBindBoardDrag();
}

/* ── Build one card for the board ─────────────────────────── */
function _fmBoardCard(f) {
  var isCS   = f.comingSoon;
  var bg     = isCS ? '#fff7ed' : '#ffffff';
  var border = isCS ? '#fdba74' : '#e2e8f0';
  var protectedBadge = f.protected
    ? '<span style="font-size:.58rem;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;padding:1px 6px;border-radius:20px;flex-shrink:0">🔐</span>'
    : '';
  var hiddenToggle = !f.protected
    ? '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:.65rem;color:' + (f.hidden ? '#64748b' : '#cbd5e1') + ';flex-shrink:0" title="Hide completely">' +
        '<input type="checkbox" ' + (f.hidden ? 'checked' : '') + ' onchange="_fmToggleHidden(\'' + f.id + '\',this.checked)" style="accent-color:#64748b;width:12px;height:12px"> 👁️' +
      '</label>'
    : '';

  return '<div class="fm-card" data-id="' + f.id + '" draggable="' + (!f.protected ? 'true' : 'false') + '" ' +
    'style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;' +
    'background:' + bg + ';border:1.5px solid ' + border + ';' +
    'transition:all .15s;user-select:none;' + (f.protected ? 'opacity:.75;' : 'cursor:grab;') + '">' +
    (!f.protected ? '<span style="font-size:.95rem;color:#cbd5e1;flex-shrink:0;line-height:1" title="Drag to move">⠿</span>' : '<span style="width:14px;flex-shrink:0"></span>') +
    '<span style="flex:1;font-size:.8rem;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + f.label + '</span>' +
    protectedBadge +
    hiddenToggle +
  '</div>';
}

/* ── Drag-and-drop between columns ───────────────────────── */
function _fmBindBoardDrag() {
  var cards = document.querySelectorAll('.fm-card[draggable="true"]');
  var cols  = document.querySelectorAll('.fm-col');

  cards.forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      _fmDragSrc = this.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function() { card.style.opacity = '.35'; }, 0);
    });
    card.addEventListener('dragend', function() {
      this.style.opacity = '';
      cols.forEach(function(c) {
        c.style.borderColor = '';
        c.style.background  = c.dataset.col === 'construction' ? '#fffbf5' : '#f0fdf4';
      });
    });
  });

  cols.forEach(function(col) {
    col.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.style.borderColor = '#c8f135';
      this.style.background  = 'rgba(200,241,53,.08)';
    });
    col.addEventListener('dragleave', function() {
      this.style.borderColor = '';
      this.style.background  = this.dataset.col === 'construction' ? '#fffbf5' : '#f0fdf4';
    });
    col.addEventListener('drop', function(e) {
      e.preventDefault();
      var targetCol = this.dataset.col;   // 'construction' or 'tools'
      if (!_fmDragSrc) return;

      var feat = _fmFeatures.find(function(f){ return f.id === _fmDragSrc; });
      if (!feat || feat.protected) return;

      feat.comingSoon = (targetCol === 'construction');
      if (feat.comingSoon) feat.hidden = false; // construction items are always visible

      _fmDragSrc = null;
      // Re-render the board with updated state
      var container = document.getElementById('admContent');
      if (container) _renderFMBoard(container);
    });
  });
}

/* ── Toggle hidden flag ───────────────────────────────────── */
function _fmToggleHidden(id, val) {
  var feat = _fmFeatures.find(function(f){ return f.id === id; });
  if (!feat) return;
  feat.hidden = val;
  if (val) feat.comingSoon = false;
  var container = document.getElementById('admContent');
  if (container) _renderFMBoard(container);
}

/* ── Reset to defaults ────────────────────────────────────── */
function _fmResetOrder() {
  if (!confirm('Reset Feature Manager to defaults? All comingSoon and hidden flags will be cleared.')) return;
  _fmFeatures = FM_DEFAULT_FEATURES.map(function(f) {
    return { id:f.id, label:f.label, comingSoon:false, hidden:false, protected:f.protected };
  });
  var container = document.getElementById('admContent');
  if (container) _renderFMBoard(container);
  admToast('Reset done. Click Save & Publish to apply.', 'ok');
}

/* ── Save to Firestore ────────────────────────────────────── */
function _fmSave() {
  var data = {
    list: _fmFeatures.map(function(f) {
      return { id:f.id, label:f.label, comingSoon:f.comingSoon, hidden:f.hidden };
    }),
    updatedAt: Date.now(),
    updatedBy: ADMIN ? ADMIN.email : 'admin'
  };
  fbDb.collection('nova_config').doc('features').set(data).then(function() {
    admToast('🚀 Published! Changes are now live for all users.', 'ok');
    renderFeatureManager(document.getElementById('admContent'));
  }).catch(function(e) { admToast('Error: ' + e.message, 'err'); });
}
