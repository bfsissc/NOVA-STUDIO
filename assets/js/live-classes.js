// ── NOVA Sessions — WebRTC Video Conferencing ────────────────────────────────
// Uses Firebase Firestore for signaling, WebRTC for peer-to-peer media
// Architecture: mesh topology via PeerJS (hosted), Firestore for room state
//
// JOIN FLOW:
//   Host  → creates session → gets a shareable link (no login wall for guests)
//   Guest → opens link → Google sign-in popup (auto-fills name) → joins directly
//           Guest never sees Nova Studio login. The join page is a standalone
//           lightweight overlay that only knows it's a "video session".
// ─────────────────────────────────────────────────────────────────────────────

const LC = (function () {

  // ── State ────────────────────────────────────────────────────────────────
  let _state = {
    view: 'lobby',        // 'lobby' | 'room'
    rooms: [],
    myRoom: null,
    peers: {},            // peerId → { stream, el, name, muted, camOff }
    localStream: null,
    peer: null,           // PeerJS instance
    myPeerId: null,
    myName: '',
    myRole: '',           // 'host' | 'participant'
    roomId: null,
    roomUnsubscribe: null,
    peersUnsubscribe: null,
    micOn: true,
    camOn: true,
    roomsUnsubscribe: null,
    chatMessages: [],
    chatUnsubscribe: null,
    screenStream: null,
    isScreenSharing: false,
    chatOpen: false,
    unreadChat: 0,
    handRaised: false,
    participantCount: 1,
  };

  // ── PeerJS CDN loader ─────────────────────────────────────────────────────
  function _loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
    s.onload = cb;
    s.onerror = () => lcShowToast('Failed to load video engine. Check connection.', 'err');
    document.head.appendChild(s);
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }
  function _uid() { return Math.random().toString(36).slice(2, 10); }
  function _ts() { return Date.now(); }
  function _fmt(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function lcShowToast(msg, type = 'ok') {
    const t = _el('lcToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'lc-toast lc-toast-' + type;
    t.style.display = 'block';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.display = 'none'; }, 3200);
  }

  // ── Firestore helpers ─────────────────────────────────────────────────────
  function _roomsRef() { return fbDb.collection('lc_rooms'); }
  function _roomRef(id) { return _roomsRef().doc(id); }
  function _peersRef(roomId) { return _roomRef(roomId).collection('peers'); }
  function _chatRef(roomId) { return _roomRef(roomId).collection('chat'); }

  // ── Magic Link Helpers ────────────────────────────────────────────────────
  // Generates a join URL that works on ANY domain/portal.
  // The link encodes only the roomId. When opened it shows a minimal Google
  // sign-in prompt — no Nova Studio branding or login wall.
  function _joinLink(roomId) {
    // Works whether the app is served from nova-studio.com, college-portal.com, etc.
    const base = window.location.origin + window.location.pathname;
    return base + '?session=' + roomId;
  }

  // On page load, check if we're arriving via a join link.
  // Called by openView() automatically.
  async function _checkJoinLink() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (!sessionId) return false;

    // Remove the param from URL without reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Show a standalone lightweight join overlay (no Nova Studio context)
    _showGuestJoinOverlay(sessionId.toUpperCase());
    return true;
  }

  // ── Guest Join Overlay ────────────────────────────────────────────────────
  // A self-contained overlay for guests arriving via link.
  // Shows: session title, "Sign in with Google to join" button.
  // No mention of Nova Studio.
  async function _showGuestJoinOverlay(roomId) {
    // Fetch room info first
    let roomData = null;
    try {
      const snap = await _roomRef(roomId).get();
      if (!snap.exists) { _showLinkError('This session link is invalid or has expired.'); return; }
      roomData = snap.data();
      if (roomData.status !== 'live') { _showLinkError('This session has already ended.'); return; }
    } catch (e) {
      _showLinkError('Could not reach the session. Check your connection.');
      return;
    }

    // Build overlay
    let overlay = _el('lcGuestOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lcGuestOverlay';
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
        display:flex;align-items:center;justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      `;
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div style="
        background:rgba(255,255,255,.06);backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.12);border-radius:20px;
        padding:40px 36px;max-width:420px;width:90%;text-align:center;
        box-shadow:0 24px 80px rgba(0,0,0,.5);
      ">
        <div style="font-size:2.2rem;margin-bottom:8px">📡</div>
        <div style="color:#fff;font-size:1.3rem;font-weight:700;margin-bottom:6px">
          ${_esc(roomData.title)}
        </div>
        ${roomData.description ? `<div style="color:#94a3b8;font-size:.88rem;margin-bottom:4px">${_esc(roomData.description)}</div>` : ''}
        <div style="color:#64748b;font-size:.78rem;margin-bottom:28px">
          🎙️ Hosted by ${_esc(roomData.hostName)}
        </div>

        <div id="lcGuestStatus" style="color:#94a3b8;font-size:.85rem;margin-bottom:18px">
          Sign in to join this session
        </div>

        <button id="lcGuestGoogleBtn" onclick="LC._guestGoogleSignIn('${roomId}')" style="
          display:flex;align-items:center;justify-content:center;gap:10px;
          width:100%;padding:13px 20px;
          background:#fff;color:#1f2937;
          border:none;border-radius:12px;
          font-size:.95rem;font-weight:600;cursor:pointer;
          box-shadow:0 2px 12px rgba(0,0,0,.25);
          transition:opacity .2s;
        " onmouseover="this.style.opacity='.9'" onmouseout="this.style.opacity='1'">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div style="color:#475569;font-size:.72rem;margin-top:16px">
          Your name from Google will be shown to other participants
        </div>
      </div>
    `;
  }

  function _showLinkError(msg) {
    let overlay = _el('lcGuestOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lcGuestOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="text-align:center;color:#fff;padding:40px">
        <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
        <div style="font-size:1.1rem;color:#cbd5e1">${_esc(msg)}</div>
      </div>`;
  }

  // Called when guest clicks "Continue with Google"
  async function _guestGoogleSignIn(roomId) {
    const btn = _el('lcGuestGoogleBtn');
    const status = _el('lcGuestStatus');
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
    if (status) status.textContent = 'Signing in…';

    try {
      // Check if already signed in
      let user = fbAuth.currentUser;
      if (!user) {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        const result = await fbAuth.signInWithPopup(provider);
        user = result.user;
      }

      const name = user.displayName || user.email?.split('@')[0] || 'Guest';
      if (status) status.textContent = `Welcome, ${name}! Joining session…`;

      // Remove overlay and enter room
      setTimeout(() => {
        const ov = _el('lcGuestOverlay');
        if (ov) ov.remove();
        _enterRoom(roomId, name, 'participant', null);
      }, 600);

    } catch (e) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      if (status) status.textContent = 'Sign-in failed. Please try again.';
      if (e.code !== 'auth/popup-closed-by-user') {
        console.error('[LC Guest]', e);
      }
    }
  }

  // ── Render Lobby ──────────────────────────────────────────────────────────
  function _renderLobby() {
    const wrap = _el('lcWrap');
    if (!wrap) return;
    wrap.style.overflowY = 'auto';

    wrap.innerHTML = `
<div class="lc-lobby-wrap">

  <!-- ── Header Card ── -->
  <div class="lc-header-card">
    <div class="lc-header-left">
      <div class="lc-lobby-title">📡 Sessions</div>
      <div class="lc-lobby-sub">Create or join video sessions, meetings, classes, and more</div>
    </div>
    <div class="lc-header-actions">
      <button class="lc-btn lc-btn-lime" onclick="LC.openCreateModal()">
        ＋ New Session
      </button>
    </div>
  </div>

  <!-- ── Join by Code Card ── -->
  <div class="lc-join-card">
    <span class="lc-join-card-label">🔗 Join a Session</span>
    <div class="lc-join-bar">
      <input id="lcJoinCode" placeholder="Enter room code…" class="lc-input" maxlength="16"
        onkeydown="if(event.key==='Enter')LC.joinByCode()">
      <button class="lc-btn lc-btn-primary" onclick="LC.joinByCode()">Join →</button>
    </div>
  </div>

  <!-- ── Your Sessions ── -->
  <div class="lc-section-label">Your Sessions</div>
  <div id="lcRoomsList" class="lc-rooms-grid">
    <div class="lc-empty-state">
      <div style="font-size:2.8rem;opacity:.15">📡</div>
      <div style="font-weight:700;color:var(--ink3)">No sessions yet</div>
      <div>Click <strong>＋ New Session</strong> to create your first one</div>
    </div>
  </div>

</div>
<div id="lcToast" class="lc-toast" style="display:none"></div>`;

    _ensureModalsPortal();
    _subscribeRooms();
    _prefillName();
  }

  // ── Modal Portal ──────────────────────────────────────────────────────────
  function _ensureModalsPortal() {
    const portal = document.getElementById('lcModalPortal');
    if (!portal) return;
    if (portal.querySelector('#lcCreateModal')) return;
    portal.innerHTML = `
<!-- Create Modal -->
<div id="lcCreateModal" class="lc-modal-ovl" style="display:none">
  <div class="lc-modal-box">
    <div class="lc-modal-head">
      <div class="lc-modal-title">📡 New Session</div>
      <button class="lc-modal-close" onclick="LC.closeCreateModal()">✕</button>
    </div>
    <div class="lc-modal-body">
      <div class="lc-field">
        <label class="lc-label">Session Title <span style="color:#e53e3e">*</span></label>
        <input id="lcCreateTitle" class="lc-input" placeholder="e.g. Physics Lecture, Team Standup, Office Hours…" maxlength="80">
      </div>
      <div class="lc-field">
        <label class="lc-label">Description (optional)</label>
        <textarea id="lcCreateDesc" class="lc-input lc-textarea" placeholder="What is this session about?" maxlength="240"></textarea>
      </div>
      <div class="lc-field">
        <label class="lc-label">Your Display Name <span style="color:#e53e3e">*</span></label>
        <input id="lcCreateName" class="lc-input" placeholder="Your name" maxlength="40">
      </div>
    </div>
    <div class="lc-modal-foot">
      <button class="lc-btn lc-btn-ghost" onclick="LC.closeCreateModal()">Cancel</button>
      <button class="lc-btn lc-btn-primary" onclick="LC.createRoom()">🚀 Create &amp; Join</button>
    </div>
  </div>
</div>

<!-- Join Modal (for room-code join within the app) -->
<div id="lcJoinModal" class="lc-modal-ovl" style="display:none">
  <div class="lc-modal-box">
    <div class="lc-modal-head">
      <div class="lc-modal-title">🔗 Join Session</div>
      <button class="lc-modal-close" onclick="LC.closeJoinModal()">✕</button>
    </div>
    <div class="lc-modal-body">
      <div id="lcJoinRoomInfo" class="lc-join-info"></div>
      <div class="lc-field">
        <label class="lc-label">Your Display Name <span style="color:#e53e3e">*</span></label>
        <input id="lcJoinName" class="lc-input" placeholder="Your name" maxlength="40">
      </div>
    </div>
    <div class="lc-modal-foot">
      <button class="lc-btn lc-btn-ghost" onclick="LC.closeJoinModal()">Cancel</button>
      <button id="lcJoinBtn" class="lc-btn lc-btn-primary" onclick="LC.doJoin()">📡 Join Session</button>
    </div>
  </div>
</div>

<!-- Share Link Modal -->
<div id="lcShareModal" class="lc-modal-ovl" style="display:none">
  <div class="lc-modal-box" style="max-width:480px">
    <div class="lc-modal-head">
      <div class="lc-modal-title">🔗 Share Session Link</div>
      <button class="lc-modal-close" onclick="LC.closeShareModal()">✕</button>
    </div>
    <div class="lc-modal-body">
      <div style="color:var(--mist);font-size:.8rem;margin-bottom:10px">
        Share this link — participants can join directly using their Google account.
        They don't need to sign up for anything.
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="lcShareLinkInput" class="lc-input" readonly
          style="font-size:.78rem;font-family:monospace;flex:1;background:rgba(255,255,255,.04)">
        <button class="lc-btn lc-btn-primary lc-btn-sm" onclick="LC.copyShareLink()">📋 Copy</button>
      </div>
      <div style="margin-top:14px;color:var(--mist);font-size:.75rem">
        Or share room code: <strong id="lcShareCode" style="color:var(--lime)"></strong>
      </div>
    </div>
    <div class="lc-modal-foot">
      <button class="lc-btn lc-btn-ghost" onclick="LC.closeShareModal()">Close</button>
    </div>
  </div>
</div>`;
  }

  function _prefillName() {
    const user = fbAuth.currentUser;
    if (user) {
      const name = user.displayName || user.email?.split('@')[0] || '';
      const ci = _el('lcCreateName');
      const ji = _el('lcJoinName');
      if (ci && !ci.value) ci.value = name;
      if (ji && !ji.value) ji.value = name;
    }
  }

  function _subscribeRooms() {
    if (_state.roomsUnsubscribe) _state.roomsUnsubscribe();
    const user = fbAuth.currentUser;
    if (!user) return;

    _state.roomsUnsubscribe = _roomsRef()
      .where('hostUid', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(snap => {
        _state.rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _renderRoomsList();
      }, () => {});
  }

  function _renderRoomsList() {
    const el = _el('lcRoomsList');
    if (!el) return;
    if (!_state.rooms.length) {
      el.innerHTML = `<div class="lc-empty-state">
        <div style="font-size:2.5rem;opacity:.18">📡</div>
        <div>No sessions yet. Create one to get started!</div>
      </div>`;
      return;
    }
    el.innerHTML = _state.rooms.map(r => `
<div class="lc-room-card">
  <div class="lc-room-card-top">
    <div class="lc-room-status ${r.status === 'live' ? 'live' : 'ended'}">
      ${r.status === 'live' ? '🔴 Live' : '⚫ Ended'}
    </div>
    <div class="lc-room-code" title="Room Code">${r.id}</div>
  </div>
  <div class="lc-room-title">${_esc(r.title)}</div>
  ${r.description ? `<div class="lc-room-desc">${_esc(r.description)}</div>` : ''}
  <div class="lc-room-meta">
    <span>👤 ${_esc(r.hostName)}</span>
    <span>🕐 ${_fmt(r.createdAt)}</span>
    ${r.participantCount ? `<span>👥 ${r.participantCount}</span>` : ''}
  </div>
  <div class="lc-room-actions">
    ${r.status === 'live' ? `<button class="lc-btn lc-btn-primary lc-btn-sm" onclick="LC.rejoinRoom('${r.id}')">🎥 Rejoin</button>` : ''}
    <button class="lc-btn lc-btn-outline lc-btn-sm" onclick="LC.openShareModal('${r.id}')">🔗 Share Link</button>
    <button class="lc-btn lc-btn-outline lc-btn-sm" onclick="LC.copyCode('${r.id}')">📋 Code</button>
    ${r.status === 'live' ? `<button class="lc-btn lc-btn-danger lc-btn-sm" onclick="LC.endRoom('${r.id}')">🛑 End</button>` : ''}
    <button class="lc-btn lc-btn-ghost lc-btn-sm" onclick="LC.deleteRoom('${r.id}')">🗑️</button>
  </div>
</div>`).join('');
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Share Link Modal ──────────────────────────────────────────────────────
  function openShareModal(roomId) {
    _ensureModalsPortal();
    const modal = _el('lcShareModal');
    const input = _el('lcShareLinkInput');
    const codeEl = _el('lcShareCode');
    if (!modal) return;
    if (input) input.value = _joinLink(roomId);
    if (codeEl) codeEl.textContent = roomId;
    modal.style.display = 'flex';
  }
  function closeShareModal() {
    const m = _el('lcShareModal');
    if (m) m.style.display = 'none';
  }
  function copyShareLink() {
    const input = _el('lcShareLinkInput');
    if (!input) return;
    navigator.clipboard.writeText(input.value)
      .then(() => lcShowToast('Link copied! Share it with participants.', 'ok'))
      .catch(() => { input.select(); document.execCommand('copy'); lcShowToast('Link copied!', 'ok'); });
  }

  // ── Create Room ───────────────────────────────────────────────────────────
  async function createRoom() {
    const title = (_el('lcCreateTitle')?.value || '').trim();
    const desc = (_el('lcCreateDesc')?.value || '').trim();
    const name = (_el('lcCreateName')?.value || '').trim();
    if (!title) { lcShowToast('Please enter a session title', 'err'); return; }
    if (!name) { lcShowToast('Please enter your name', 'err'); return; }

    const user = fbAuth.currentUser;
    if (!user) { lcShowToast('Please log in first', 'err'); return; }

    const createBtn = _el('lcCreateModal')?.querySelector('.lc-btn-primary');
    if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating…'; }

    try {
      const roomId = _uid().toUpperCase().slice(0, 6);
      await _roomRef(roomId).set({
        title, description: desc, hostUid: user.uid, hostName: name,
        status: 'live', createdAt: _ts(), participantCount: 1
      });
      closeCreateModal();

      // Auto-show share link after creation
      setTimeout(() => openShareModal(roomId), 300);

      _enterRoom(roomId, name, 'host', { title, description: desc });
    } catch (e) {
      lcShowToast('Failed to create session: ' + e.message, 'err');
      if (createBtn) { createBtn.disabled = false; createBtn.textContent = '🚀 Create & Join'; }
    }
  }

  // ── Join by Code (within-app flow) ────────────────────────────────────────
  async function joinByCode() {
    const code = (_el('lcJoinCode')?.value || '').trim().toUpperCase();
    if (!code) { lcShowToast('Enter a room code', 'err'); return; }

    try {
      const snap = await _roomRef(code).get();
      if (!snap.exists) { lcShowToast('Room not found. Check the code.', 'err'); return; }
      const data = snap.data();
      if (data.status !== 'live') { lcShowToast('This session has ended.', 'err'); return; }

      _el('lcJoinModal').style.display = 'flex';
      _el('lcJoinModal')._roomId = code;
      _el('lcJoinModal')._roomData = data;
      _el('lcJoinRoomInfo').innerHTML = `
        <div class="lc-join-room-preview">
          <div class="lc-join-room-title">${_esc(data.title)}</div>
          ${data.description ? `<div class="lc-join-room-desc">${_esc(data.description)}</div>` : ''}
          <div class="lc-join-room-host">🎙️ Host: ${_esc(data.hostName)}</div>
        </div>`;
      _prefillName();
      _el('lcJoinName')?.focus();
    } catch (e) {
      lcShowToast('Error: ' + e.message, 'err');
    }
  }

  async function doJoin() {
    const modal = _el('lcJoinModal');
    const roomId = modal._roomId;
    const roomData = modal._roomData;
    const name = (_el('lcJoinName')?.value || '').trim();
    if (!name) { lcShowToast('Enter your name', 'err'); return; }
    closeJoinModal();
    _enterRoom(roomId, name, 'participant', roomData);
  }

  async function rejoinRoom(roomId) {
    try {
      const snap = await _roomRef(roomId).get();
      if (!snap.exists || snap.data().status !== 'live') {
        lcShowToast('Session has ended.', 'err'); return;
      }
      const user = fbAuth.currentUser;
      const name = user?.displayName || user?.email?.split('@')[0] || 'Me';
      _enterRoom(roomId, name, 'host', snap.data());
    } catch (e) {
      lcShowToast('Error: ' + e.message, 'err');
    }
  }

  // ── Enter Room ────────────────────────────────────────────────────────────
  function _enterRoom(roomId, name, role, roomData) {
    _state.roomId = roomId;
    _state.myName = name;
    _state.myRole = role;
    _state.myRoom = roomData;
    _state.peers = {};
    _state.chatMessages = [];
    _state.micOn = true;
    _state.camOn = true;
    _state.isScreenSharing = false;
    _state.chatOpen = false;
    _state.unreadChat = 0;
    _state.handRaised = false;

    _renderRoom();
    _loadPeerJS(() => _startMedia());
  }

  function _renderRoom() {
    const wrap = _el('lcWrap');
    if (!wrap) return;
    wrap.style.overflowY = 'hidden';
    const r = _state.myRoom || {};
    wrap.innerHTML = `
<div class="lc-room" id="lcRoom">
  <!-- Top Bar -->
  <div class="lc-room-bar">
    <div class="lc-room-bar-left">
      <button class="lc-bar-btn" onclick="LC.leaveRoom()" title="Leave">← Back</button>
      <div class="lc-room-bar-title">
        <span class="lc-live-dot"></span>
        <span>${_esc(r.title || 'Live Session')}</span>
      </div>
      <div class="lc-room-bar-code">Code: <strong>${_state.roomId}</strong></div>
    </div>
    <div class="lc-room-bar-right">
      <span id="lcParticipantCount" class="lc-participant-count">👥 1</span>
      <button class="lc-bar-btn" onclick="LC.openShareModal('${_state.roomId}')" title="Share join link">🔗 Invite</button>
      <button class="lc-bar-btn" onclick="LC.copyCode('${_state.roomId}')" title="Copy room code">📋 Code</button>
      ${_state.myRole === 'host' ? `<button class="lc-bar-btn lc-bar-btn-danger" onclick="LC.endRoom('${_state.roomId}')">🛑 End</button>` : ''}
    </div>
  </div>

  <!-- Video Grid -->
  <div class="lc-video-area" id="lcVideoArea"></div>

  <!-- Chat Panel -->
  <div class="lc-chat-panel" id="lcChatPanel" style="display:none">
    <div class="lc-chat-head">
      <span>💬 Chat</span>
      <button onclick="LC.toggleChat()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--mist)">✕</button>
    </div>
    <div class="lc-chat-messages" id="lcChatMessages"></div>
    <div class="lc-chat-input-row">
      <input id="lcChatInput" class="lc-chat-input" placeholder="Type a message…" maxlength="300"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();LC.sendChat();}">
      <button class="lc-btn lc-btn-primary lc-btn-sm" onclick="LC.sendChat()">↑</button>
    </div>
  </div>

  <!-- Controls -->
  <div class="lc-controls">
    <button id="lcMicBtn" class="lc-ctrl-btn lc-ctrl-active" onclick="LC.toggleMic()" title="Toggle Mic">
      🎙️ <span id="lcMicLabel">Mute</span>
    </button>
    <button id="lcCamBtn" class="lc-ctrl-btn lc-ctrl-active" onclick="LC.toggleCam()" title="Toggle Camera">
      📷 <span id="lcCamLabel">Stop Cam</span>
    </button>
    <button id="lcScreenBtn" class="lc-ctrl-btn" onclick="LC.toggleScreen()" title="Share Screen">
      🖥️ <span>Share Screen</span>
    </button>
    <button id="lcHandBtn" class="lc-ctrl-btn" onclick="LC.toggleHand()" title="Raise Hand">
      ✋ <span id="lcHandLabel">Raise Hand</span>
    </button>
    <button id="lcChatBtn" class="lc-ctrl-btn" onclick="LC.toggleChat()" title="Chat">
      💬 <span>Chat</span><span id="lcChatBadge" class="lc-chat-badge" style="display:none">0</span>
    </button>
    <button class="lc-ctrl-btn lc-ctrl-leave" onclick="LC.leaveRoom()" title="Leave">
      🚪 Leave
    </button>
  </div>
</div>
<div id="lcToast" class="lc-toast" style="display:none"></div>`;
  }

  // ── Media ─────────────────────────────────────────────────────────────────
  async function _startMedia() {
    try {
      _state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      try {
        _state.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        lcShowToast('Camera not available — audio only', 'warn');
      } catch (e2) {
        lcShowToast('Could not access microphone/camera: ' + e2.message, 'err');
        _state.localStream = null;
      }
    }
    _addLocalTile();
    _initPeer();
    _subscribeRoom();
    _subscribeChat();
  }

  function _addLocalTile() {
    const area = _el('lcVideoArea');
    if (!area) return;
    const tile = document.createElement('div');
    tile.className = 'lc-video-tile lc-video-local';
    tile.id = 'lcLocalTile';
    tile.innerHTML = `
      <video id="lcLocalVideo" autoplay muted playsinline></video>
      <div class="lc-tile-label">
        <span class="lc-tile-name">${_esc(_state.myName)} (You)</span>
        <span class="lc-tile-role">${_state.myRole === 'host' ? '🎙️ Host' : ''}</span>
      </div>
      <div id="lcLocalOverlay" class="lc-cam-off-overlay" style="display:none">📷<br><span style="font-size:.65rem">Cam Off</span></div>`;
    area.appendChild(tile);
    if (_state.localStream) {
      _el('lcLocalVideo').srcObject = _state.localStream;
    }
    _updateTileLayout();
  }

  // ── PeerJS ────────────────────────────────────────────────────────────────
  function _initPeer() {
    _state.myPeerId = 'lc_' + _state.roomId + '_' + _uid();
    _state.peer = new window.Peer(_state.myPeerId, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
    });

    _state.peer.on('open', id => {
      _peersRef(_state.roomId).doc(id).set({
        name: _state.myName, role: _state.myRole,
        joinedAt: _ts(), active: true
      });
      _state.peer.on('call', call => _handleIncomingCall(call));
    });

    _state.peer.on('error', e => { console.warn('[LC Peer]', e); });
  }

  function _handleIncomingCall(call) {
    call.answer(_state.localStream);
    call.on('stream', remoteStream => {
      const peerId = call.peer;
      if (!_state.peers[peerId]) _state.peers[peerId] = {};
      _state.peers[peerId].stream = remoteStream;
      _addOrUpdatePeerTile(peerId, remoteStream, _state.peers[peerId].name || _nameFromPeerId(peerId));
      _updateParticipantCount();
    });
    call.on('close', () => _removePeerTile(call.peer));
    call.on('error', () => _removePeerTile(call.peer));
  }

  function _nameFromPeerId(id) { return _state.peers[id]?.name || 'Participant'; }

  function _subscribeRoom() {
    if (_state.peersUnsubscribe) _state.peersUnsubscribe();
    _state.peersUnsubscribe = _peersRef(_state.roomId)
      .where('active', '==', true)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          const id = change.doc.id;
          const data = change.doc.data();
          if (id === _state.myPeerId) return;
          if (change.type === 'added') {
            if (!_state.peers[id]) {
              _state.peers[id] = { name: data.name, role: data.role };
              _callPeer(id, data.name);
            }
          }
          if (change.type === 'modified') {
            if (!data.active && _state.peers[id]) { _removePeerTile(id); delete _state.peers[id]; }
            if (_state.peers[id]) {
              _state.peers[id].name = data.name;
              const nameEl = _el('lc_name_' + id.replace(/[^a-z0-9]/gi, '_'));
              if (nameEl) nameEl.textContent = data.name;
              const handEl = _el('lc_hand_' + id.replace(/[^a-z0-9]/gi, '_'));
              if (handEl) handEl.style.display = data.handRaised ? 'block' : 'none';
            }
          }
          if (change.type === 'removed') { _removePeerTile(id); delete _state.peers[id]; }
        });
        _updateParticipantCount();
      }, () => {});
  }

  function _callPeer(peerId, peerName) {
    if (!_state.peer || !_state.localStream) return;
    const call = _state.peer.call(peerId, _state.localStream);
    if (!call) return;
    call.on('stream', remoteStream => {
      if (!_state.peers[peerId]) _state.peers[peerId] = {};
      _state.peers[peerId].stream = remoteStream;
      _addOrUpdatePeerTile(peerId, remoteStream, peerName || _nameFromPeerId(peerId));
      _updateParticipantCount();
    });
    call.on('close', () => _removePeerTile(peerId));
    call.on('error', () => _removePeerTile(peerId));
  }

  // ── Video Tiles ───────────────────────────────────────────────────────────
  function _safeId(peerId) { return peerId.replace(/[^a-z0-9]/gi, '_'); }

  function _addOrUpdatePeerTile(peerId, stream, name) {
    const area = _el('lcVideoArea');
    if (!area) return;
    const sid = _safeId(peerId);
    let tile = _el('lc_tile_' + sid);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'lc-video-tile';
      tile.id = 'lc_tile_' + sid;
      tile.innerHTML = `
        <video id="lc_vid_${sid}" autoplay playsinline></video>
        <div class="lc-tile-label">
          <span class="lc-tile-name" id="lc_name_${sid}">${_esc(name)}</span>
          <span id="lc_hand_${sid}" class="lc-hand-indicator" style="display:none">✋</span>
        </div>
        <div id="lc_camoff_${sid}" class="lc-cam-off-overlay" style="display:none">📷<br><span style="font-size:.65rem">Cam Off</span></div>`;
      area.appendChild(tile);
    }
    const vid = _el('lc_vid_' + sid);
    if (vid && stream) vid.srcObject = stream;
    _updateTileLayout();
  }

  function _removePeerTile(peerId) {
    _el('lc_tile_' + _safeId(peerId))?.remove();
    _updateTileLayout();
  }

  function _updateTileLayout() {
    const area = _el('lcVideoArea');
    if (!area) return;
    const count = area.querySelectorAll('.lc-video-tile').length;
    let cols = 1;
    if (count >= 2) cols = 2;
    if (count >= 5) cols = 3;
    if (count >= 10) cols = 4;
    area.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }

  function _updateParticipantCount() {
    const area = _el('lcVideoArea');
    if (!area) return;
    const count = area.querySelectorAll('.lc-video-tile').length;
    const el = _el('lcParticipantCount');
    if (el) el.textContent = '👥 ' + count;
    if (_state.myRole === 'host') {
      _roomRef(_state.roomId).update({ participantCount: count }).catch(() => {});
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function toggleMic() {
    _state.micOn = !_state.micOn;
    if (_state.localStream) _state.localStream.getAudioTracks().forEach(t => t.enabled = _state.micOn);
    const btn = _el('lcMicBtn'); const lbl = _el('lcMicLabel');
    if (btn) btn.className = 'lc-ctrl-btn' + (_state.micOn ? ' lc-ctrl-active' : ' lc-ctrl-off');
    if (lbl) lbl.textContent = _state.micOn ? 'Mute' : 'Unmute';
  }

  function toggleCam() {
    _state.camOn = !_state.camOn;
    if (_state.localStream) _state.localStream.getVideoTracks().forEach(t => t.enabled = _state.camOn);
    const btn = _el('lcCamBtn'); const lbl = _el('lcCamLabel'); const overlay = _el('lcLocalOverlay');
    if (btn) btn.className = 'lc-ctrl-btn' + (_state.camOn ? ' lc-ctrl-active' : ' lc-ctrl-off');
    if (lbl) lbl.textContent = _state.camOn ? 'Stop Cam' : 'Start Cam';
    if (overlay) overlay.style.display = _state.camOn ? 'none' : 'flex';
  }

  async function toggleScreen() {
    if (_state.isScreenSharing) { _stopScreenShare(); return; }
    try {
      _state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      _state.isScreenSharing = true;
      const screenTrack = _state.screenStream.getVideoTracks()[0];
      const localVid = _el('lcLocalVideo');
      if (localVid) localVid.srcObject = _state.screenStream;
      _state.peer?.connections && Object.values(_state.peer.connections).forEach(conns => {
        conns.forEach(conn => {
          if (conn.peerConnection) {
            const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack).catch(() => {});
          }
        });
      });
      const btn = _el('lcScreenBtn');
      if (btn) { btn.className = 'lc-ctrl-btn lc-ctrl-active'; btn.innerHTML = '🖥️ <span>Stop Share</span>'; }
      _state.screenStream.getVideoTracks()[0].onended = () => _stopScreenShare();
      lcShowToast('Screen sharing started', 'ok');
    } catch (e) { lcShowToast('Screen share cancelled or unavailable.', 'warn'); }
  }

  function _stopScreenShare() {
    _state.isScreenSharing = false;
    if (_state.screenStream) { _state.screenStream.getTracks().forEach(t => t.stop()); _state.screenStream = null; }
    const camTrack = _state.localStream?.getVideoTracks()[0];
    const localVid = _el('lcLocalVideo');
    if (localVid && _state.localStream) localVid.srcObject = _state.localStream;
    if (camTrack) {
      _state.peer?.connections && Object.values(_state.peer.connections).forEach(conns => {
        conns.forEach(conn => {
          if (conn.peerConnection) {
            const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(camTrack).catch(() => {});
          }
        });
      });
    }
    const btn = _el('lcScreenBtn');
    if (btn) { btn.className = 'lc-ctrl-btn'; btn.innerHTML = '🖥️ <span>Share Screen</span>'; }
    lcShowToast('Screen sharing stopped', 'ok');
  }

  function toggleHand() {
    _state.handRaised = !_state.handRaised;
    const btn = _el('lcHandBtn'); const lbl = _el('lcHandLabel');
    if (btn) btn.className = 'lc-ctrl-btn' + (_state.handRaised ? ' lc-ctrl-hand' : '');
    if (lbl) lbl.textContent = _state.handRaised ? 'Lower Hand' : 'Raise Hand';
    if (_state.myPeerId) {
      _peersRef(_state.roomId).doc(_state.myPeerId).update({ handRaised: _state.handRaised }).catch(() => {});
    }
    if (_state.handRaised) lcShowToast('✋ Hand raised — host can see this', 'ok');
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  function _subscribeChat() {
    if (_state.chatUnsubscribe) _state.chatUnsubscribe();
    _state.chatUnsubscribe = _chatRef(_state.roomId)
      .orderBy('ts').limit(100)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            _state.chatMessages.push(d);
            _appendChatMessage(d);
            if (!_state.chatOpen) {
              _state.unreadChat++;
              const badge = _el('lcChatBadge');
              if (badge) { badge.textContent = _state.unreadChat; badge.style.display = 'inline-block'; }
            }
          }
        });
      }, () => {});
  }

  function _appendChatMessage(d) {
    const el = _el('lcChatMessages');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'lc-chat-msg' + (d.name === _state.myName ? ' lc-chat-mine' : '');
    div.innerHTML = `<span class="lc-chat-sender">${_esc(d.name)}</span> <span class="lc-chat-time">${_fmt(d.ts)}</span><div class="lc-chat-text">${_esc(d.text)}</div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  async function sendChat() {
    const input = _el('lcChatInput');
    const text = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    try { await _chatRef(_state.roomId).add({ name: _state.myName, text, ts: _ts() }); }
    catch (e) { lcShowToast('Could not send message', 'err'); }
  }

  function toggleChat() {
    _state.chatOpen = !_state.chatOpen;
    const panel = _el('lcChatPanel');
    if (panel) panel.style.display = _state.chatOpen ? 'flex' : 'none';
    if (_state.chatOpen) {
      _state.unreadChat = 0;
      const badge = _el('lcChatBadge');
      if (badge) badge.style.display = 'none';
      const msgs = _el('lcChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      _el('lcChatInput')?.focus();
    }
    const btn = _el('lcChatBtn');
    if (btn) btn.className = 'lc-ctrl-btn' + (_state.chatOpen ? ' lc-ctrl-active' : '');
  }

  // ── Leave / End ───────────────────────────────────────────────────────────
  async function leaveRoom() { _cleanup(); openView(); }

  async function endRoom(roomId) {
    if (!confirm('End this session for everyone?')) return;
    try {
      await _roomRef(roomId).update({ status: 'ended' });
      lcShowToast('Session ended', 'ok');
      if (_state.roomId === roomId) { _cleanup(); openView(); }
    } catch (e) { lcShowToast('Error ending session', 'err'); }
  }

  function _cleanup() {
    if (_state.localStream) { _state.localStream.getTracks().forEach(t => t.stop()); _state.localStream = null; }
    if (_state.screenStream) { _state.screenStream.getTracks().forEach(t => t.stop()); _state.screenStream = null; }
    if (_state.myPeerId) {
      _peersRef(_state.roomId).doc(_state.myPeerId).update({ active: false }).catch(() => {});
    }
    if (_state.peer) { try { _state.peer.destroy(); } catch (e) {} _state.peer = null; }
    if (_state.roomsUnsubscribe) { _state.roomsUnsubscribe(); _state.roomsUnsubscribe = null; }
    if (_state.peersUnsubscribe) { _state.peersUnsubscribe(); _state.peersUnsubscribe = null; }
    if (_state.chatUnsubscribe) { _state.chatUnsubscribe(); _state.chatUnsubscribe = null; }
    _state.roomId = null; _state.myPeerId = null; _state.peers = {};
    _state.isScreenSharing = false;
  }

  // ── Utility Actions ───────────────────────────────────────────────────────
  function copyCode(code) {
    navigator.clipboard.writeText(code)
      .then(() => lcShowToast('Room code copied: ' + code, 'ok'))
      .catch(() => { prompt('Copy this room code:', code); });
  }

  async function deleteRoom(roomId) {
    if (!confirm('Delete this session record?')) return;
    try { await _roomRef(roomId).delete(); lcShowToast('Deleted', 'ok'); }
    catch (e) { lcShowToast('Error: ' + e.message, 'err'); }
  }

  // ── Modal Helpers ─────────────────────────────────────────────────────────
  function openCreateModal() {
    _ensureModalsPortal();
    _el('lcCreateModal').style.display = 'flex';
    _prefillName();
    _el('lcCreateTitle')?.focus();
  }
  function closeCreateModal() { if (_el('lcCreateModal')) _el('lcCreateModal').style.display = 'none'; }
  function closeJoinModal() { if (_el('lcJoinModal')) _el('lcJoinModal').style.display = 'none'; }

  // ── Public API ────────────────────────────────────────────────────────────
  async function openView() {
    _state.view = 'lobby';
    // Check if arriving via magic join link first
    const wasLink = await _checkJoinLink();
    if (!wasLink) _renderLobby();
  }

  return {
    openView,
    openCreateModal, closeCreateModal,
    closeJoinModal, joinByCode, doJoin,
    createRoom, rejoinRoom, endRoom, leaveRoom,
    deleteRoom, copyCode,
    toggleMic, toggleCam, toggleScreen,
    toggleHand, toggleChat, sendChat,
    openShareModal, closeShareModal, copyShareLink,
    // exposed so onclick can reach it
    _guestGoogleSignIn,
  };
})();
