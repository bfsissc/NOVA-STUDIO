// ==================== DASHBOARD CORE ====================
let U=null, editSkills=[];
// SK / SS kept for legacy reference but Firestore is the source of truth now
const SK='nova_users', SS='nova_sess';

// ── Firebase Auth state listener — replaces window.onload session restore ──
window.onload = () => {
  updateGreeting();
  fbAuth.onAuthStateChanged(async function(firebaseUser) {
    if (firebaseUser) {
      // Signed in — load profile from Firestore
      try {
        const doc = await fbDb.collection('users').doc(firebaseUser.email).get();
        if (doc.exists) {
          U = doc.data();
        } else {
          // First time Google login — build profile
          U = {
            firstName: firebaseUser.displayName ? firebaseUser.displayName.split(' ')[0] : 'User',
            lastName:  firebaseUser.displayName ? firebaseUser.displayName.split(' ').slice(1).join(' ') : '',
            email:     firebaseUser.email,
            avatar:    firebaseUser.photoURL || null,
            cover:     null, role:'', company:'', dept:'', phone:'',
            location:'', website:'', bio:'',
            skills:[], memberSince: new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),
            stats:{certs:0,ppts:0,photos:0,exports:0},
            googleAccount: true
          };
          await fbDb.collection('users').doc(U.email).set(U);
        }
        // Keep a lightweight local session cache for fast reloads
        try { localStorage.setItem(SS, JSON.stringify(U)); } catch(e) {}
        if (!document.getElementById('app').classList.contains('visible')) {
          boot(false);
        }
      } catch(err) {
        console.error('Firestore load error:', err);
        // Fallback to localStorage cache if offline
        const cached = localStorage.getItem(SS);
        if (cached) { try { U = JSON.parse(cached); boot(false); } catch(e){} }
        else updateGreeting();
      }
    } else {
      // Not signed in — try localStorage cache for email/pass users
      const s = localStorage.getItem(SS);
      if (s) { try { U = JSON.parse(s); if (U && U.email) { boot(false); return; } } catch(e){} }
      updateGreeting();
    }
  });
};

function boot(anim){
  updateGreeting(); renderAvatars(); renderProfile(); updateStats(); updateGmailTracker();
  document.getElementById('loginScreen').classList.add('out');
  document.getElementById('app').classList.add('visible');
  if(anim) showToast('Welcome, '+U.firstName+'! 👋','ok');
  // Update Cert Mailer sender display
  setTimeout(function() {
    var nameEl  = document.getElementById('mlSenderName');
    var emailEl = document.getElementById('mlSenderEmail');
    if (nameEl && U)  nameEl.textContent  = (U.firstName || '') + (U.lastName ? ' ' + U.lastName : '');
    if (emailEl && U) emailEl.textContent = U.email || 'Not logged in';
  }, 300);
}

function toggleForm(t){
  document.getElementById('signinForm').style.display=t==='signin'?'flex':'none';
  document.getElementById('signupForm').style.display=t==='signup'?'flex':'none';
}

// ══════════════════════════════════════════════════════
// ██ GOOGLE LOGIN — Firebase signInWithPopup (no Gmail scope)
// ══════════════════════════════════════════════════════
// Uses Firebase Google Auth — only requests basic profile/email.
// No Gmail API scope = no Google verification required.
// ══════════════════════════════════════════════════════

var NOVA_GMAIL_TOKEN  = null;  // kept for legacy references (unused)
var NOVA_TOKEN_CLIENT = null;  // kept for legacy references (unused)

// ── Trigger Google login via Firebase popup ──
function triggerGoogleLogin() {
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  fbAuth.signInWithPopup(provider)
    .then(function(result) {
      var firebaseUser = result.user;
      var firstName = firebaseUser.displayName ? firebaseUser.displayName.split(' ')[0] : 'User';
      var lastName  = firebaseUser.displayName ? firebaseUser.displayName.split(' ').slice(1).join(' ') : '';
      var email     = firebaseUser.email;
      var picture   = firebaseUser.photoURL || null;

      var userRef = fbDb.collection('users').doc(email);
      userRef.get().then(function(doc) {
        var userData;
        if (!doc.exists) {
          userData = {
            firstName: firstName, lastName: lastName, email: email,
            role: '', company: '', dept: '', phone: '',
            location: '', website: '', bio: '',
            skills: [], avatar: picture, cover: null,
            memberSince: new Date().toLocaleDateString('en-GB', {month:'long', year:'numeric'}),
            stats: {certs:0, ppts:0, photos:0, exports:0},
            googleAccount: true
          };
          return userRef.set(userData).then(function(){ return userData; });
        } else {
          userData = doc.data();
          if (picture && !userData.avatar) {
            return userRef.update({ avatar: picture }).then(function(){ userData.avatar = picture; return userData; });
          }
          return Promise.resolve(userData);
        }
      }).then(function(userData) {
        U = userData;
        try { localStorage.setItem(SS, JSON.stringify(U)); } catch(e){}
        showToast('Signed in as ' + firstName + ' via Google 🎉', 'ok');
        setTimeout(function() {
          var nameEl  = document.getElementById('mlSenderName');
          var emailEl = document.getElementById('mlSenderEmail');
          if (nameEl)  nameEl.textContent = firstName + (lastName ? ' ' + lastName : '');
          if (emailEl) emailEl.textContent = email;
        }, 300);
        if (!document.getElementById('app').classList.contains('visible')) {
          boot(true);
        } else {
          renderAvatars(); renderProfile();
        }
      }).catch(function(e) {
        showToast('Could not save profile — ' + e.message, 'err');
      });
    })
    .catch(function(err) {
      var msgs = {
        'auth/popup-closed-by-user':    'Popup was closed — please try again',
        'auth/popup-blocked':           'Popup blocked — allow popups for this site',
        'auth/cancelled-popup-request': 'Sign-in cancelled',
        'auth/unauthorized-domain':     '❌ Domain not authorized — add your Hostinger domain to Firebase Auth → Authorized domains'
      };
      var m = msgs[err.code] || ('Google sign-in error: ' + err.message);
      showToast(m, 'err');
    });
}

// ── Stub kept for compatibility ──
function requestGmailToken(interactive) { /* replaced by EmailJS */ }

// ── Show Client ID setup modal ──
function showClientIdSetup() {
  var existing = NOVA_GOOGLE_CLIENT_ID;
  var html = '<div style="position:fixed;inset:0;z-index:9999;background:rgba(13,15,18,.65);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center" id="gSetupOverlay">' +
    '<div style="background:#fff;border-radius:18px;padding:30px 28px;width:min(480px,92vw);box-shadow:0 28px 80px rgba(0,0,0,.25)">' +
    '<div style="font-size:1.4rem;margin-bottom:6px">🔑 Google Client ID Setup</div>' +
    '<div style="font-size:.78rem;color:#8b94a3;margin-bottom:18px;line-height:1.7">To enable Google login & Gmail sending, you need a Google OAuth Client ID:</div>' +
    '<ol style="font-size:.75rem;color:#2d3340;line-height:2;padding-left:18px;margin-bottom:18px">' +
    '<li>Go to <a href="https://console.cloud.google.com/" target="_blank" style="color:#4285f4;font-weight:700">console.cloud.google.com</a></li>' +
    '<li>APIs & Services → Enable <strong>Gmail API</strong></li>' +
    '<li>Credentials → Create <strong>OAuth 2.0 Client ID</strong> (Web application)</li>' +
    '<li>Add your site URL to <strong>Authorised JavaScript origins</strong></li>' +
    '<li>Paste your Client ID below:</li>' +
    '</ol>' +
    '<input id="gClientIdInput" type="text" value="' + (existing||'') + '" placeholder="123456789-abc....apps.googleusercontent.com" style="width:100%;padding:11px 13px;border:1.5px solid #dadce0;border-radius:9px;font-size:.8rem;color:#0d0f12;outline:none;margin-bottom:14px">' +
    '<div style="display:flex;gap:9px">' +
    '<button onclick="saveClientId()" style="flex:1;padding:11px;border:none;border-radius:8px;background:#0d0f12;color:#fff;font-weight:700;font-size:.86rem;cursor:pointer">Save & Reload</button>' +
    '<button onclick="document.getElementById(\'gSetupOverlay\').remove()" style="padding:11px 18px;border:1.5px solid #e8ecf2;border-radius:8px;background:transparent;color:#8b94a3;font-size:.84rem;cursor:pointer">Cancel</button>' +
    '</div>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var el=document.getElementById('gClientIdInput'); if(el){ el.focus(); el.select(); } }, 100);
}

function saveClientId() {
  var val = (document.getElementById('gClientIdInput').value || '').trim();
  if (!val || !val.includes('.apps.googleusercontent.com')) {
    alert('Please enter a valid Google Client ID (ends with .apps.googleusercontent.com)');
    return;
  }
  NOVA_GOOGLE_CLIENT_ID = val;
  NOVA_TOKEN_CLIENT = null; // reset so it re-initialises with new ID
  showToast('Client ID saved! Reloading…', 'ok');
  setTimeout(function(){ location.reload(); }, 900);
}

// ── Send email via Brevo API (free, supports attachments, no Google verification) ──
async function sendViaGmailAPI(to, toName, from, fromName, subject, htmlBody, certDataUrl, certFileName) {
  if (!BREVO_API_KEY) {
    throw new Error('Brevo API key not configured — go to Settings → Integrations to add your free Brevo key');
  }

  // Use saved verified sender (required by Brevo) — fallback to logged-in user
  var senderEmail = localStorage.getItem('brevo_sender_email') || from;
  var senderName  = localStorage.getItem('brevo_sender_name')  || fromName;

  var payload = {
    sender:  { name: senderName, email: senderEmail },
    to:      [{ email: to, name: toName }],
    subject: subject,
    htmlContent: htmlBody
  };

  // Attach certificate image if provided
  if (certDataUrl && certFileName) {
    var base64Data = certDataUrl.includes(',') ? certDataUrl.split(',')[1] : certDataUrl;
    payload.attachment = [{
      name:    certFileName,
      content: base64Data
    }];
  }

  var resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'accept':       'application/json',
      'api-key':      BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    var err = await resp.json().catch(function(){ return {}; });
    var msg = (err.message) || ('Brevo API error ' + resp.status);
    if (resp.status === 401) throw new Error('Invalid Brevo API key — check Settings → Integrations');
    if (resp.status === 400) throw new Error('Brevo error: ' + msg);
    throw new Error(msg);
  }
  return true;
}

function doLogin(){
  const em=document.getElementById('siEmail').value.trim();
  const pw=document.getElementById('siPass').value;
  if(!em||!pw){showToast('Fill in all fields','err');return;}
  showToast('Signing in…','info');
  fbAuth.signInWithEmailAndPassword(em, pw)
    .then(async function(cred) {
      // onAuthStateChanged will handle boot — just show toast
      showToast('Welcome back! 👋','ok');
    })
    .catch(function(err) {
      const msgs = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Wrong password — try again',
        'auth/invalid-email':  'Invalid email address',
        'auth/too-many-requests': 'Too many attempts — try again later'
      };
      showToast(msgs[err.code] || err.message, 'err');
    });
}

function doSignup(){
  const f=document.getElementById('suFirst').value.trim();
  const l=document.getElementById('suLast').value.trim();
  const em=document.getElementById('suEmail').value.trim();
  const pw=document.getElementById('suPass').value;
  if(!f||!l||!em||!pw){showToast('Fill in all fields','err');return;}
  if(pw.length<6){showToast('Password must be 6+ characters','err');return;}
  showToast('Creating account…','info');
  fbAuth.createUserWithEmailAndPassword(em, pw)
    .then(async function(cred) {
      await cred.user.updateProfile({ displayName: f + ' ' + l });
      const nu = {
        firstName:f, lastName:l, email:em,
        role:'', company:'', dept:'', phone:'', location:'', website:'', bio:'',
        skills:[], avatar:null, cover:null,
        memberSince: new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),
        stats:{certs:0,ppts:0,photos:0,exports:0},
        googleAccount: false
      };
      await fbDb.collection('users').doc(em).set(nu);
      // onAuthStateChanged will fire and call boot
    })
    .catch(function(err) {
      const msgs = {
        'auth/email-already-in-use': 'Email already registered — try signing in',
        'auth/invalid-email':        'Invalid email address',
        'auth/weak-password':        'Password is too weak (min 6 characters)'
      };
      showToast(msgs[err.code] || err.message, 'err');
    });
}

function demoLogin(){
  U={firstName:'Alex',lastName:'Johnson',email:'demo@nova.studio',role:'Designer',company:'NOVA Studio',dept:'Creative',phone:'+1 555 0100',location:'New York, USA',website:'https://nova.studio',bio:'Exploring NOVA Studio — the all-in-one creative workspace for certificates, presentations and photo editing.',skills:['Design','Certificates','Presentations','Photo Editing'],avatar:null,cover:null,memberSince:'January 2025',stats:{certs:12,ppts:7,photos:23,exports:42}};
  try { localStorage.setItem(SS,JSON.stringify(U)); } catch(e){}
  boot(true);
}

function doLogout(){
  fbAuth.signOut().catch(function(){});
  localStorage.removeItem(SS); U=null;
  document.getElementById('loginScreen').classList.remove('out');
  document.getElementById('app').classList.remove('visible');
  showToast('Signed out','ok');
}

const VIEWS=['home','cert','projects','profile','settings','mailer','sync','portal'];
const SBM={home:'sbHome',projects:'sbProj',profile:'sbProfile',cert:'sbCert',settings:'sbSettings',mailer:'sbMailer',sync:'sbSync',portal:'sbPortal'};

function goView(v){
  VIEWS.forEach(id=>{
    const el=document.getElementById('view'+id[0].toUpperCase()+id.slice(1));
    if(el)el.classList.toggle('active',id===v);
  });
  document.querySelectorAll('.sb-i').forEach(e=>e.classList.remove('on'));
  if(SBM[v])document.getElementById(SBM[v])?.classList.add('on');
  if(v==='profile')renderProfile();
  if(v==='cert')certFitZoom();
  if(v==='projects'){projShowBin=false;projRender();}
  if(v==='settings'){stgApplyUI(stgGetSettings());stgUpdateStorageInfo();}
  if(v==='mailer'){setTimeout(mlInitCanvas,80);}
  if(v==='home'){updateGmailTracker();}
  if(v==='sync'){syncOnViewOpen();}
  if(v==='portal'){if(typeof cpInit==='function')cpInit();}

}

const TL={cert:'🎓 Certificate Maker',mailer:'📧 Certificate Mailer'};

function launchTool(tool){
  if(tool==='cert'){
    goView('cert');
    document.querySelectorAll('.sb-i').forEach(e=>e.classList.remove('on'));
    document.getElementById('sbCert')?.classList.add('on');
    if(U){
      U.stats=U.stats||{};
      U.stats.certs=(U.stats.certs||0)+1;
      persist();updateStats();logAct('🎓 Certificate Maker','Opened');
    }
    return;
  }
  if(tool==='mailer'){
    goView('mailer');
    document.querySelectorAll('.sb-i').forEach(e=>e.classList.remove('on'));
    document.getElementById('sbMailer')?.classList.add('on');
    logAct('📧 Certificate Mailer','Opened');
    return;
  }
}

function updateStats(){
  if(!U)return;
  const s=U.stats||{};
  animN('stCerts',s.certs||0);
  animN('stExp',s.exports||0);
}

// ── Gmail Limit Tracker ──
// Daily send count stored in Firestore under users/{email}/meta/gmailTrack
// Falls back to localStorage for demo/offline users.
async function _gmailTrackRef() {
  if (!U || !U.email || U.email === 'demo@nova.studio') return null;
  return fbDb.collection('users').doc(U.email).collection('meta').doc('gmailTrack');
}

async function _getGmailTrack() {
  const today = new Date().toDateString();
  try {
    const ref = await _gmailTrackRef();
    if (!ref) throw new Error('no ref');
    const doc = await ref.get();
    if (doc.exists) {
      const d = doc.data();
      if (d.date !== today) {
        const reset = { date: today, sent: 0 };
        await ref.set(reset);
        return reset;
      }
      return d;
    } else {
      const init = { date: today, sent: 0 };
      await ref.set(init);
      return init;
    }
  } catch(e) {
    // Offline fallback
    const stored = JSON.parse(localStorage.getItem('gmailTrack') || '{"date":"","sent":0}');
    if (stored.date !== today) { stored.date = today; stored.sent = 0; }
    return stored;
  }
}

async function _setGmailTrack(data) {
  try {
    const ref = await _gmailTrackRef();
    if (ref) { await ref.set(data); return; }
  } catch(e) {}
  try { localStorage.setItem('gmailTrack', JSON.stringify(data)); } catch(e){}
}

async function updateGmailTracker() {
  const stored  = await _getGmailTrack();
  const limit   = parseInt(localStorage.getItem('gmailDailyLimit') || '500', 10);
  const sent    = stored.sent || 0;
  const remaining = Math.max(0, limit - sent);
  const pct     = Math.min(100, limit > 0 ? Math.round(sent / limit * 100) : 0);

  const setSafe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setSafe('gmailSentCount', sent);
  setSafe('gmailRemainingCount', remaining);
  setSafe('gmailPctCount', pct + '%');

  const bar = document.getElementById('gmailBarFill');
  if (bar) {
    bar.style.width = pct + '%';
    bar.className = 'gmail-bar-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  }

  const limitInput = document.getElementById('gmailLimitInput');
  if (limitInput) limitInput.value = limit;

  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const hh = Math.floor(diff / 3600000);
  const mm = Math.floor((diff % 3600000) / 60000);
  const resetEl = document.getElementById('gmailResetTime');
  if (resetEl) resetEl.textContent = 'Resets in ' + hh + 'h ' + mm + 'm';

  const remEl = document.getElementById('gmailRemainingCount');
  if (remEl) remEl.style.color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';
}
function gmailLimitChanged(val) {
  const v = Math.max(1, Math.min(9999, parseInt(val, 10) || 500));
  localStorage.setItem('gmailDailyLimit', v);
  updateGmailTracker();
}
async function gmailTrackerReset() {
  const today = new Date().toDateString();
  await _setGmailTrack({ date: today, sent: 0 });
  try { localStorage.setItem('gmailTrack', JSON.stringify({ date: today, sent: 0 })); } catch(e){}
  updateGmailTracker();
  showToast('Gmail counter reset for today', 'ok');
}
function animN(id,t){
  const el=document.getElementById(id);if(!el)return;
  if(!t){el.textContent='0';return;}
  let v=0;const st=Math.max(1,Math.ceil(t/22));
  const ti=setInterval(()=>{v=Math.min(v+st,t);el.textContent=v;if(v>=t)clearInterval(ti);},40);
}
function logAct(n,a){
  const l=document.getElementById('actList');if(!l)return;
  const t=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  l.insertAdjacentHTML('afterbegin','<div class="ai" style="animation:fadeUp .28s ease"><div class="ai-ic" style="background:var(--lime-p)">'+n.split(' ')[0]+'</div><div style="flex:1;min-width:0"><div class="ai-n">'+a+': '+n.replace(/^[^\s]+\s/,'')+'</div><div class="ai-t">Today at '+t+'</div></div></div>');
}

function updateGreeting(){
  const h=new Date().getHours();
  const g=h<12?'morning':h<17?'afternoon':'evening';
  const e=document.getElementById('greetTime');if(e)e.textContent=g;
  const ne=document.getElementById('greetName');if(ne)ne.textContent=U?U.firstName:'there';
  const de=document.getElementById('dateDisplay');
  if(de)de.textContent=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

function ini(){return((U?.firstName||'?')[0]+(U?.lastName||'')[0]||'').toUpperCase();}

function renderAvatars(){
  if(!U)return;
  const av=U.avatar?`<img src="${U.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`<span>${ini()}</span>`;
  const nb=document.getElementById('nbAv');if(nb)nb.innerHTML=av;
  const sb=document.getElementById('sbAv');if(sb)sb.innerHTML=U.avatar?`<img src="${U.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`<span>${ini()}</span>`;
  const sn=document.getElementById('sbName');if(sn)sn.textContent=U.firstName+' '+U.lastName;
  const sr=document.getElementById('sbRole');if(sr)sr.textContent=U.role||'Member';
}

function renderProfile(){
  if(!U)return;
  const ci=document.getElementById('coverImg');
  if(ci){ci.src=U.cover||'';ci.style.display=U.cover?'block':'none';}
  const aw=document.getElementById('profAvWrap');
  if(aw){
    if(U.avatar) aw.innerHTML=`<img src="${U.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><div class="av-ov">📷</div>`;
    else aw.innerHTML=`<span id="profIni">${ini()}</span><div class="av-ov">📷</div>`;
  }
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v||'—';};
  s('nmName',(U.firstName||'')+' '+(U.lastName||''));
  s('nmRole',(U.role?U.role+' · ':'')+(U.company||'NOVA Studio'));
  s('nmBio',U.bio||'No bio yet. Click Edit Profile to add one.');
  s('pdEmail',U.email);s('pdPhone',U.phone);s('pdLoc',U.location);s('pdWeb',U.website);
  s('pdRole',U.role);s('pdComp',U.company);s('pdDept',U.dept);s('pdSince',U.memberSince);
  const sk=document.getElementById('pdSkills');
  if(sk)sk.innerHTML=(U.skills&&U.skills.length)?U.skills.map(s=>`<span class="sk-chip">${s}</span>`).join(''):`<span style="font-size:.73rem;color:var(--mist)">No skills added yet</span>`;
}

function handleCover(inp){
  const f=inp.files[0];if(!f)return;
  if(f.size>10*1024*1024){showToast('Max 10MB','err');return;}
  showToast('Uploading cover photo…','info');
  const ext=f.name.split('.').pop()||'jpg';
  const path='profile-photos/'+U.email+'/cover.'+ext;
  const ref=fbStorage.ref(path);
  ref.put(f).then(()=>ref.getDownloadURL()).then(url=>{
    U.cover=url;
    const ci=document.getElementById('coverImg');
    if(ci){ci.src=url;ci.style.display='block';}
    persist();renderProfile();showToast('Cover photo updated ✓','ok');
  }).catch(err=>showToast('Upload failed: '+err.message,'err'));
  inp.value='';
}

function handleAvatar(inp){
  const f=inp.files[0];if(!f)return;
  if(f.size>10*1024*1024){showToast('Max 10MB','err');return;}
  showToast('Uploading profile photo…','info');
  const ext=f.name.split('.').pop()||'jpg';
  const path='profile-photos/'+U.email+'/avatar.'+ext;
  const ref=fbStorage.ref(path);
  ref.put(f).then(()=>ref.getDownloadURL()).then(url=>{
    U.avatar=url;
    const ep=document.getElementById('epAv');
    if(ep)ep.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    renderAvatars();renderProfile();persist();
    showToast('Profile photo updated ✓','ok');
  }).catch(err=>showToast('Upload failed: '+err.message,'err'));
  inp.value='';
}

function openEdit(){
  if(!U)return;
  document.getElementById('epFirst').value=U.firstName||'';
  document.getElementById('epLast').value=U.lastName||'';
  document.getElementById('epEmail').value=U.email||'';
  document.getElementById('epPhone').value=U.phone||'';
  document.getElementById('epLoc').value=U.location||'';
  document.getElementById('epWeb').value=U.website||'';
  document.getElementById('epRole').value=U.role||'';
  document.getElementById('epComp').value=U.company||'';
  document.getElementById('epDept').value=U.dept||'';
  document.getElementById('epBio').value=U.bio||'';
  document.getElementById('epBioCt').textContent=(U.bio||'').length;
  editSkills=[...(U.skills||[])];renderEditSkills();
  const ep=document.getElementById('epAv');
  if(ep)ep.innerHTML=U.avatar?`<img src="${U.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`<span style="font-size:1.6rem;font-weight:800;color:var(--ink)">${ini()}</span>`;
  document.getElementById('editOvl').classList.add('show');
  document.getElementById('editPanel').classList.add('show');
}
function closeEdit(){
  document.getElementById('editOvl').classList.remove('show');
  document.getElementById('editPanel').classList.remove('show');
}
function saveProfile(){
  U.firstName=document.getElementById('epFirst').value.trim()||U.firstName;
  U.lastName=document.getElementById('epLast').value.trim();
  U.email=document.getElementById('epEmail').value.trim()||U.email;
  U.phone=document.getElementById('epPhone').value.trim();
  U.location=document.getElementById('epLoc').value.trim();
  U.website=document.getElementById('epWeb').value.trim();
  U.role=document.getElementById('epRole').value;
  U.company=document.getElementById('epComp').value.trim();
  U.dept=document.getElementById('epDept').value.trim();
  U.bio=document.getElementById('epBio').value.trim();
  U.skills=[...editSkills];
  persist();renderAvatars();renderProfile();updateGreeting();closeEdit();
  showToast('Profile saved ✓','ok');
}
function persist(){
  // Always keep a fast local cache
  try { localStorage.setItem(SS,JSON.stringify(U)); } catch(e){}
  // Save to Firestore (skip demo user)
  if (U && U.email && U.email !== 'demo@nova.studio') {
    const dataToSave = Object.assign({}, U);
    // Never store password in Firestore
    delete dataToSave.password;
    // Strip base64 images — only store Storage URLs (Firestore 1MB limit)
    if (dataToSave.avatar && dataToSave.avatar.startsWith('data:')) delete dataToSave.avatar;
    if (dataToSave.cover  && dataToSave.cover.startsWith('data:'))  delete dataToSave.cover;
    fbDb.collection('users').doc(U.email).set(dataToSave, { merge: true })
      .catch(function(err){ console.warn('Firestore persist error:', err); });
  }
}
function addSkill(e){
  if(e.key!=='Enter')return;e.preventDefault();
  const inp=document.getElementById('epSkIn');
  const v=inp.value.trim();
  if(!v||editSkills.includes(v)){inp.value='';return;}
  if(editSkills.length>=12){showToast('Max 12 skills','info');return;}
  editSkills.push(v);inp.value='';renderEditSkills();
}
function removeSkill(s){editSkills=editSkills.filter(x=>x!==s);renderEditSkills();}
function renderEditSkills(){
  document.getElementById('epSkTags').innerHTML=editSkills.map(s=>`<span class="sk-t">${s}<button onclick="removeSkill('${s.replace(/'/g,"\\'")}')">✕</button></span>`).join('');
}
function showToast(msg,type='info'){
  const t=document.getElementById('toastEl');
  t.textContent=msg;t.className='toast '+type+' show';
  clearTimeout(t._t);t._t=setTimeout(()=>t.className='toast',3000);
}
window.toast=showToast;
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeEdit();document.getElementById('zipModal').classList.remove('show');}
  if(e.key==='Delete'&&C.selId!==null)certDeleteEl(C.selId);
});


// ==================== CERTIFICATE TOOL ====================
const C = {
  bgDataUrl: null, bgImage: null, bgFit: 'stretch',
  bgOpacity: 1, bgColor: '#ffffff',
  cw: 3508, ch: 2481,
  logoDataUrl: null, logoImage: null,
  logoX: 0.05, logoY: 0.05, logoW: 0.18, logoH: 0.1,
  elements: [], selId: null, nextId: 1,
  zoom: 0.25, mode: 'select',
  csv: [], csvHeaders: [],
  previewRow: 0, previewOn: false,
  dragging: false, dragEl: null, dragOX: 0, dragOY: 0
};

// ---- Rendering ----
function certDraw(overrideData) {
  const canvas = document.getElementById('certCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Auto-inject current preview row if preview is on and no explicit override
  if (overrideData === undefined) {
    overrideData = (C.previewOn && C.csv.length > 0) ? C.csv[C.previewRow] : null;
  }

  // Always render at FULL resolution — zoom is handled by CSS transform only
  if (canvas.width !== C.cw || canvas.height !== C.ch) {
    canvas.width = C.cw;
    canvas.height = C.ch;
  }

  // High-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // BG color
  ctx.clearRect(0, 0, C.cw, C.ch);
  ctx.fillStyle = C.bgColor;
  ctx.fillRect(0, 0, C.cw, C.ch);

  // BG image — drawn at full canvas size
  if (C.bgImage && C.bgImage.complete && C.bgImage.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = C.bgOpacity;
    const iw = C.bgImage.naturalWidth, ih = C.bgImage.naturalHeight;
    const cw = C.cw, ch = C.ch;
    switch (C.bgFit) {
      case 'stretch': ctx.drawImage(C.bgImage, 0, 0, cw, ch); break;
      case 'cover': {
        const sc = Math.max(cw/iw, ch/ih);
        const dw = iw*sc, dh = ih*sc;
        ctx.drawImage(C.bgImage, (cw-dw)/2, (ch-dh)/2, dw, dh); break;
      }
      case 'contain':
      case 'auto': {
        const sc = Math.min(cw/iw, ch/ih);
        const dw = iw*sc, dh = ih*sc;
        ctx.drawImage(C.bgImage, (cw-dw)/2, (ch-dh)/2, dw, dh); break;
      }
      case 'original':
        ctx.drawImage(C.bgImage, 0, 0, iw, ih); break;
    }
    ctx.restore();
  }

  // Logo — full-res coordinates
  if (C.logoImage && C.logoImage.complete && C.logoImage.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(C.logoImage, C.logoX*C.cw, C.logoY*C.ch, C.logoW*C.cw, C.logoH*C.ch);
  }

  // Text elements — full-res font sizes
  for (const el of C.elements) {
    if (!el.visible) continue;
    const txt = overrideData ? certSubstitute(el.text, overrideData) : el.text;
    const x = el.x * C.cw, y = el.y * C.ch;
    ctx.font = `${el.italic?'italic ':''}${el.bold?'bold ':''}${el.fontSize}px "${el.fontFamily}"`;
    ctx.fillStyle = el.color;
    ctx.textAlign = el.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  }

  // ── Grid overlay (only when enabled in Settings) ──
  try {
    const stg = stgGetSettings();
    if (stg.showGrid) {
      const cols = 12, rows = 8;
      const stepX = C.cw / cols, stepY = C.ch / rows;
      ctx.save();
      ctx.strokeStyle = 'rgba(100,120,255,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      for (let i = 1; i < cols; i++) {
        ctx.beginPath(); ctx.moveTo(i*stepX, 0); ctx.lineTo(i*stepX, C.ch); ctx.stroke();
      }
      for (let j = 1; j < rows; j++) {
        ctx.beginPath(); ctx.moveTo(0, j*stepY); ctx.lineTo(C.cw, j*stepY); ctx.stroke();
      }
      // Center crosshair
      ctx.strokeStyle = 'rgba(100,120,255,0.35)';
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(C.cw/2,0); ctx.lineTo(C.cw/2,C.ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,C.ch/2); ctx.lineTo(C.cw,C.ch/2); ctx.stroke();
      ctx.restore();
    }
  } catch(e) {}

  // Update selection handle overlay (in canvas-pixel space, then scaled by CSS)
  certDrawSelHandle();
}

function certDrawSelHandle() {
  const el = C.elements.find(e => e.id === C.selId);
  const h = document.getElementById('certSelHandle');
  if (!el || !h) { if(h) h.style.display='none'; return; }
  // Measure text at full resolution
  const canvas = document.getElementById('certCanvas');
  const ctx = canvas.getContext('2d');
  const x = el.x * C.cw, y = el.y * C.ch;
  ctx.font = `${el.italic?'italic ':''}${el.bold?'bold ':''}${el.fontSize}px "${el.fontFamily}"`;
  const tw = ctx.measureText(el.text).width;
  const th = el.fontSize * 1.3;
  let rx = x;
  if (el.align === 'center') rx = x - tw/2;
  else if (el.align === 'right') rx = x - tw;
  // Handle is inside certCanvasWrap which is CSS-scaled — use canvas pixels directly
  h.style.display = 'block';
  h.style.left = (rx - 4) + 'px';
  h.style.top = (y - th/2 - 4) + 'px';
  h.style.width = (tw + 8) + 'px';
  h.style.height = (th + 8) + 'px';
}

// Full-res export canvas (no zoom)
function certRenderFull(overrideData) {
  const oc = document.createElement('canvas');
  oc.width = C.cw; oc.height = C.ch;
  const ctx = oc.getContext('2d');
  ctx.fillStyle = C.bgColor;
  ctx.fillRect(0, 0, C.cw, C.ch);
  if (C.bgImage && C.bgImage.complete && C.bgImage.naturalWidth > 0) {
    ctx.save(); ctx.globalAlpha = C.bgOpacity;
    const iw = C.bgImage.naturalWidth, ih = C.bgImage.naturalHeight;
    switch (C.bgFit) {
      case 'stretch': ctx.drawImage(C.bgImage, 0, 0, C.cw, C.ch); break;
      case 'cover': { const sc=Math.max(C.cw/iw,C.ch/ih),dw=iw*sc,dh=ih*sc; ctx.drawImage(C.bgImage,(C.cw-dw)/2,(C.ch-dh)/2,dw,dh); break; }
      case 'contain':
      case 'auto': { const sc=Math.min(C.cw/iw,C.ch/ih),dw=iw*sc,dh=ih*sc; ctx.drawImage(C.bgImage,(C.cw-dw)/2,(C.ch-dh)/2,dw,dh); break; }
      case 'original': ctx.drawImage(C.bgImage, 0, 0, iw, ih); break;
    }
    ctx.restore();
  }
  if (C.logoImage && C.logoImage.complete) {
    ctx.drawImage(C.logoImage, C.logoX*C.cw, C.logoY*C.ch, C.logoW*C.cw, C.logoH*C.ch);
  }
  for (const el of C.elements) {
    if (!el.visible) continue;
    const txt = overrideData ? certSubstitute(el.text, overrideData) : el.text;
    ctx.font = `${el.italic?'italic ':''}${el.bold?'bold ':''}${el.fontSize}px "${el.fontFamily}"`;
    ctx.fillStyle = el.color;
    ctx.textAlign = el.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, el.x*C.cw, el.y*C.ch);
  }
  return oc.toDataURL('image/png');
}

function certSubstitute(text, data) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] || data[k.toLowerCase()] || '');
}

// ---- Background ----
function certLoadBg(inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 20*1024*1024) { showToast('Max 20MB image','err'); return; }
  const r = new FileReader();
  r.onload = e => {
    C.bgDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      C.bgImage = img;
      // Update canvas size to match if no custom size set
      document.getElementById('certBgBadgeTxt').textContent = f.name + ' (' + img.naturalWidth + '×' + img.naturalHeight + ')';
      document.getElementById('certBgUploadZone').style.display = 'none';
      document.getElementById('certBgBadge').style.display = 'block';
      certDraw();
      showToast('Template loaded ✓','ok');
    };
    img.onerror = () => showToast('Could not load image','err');
    img.src = C.bgDataUrl;
  };
  r.readAsDataURL(f);
  inp.value = '';
}

function certBgDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.type.startsWith('image/')) { showToast('Drop an image file','err'); return; }
  const r = new FileReader();
  r.onload = ev => {
    C.bgDataUrl = ev.target.result;
    const img = new Image();
    img.onload = () => {
      C.bgImage = img;
      document.getElementById('certBgBadgeTxt').textContent = f.name + ' (' + img.naturalWidth + '×' + img.naturalHeight + ')';
      document.getElementById('certBgUploadZone').style.display = 'none';
      document.getElementById('certBgBadge').style.display = 'block';
      certDraw(); showToast('Template loaded ✓','ok');
    };
    img.src = C.bgDataUrl;
  };
  r.readAsDataURL(f);
}

function certRemoveBg() {
  C.bgDataUrl = null; C.bgImage = null;
  document.getElementById('certBgUploadZone').style.display = 'flex';
  document.getElementById('certBgBadge').style.display = 'none';
  certDraw();
}

function certSetBgFit(fit) {
  C.bgFit = fit;
  document.querySelectorAll('.cert-fit-btn').forEach(b => b.classList.remove('active'));
  const map = {stretch:'certFitStretch',cover:'certFitCover',contain:'certFitContain',original:'certFitOriginal',auto:'certFitContain'};
  if (map[fit]) document.getElementById(map[fit])?.classList.add('active');
  certDraw();
}

function certSetOpacity(v) {
  C.bgOpacity = v / 100;
  document.getElementById('certOpacityVal').textContent = v + '%';
  certDraw();
}

function certSetBgColor(v) {
  C.bgColor = v;
  document.getElementById('certBgColorHex').value = v;
  certDraw();
}

function certBgColorHexChange(v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    C.bgColor = v;
    document.getElementById('certBgColorPicker').value = v;
    certDraw();
  }
}

function certResizeCanvas() {
  const w = parseInt(document.getElementById('certCW').value)||3508;
  const h = parseInt(document.getElementById('certCH').value)||2481;
  C.cw = w; C.ch = h;
  certUpdateCanvasSize(); certDraw();
}

function certUpdateCanvasSize() {
  const wrap = document.getElementById('certCanvasWrap');
  const outer = document.getElementById('certCanvasOuter');
  const canvas = document.getElementById('certCanvas');
  if (!wrap || !outer || !canvas) return;
  // Canvas always at full resolution
  if (canvas.width !== C.cw) canvas.width = C.cw;
  if (canvas.height !== C.ch) canvas.height = C.ch;
  // CSS transform scales visually — no pixel loss
  wrap.style.transform = `scale(${C.zoom})`;
  // Outer provides scroll space at the visual (zoomed) size
  outer.style.width = Math.round(C.cw * C.zoom) + 'px';
  outer.style.height = Math.round(C.ch * C.zoom) + 'px';
}

function certPreset(w, h) {
  C.cw = w; C.ch = h;
  document.getElementById('certCW').value = w;
  document.getElementById('certCH').value = h;
  certUpdateCanvasSize(); certDraw();
}

// ---- Logo ----
function certLoadLogo(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    C.logoDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      C.logoImage = img;
      document.getElementById('certLogoBadgeTxt').textContent = f.name;
      document.getElementById('certLogoUploadZone').style.display = 'none';
      document.getElementById('certLogoBadge').style.display = 'block';
      document.getElementById('certLogoPos').style.display = 'block';
      certDraw(); showToast('Logo loaded ✓','ok');
    };
    img.src = C.logoDataUrl;
  };
  r.readAsDataURL(f);
  inp.value = '';
}

function certLogoDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const inp = {files:[f]};
  certLoadLogo(inp);
}

function certRemoveLogo() {
  C.logoDataUrl = null; C.logoImage = null;
  document.getElementById('certLogoUploadZone').style.display = 'flex';
  document.getElementById('certLogoBadge').style.display = 'none';
  document.getElementById('certLogoPos').style.display = 'none';
  certDraw();
}

function certUpdateLogo() {
  C.logoX = (parseInt(document.getElementById('certLogoX').value)||5) / 100;
  C.logoY = (parseInt(document.getElementById('certLogoY').value)||5) / 100;
  C.logoW = (parseInt(document.getElementById('certLogoW').value)||18) / 100;
  C.logoH = (parseInt(document.getElementById('certLogoH').value)||10) / 100;
  certDraw();
}

// ---- Text Elements ----
function certAddText() {
  const el = {
    id: C.nextId++, type:'text', text:'Text here',
    x: 0.5, y: 0.5, fontFamily:'Arial', fontSize: 80,
    color:'#000000', bold:false, italic:false, align:'center', visible:true
  };
  C.elements.push(el);
  C.selId = el.id;
  certRenderElList();
  certShowElProps(el);
  certDraw();
}

function certDeleteEl(id) {
  C.elements = C.elements.filter(e => e.id !== id);
  if (C.selId === id) { C.selId = null; certHideElProps(); }
  certRenderElList(); certDraw();
}

function certSelectEl(id) {
  C.selId = id;
  certRenderElList();
  const el = C.elements.find(e => e.id===id);
  if (el) certShowElProps(el);
  certDraw();
}

function certRenderElList() {
  const list = document.getElementById('certElList');
  if (!list) return;
  if (!C.elements.length) {
    list.innerHTML='<div style="font-size:.7rem;color:var(--mist);text-align:center;padding:8px 0">No text elements yet.<br>Click "+ Add Text" to begin.</div>';
    return;
  }
  list.innerHTML = C.elements.map(el=>`
    <div class="cert-el-item ${el.id===C.selId?'selected':''}" onclick="certSelectEl(${el.id})">
      <span class="cert-el-ic">T</span>
      <span class="cert-el-txt">${el.text.replace(/</g,'&lt;')}</span>
      <button class="cert-el-del" onclick="event.stopPropagation();certDeleteEl(${el.id})">✕</button>
    </div>
  `).join('');
}

function certShowElProps(el) {
  document.getElementById('certElProps').style.display='flex';
  document.getElementById('certElText').value=el.text;
  document.getElementById('certElSize').value=el.fontSize;
  document.getElementById('certElFont').value=el.fontFamily;
  document.getElementById('certElColor').value=el.color;
  document.getElementById('certElColorHex').value=el.color;
  document.getElementById('certElBold').classList.toggle('active',el.bold);
  document.getElementById('certElItalic').classList.toggle('active',el.italic);
  document.getElementById('certElX').value=Math.round(el.x*1000)/10;
  document.getElementById('certElY').value=Math.round(el.y*1000)/10;
  ['certAlLeft','certAlCenter','certAlRight'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  const alMap={left:'certAlLeft',center:'certAlCenter',right:'certAlRight'};
  if(alMap[el.align])document.getElementById(alMap[el.align])?.classList.add('active');
}

function certHideElProps() {
  document.getElementById('certElProps').style.display='none';
  document.getElementById('certSelHandle').style.display='none';
}

function certUpdateElText(v) {
  const el = C.elements.find(e=>e.id===C.selId);
  if (!el) return; el.text=v; certRenderElList(); certDraw();
}

function certUpdateElProp(prop, val) {
  const el = C.elements.find(e=>e.id===C.selId);
  if (!el) return; el[prop]=val;
  if (prop==='color') {
    document.getElementById('certElColor').value=val;
    document.getElementById('certElColorHex').value=val;
  }
  if (prop==='align') {
    ['certAlLeft','certAlCenter','certAlRight'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
    const alMap={left:'certAlLeft',center:'certAlCenter',right:'certAlRight'};
    if(alMap[val])document.getElementById(alMap[val])?.classList.add('active');
  }
  certDraw();
}

function certToggleElBold() {
  const el = C.elements.find(e=>e.id===C.selId); if(!el) return;
  el.bold=!el.bold;
  document.getElementById('certElBold').classList.toggle('active',el.bold);
  certDraw();
}

function certToggleElItalic() {
  const el = C.elements.find(e=>e.id===C.selId); if(!el) return;
  el.italic=!el.italic;
  document.getElementById('certElItalic').classList.toggle('active',el.italic);
  certDraw();
}

// ---- CSV ----
function certLoadCsv(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const raw = e.target.result;
    // Handle both \r\n and \n line endings
    const rows = raw.trim().split(/\r?\n/).filter(r=>r.trim());
    if (rows.length < 2) { showToast('CSV needs headers + at least 1 row','err'); return; }

    // Parse headers — handle quoted fields
    const headers = certParseCsvRow(rows[0]);
    C.csvHeaders = headers;
    C.csv = rows.slice(1).map(row => {
      const vals = certParseCsvRow(row);
      const obj = {};
      headers.forEach((h,i)=>{ obj[h]=vals[i]||''; });
      return obj;
    });

    // Show info panel
    document.getElementById('certCsvInfo').style.display='block';
    document.getElementById('certCsvInfoTxt').textContent = f.name + ' — ' + C.csv.length + ' rows';

    // Render clickable chips for each column
    certRenderCsvChips();

    // Show preview bar
    C.previewRow = 0;
    C.previewOn = true;
    certUpdatePreviewBar();

    // Auto-add Name field if no elements exist yet, or a Name/name column exists
    const nameCol = headers.find(h => /^name$/i.test(h));
    if (nameCol && !C.elements.some(el => el.text.includes('{{'+nameCol+'}}'))) {
      const el = {
        id: C.nextId++, type:'text',
        text: '{{'+nameCol+'}}',
        x: 0.5, y: 0.55,
        fontFamily:'Georgia', fontSize: 120,
        color:'#1a1f27', bold:true, italic:false, align:'center', visible:true
      };
      C.elements.push(el);
      C.selId = el.id;
      certRenderElList();
      certShowElProps(el);
    }

    certDraw();
    showToast('CSV loaded: '+C.csv.length+' rows ✓','ok');
  };
  r.readAsText(f);
  inp.value='';
}

function certParseCsvRow(row) {
  // Handles quoted fields with commas inside
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function certRenderCsvChips() {
  const container = document.getElementById('certCsvCols');
  if (!container) return;
  const added = new Set(C.elements.map(el => el.text));
  container.innerHTML = C.csvHeaders.map(h => {
    const tag = '{{'+h+'}}';
    const isAdded = added.has(tag);
    return `<button class="cert-col-chip${isAdded?' added':''}" onclick="certAddFieldFromChip('${h.replace(/'/g,"\\'")}', this)" title="Click to add {{${h}}} to canvas">
      <span class="chip-ic">${isAdded?'✓':'+'}</span> {{${h}}}
    </button>`;
  }).join('');
}

function certAddFieldFromChip(colName, btn) {
  const tag = '{{'+colName+'}}';
  // Don't add duplicate
  if (C.elements.some(el => el.text === tag)) {
    showToast('{{'+colName+'}} already on canvas','info'); return;
  }
  const el = {
    id: C.nextId++, type:'text',
    text: tag,
    x: 0.5, y: 0.5 + (C.elements.length * 0.08),
    fontFamily:'Arial', fontSize: 80,
    color:'#000000', bold:false, italic:false, align:'center', visible:true
  };
  C.elements.push(el);
  C.selId = el.id;
  certRenderElList();
  certShowElProps(el);
  certDraw();
  // Mark chip as added
  if (btn) { btn.classList.add('added'); btn.querySelector('.chip-ic').textContent='✓'; }
  showToast('Added {{'+colName+'}} to canvas ✓','ok');
}

function certAddAllFields() {
  let added = 0;
  C.csvHeaders.forEach((h, i) => {
    const tag = '{{'+h+'}}';
    if (!C.elements.some(el => el.text === tag)) {
      C.elements.push({
        id: C.nextId++, type:'text', text: tag,
        x: 0.5, y: 0.3 + i*0.12,
        fontFamily:'Arial', fontSize: 80,
        color:'#000000', bold:false, italic:false, align:'center', visible:true
      });
      added++;
    }
  });
  certRenderElList();
  certRenderCsvChips();
  certDraw();
  showToast('Added '+added+' field'+(added!==1?'s':'')+' to canvas ✓','ok');
}

function certClearCsv() {
  C.csv=[]; C.csvHeaders=[]; C.previewRow=0; C.previewOn=false;
  document.getElementById('certCsvInfo').style.display='none';
  document.getElementById('certPreviewBar').classList.remove('visible');
  certDraw();
}

// ---- Preview ----
function certUpdatePreviewBar() {
  const bar = document.getElementById('certPreviewBar');
  const counter = document.getElementById('certPrevCounter');
  const nameEl = document.getElementById('certPrevName');
  const toggle = document.getElementById('certPrevToggle');
  if (!C.csv.length) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  counter.textContent = (C.previewRow+1) + ' / ' + C.csv.length;
  // Show first column value as name
  const row = C.csv[C.previewRow];
  const nameKey = C.csvHeaders.find(h=>/^name$/i.test(h)) || C.csvHeaders[0];
  nameEl.textContent = row ? (row[nameKey]||'Row '+(C.previewRow+1)) : '—';
  toggle.textContent = C.previewOn ? '● Live Preview ON' : '○ Live Preview OFF';
  toggle.className = 'cert-prev-toggle' + (C.previewOn ? '' : ' off');
}

function certPreviewNav(dir) {
  if (!C.csv.length) return;
  C.previewRow = (C.previewRow + dir + C.csv.length) % C.csv.length;
  certUpdatePreviewBar();
  if (C.previewOn) certDraw();
}

function certTogglePreview() {
  C.previewOn = !C.previewOn;
  certUpdatePreviewBar();
  certDraw();
  showToast('Preview ' + (C.previewOn ? 'ON — showing row '+(C.previewRow+1) : 'OFF — showing placeholders'), 'info');
}

// ---- Canvas interaction ----
function certSetMode(m) {
  C.mode = m;
  document.getElementById('certBtnSel').classList.toggle('active', m==='select');
  document.getElementById('certBtnTxt').classList.toggle('active', m==='text');
  const wrap = document.getElementById('certCanvasWrap');
  if (wrap) wrap.className = 'cert-canvas-wrap ' + (m==='select'?'mode-select':'');
}

function certCanvasClick(e) {
  if (C.dragging) return;
  const wrap = document.getElementById('certCanvasWrap');
  const rect = wrap.getBoundingClientRect();
  // Convert screen pixel → canvas pixel (wrap is CSS-scaled)
  const cx = (e.clientX - rect.left) / C.zoom;
  const cy = (e.clientY - rect.top) / C.zoom;

  if (C.mode === 'text') {
    const el = {
      id: C.nextId++, type:'text', text:'Text here',
      x: cx/C.cw, y: cy/C.ch,
      fontFamily:'Arial', fontSize:80, color:'#000000',
      bold:false, italic:false, align:'center', visible:true
    };
    C.elements.push(el);
    C.selId = el.id;
    certRenderElList(); certShowElProps(el); certDraw();
    certSetMode('select');
    return;
  }

  // Select mode — hit test in canvas-pixel space
  let hit = null;
  const canvas = document.getElementById('certCanvas');
  const ctx = canvas.getContext('2d');
  for (let i = C.elements.length-1; i >= 0; i--) {
    const el = C.elements[i];
    const ex = el.x * C.cw;
    const ey = el.y * C.ch;
    ctx.font = `${el.italic?'italic ':''}${el.bold?'bold ':''}${el.fontSize}px "${el.fontFamily}"`;
    const tw = ctx.measureText(el.text).width;
    const th = el.fontSize * 1.3;
    let rx = ex;
    if (el.align==='center') rx = ex - tw/2;
    else if (el.align==='right') rx = ex - tw;
    if (cx >= rx-6 && cx <= rx+tw+6 && cy >= ey-th/2-6 && cy <= ey+th/2+6) {
      hit = el; break;
    }
  }
  if (hit) { C.selId=hit.id; certRenderElList(); certShowElProps(hit); }
  else { C.selId=null; certRenderElList(); certHideElProps(); }
  certDraw();
}

function certMouseDown(e) {
  if (C.mode !== 'select' || C.selId === null) return;
  const wrap = document.getElementById('certCanvasWrap');
  const rect = wrap.getBoundingClientRect();
  const el = C.elements.find(e2=>e2.id===C.selId);
  if (!el) return;
  // Convert to canvas pixels
  const mx = (e.clientX - rect.left) / C.zoom;
  const my = (e.clientY - rect.top) / C.zoom;
  const ex = el.x * C.cw;
  const ey = el.y * C.ch;
  const canvas = document.getElementById('certCanvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${el.italic?'italic ':''}${el.bold?'bold ':''}${el.fontSize}px "${el.fontFamily}"`;
  const tw = ctx.measureText(el.text).width;
  const th = el.fontSize * 1.3;
  let rx = ex;
  if (el.align==='center') rx = ex - tw/2;
  else if (el.align==='right') rx = ex - tw;
  if (mx >= rx-6 && mx <= rx+tw+6 && my >= ey-th/2-6 && my <= ey+th/2+6) {
    C.dragging = true;
    C.dragEl = el;
    C.dragOX = mx - ex;
    C.dragOY = my - ey;
    e.preventDefault();
  }
}

function certMouseMove(e) {
  if (!C.dragging || !C.dragEl) return;
  const wrap = document.getElementById('certCanvasWrap');
  const rect = wrap.getBoundingClientRect();
  // Convert screen pixels → canvas pixels
  const mx = (e.clientX - rect.left) / C.zoom;
  const my = (e.clientY - rect.top) / C.zoom;
  let nx = (mx - C.dragOX) / C.cw;
  let ny = (my - C.dragOY) / C.ch;
  // Snap to grid (12×8 grid)
  try {
    const stg = stgGetSettings();
    if (stg.snapGrid) {
      const cols = 12, rows = 8;
      nx = Math.round(nx * cols) / cols;
      ny = Math.round(ny * rows) / rows;
    }
  } catch(e2) {}
  C.dragEl.x = Math.max(0, Math.min(1, nx));
  C.dragEl.y = Math.max(0, Math.min(1, ny));
  document.getElementById('certElX').value = Math.round(C.dragEl.x*1000)/10;
  document.getElementById('certElY').value = Math.round(C.dragEl.y*1000)/10;
  certDraw();
}

function certMouseUp() {
  C.dragging = false; C.dragEl = null;
}

// ---- Zoom ----
function certSetZoom(z) {
  C.zoom = Math.max(0.05, Math.min(2.0, z));
  document.getElementById('certZoomSlider').value = Math.round(C.zoom*100);
  document.getElementById('certZoomPct').textContent = Math.round(C.zoom*100)+'%';
  // Update CSS transform + scroll-space; canvas pixels don't change
  certUpdateCanvasSize();
  certDraw();
}

function certZoom(delta) {
  certSetZoom(C.zoom + delta);
}

function certFitZoom() {
  const area = document.getElementById('certCanvasArea');
  if (!area) return;
  const aw = area.clientWidth - 80;
  const ah = area.clientHeight - 80;
  const zw = aw / C.cw;
  const zh = ah / C.ch;
  certSetZoom(Math.min(zw, zh, 1.5));
}

// ---- Sections toggle ----
function certToggleSection(id) {
  const body = document.getElementById('certSec'+id[0].toUpperCase()+id.slice(1));
  const toggle = document.getElementById('certSecToggle'+id[0].toUpperCase()+id.slice(1));
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'flex';
  if (toggle) toggle.classList.toggle('open', !open);
}

// ---- Inline ZIP builder (no external library needed) ----
function _crc32(data) {
  // Build CRC table once
  if (!_crc32.table) {
    _crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crc32.table[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = _crc32.table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _u16(v, buf, off) { buf[off]=v&0xFF; buf[off+1]=(v>>8)&0xFF; }
function _u32(v, buf, off) { buf[off]=v&0xFF; buf[off+1]=(v>>8)&0xFF; buf[off+2]=(v>>16)&0xFF; buf[off+3]=(v>>24)&0xFF; }

function buildZipBlob(files) {
  // files: [{name:string, data:Uint8Array}]
  // Store without compression (PNG is already compressed — STORE is fine & smaller overhead)
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = _crc32(file.data);
    const sz = file.data.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    _u32(0x04034b50, lh, 0);  // signature
    _u16(20, lh, 4);           // version needed
    _u16(0, lh, 6);            // flags
    _u16(0, lh, 8);            // compression: STORE
    _u16(0, lh, 10);           // mod time
    _u16(0, lh, 12);           // mod date
    _u32(crc, lh, 14);
    _u32(sz, lh, 18);
    _u32(sz, lh, 22);
    _u16(nameBytes.length, lh, 26);
    _u16(0, lh, 28);
    lh.set(nameBytes, 30);

    // Central directory header (46 bytes + name)
    const cd = new Uint8Array(46 + nameBytes.length);
    _u32(0x02014b50, cd, 0);   // signature
    _u16(20, cd, 4);            // version made
    _u16(20, cd, 6);            // version needed
    _u16(0, cd, 8);             // flags
    _u16(0, cd, 10);            // compression: STORE
    _u16(0, cd, 12);            // mod time
    _u16(0, cd, 14);            // mod date
    _u32(crc, cd, 16);
    _u32(sz, cd, 20);
    _u32(sz, cd, 24);
    _u16(nameBytes.length, cd, 28);
    _u16(0, cd, 30);            // extra length
    _u16(0, cd, 32);            // comment length
    _u16(0, cd, 34);            // disk start
    _u16(0, cd, 36);            // internal attr
    _u32(0, cd, 38);            // external attr
    _u32(offset, cd, 42);       // local header offset
    cd.set(nameBytes, 46);

    localParts.push(lh, file.data);
    centralParts.push(cd);
    offset += lh.length + sz;
  }

  const cdSize = centralParts.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  _u32(0x06054b50, eocd, 0);   // signature
  _u16(0, eocd, 4);             // disk
  _u16(0, eocd, 6);             // disk with cd
  _u16(files.length, eocd, 8);
  _u16(files.length, eocd, 10);
  _u32(cdSize, eocd, 12);
  _u32(offset, eocd, 16);
  _u16(0, eocd, 20);

  return new Blob([...localParts, ...centralParts, eocd], {type:'application/zip'});
}

function dataUrlToUint8Array(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ---- Download ----
function certDownloadSingle() {
  // Use current preview row if preview is on and CSV is loaded, otherwise no substitution
  const rowData = (C.csv.length > 0) ? C.csv[C.previewRow] : null;
  const dataUrl = certRenderFull(rowData);
  let fname = 'certificate.png';
  if (rowData) {
    const nameKey = C.csvHeaders.find(h=>/^name$/i.test(h)) || C.csvHeaders[0];
    fname = (rowData[nameKey]||'certificate').replace(/[^a-z0-9_\-\s]/gi,'_').trim()+'.png';
  }
  const a = document.createElement('a');
  a.href = dataUrl; a.download = fname; a.click();
  if (U) { U.stats=U.stats||{}; U.stats.exports=(U.stats.exports||0)+1; persist(); updateStats(); }
  showToast('Downloaded: '+fname+' ✓','ok');
}

function certAskZipDownload() {
  const modal = document.getElementById('zipModal');
  const sub = document.getElementById('zipSubTxt');
  const inp = document.getElementById('zipNameInp');
  if (C.csv.length > 0) {
    sub.textContent = C.csv.length + ' certificates will be bundled into a ZIP folder.';
    inp.value = 'Certificates';
  } else {
    sub.textContent = 'Download the current certificate as a ZIP.';
    inp.value = 'Certificate';
  }
  modal.classList.add('show');
  setTimeout(()=>inp.select(), 100);
}

async function certConfirmZip() {
  const modal = document.getElementById('zipModal');
  const zipName = document.getElementById('zipNameInp').value.trim() || 'Certificates';
  modal.classList.remove('show');

  const rows = C.csv.length > 0 ? C.csv : [null];
  const total = rows.length;
  const nameKey = C.csvHeaders.find(h => /^name$/i.test(h)) || C.csvHeaders[0];

  // Show progress modal
  const pm = document.getElementById('progressModal');
  const progGen = document.getElementById('progGenerating');
  const progDone = document.getElementById('progDone');
  progGen.style.display = 'block';
  progDone.style.display = 'none';
  document.getElementById('progTitle').textContent = 'Generating Certificates…';
  document.getElementById('progTotalN').textContent = total;
  document.getElementById('progPendN').textContent = total;
  document.getElementById('progDoneN').textContent = '0';
  document.getElementById('progPct').textContent = '0%';
  document.getElementById('progBarFill').style.width = '0%';
  document.getElementById('progRingFill').style.strokeDashoffset = '163';
  document.getElementById('progNameTxt').textContent = 'Starting…';
  pm.classList.add('show');

  await new Promise(r => setTimeout(r, 60));

  function updateProgress(done) {
    const pct = Math.round((done / total) * 100);
    const pending = total - done;
    const offset = 163 - (163 * done / total);
    document.getElementById('progDoneN').textContent = done;
    document.getElementById('progPendN').textContent = pending;
    document.getElementById('progPct').textContent = pct + '%';
    document.getElementById('progBarFill').style.width = pct + '%';
    document.getElementById('progRingFill').style.strokeDashoffset = offset;
  }

  try {
    const files = [];
    const usedNames = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Update current name being processed
      const curName = row ? (row[nameKey] || 'Row '+(i+1)) : 'Certificate';
      document.getElementById('progNameTxt').textContent = '('+(i+1)+'/'+total+') '+curName;
      document.getElementById('progStatus').textContent = 'Processing: '+curName;

      const dataUrl = certRenderFull(row);
      const data = dataUrlToUint8Array(dataUrl);

      let baseName = row
        ? (row[nameKey] || 'certificate_'+(i+1)).replace(/[^a-z0-9_\-\s]/gi,'_').trim()
        : 'certificate';
      if (!baseName) baseName = 'certificate_'+(i+1);
      if (usedNames[baseName]) { usedNames[baseName]++; baseName += '_'+usedNames[baseName]; }
      else usedNames[baseName] = 1;

      files.push({ name: zipName + '/' + baseName + '.png', data });

      updateProgress(i + 1);

      // Yield to UI every 5 frames so progress visually updates
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }

    document.getElementById('progNameTxt').textContent = 'Packing ZIP file…';
    document.getElementById('progStatus').textContent = 'Almost done!';
    document.getElementById('progNameIc').style.animation = 'none';
    document.getElementById('progNameIc').textContent = '📦';
    await new Promise(r => setTimeout(r, 40));

    const blob = buildZipBlob(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = zipName + '.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    // Store blob so "Save to Drive" button in done modal can use it
    _gdriveStoreBlob(blob, zipName + '.zip');

    // Show done state
    progGen.style.display = 'none';
    progDone.style.display = 'block';
    document.getElementById('progDoneTitle').textContent = '🎉 All '+total+' Certificates Ready!';
    document.getElementById('progDoneSub').textContent = 'Your ZIP is downloading automatically.';
    document.getElementById('progSumCerts').textContent = total;
    document.getElementById('progSumFile').textContent = zipName + '.zip';

    if (U) { U.stats=U.stats||{}; U.stats.exports=(U.stats.exports||0)+total; persist(); updateStats(); }

  } catch(err) {
    console.error(err);
    pm.classList.remove('show');
    showToast('ZIP error: '+err.message,'err');
  }
}

// ---- Save / Load ----
function certSave() {
  const data = {
    bgDataUrl: C.bgDataUrl, bgFit: C.bgFit, bgOpacity: C.bgOpacity,
    bgColor: C.bgColor, cw: C.cw, ch: C.ch,
    logoDataUrl: C.logoDataUrl, logoX: C.logoX, logoY: C.logoY, logoW: C.logoW, logoH: C.logoH,
    elements: C.elements, nextId: C.nextId
  };
  localStorage.setItem('nova_cert_project', JSON.stringify(data));
  showToast('Project saved ✓','ok');
}

function certLoad() {
  const raw = localStorage.getItem('nova_cert_project');
  if (!raw) { showToast('No saved project found','info'); return; }
  try {
    const data = JSON.parse(raw);
    C.bgFit = data.bgFit||'stretch';
    C.bgOpacity = data.bgOpacity||1;
    C.bgColor = data.bgColor||'#ffffff';
    C.cw = data.cw||3508; C.ch = data.ch||2481;
    C.logoX = data.logoX||0.05; C.logoY = data.logoY||0.05;
    C.logoW = data.logoW||0.18; C.logoH = data.logoH||0.1;
    C.elements = data.elements||[]; C.nextId = data.nextId||1;
    document.getElementById('certCW').value = C.cw;
    document.getElementById('certCH').value = C.ch;
    document.getElementById('certOpacitySlider').value = Math.round(C.bgOpacity*100);
    document.getElementById('certOpacityVal').textContent = Math.round(C.bgOpacity*100)+'%';
    document.getElementById('certBgColorPicker').value = C.bgColor;
    document.getElementById('certBgColorHex').value = C.bgColor;
    certSetBgFit(C.bgFit);

    const reloadImg = (dataUrl, onDone) => {
      if (!dataUrl) { onDone(null); return; }
      const img = new Image();
      img.onload = () => onDone(img);
      img.onerror = () => onDone(null);
      img.src = dataUrl;
    };

    reloadImg(data.bgDataUrl, bgImg => {
      C.bgDataUrl = data.bgDataUrl;
      C.bgImage = bgImg;
      if (bgImg) {
        document.getElementById('certBgUploadZone').style.display='none';
        document.getElementById('certBgBadge').style.display='block';
        document.getElementById('certBgBadgeTxt').textContent='Template loaded';
      }
      reloadImg(data.logoDataUrl, logoImg => {
        C.logoDataUrl = data.logoDataUrl;
        C.logoImage = logoImg;
        if (logoImg) {
          document.getElementById('certLogoUploadZone').style.display='none';
          document.getElementById('certLogoBadge').style.display='block';
          document.getElementById('certLogoPos').style.display='block';
        }
        certRenderElList();
        certFitZoom();
        certDraw();
        showToast('Project loaded ✓','ok');
      });
    });
  } catch(err) { showToast('Load failed','err'); }
}

// ---- Init ----
window.addEventListener('load', () => {
  // Set canvas to full resolution immediately
  const canvas = document.getElementById('certCanvas');
  if (canvas) { canvas.width = C.cw; canvas.height = C.ch; }
  certUpdateCanvasSize();
  certDraw();
  // Open background section by default
  const bgBody = document.getElementById('certSecBg');
  if (bgBody) bgBody.style.display = 'flex';
  const bgToggle = document.getElementById('certSecToggleBg');
  if (bgToggle) bgToggle.classList.add('open');
  // Fit zoom after a tick so layout is complete
  setTimeout(certFitZoom, 80);
});

// ==================== CROSS VERIFY ====================
const VFY = {
  csvNames: [],       // [{original, normalized}]
  certFiles: [],      // [{original, normalized}]
  results: [],        // [{csvName, certFile, status:'match'|'miss'|'extra'}]
  filter: 'all',
  csvReady: false,
  zipReady: false
};

// ---- Name normalisation (handles accents, case, underscores, extra spaces) ----
function vfyNorm(s) {
  return s
    .toString()
    .trim()
    .normalize('NFD')                    // decompose accented chars (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '')     // strip accent marks
    .toLowerCase()
    .replace(/\.[a-z]{2,5}$/i, '')       // strip file extension (.png .jpg .jpeg .pdf)
    .replace(/[_\-\.]+/g, ' ')          // underscores / dashes / dots → space
    .replace(/\s+/g, ' ')               // collapse multiple spaces
    .replace(/[^a-z0-9 ]/g, '')         // remove remaining special chars
    .trim();
}

// ---- ZIP binary reader — extracts filenames from central directory ----
function readZipFilenames(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view  = new DataView(arrayBuffer);
  const decUtf8 = new TextDecoder('utf-8');
  // CP437 decoder with fallback
  let decCp437;
  try { decCp437 = new TextDecoder('cp437'); } catch(e) { decCp437 = decUtf8; }

  // 1. Find End of Central Directory signature (0x06054b50) from back
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid ZIP file — EOCD not found');

  const cdCount  = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  // 2. Walk central directory
  const filenames = [];
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (pos + 46 > bytes.length) break;
    const sig = view.getUint32(pos, true);
    if (sig !== 0x02014b50) break; // Central directory entry signature

    const flags     = view.getUint16(pos + 8,  true);
    const fnLen     = view.getUint16(pos + 28, true);
    const extraLen  = view.getUint16(pos + 30, true);
    const cmtLen    = view.getUint16(pos + 32, true);

    const fnBytes   = bytes.slice(pos + 46, pos + 46 + fnLen);
    const isUtf8    = (flags & 0x800) !== 0;
    const filename  = isUtf8 ? decUtf8.decode(fnBytes) : decCp437.decode(fnBytes);

    filenames.push(filename);
    pos += 46 + fnLen + extraLen + cmtLen;
  }

  if (filenames.length === 0) throw new Error('ZIP contains no files');
  return filenames;
}

// ---- CSV parser (reuse from cert tool) ----
function vfyParseCsv(text) {
  const rows = text.trim().split(/\r?\n/).filter(r => r.trim());
  if (rows.length < 1) return [];
  const headers = certParseCsvRow(rows[0]);
  // Find "Name" column (case-insensitive), fallback to first column
  const nameCol = headers.findIndex(h => /^name$/i.test(h.trim()));
  const col = nameCol >= 0 ? nameCol : 0;
  return rows.slice(1)
    .map(r => certParseCsvRow(r)[col])
    .filter(v => v && v.trim());
}

// ---- Load CSV ----
function vfyLoadCsv(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const names = vfyParseCsv(e.target.result);
    if (names.length === 0) { showToast('No names found in CSV','err'); return; }
    VFY.csvNames = names.map(n => ({ original: n, normalized: vfyNorm(n) }));
    VFY.csvReady = true;
    // Update UI
    document.getElementById('vfyCsvZone').classList.add('loaded');
    document.getElementById('vfyCsvName').textContent = f.name;
    document.getElementById('vfyCsvMeta').textContent = names.length + ' names found';
    vfyCheckReady();
    inp.value = '';
  };
  r.readAsText(f);
}

// ---- Load ZIP ----
function vfyLoadZip(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const allFiles = readZipFilenames(e.target.result);
      // Filter to image files only, strip folder path
      const imgExts = /\.(png|jpg|jpeg|webp|pdf)$/i;
      const certFiles = allFiles
        .filter(fn => !fn.endsWith('/') && imgExts.test(fn)) // no dirs, only images
        .map(fn => {
          // Strip folder prefix — keep only the filename part
          const base = fn.split('/').pop();
          return { original: base, normalized: vfyNorm(base) };
        });
      if (certFiles.length === 0) {
        showToast('No image files found in ZIP','err'); return;
      }
      VFY.certFiles = certFiles;
      VFY.zipReady = true;
      document.getElementById('vfyZipZone').classList.add('loaded');
      document.getElementById('vfyZipName').textContent = f.name;
      document.getElementById('vfyZipMeta').textContent = certFiles.length + ' certificate files found';
      vfyCheckReady();
    } catch(err) {
      showToast('ZIP error: ' + err.message, 'err');
    }
    inp.value = '';
  };
  r.readAsArrayBuffer(f);
}

function vfyZipDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.name.toLowerCase().endsWith('.zip')) { showToast('Please drop a .zip file','err'); return; }
  document.getElementById('vfyZipFile').files; // no-op trick
  // Manually trigger
  const dt = new DataTransfer(); dt.items.add(f);
  document.getElementById('vfyZipFile').files = dt.files;
  vfyLoadZip(document.getElementById('vfyZipFile'));
}

function vfyCheckReady() {
  const btn = document.getElementById('vfyRunBtn');
  if (VFY.csvReady && VFY.zipReady) {
    btn.disabled = false;
    btn.classList.add('ready');
    btn.textContent = '🔍 Run Verification';
  }
}

// ---- Core verification logic ----
function runVerification() {
  const csvMap  = new Map(); // normalized → original
  VFY.csvNames.forEach(n => csvMap.set(n.normalized, n.original));

  const certMap = new Map(); // normalized → original filename
  VFY.certFiles.forEach(f => certMap.set(f.normalized, f.original));

  const results = [];
  const matchedCerts = new Set();

  // Check every CSV name against cert files
  for (const name of VFY.csvNames) {
    const certFile = certMap.get(name.normalized);
    if (certFile) {
      results.push({ csvName: name.original, certFile, status: 'match' });
      matchedCerts.add(name.normalized);
    } else {
      results.push({ csvName: name.original, certFile: null, status: 'miss' });
    }
  }

  // Find extra cert files (in ZIP but no matching CSV name)
  for (const f of VFY.certFiles) {
    if (!matchedCerts.has(f.normalized)) {
      results.push({ csvName: null, certFile: f.original, status: 'extra' });
    }
  }

  VFY.results = results;
  VFY.filter  = 'all';

  // Update stat counts
  const matched = results.filter(r => r.status === 'match').length;
  const missing = results.filter(r => r.status === 'miss').length;
  const extra   = results.filter(r => r.status === 'extra').length;
  const total   = VFY.csvNames.length;

  document.getElementById('vfyNAll').textContent   = total;
  document.getElementById('vfyNMatch').textContent = matched;
  document.getElementById('vfyNMiss').textContent  = missing;
  document.getElementById('vfyNExtra').textContent = extra;

  // Show results
  document.getElementById('vfyEmptyState').style.display     = 'none';
  document.getElementById('vfyResultsContent').style.display = 'flex';
  document.getElementById('vfyResetRow').style.display       = 'block';
  document.getElementById('vfyRunBtn').textContent = '✓ Verified — Run Again';
  document.getElementById('vfyRunBtn').classList.remove('ready');

  vfySetFilter('all');

  // Toast summary
  if (missing === 0 && extra === 0) {
    showToast('✅ Perfect match! All '+matched+' certificates verified','ok');
  } else {
    const issues = [];
    if (missing > 0) issues.push(missing+' missing');
    if (extra > 0)   issues.push(extra+' extra');
    showToast('⚠️ '+issues.join(', ')+' — check results','info');
  }
}

// ---- Filter & render ----
function vfySetFilter(f) {
  VFY.filter = f;
  ['all','match','miss','extra'].forEach(id => {
    document.getElementById('vfyStat'+id[0].toUpperCase()+id.slice(1))?.classList.remove('active');
  });
  document.getElementById('vfyStat'+f[0].toUpperCase()+f.slice(1))?.classList.add('active');
  document.getElementById('vfySearch').value = '';
  vfyRenderList();
}

function vfyFilter(f) { vfySetFilter(f); }

function vfyRenderList() {
  const list    = document.getElementById('vfyList');
  const search  = document.getElementById('vfySearch').value.trim().toLowerCase();
  const filter  = VFY.filter;

  let items = VFY.results.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search) {
      const haystack = ((r.csvName||'') + ' ' + (r.certFile||'')).toLowerCase();
      return haystack.includes(search);
    }
    return true;
  });

  if (items.length === 0) {
    list.innerHTML = '<div class="vfy-no-results">No results match your filter / search.</div>';
    return;
  }

  const icon  = { match:'✅', miss:'❌', extra:'⚠️' };
  const badge = { match:'badge-match', miss:'badge-miss', extra:'badge-extra' };
  const label = { match:'Matched', miss:'Missing', extra:'Extra File' };

  let idx = 0;
  list.innerHTML = items.map(r => {
    idx++;
    const csvDisp  = r.csvName  || '<em style="opacity:.5">—</em>';
    const certDisp = r.certFile
      ? `<span class="vfy-row-cert found">📄 ${r.certFile}</span>`
      : (r.status === 'miss'
        ? `<span class="vfy-row-cert missing">Certificate file not found in ZIP</span>`
        : `<span class="vfy-row-cert extra">Not in CSV — extra file</span>`);
    return `<div class="vfy-row r-${r.status}">
      <span class="vfy-row-icon">${icon[r.status]}</span>
      <span class="vfy-row-idx">${String(idx).padStart(3,'0')}</span>
      <div class="vfy-row-name">
        <div class="vfy-row-csv">${r.csvName||r.certFile||'—'}</div>
        ${certDisp}
      </div>
      <span class="vfy-row-badge ${badge[r.status]}">${label[r.status]}</span>
    </div>`;
  }).join('');
}

// ---- Export report as CSV ----
function vfyExportReport() {
  if (!VFY.results.length) { showToast('Run verification first','info'); return; }
  const rows = [['#','CSV Name','Certificate File','Status']];
  VFY.results.forEach((r, i) => {
    rows.push([
      i+1,
      r.csvName  || '',
      r.certFile || '',
      r.status === 'match' ? 'Matched' : r.status === 'miss' ? 'Missing Certificate' : 'Extra File'
    ]);
  });
  const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'verification_report.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Report exported ✓','ok');
}

// ============================================================
// GOOGLE DRIVE UPLOAD — Apps Script relay (no API key needed)
// ============================================================

let _gdriveLastBlob = null;
let _gdriveLastName = '';
let _gdrivePendingCallback = null;

// Store blob after any ZIP generation so the Drive button can use it
function _gdriveStoreBlob(blob, name) {
  _gdriveLastBlob = blob;
  _gdriveLastName = name;
  const btn = document.getElementById('progDriveBtn');
  if (btn) { btn.style.display = 'flex'; btn.disabled = false; }
}

// ---- Toolbar "Save to Drive" button ----
function certAskZipUploadDrive() {
  const modal = document.getElementById('zipModal');
  const sub   = document.getElementById('zipSubTxt');
  const inp   = document.getElementById('zipNameInp');
  sub.textContent = (C.csv.length > 0 ? C.csv.length + ' certificates' : 'Current certificate') + ' will be zipped and uploaded to Google Drive.';
  inp.value = C.csv.length > 0 ? 'Certificates' : 'Certificate';

  const okBtn = document.querySelector('#zipModal .zip-ok');
  okBtn.textContent = '☁️ Upload to Drive';
  okBtn.onclick = certConfirmZipDrive;

  const cancelBtn = document.querySelector('#zipModal .zip-cancel');
  const origCancel = cancelBtn.onclick;
  cancelBtn.onclick = function() {
    modal.classList.remove('show');
    okBtn.textContent = '⬇ Download ZIP';
    okBtn.onclick = certConfirmZip;
    cancelBtn.onclick = origCancel;
  };

  modal.classList.add('show');
  setTimeout(() => inp.select(), 100);
}

// ---- Generate ZIP → upload to Drive (no local download) ----
async function certConfirmZipDrive() {
  const zipName = document.getElementById('zipNameInp').value.trim() || 'Certificates';
  const okBtn   = document.querySelector('#zipModal .zip-ok');
  okBtn.textContent = '⬇ Download ZIP';
  okBtn.onclick = certConfirmZip;
  document.getElementById('zipModal').classList.remove('show');

  // Check script URL first — if missing, show setup then retry
  if (!localStorage.getItem('nova_gdrive_script_url')) {
    _gdrivePendingCallback = () => certConfirmZipDrive_run(zipName);
    openGDriveModal();
    return;
  }
  await certConfirmZipDrive_run(zipName);
}

async function certConfirmZipDrive_run(zipName) {
  const rows    = C.csv.length > 0 ? C.csv : [null];
  const total   = rows.length;
  const nameKey = C.csvHeaders.find(h => /^name$/i.test(h)) || C.csvHeaders[0];

  const pm      = document.getElementById('progressModal');
  const progGen = document.getElementById('progGenerating');
  const progDone= document.getElementById('progDone');
  progGen.style.display = 'block'; progDone.style.display = 'none';
  document.getElementById('progTitle').textContent = 'Generating Certificates…';
  document.getElementById('progTotalN').textContent = total;
  document.getElementById('progPendN').textContent  = total;
  document.getElementById('progDoneN').textContent  = '0';
  document.getElementById('progPct').textContent    = '0%';
  document.getElementById('progBarFill').style.width = '0%';
  document.getElementById('progRingFill').style.strokeDashoffset = '163';
  document.getElementById('progNameTxt').textContent = 'Starting…';
  pm.classList.add('show');
  await new Promise(r => setTimeout(r, 60));

  function updateProgress(done) {
    const pct = Math.round((done / total) * 100);
    document.getElementById('progDoneN').textContent = done;
    document.getElementById('progPendN').textContent = total - done;
    document.getElementById('progPct').textContent   = pct + '%';
    document.getElementById('progBarFill').style.width = pct + '%';
    document.getElementById('progRingFill').style.strokeDashoffset = 163 - (163 * done / total);
  }

  try {
    const files = []; const usedNames = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const curName = row ? (row[nameKey] || 'Row '+(i+1)) : 'Certificate';
      document.getElementById('progNameTxt').textContent = '('+(i+1)+'/'+total+') '+curName;
      document.getElementById('progStatus').textContent  = 'Processing: '+curName;
      const dataUrl = certRenderFull(row);
      const data    = dataUrlToUint8Array(dataUrl);
      let baseName  = row ? (row[nameKey]||'certificate_'+(i+1)).replace(/[^a-z0-9_\-\s]/gi,'_').trim() : 'certificate';
      if (!baseName) baseName = 'certificate_'+(i+1);
      if (usedNames[baseName]) { usedNames[baseName]++; baseName += '_'+usedNames[baseName]; } else usedNames[baseName] = 1;
      files.push({ name: zipName+'/'+baseName+'.png', data });
      updateProgress(i + 1);
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }
    document.getElementById('progNameTxt').textContent = 'Packing ZIP…';
    document.getElementById('progStatus').textContent  = 'Almost done!';
    document.getElementById('progNameIc').textContent  = '📦';
    await new Promise(r => setTimeout(r, 40));

    const blob = buildZipBlob(files);
    _gdriveStoreBlob(blob, zipName + '.zip');

    progGen.style.display = 'none'; progDone.style.display = 'block';
    document.getElementById('progDoneTitle').textContent = '🎉 All '+total+' Certificates Ready!';
    document.getElementById('progDoneSub').textContent   = 'Uploading to Google Drive…';
    document.getElementById('progSumCerts').textContent  = total;
    document.getElementById('progSumFile').textContent   = zipName + '.zip';
    if (U) { U.stats=U.stats||{}; U.stats.exports=(U.stats.exports||0)+total; persist(); updateStats(); }

    await _gdriveDoUpload(blob, zipName + '.zip');

  } catch(err) {
    console.error(err);
    pm.classList.remove('show');
    showToast('Error: '+err.message, 'err');
  }
}

// ---- "Save to Google Drive" button in done modal ----
async function triggerDriveUploadFromModal() {
  if (!_gdriveLastBlob) { showToast('No ZIP ready — generate one first','info'); return; }
  if (!localStorage.getItem('nova_gdrive_script_url')) {
    _gdrivePendingCallback = () => _gdriveDoUpload(_gdriveLastBlob, _gdriveLastName);
    openGDriveModal();
    return;
  }
  await _gdriveDoUpload(_gdriveLastBlob, _gdriveLastName);
}

// ---- Core upload via Apps Script relay ----
async function _gdriveDoUpload(blob, filename) {
  const scriptUrl = localStorage.getItem('nova_gdrive_script_url');
  if (!scriptUrl) {
    _gdrivePendingCallback = () => _gdriveDoUpload(blob, filename);
    openGDriveModal(); return;
  }

  const btn = document.getElementById('progDriveBtn');
  const origHtml = btn ? btn.innerHTML : '';

  try {
    if (btn) { btn.innerHTML = '⬆️ Uploading…'; btn.disabled = true; }
    showToast('Uploading to Google Drive…','info');

    // Extract folder ID from folder link (if provided)
    const folderRaw = localStorage.getItem('nova_gdrive_folder_id') || '';
    const folderMatch = folderRaw.match(/folders\/([a-zA-Z0-9_-]+)/);
    const folderId = folderMatch ? folderMatch[1] : folderRaw.trim();

    // Convert blob → base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('FileReader failed'));
      r.readAsDataURL(blob);
    });

    // POST to Apps Script (application/x-www-form-urlencoded — simple request, no CORS preflight)
    const body = new URLSearchParams({ filename, filedata: base64, folderid: folderId });
    const resp = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    let result = null;
    try { result = await resp.json(); } catch(e) {}

    if (result && result.ok) {
      if (btn) { btn.innerHTML = '✅ Uploaded!'; btn.style.background = '#0f9d58'; btn.disabled = false; setTimeout(() => { btn.innerHTML = origHtml; btn.style.background = '#1a73e8'; }, 4000); }
      document.getElementById('progDoneSub').textContent = '✅ Uploaded to Google Drive!';
      showToast('✅ Uploaded to Google Drive!','ok');
      if (result.url) window.open(result.url, '_blank');
    } else if (result && !result.ok) {
      throw new Error(result.error || 'Apps Script returned an error');
    } else {
      // Apps Script redirected (no-cors fallback) — can't read response but request went through
      if (btn) { btn.innerHTML = '✅ Sent!'; btn.style.background = '#0f9d58'; btn.disabled = false; setTimeout(() => { btn.innerHTML = origHtml; btn.style.background = '#1a73e8'; }, 4000); }
      document.getElementById('progDoneSub').textContent = '✅ Sent to Google Drive — check your Drive folder.';
      showToast('✅ File sent — check your Google Drive folder','ok');
    }

  } catch(err) {
    console.error('Drive upload error:', err);
    if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
    // If CORS error, the request still likely went through via redirect
    if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      if (btn) { btn.innerHTML = '✅ Sent!'; btn.style.background = '#0f9d58'; btn.disabled = false; setTimeout(() => { btn.innerHTML = origHtml; btn.style.background = '#1a73e8'; }, 4000); }
      document.getElementById('progDoneSub').textContent = '✅ Sent — check your Google Drive.';
      showToast('File sent — check your Google Drive folder','ok');
    } else {
      showToast('Drive error: '+err.message,'err');
    }
  }
}

// ---- Modal open / close / save ----
function openGDriveModal() {
  const el = document.getElementById('gdriveModal');
  el.style.display = 'flex';
  const savedUrl    = localStorage.getItem('nova_gdrive_script_url') || '';
  const savedFolder = localStorage.getItem('nova_gdrive_folder_id')  || '';
  document.getElementById('gdriveScriptUrlInp').value = savedUrl;
  document.getElementById('gdriveFolderInp').value    = savedFolder;
}

function closeGDriveModal() {
  document.getElementById('gdriveModal').style.display = 'none';
  _gdrivePendingCallback = null;
}

function saveGDriveScriptUrl() {
  const url    = document.getElementById('gdriveScriptUrlInp').value.trim();
  const folder = document.getElementById('gdriveFolderInp').value.trim();
  if (!url) { showToast('Please paste your Apps Script Web App URL','info'); return; }
  if (!url.includes('script.google.com/macros/s/')) {
    showToast('That doesn\'t look like an Apps Script URL — please check','info'); return;
  }
  localStorage.setItem('nova_gdrive_script_url', url);
  localStorage.setItem('nova_gdrive_folder_id',  folder);
  document.getElementById('gdriveModal').style.display = 'none';
  if (_gdrivePendingCallback) { const cb = _gdrivePendingCallback; _gdrivePendingCallback = null; cb(); }
  else { showToast('Google Drive connected ✓','ok'); }
}

function gdriveCopyScript() {
  const code = document.getElementById('gdriveScriptCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('gdriveCopyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// ---- Reset ----
function vfyReset() {
  VFY.csvNames=[]; VFY.certFiles=[]; VFY.results=[]; VFY.csvReady=false; VFY.zipReady=false; VFY.filter='all';
  ['vfyCsvZone','vfyZipZone'].forEach(id => document.getElementById(id)?.classList.remove('loaded'));
  document.getElementById('vfyEmptyState').style.display = 'flex';
  document.getElementById('vfyResultsContent').style.display = 'none';
  document.getElementById('vfyResetRow').style.display = 'none';
  document.getElementById('vfyRunBtn').disabled = true;
  document.getElementById('vfyRunBtn').classList.remove('ready');
  document.getElementById('vfyRunBtn').textContent = '🔍 Run Verification';
}

function openVerifyModal()  {
  document.getElementById('verifyModal').classList.add('show');
}
function closeVerifyModal() {
  document.getElementById('verifyModal').classList.remove('show');
}

// ============================================================
// PROJECTS SYSTEM
// ============================================================
const PROJ_KEY     = 'nova_projects';      // kept for legacy cache key
const PROJ_BIN_KEY = 'nova_projects_bin';  // kept for legacy cache key
const PROJ_LIMIT   = 20;
let projShowBin    = false;

// ── Firestore project helpers ──
// All project data lives in: users/{email}/projects/{id}
// Bin lives in:              users/{email}/bin/{id}

function _projCol()    { return fbDb.collection('users').doc(U.email).collection('projects'); }
function _projBinCol() { return fbDb.collection('users').doc(U.email).collection('bin'); }

// Returns array of projects (sorted newest first). Falls back to localStorage if offline/demo.
async function projLoad() {
  if (!U || !U.email || U.email === 'demo@nova.studio') {
    return JSON.parse(localStorage.getItem(PROJ_KEY) || '[]');
  }
  try {
    const snap = await _projCol().orderBy('updatedAt','desc').get();
    const arr  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(arr)); } catch(e){}
    return arr;
  } catch(e) {
    console.warn('projLoad offline fallback:', e);
    return JSON.parse(localStorage.getItem(PROJ_KEY) || '[]');
  }
}

// Saves the FULL projects array by writing each doc. Used after delete/restore.
async function projSave(arr) {
  if (!U || !U.email || U.email === 'demo@nova.studio') {
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(arr)); } catch(e){} return;
  }
  // Firestore: overwrite each doc individually (batch for safety)
  const batch = fbDb.batch();
  const col   = _projCol();
  // Delete everything then re-add is expensive — instead just update changed docs.
  arr.forEach(p => { batch.set(col.doc(p.id), p); });
  try { await batch.commit(); } catch(e) { console.warn('projSave error:', e); }
  try { localStorage.setItem(PROJ_KEY, JSON.stringify(arr)); } catch(e){}
}

// Save a SINGLE project doc (used on create/update — faster than projSave).
async function projSaveOne(proj) {
  if (!U || !U.email || U.email === 'demo@nova.studio') {
    const arr = JSON.parse(localStorage.getItem(PROJ_KEY) || '[]');
    const i   = arr.findIndex(p => p.id === proj.id);
    if (i >= 0) arr[i] = proj; else arr.unshift(proj);
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(arr)); } catch(e){} return;
  }
  try { await _projCol().doc(proj.id).set(proj); } catch(e) { console.warn('projSaveOne:', e); }
}

// Delete a SINGLE project doc.
async function projDeleteOne(id) {
  if (!U || !U.email || U.email === 'demo@nova.studio') return;
  try { await _projCol().doc(id).delete(); } catch(e) { console.warn('projDeleteOne:', e); }
}

async function projBinLoad() {
  if (!U || !U.email || U.email === 'demo@nova.studio') {
    return JSON.parse(localStorage.getItem(PROJ_BIN_KEY) || '[]');
  }
  try {
    const snap = await _projBinCol().orderBy('updatedAt','desc').get();
    const arr  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    try { localStorage.setItem(PROJ_BIN_KEY, JSON.stringify(arr)); } catch(e){}
    return arr;
  } catch(e) {
    return JSON.parse(localStorage.getItem(PROJ_BIN_KEY) || '[]');
  }
}

async function projBinSave(arr) {
  if (!U || !U.email || U.email === 'demo@nova.studio') {
    try { localStorage.setItem(PROJ_BIN_KEY, JSON.stringify(arr)); } catch(e){} return;
  }
  const batch = fbDb.batch();
  const col   = _projBinCol();
  arr.forEach(p => { batch.set(col.doc(p.id), p); });
  try { await batch.commit(); } catch(e) { console.warn('projBinSave:', e); }
  try { localStorage.setItem(PROJ_BIN_KEY, JSON.stringify(arr)); } catch(e){}
}

async function projBinSaveOne(proj) {
  if (!U || !U.email || U.email === 'demo@nova.studio') return;
  try { await _projBinCol().doc(proj.id).set(proj); } catch(e){}
}

async function projBinDeleteOne(id) {
  if (!U || !U.email || U.email === 'demo@nova.studio') return;
  try { await _projBinCol().doc(id).delete(); } catch(e){}
}

function projSaveCurrent() {
  const projects = projLoad();
  if (projects.length >= PROJ_LIMIT) {
    showToast('Project limit reached (20). Delete a project to free up space.', 'err');
    return;
  }
  // Pre-fill input if on cert view
  const inp = document.getElementById('projSaveNameInp');
  inp.value = '';
  document.getElementById('projSaveModal').classList.add('show');
  setTimeout(() => inp.focus(), 80);
}

async function projConfirmSave() {
  const name = document.getElementById('projSaveNameInp').value.trim();
  if (!name) { showToast('Please enter a project name', 'info'); return; }
  const projects = await projLoad();
  if (projects.length >= PROJ_LIMIT) {
    showToast('Project limit reached (20)', 'err');
    document.getElementById('projSaveModal').classList.remove('show');
    return;
  }

  // Thumbnail — small JPEG preview
  let thumb = null;
  try {
    const canvas = document.getElementById('certCanvas');
    if (canvas && canvas.width > 0) {
      const tmp = document.createElement('canvas');
      const tw = 260;
      tmp.width = tw;
      tmp.height = Math.round(tw * canvas.height / canvas.width);
      tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
      thumb = tmp.toDataURL('image/jpeg', 0.35);
    }
  } catch(e) {}

  const snapshot = {
    bgFit: C.bgFit, bgOpacity: C.bgOpacity, bgColor: C.bgColor,
    cw: C.cw, ch: C.ch,
    logoX: C.logoX, logoY: C.logoY, logoW: C.logoW, logoH: C.logoH,
    elements: JSON.parse(JSON.stringify(C.elements)),
    nextId: C.nextId,
    hadBg: !!C.bgDataUrl, hadLogo: !!C.logoDataUrl
  };

  const proj = {
    id: Date.now().toString(),
    name, thumb, snapshot,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  showToast('Saving…', 'info');
  try {
    await projSaveOne(proj);
  } catch(e) {
    showToast('Save failed: ' + e.message, 'err');
    return;
  }

  document.getElementById('projSaveModal').classList.remove('show');
  showToast('Project "' + name + '" saved ✓', 'ok');
  logAct('📁 ' + name, 'Saved');
  if (U) { U.stats = U.stats||{}; U.stats.exports=(U.stats.exports||0)+1; persist(); updateStats(); }
  await projRender();
  const stg = stgGetSettings();
  const allProjs = await projLoad();
  if (stg.projWarn !== false && allProjs.length >= 18) {
    showToast('⚠️ You have ' + allProjs.length + '/20 project slots used', 'info');
  }
}

async function projRender() {
  const projects = await projLoad();
  const bin      = await projBinLoad();
  const grid     = document.getElementById('projGrid');
  const empty    = document.getElementById('projEmpty');
  const binEmpty = document.getElementById('projBinEmpty');
  const limitBar = document.getElementById('projLimitBar');
  const binBar   = document.getElementById('projBinBar');
  const binBtn   = document.getElementById('projBinBtn');

  // Update bin badge
  const binCountEl = document.getElementById('projBinCount');
  if (bin.length > 0) { binCountEl.textContent = bin.length; binCountEl.style.display='inline'; }
  else binCountEl.style.display='none';

  // Show/hide bin bar
  binBar.style.display  = projShowBin ? 'flex' : 'none';

  // Limit bar
  limitBar.style.display = projects.length > 0 ? 'flex' : 'none';
  document.getElementById('projLimitFill').style.width = (projects.length / PROJ_LIMIT * 100) + '%';
  document.getElementById('projLimitFill').style.background = projects.length >= 18 ? 'var(--coral)' : projects.length >= 15 ? '#f59e0b' : 'linear-gradient(90deg,var(--lime),var(--teal))';
  document.getElementById('projLimitTxt').textContent = projects.length + ' / ' + PROJ_LIMIT;

  const list = projShowBin ? bin : projects;

  if (list.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (projShowBin) { binEmpty.style.display='flex'; empty.style.display='none'; }
    else { empty.style.display='flex'; binEmpty.style.display='none'; }
    return;
  }
  empty.style.display = 'none';
  binEmpty.style.display = 'none';
  grid.style.display = 'grid';

  grid.innerHTML = list.map(p => {
    const date = new Date(p.updatedAt).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
    const thumbHtml = p.thumb
      ? `<img src="${p.thumb}" alt="${p.name}">`
      : `<div class="proj-thumb-placeholder">📄</div>`;
    if (projShowBin) {
      return `<div class="proj-card">
        <div class="proj-thumb">${thumbHtml}</div>
        <div class="proj-body">
          <div class="proj-name">${p.name}</div>
          <div class="proj-meta"><span>Deleted</span><span class="proj-meta-dot"></span><span>${date}</span></div>
        </div>
        <div class="proj-actions">
          <button class="proj-act-btn restore" onclick="projRestore('${p.id}')">↩ Restore</button>
          <button class="proj-act-btn danger" onclick="projPermDelete('${p.id}')">🗑 Delete</button>
        </div>
      </div>`;
    }
    return `<div class="proj-card">
      <div class="proj-thumb">
        ${thumbHtml}
        <div class="proj-thumb-overlay">
          <button class="proj-thumb-btn" onclick="projLoadDesign('${p.id}')">✏️ Open</button>
          <button class="proj-thumb-btn" onclick="projDownloadThumb('${p.id}')">⬇ Download</button>
        </div>
      </div>
      <div class="proj-body">
        <div class="proj-name">${p.name}</div>
        <div class="proj-meta"><span>Certificate</span><span class="proj-meta-dot"></span><span>${date}</span></div>
      </div>
      <div class="proj-actions">
        <button class="proj-act-btn" onclick="projLoadDesign('${p.id}')">✏️ Open</button>
        <button class="proj-act-btn" onclick="projRename('${p.id}')">✏ Rename</button>
        <button class="proj-act-btn danger" onclick="projDeleteTobin('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');

  // Update settings data counts
  const sc = document.getElementById('stgProjCount');
  const bc = document.getElementById('stgBinCount');
  if (sc) sc.textContent = projects.length;
  if (bc) bc.textContent = bin.length;
}

async function projToggleBin() {
  projShowBin = !projShowBin;
  const btn = document.getElementById('projBinBtn');
  const projCount = (await projLoad()).length;
  const binCount  = (await projBinLoad()).length;
  btn.innerHTML = projShowBin
    ? '📂 Projects <span style="background:var(--lime);color:var(--ink);padding:1px 6px;border-radius:10px;font-size:.6rem;margin-left:3px">' + projCount + '</span>'
    : '🗑️ Bin <span id="projBinCount" style="background:var(--coral);color:#fff;padding:1px 6px;border-radius:10px;font-size:.6rem;margin-left:3px;' + (binCount>0?'':'display:none') + '">' + binCount + '</span>';
  projRender();
}

async function projDeleteTobin(id) {
  const projects = await projLoad();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return;
  const [removed] = projects.splice(idx, 1);
  await projDeleteOne(id);
  await projBinSaveOne(removed);
  showToast('"' + removed.name + '" moved to Bin', 'info');
  projRender();
}

async function projRestore(id) {
  const bin = await projBinLoad();
  const idx = bin.findIndex(p => p.id === id);
  if (idx === -1) return;
  const projects = await projLoad();
  if (projects.length >= PROJ_LIMIT) { showToast('Cannot restore — project limit (20) reached', 'err'); return; }
  const [restored] = bin.splice(idx, 1);
  await projBinDeleteOne(id);
  await projSaveOne(restored);
  showToast('"' + restored.name + '" restored ✓', 'ok');
  projRender();
}

async function projPermDelete(id) {
  const bin = await projBinLoad();
  const p = bin.find(x => x.id === id);
  if (!p) return;
  if (!confirm('Permanently delete "' + p.name + '"? This cannot be undone.')) return;
  await projBinDeleteOne(id);
  showToast('"' + p.name + '" permanently deleted', 'info');
  projRender();
}

async function projEmptyBin() {
  const bin = await projBinLoad();
  if (bin.length === 0) { showToast('Bin is already empty', 'info'); return; }
  if (!confirm('Permanently delete all ' + bin.length + ' item(s) in the Bin? This cannot be undone.')) return;
  await projBinSave([]);
  // also clear each doc
  if (U && U.email && U.email !== 'demo@nova.studio') {
    const batch = fbDb.batch();
    bin.forEach(p => batch.delete(_projBinCol().doc(p.id)));
    await batch.commit().catch(e => console.warn('emptyBin:', e));
  }
  showToast('Bin emptied ✓', 'ok');
  projRender();
}

async function projRename(id) {
  const projects = await projLoad();
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const newName = prompt('Rename project:', p.name);
  if (!newName || !newName.trim()) return;
  p.name = newName.trim();
  p.updatedAt = new Date().toISOString();
  await projSaveOne(p);
  projRender();
  showToast('Renamed to "' + p.name + '" ✓', 'ok');
}

async function projLoadDesign(id) {
  const projects = await projLoad();
  const p = projects.find(x => x.id === id);
  if (!p || !p.snapshot) { showToast('Could not load project', 'err'); return; }
  const s = p.snapshot;
  // Restore state (images not stored — user needs to re-upload bg/logo)
  C.bgDataUrl   = null;
  C.bgImage     = null;
  C.bgFit       = s.bgFit      || 'stretch';
  C.bgOpacity   = s.bgOpacity  ?? 1;
  C.bgColor     = s.bgColor    || '#ffffff';
  C.cw          = s.cw         || 3508;
  C.ch          = s.ch         || 2481;
  C.logoDataUrl = null;
  C.logoImage   = null;
  C.logoX       = s.logoX      ?? 0.05;
  C.logoY       = s.logoY      ?? 0.05;
  C.logoW       = s.logoW      ?? 0.18;
  C.logoH       = s.logoH      ?? 0.1;
  C.elements    = s.elements   || [];
  C.nextId      = s.nextId     || 1;
  C.selId       = null;
  certRenderElList();
  certUpdateCanvasSize();
  certDraw();
  launchTool('cert');
  let msg = 'Loaded "' + p.name + '" ✓';
  if (s.hadBg || s.hadLogo) msg += ' — please re-upload background/logo image';
  showToast(msg, s.hadBg || s.hadLogo ? 'info' : 'ok');
  logAct('📁 ' + p.name, 'Opened');
}

async function projDownloadThumb(id) {
  const projects = await projLoad();
  const p = projects.find(x => x.id === id);
  if (!p || !p.thumb) { showToast('No preview available', 'info'); return; }
  const a = document.createElement('a');
  a.href = p.thumb;
  a.download = p.name.replace(/[^a-z0-9_\-\s]/gi,'_') + '_preview.jpg';
  a.click();
}

async function projExportBackup() {
  const projects = await projLoad();
  const bin = await projBinLoad();
  const data = { version: 1, exportedAt: new Date().toISOString(), projects, bin };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nova_projects_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Backup exported ✓', 'ok');
}

function projImportBackup(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.projects) throw new Error('Invalid backup file');
      const existing = await projLoad();
      const merged = [...data.projects, ...existing]
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
        .slice(0, PROJ_LIMIT);
      await projSave(merged);
      if (data.bin) await projBinSave(data.bin);
      projRender();
      showToast('Imported ' + data.projects.length + ' project(s) ✓', 'ok');
    } catch(err) {
      showToast('Import failed: ' + err.message, 'err');
    }
    inp.value = '';
  };
  r.readAsText(f);
}

// ============================================================
// SETTINGS SYSTEM
// ============================================================
const STG_KEY = 'nova_settings';

const STG_DEFAULTS = {
  theme: 'light',
  accent: 'lime',
  sidebar: 'full',
  animations: true,
  dense: false,
  canvasSize: '3508x2481',
  autosave: false,
  showGrid: false,
  snapGrid: false,
  exportFmt: 'png',
  toasts: true,
  exportAlert: true,
  projWarn: true,
  activity: true,
  showProfile: true,
  rememberLogin: true,
  analytics: false
};

function stgGetSettings() {
  return { ...STG_DEFAULTS, ...JSON.parse(localStorage.getItem(STG_KEY) || '{}') };
}

function stgSaveKey(key, val) {
  const s = stgGetSettings();
  s[key] = val;
  localStorage.setItem(STG_KEY, JSON.stringify(s));
}

function stgSave() {
  const s = stgGetSettings();
  s.canvasSize = document.getElementById('stgCanvasSize')?.value || s.canvasSize;
  s.exportFmt  = document.getElementById('stgExportFmt')?.value  || s.exportFmt;
  localStorage.setItem(STG_KEY, JSON.stringify(s));
}

function stgToggle(key) {
  const s = stgGetSettings();
  s[key] = !s[key];
  localStorage.setItem(STG_KEY, JSON.stringify(s));
  stgApplyUI(s);
  showToast((s[key] ? 'Enabled' : 'Disabled') + ': ' + key.replace(/([A-Z])/g,' $1').toLowerCase(), 'info');
}

function stgSetTheme(t) {
  stgSaveKey('theme', t);
  stgApplyUI(stgGetSettings());
  showToast('Theme set to ' + t, 'ok');
}

function stgSetAccent(a) {
  stgSaveKey('accent', a);
  stgApplyUI(stgGetSettings());
  showToast('Accent color updated ✓', 'ok');
}

function stgSetSidebar(v) {
  stgSaveKey('sidebar', v);
  stgApplyUI(stgGetSettings());
}

function stgApplyUI(s) {
  // ── Theme buttons UI ──
  ['light','dark','system'].forEach(t => {
    document.getElementById('stgTheme'+t[0].toUpperCase()+t.slice(1))?.classList.toggle('active', s.theme===t);
  });

  // ── Apply theme to <html> ──
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = s.theme === 'dark' || (s.theme === 'system' && prefersDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

  // ── Accent color — set data-accent on <html>, CSS handles the rest ──
  ['lime','teal','violet','blue','coral'].forEach(a => {
    document.getElementById('ac'+a[0].toUpperCase()+a.slice(1))?.classList.toggle('active', s.accent===a);
  });
  document.documentElement.setAttribute('data-accent', s.accent || 'lime');

  // ── Sidebar ──
  document.getElementById('stgSbCompact')?.classList.toggle('active', s.sidebar==='compact');
  document.getElementById('stgSbFull')?.classList.toggle('active', s.sidebar==='full');
  document.documentElement.style.setProperty('--sb', s.sidebar==='compact' ? '180px' : '230px');

  // ── Animations — add/remove class on body ──
  document.body.classList.toggle('no-animations', !s.animations);

  // ── Dense mode ──
  document.body.classList.toggle('dense', !!s.dense);

  // ── Toggles UI ──
  const toggleMap = {
    animations:'stgAnimToggle', dense:'stgDenseToggle', autosave:'stgAutosaveToggle',
    showGrid:'stgGridToggle', snapGrid:'stgSnapToggle', toasts:'stgToastToggle',
    exportAlert:'stgExportAlertToggle', projWarn:'stgProjWarnToggle', activity:'stgActivityToggle',
    showProfile:'stgShowProfileToggle', rememberLogin:'stgRememberToggle', analytics:'stgAnalyticsToggle'
  };
  for (const [key, id] of Object.entries(toggleMap)) {
    document.getElementById(id)?.classList.toggle('on', !!s[key]);
  }

  // ── Select values ──
  const cs = document.getElementById('stgCanvasSize');
  if (cs) cs.value = s.canvasSize;
  const ef = document.getElementById('stgExportFmt');
  if (ef) ef.value = s.exportFmt;

  // ── Redraw canvas if open (grid lines may have changed) ──
  try { certDraw(); } catch(e) {}

  // ── Storage info ──
  stgUpdateStorageInfo();
}

async function stgUpdateStorageInfo() {
  // Show localStorage usage for settings/cache only (projects now in Firestore)
  try {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) total += (localStorage[key].length + key.length) * 2;
    }
    const kb = (total / 1024).toFixed(1);
    const pct = Math.min((total / (5 * 1024 * 1024)) * 100, 100);
    const el = document.getElementById('stgStorageUsed');
    const bar = document.getElementById('stgStorageBar');
    if (el) el.textContent = kb + ' KB (cache)';
    if (bar) bar.style.width = pct + '%';
  } catch(e) {}
  const projects = await projLoad();
  const bin      = await projBinLoad();
  const sc = document.getElementById('stgProjCount');
  const bc = document.getElementById('stgBinCount');
  if (sc) sc.textContent = projects.length;
  if (bc) bc.textContent = bin.length;
}

function stgTab(tab) {
  ['appearance','workspace','notifications','privacy','data','integrations'].forEach(t => {
    document.getElementById('stp'+t[0].toUpperCase()+t.slice(1))?.style && (document.getElementById('stp'+t[0].toUpperCase()+t.slice(1)).style.display = t===tab ? '' : 'none');
    document.getElementById('stn'+t[0].toUpperCase()+t.slice(1))?.classList.toggle('active', t===tab);
  });
  if (tab === 'data') stgUpdateStorageInfo();
  if (tab === 'integrations') ejsLoadKeys();
}

// ── Brevo Template Defaults ──
var BREVO_DEFAULT_SUBJECT = 'Your Certificate — {{college}}';
var BREVO_DEFAULT_BODY =
'<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:0;background:#f4f6fa">' +
  '<div style="background:linear-gradient(135deg,#1a1f27,#2d3340);padding:32px 36px;border-radius:12px 12px 0 0;text-align:center">' +
    '<h1 style="color:#c8f135;font-size:1.6rem;margin:0;letter-spacing:-.02em">🏆 Congratulations!</h1>' +
  '</div>' +
  '<div style="background:#fff;padding:32px 36px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:1rem;color:#1a1f27;margin:0 0 12px">Dear <strong>{{name}}</strong>,</p>' +
    '<p style="color:#444;line-height:1.7;margin:0 0 20px">We are pleased to present you with your certificate of participation for <strong>{{college}}</strong>. Please find your certificate attached to this email.</p>' +
    '<div style="background:#f4f6fa;border-left:4px solid #c8f135;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px">' +
      '<p style="margin:0;font-size:.8rem;color:#666">Certificate ID: <strong style="color:#1a1f27;font-family:monospace">{{certId}}</strong></p>' +
    '</div>' +
    '<p style="color:#444;line-height:1.7;margin:0 0 28px">Keep this certificate as a record of your achievement. Wishing you continued success!</p>' +
    '<p style="color:#888;font-size:.85rem;margin:0">Warm regards,<br><strong style="color:#1a1f27">{{senderName}}</strong></p>' +
  '</div>' +
  '<p style="text-align:center;color:#aaa;font-size:.7rem;margin:16px 0 0">Sent via NOVA Studio</p>' +
'</div>';

function brevoRenderSubject(candidate, senderName) {
  var tpl = localStorage.getItem('brevo_subject') || BREVO_DEFAULT_SUBJECT;
  return tpl
    .replace(/{{name}}/g,       candidate.name     || 'Participant')
    .replace(/{{college}}/g,    candidate.college  || 'Programme')
    .replace(/{{email}}/g,      candidate.email    || '')
    .replace(/{{gender}}/g,     candidate.gender   || '')
    .replace(/{{senderName}}/g, senderName         || 'NOVA Studio');
}

function brevoRenderTemplate(candidate, certId, senderName) {
  var tpl = localStorage.getItem('brevo_template') || BREVO_DEFAULT_BODY;
  return tpl
    .replace(/{{name}}/g,       candidate.name     || 'Participant')
    .replace(/{{college}}/g,    candidate.college  || 'Programme')
    .replace(/{{email}}/g,      candidate.email    || '')
    .replace(/{{gender}}/g,     candidate.gender   || '')
    .replace(/{{certId}}/g,     certId             || '')
    .replace(/{{senderName}}/g, senderName         || 'NOVA Studio');
}

// ── Brevo Key Management ──
function ejsLoadKeys() { brevoLoadKeys(); stgDriveLoad(); } // alias for stgTab call

function brevoLoadKeys() {
  var ak = document.getElementById('brevoApiKey');
  var se = document.getElementById('brevoSenderEmail');
  var sn = document.getElementById('brevoSenderName');
  if (ak) ak.value = localStorage.getItem('brevo_api_key')      || '';
  if (se) se.value = localStorage.getItem('brevo_sender_email') || (U && U.email ? U.email : '');
  if (sn) sn.value = localStorage.getItem('brevo_sender_name')  || (U ? ((U.firstName||'') + ' ' + (U.lastName||'')).trim() : 'NOVA Studio');
  // Load template fields
  var subj = document.getElementById('brevoSubject');
  var body = document.getElementById('brevoBodyTpl');
  if (subj) subj.value = localStorage.getItem('brevo_subject')  || BREVO_DEFAULT_SUBJECT;
  if (body) body.value = localStorage.getItem('brevo_template') || BREVO_DEFAULT_BODY;
  brevoUpdateStatus();
}

function brevoSaveTemplate() {
  var subj = document.getElementById('brevoSubject')?.value.trim();
  var body = document.getElementById('brevoBodyTpl')?.value.trim();
  if (!subj) { showToast('Subject cannot be empty', 'err'); return; }
  if (!body) { showToast('Body cannot be empty', 'err'); return; }
  localStorage.setItem('brevo_subject',  subj);
  localStorage.setItem('brevo_template', body);
  showToast('Email template saved ✓', 'ok');
}

function brevoResetTemplate() {
  if (!confirm('Reset to the default email template?')) return;
  localStorage.removeItem('brevo_subject');
  localStorage.removeItem('brevo_template');
  var subj = document.getElementById('brevoSubject');
  var body = document.getElementById('brevoBodyTpl');
  if (subj) subj.value = BREVO_DEFAULT_SUBJECT;
  if (body) body.value = BREVO_DEFAULT_BODY;
  showToast('Template reset to default ✓', 'ok');
}

function brevoPreviewTemplate() {
  var subjTpl = document.getElementById('brevoSubject')?.value || localStorage.getItem('brevo_subject') || BREVO_DEFAULT_SUBJECT;
  var bodyTpl = document.getElementById('brevoBodyTpl')?.value || localStorage.getItem('brevo_template') || BREVO_DEFAULT_BODY;
  var sampleCandidate = { name: 'Priya Sharma', college: 'Data Science Summit 2025', email: 'priya@example.com', gender: 'Female' };
  var sampleCertId    = 'BFSI-20250423-123456';
  var sampleSender    = localStorage.getItem('brevo_sender_name') || (U ? ((U.firstName||'')+ ' '+(U.lastName||'')).trim() : 'NOVA Studio');
  var renderedSubj = subjTpl.replace(/{{name}}/g, sampleCandidate.name).replace(/{{college}}/g, sampleCandidate.college).replace(/{{email}}/g, sampleCandidate.email).replace(/{{gender}}/g, sampleCandidate.gender).replace(/{{certId}}/g, sampleCertId).replace(/{{senderName}}/g, sampleSender);
  var renderedBody = bodyTpl.replace(/{{name}}/g, sampleCandidate.name).replace(/{{college}}/g, sampleCandidate.college).replace(/{{email}}/g, sampleCandidate.email).replace(/{{gender}}/g, sampleCandidate.gender).replace(/{{certId}}/g, sampleCertId).replace(/{{senderName}}/g, sampleSender);
  document.getElementById('brevoPreviewSubject').textContent = renderedSubj;
  document.getElementById('brevoPreviewBody').innerHTML = renderedBody;
  document.getElementById('brevoPreviewModal').style.display = 'flex';
}

function brevoSaveKeys() {
  var ak = document.getElementById('brevoApiKey')?.value.trim();
  var se = document.getElementById('brevoSenderEmail')?.value.trim();
  var sn = document.getElementById('brevoSenderName')?.value.trim();
  if (!ak) { showToast('Please enter your Brevo API key', 'err'); return; }
  if (!se) { showToast('Please enter a sender email address', 'err'); return; }
  localStorage.setItem('brevo_api_key',      ak);
  localStorage.setItem('brevo_sender_email', se);
  localStorage.setItem('brevo_sender_name',  sn || 'NOVA Studio');
  BREVO_API_KEY = ak;
  brevoUpdateStatus();
  showToast('Brevo keys saved ✓ — Certificate Mailer is ready!', 'ok');
}

function brevoUpdateStatus() {
  var el = document.getElementById('brevoStatus');
  if (!el) return;
  var configured = !!localStorage.getItem('brevo_api_key');
  el.style.display = 'block';
  if (configured) {
    el.style.cssText += ';background:rgba(34,197,94,.1);color:#15803d;border:1px solid rgba(34,197,94,.25)';
    el.innerHTML = '✅ Brevo is configured — certificates will be sent as email attachments (PNG).';
  } else {
    el.style.cssText += ';background:rgba(251,191,36,.1);color:#b45309;border:1px solid rgba(251,191,36,.3)';
    el.innerHTML = '⚠️ Not configured yet — enter your Brevo API key above and click Save.';
  }
}

async function brevoTestSend() {
  var ak = localStorage.getItem('brevo_api_key');
  var se = localStorage.getItem('brevo_sender_email') || (U && U.email);
  var sn = localStorage.getItem('brevo_sender_name')  || 'NOVA Studio';
  if (!ak) { showToast('Save your Brevo API key first', 'err'); return; }
  if (!U || !U.email) { showToast('Please log in first to test', 'err'); return; }
  showToast('Sending test email to ' + U.email + '…', 'info');
  try {
    var resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': ak, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: sn, email: se },
        to:          [{ email: U.email, name: U.firstName || 'Test User' }],
        subject:     '✅ NOVA Studio — Brevo Test Email',
        htmlContent: '<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px"><h2>🎉 Brevo is working!</h2><p>Your certificate mailer is configured correctly.</p><p>Certificates will be sent as <b>PNG attachments</b> with each email.</p><p style="color:#888;font-size:.85em">Sent from NOVA Studio via Brevo</p></div>'
      })
    });
    if (resp.ok) {
      showToast('Test email sent to ' + U.email + ' ✓ Check your inbox!', 'ok');
    } else {
      var err = await resp.json().catch(function(){ return {}; });
      showToast('Test failed: ' + (err.message || 'status ' + resp.status), 'err');
    }
  } catch(e) {
    showToast('Test failed: ' + (e.message || String(e)), 'err');
  }
}

async function stgClearProjects() {
  if (!confirm('Permanently delete ALL saved projects? This cannot be undone.')) return;
  const projects = await projLoad();
  if (U && U.email && U.email !== 'demo@nova.studio') {
    const batch = fbDb.batch();
    projects.forEach(p => batch.delete(_projCol().doc(p.id)));
    await batch.commit().catch(e => console.warn('clearProjects:', e));
  }
  try { localStorage.removeItem(PROJ_KEY); } catch(e){}
  projRender();
  showToast('All projects cleared', 'info');
  stgUpdateStorageInfo();
}

function stgReset() {
  if (!confirm('Reset all settings to defaults?')) return;
  localStorage.removeItem(STG_KEY);
  stgApplyUI(STG_DEFAULTS);
  showToast('Settings reset to defaults ✓', 'ok');
}

function stgChangePassword() {
  const curr = prompt('Enter current password:');
  if (!curr) return;
  const user = fbAuth.currentUser;
  if (!user) { showToast('Please sign in again to change password', 'err'); return; }
  // Re-authenticate then update
  const cred = firebase.auth.EmailAuthProvider.credential(user.email, curr);
  user.reauthenticateWithCredential(cred)
    .then(function() {
      const np = prompt('Enter new password (min 6 chars):');
      if (!np || np.length < 6) { showToast('Password too short', 'err'); return Promise.reject('short'); }
      const np2 = prompt('Confirm new password:');
      if (np !== np2) { showToast('Passwords do not match', 'err'); return Promise.reject('mismatch'); }
      return user.updatePassword(np);
    })
    .then(function() { showToast('Password changed ✓', 'ok'); })
    .catch(function(err) {
      if (err === 'short' || err === 'mismatch') return;
      const msgs = {
        'auth/wrong-password': 'Current password is incorrect',
        'auth/too-many-requests': 'Too many attempts — try later'
      };
      showToast(msgs[err.code] || (err.message || 'Error'), 'err');
    });
}

// Initialize settings on page load
window.addEventListener('DOMContentLoaded', () => {
  stgApplyUI(stgGetSettings());
});

// ══════════════════════════════════════════════════════════════
//  CERTIFICATE MAILER — Fully integrated into Nova Dashboard
//  Replaces Google Sheet with local Excel/CSV file upload
// ══════════════════════════════════════════════════════════════

const ML = {
  // Canvas state
  certImg: null, certDataUrl: null,
  imgW: 800, imgH: 566,
  scale: 1,
  nameX: 400, nameY: 237, nameW: 440,
  bold: false, italic: false, underline: false,
  dragging: false, dragOffX: 0, dragOffY: 0,
  selected: null,

  // Data
  candidates: [],
  filtered: [],
  rawHeaders: [],

  // Tracker
  tracker: { sent: [], failed: [], startedAt: null, total: 0 },

  // Bulk send
  bulkRunning: false,
  bulkStop: false,
  bulkQueue: [],
  bulkIdx: 0,
  batchCount: 0,
  totalBatchNum: 0,
  isCoolingDown: false,
  cdTimer: null,

  // Layout saved key
  LAYOUT_KEY: 'ml_layout_v1',
};

let mlBG, mlOVR, mlBgCtx, mlOvCtx;

// ══ MISSING HELPER FUNCTIONS (were called but not defined) ══

// ── Console badge (RUNNING / IDLE / DONE) ──
function mlSetConBadge(state) {
  const el = document.getElementById('mlConBadge');
  if (!el) return;
  const map = {
    RUNNING: { label:'RUNNING', bg:'#dcfce7', color:'#16a34a', border:'#86efac' },
    IDLE:    { label:'IDLE',    bg:'#f1f5f9', color:'#64748b', border:'#cbd5e1' },
    DONE:    { label:'DONE',    bg:'#dbeafe', color:'#2563eb', border:'#93c5fd' },
    STOPPED: { label:'STOPPED', bg:'#fef3c7', color:'#d97706', border:'#fcd34d' },
  };
  const s = map[state] || map.IDLE;
  el.textContent = s.label;
  el.style.cssText = `font-size:.6rem;font-weight:700;padding:2px 9px;border-radius:99px;background:${s.bg};color:${s.color};border:1px solid ${s.border}`;
}

// ── Sync status dot ──
function mlSetSync(state, label) {
  const dot  = document.getElementById('mlSyncDot');
  const text = document.getElementById('mlSyncLabel');
  const colors = { syncing:'#f59e0b', ok:'#16a34a', err:'#dc2626', idle:'#b0b8c6' };
  if (dot)  dot.style.background  = colors[state] || colors.idle;
  if (text) text.lastChild && (text.lastChild.textContent = label || state);
}

// ── Set local candidate status ──
function mlSetLocalStatus(rowIndex, status, certId, sentAt, error) {
  const c = ML.candidates.find(x => x.rowIndex === rowIndex);
  if (!c) return;
  c.status = status;
  if (certId  !== '') c.certId = certId;
  if (sentAt  !== '') c.sentAt = sentAt;
  if (error   !== '') c.error  = error;
}

// ── Record a successful send ──
function mlRecordSent(candidate, certId) {
  const ts = new Date().toISOString();
  candidate.status = 'Sent';
  candidate.certId = certId;
  candidate.sentAt = ts;
  candidate.error  = '';
  ML.tracker.sent.push({ name: candidate.name, email: candidate.email, certId: certId, sentAt: ts });
}

// ── Record a failed send ──
function mlRecordFail(candidate, errMsg) {
  candidate.status = 'Failed';
  candidate.error  = errMsg;
  ML.tracker.failed.push({ name: candidate.name, email: candidate.email, error: errMsg });
}

// ── Finish the bulk send run ──
function mlFinishBulk() {
  ML.bulkRunning = false;
  ML.isCoolingDown = false;
  if (ML.cdTimer) { clearInterval(ML.cdTimer); ML.cdTimer = null; }
  mlStopLiveTimer();

  const sendBtn = document.getElementById('mlSendBtn');
  const stopBtn = document.getElementById('mlStopBtn');
  const topBtn  = document.getElementById('mlTopSendBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.style.display = 'none';
  if (topBtn)  topBtn.disabled = false;

  const total  = ML.tracker.sent.length + ML.tracker.failed.length;
  const sent   = ML.tracker.sent.length;
  const failed = ML.tracker.failed.length;

  if (ML.bulkStop) {
    mlSetConBadge('STOPPED');
    mlSetSync('idle', 'Stopped');
    showToast('Dispatch stopped — ' + sent + ' sent', 'info');
  } else {
    mlSetConBadge('DONE');
    mlSetSync('ok', 'Done');
    if (failed === 0) {
      showToast('All ' + sent + ' emails sent ✓', 'ok');
    } else {
      showToast(sent + ' sent, ' + failed + ' failed', failed > 0 ? 'err' : 'ok');
    }
  }
  mlConLog('info', 'Dispatch finished — sent:' + sent + ' failed:' + failed);
  mlRenderList(); mlRenderTracker(); mlUpdateDataStats();
}

// ── Cooldown timer between batches ──
function mlStartCooldown(seconds, batchNum, remaining, onDone) {
  ML.isCoolingDown = true;
  const overlay = document.getElementById('mlCooldownOverlay');
  const secsEl  = document.getElementById('mlCdSecs');
  const batchEl = document.getElementById('mlCdBatch');
  const queueEl = document.getElementById('mlCdQueue');
  const sentEl  = document.getElementById('mlCdSent');
  if (overlay) overlay.classList.add('active');
  if (batchEl) batchEl.textContent = batchNum;
  if (queueEl) queueEl.textContent = remaining;
  if (sentEl)  sentEl.textContent  = 'Sent: ' + ML.tracker.sent.length;
  let left = seconds;
  const tick = () => {
    if (secsEl) secsEl.textContent = left + 's';
    if (left <= 0) {
      clearInterval(ML.cdTimer); ML.cdTimer = null;
      ML.isCoolingDown = false;
      if (overlay) overlay.classList.remove('active');
      onDone && onDone();
    }
    left--;
  };
  tick();
  ML.cdTimer = setInterval(tick, 1000);
}

// ── Live send timer ──
let _mlTimerInterval = null;

function mlStartLiveTimer() {
  const timerRow = document.getElementById('mlTimerRow');
  if (timerRow) timerRow.style.display = 'flex';
  _mlTimerInterval && clearInterval(_mlTimerInterval);
  _mlTimerInterval = setInterval(mlTickLiveTimer, 1000);
  mlTickLiveTimer();
}

function mlStopLiveTimer() {
  if (_mlTimerInterval) { clearInterval(_mlTimerInterval); _mlTimerInterval = null; }
  mlTickLiveTimer(); // final tick
  const progLabel = document.getElementById('mlProgLabel');
  if (progLabel) progLabel.textContent = ML.bulkStop ? 'Stopped' : 'Done ✓';
}

function mlTickLiveTimer() {
  const startedAt = ML.tracker.startedAt;
  if (!startedAt) return;
  const elapsedMs = Date.now() - startedAt.getTime();
  const elapsed   = Math.floor(elapsedMs / 1000);
  const sentSoFar = ML.tracker.sent.length + ML.tracker.failed.length;
  const total     = ML.bulkQueue.length || ML.tracker.total || 1;
  const remaining = total - sentSoFar;
  const pct       = total > 0 ? Math.round(sentSoFar / total * 100) : 0;

  const fmt = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  };

  let etaStr = '—';
  if (sentSoFar > 0 && remaining > 0) {
    const ratePerSec = sentSoFar / (elapsedMs / 1000);
    etaStr = fmt(Math.round(remaining / ratePerSec));
  } else if (remaining === 0 && sentSoFar > 0) {
    etaStr = '✓ Done';
  }

  let rateStr = '—';
  if (elapsedMs > 4000 && sentSoFar > 0) {
    rateStr = ((sentSoFar / elapsedMs) * 60000).toFixed(1) + '/min';
  }

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('mlTimerElapsed', fmt(elapsed));
  setEl('mlTimerEta',     etaStr);
  setEl('mlTimerRate',    rateStr);

  const progLabel = document.getElementById('mlProgLabel');
  if (progLabel && ML.bulkRunning) progLabel.textContent = `Sending ${sentSoFar} / ${total}`;

  const bar = document.getElementById('mlProgBar');
  const lbl = document.getElementById('mlProgPct');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct + '%';

  // Refresh feed stats every tick
  const setCount = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setCount('mlTrSent',    ML.tracker.sent.length);
  setCount('mlTrFailed',  ML.tracker.failed.length);
  setCount('mlTrSending', ML.candidates.filter(c => c.status === 'Sending' || c.status === 'Generating').length);
  const totalC = ML.candidates.length;
  const doneC  = ML.tracker.sent.length + ML.tracker.failed.length;
  setCount('mlTrPending', Math.max(0, totalC - doneC - ML.candidates.filter(c => c.status === 'Sending' || c.status === 'Generating').length));
  setCount('mlTrTotal', totalC);
}

// ── Tab Switching ──
function mlSwitchTab(tab) {
  ['designer','candidates','tracker'].forEach(t => {
    document.getElementById('mlPage'+t[0].toUpperCase()+t.slice(1))?.classList.toggle('active', t===tab);
    document.getElementById('mlTab'+t[0].toUpperCase()+t.slice(1))?.classList.toggle('active', t===tab);
  });
  if (tab==='tracker') { mlRenderTracker(); mlRenderFeed(); }
  if (tab==='candidates') { mlFilterList(); mlPopCollegeFilter(); }
}

// ── HTML Escape Helper ──
function mlEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Save / Load Canvas Layout ──
function mlSaveLayout() {
  const layout = {
    nameX: ML.nameX, nameY: ML.nameY, nameW: ML.nameW,
    bold: ML.bold, italic: ML.italic, underline: ML.underline,
    fontSize:   (document.getElementById('mlFontSize')   || {}).value || 28,
    fontFamily: (document.getElementById('mlFontFamily') || {}).value || 'Bricolage Grotesque',
    color:      (document.getElementById('mlNameColor')  || {}).value || '#0a1628',
    nameCase:   (document.getElementById('mlNameCase')   || {}).value || 'title',
    letterSpacing: (document.getElementById('mlLetterSpacing') || {}).value || 0
  };
  localStorage.setItem(ML.LAYOUT_KEY, JSON.stringify(layout));
  showToast('Layout saved ✓', 'ok');
}
function mlLoadLayout() {
  const raw = localStorage.getItem(ML.LAYOUT_KEY);
  if (!raw) return;
  try {
    const l = JSON.parse(raw);
    ML.nameX = l.nameX || ML.nameX; ML.nameY = l.nameY || ML.nameY; ML.nameW = l.nameW || ML.nameW;
    ML.bold = !!l.bold; ML.italic = !!l.italic; ML.underline = !!l.underline;
    const setEl = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
    setEl('mlFontSize', l.fontSize); setEl('mlFontFamily', l.fontFamily);
    setEl('mlNameColor', l.color); setEl('mlNameColorHex', l.color);
    setEl('mlNameCase', l.nameCase); setEl('mlLetterSpacing', l.letterSpacing);
    const fsVal = document.getElementById('mlFsVal'); if (fsVal) fsVal.textContent = l.fontSize || 28;
    mlRedraw();
  } catch(e) {}
}

// ── Export candidates to Excel ──
function mlExportExcel() {
  if (!ML.candidates.length) { showToast('No data to export', 'info'); return; }
  const rows = ML.candidates.map(c => ({
    Name: c.name, Email: c.email, College: c.college || '',
    Gender: c.gender || '', Status: c.status || 'Pending',
    CertID: c.certId || '', SentAt: c.sentAt || '', Error: c.error || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.writeFile(wb, 'candidates_export.xlsx');
  showToast('Excel exported ✓', 'ok');
}

// ── Edit mode / Add row ──
let mlEditMode = false;
function mlToggleEditMode() {
  mlEditMode = !mlEditMode;
  const btn = document.getElementById('mlEditModeBtn');
  const addBtn = document.getElementById('mlAddRowBtn');
  if (btn) { btn.textContent = mlEditMode ? '✅ Done Editing' : '✏️ Edit Data'; btn.style.background = mlEditMode ? '#f0fdf4' : '#fffbeb'; btn.style.color = mlEditMode ? '#16a34a' : '#b45309'; }
  if (addBtn) addBtn.style.display = mlEditMode ? 'inline-flex' : 'none';
  mlRenderList();
}
function mlAddNewRow() {
  ML.candidates.unshift({ rowIndex: 0, name: 'New Name', email: 'email@example.com', gender: '', college: '', status: 'Pending', certId: '', sentAt: '', error: '', rawRow: {} });
  ML.filtered = ML.candidates.slice();
  mlRenderList(); mlUpdateDataStats();
  showToast('Row added — click to edit', 'info');
}

// ── Skip cooldown ──
function mlSkipCooldown() {
  ML.isCoolingDown = false;
  if (ML.cdTimer) { clearTimeout(ML.cdTimer); ML.cdTimer = null; }
  const overlay = document.getElementById('mlCooldownOverlay');
  if (overlay) overlay.style.display = 'none';
  mlConLog('warn', 'Cooldown skipped by user');
  if (ML.bulkRunning) mlRunNext();
}

// ── emAcc stub (email account modal — not implemented) ──
function emAccLoad() {}
function emAccCloseModal() {
  const m = document.getElementById('emAccModal'); if (m) m.style.display = 'none';
}

// ── Console Log Helper ──
function mlConLog(type, msg) {
  const body = document.getElementById('mlConBody');
  const badge = document.getElementById('mlConBadge');
  if (!body) return;
  const colors = { ok:'#059669', err:'#dc2626', warn:'#d97706', info:'#2563eb' };
  const prefixes = { ok:'✓', err:'✗', warn:'⚠', info:'→' };
  const div = document.createElement('div');
  div.style.color = colors[type] || '#6d28d9';
  const ts = new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  div.textContent = '[' + ts + '] ' + (prefixes[type]||'•') + ' ' + msg;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  if (badge) {
    const cls = { ok:'ml-cb-ok', err:'ml-cb-err', warn:'ml-cb-warn', info:'ml-cb-run' };
    const lbl = { ok:'OK', err:'ERROR', warn:'WARN', info:'RUNNING' };
    badge.textContent = lbl[type] || 'ACTIVE';
    badge.className = 'ml-con-badge ' + (cls[type] || 'ml-cb-run');
  }
  // Track Gmail sends for dashboard counter
  if (type === 'ok' && msg.includes('Sent via Gmail')) {
    _getGmailTrack().then(function(stored) {
      stored.sent = (stored.sent || 0) + 1;
      _setGmailTrack(stored);
      try { localStorage.setItem('gmailTrack', JSON.stringify(stored)); } catch(e){}
      updateGmailTracker();
    });
  }
}

// ── Canvas Init ──
function mlInitCanvas() {
  mlBG  = document.getElementById('mlBgCanvas');
  mlOVR = document.getElementById('mlOvCanvas');
  if (!mlBG || !mlOVR) return;
  mlBgCtx = mlBG.getContext('2d');
  mlOvCtx = mlOVR.getContext('2d');
  mlFitZoom();
  mlDrawBg();
  mlDrawOverlay();
}

function mlSetCanvasSize(w, h) {
  const sw = Math.round(w * ML.scale), sh = Math.round(h * ML.scale);
  mlBG.width = mlOVR.width = sw;
  mlBG.height = mlOVR.height = sh;
  mlBG.style.width = mlOVR.style.width = sw + 'px';
  mlBG.style.height = mlOVR.style.height = sh + 'px';
  const wrap = document.getElementById('mlCanvasWrap');
  if (wrap) { wrap.style.width = sw + 'px'; wrap.style.height = sh + 'px'; }
}

function mlFitZoom() {
  const area = document.querySelector('.ml-canvas-area');
  if (!area) return;
  const avail = area.clientWidth - 60;
  ML.scale = Math.min(1, Math.max(0.3, avail / ML.imgW));
  const pill = document.getElementById('mlZoomPill');
  if (pill) pill.textContent = Math.round(ML.scale * 100) + '%';
  mlSetCanvasSize(ML.imgW, ML.imgH);
  mlDrawBg(); mlDrawOverlay();
}

function mlZoom(d) {
  ML.scale = Math.max(0.2, Math.min(3, ML.scale + d));
  const pill = document.getElementById('mlZoomPill');
  if (pill) pill.textContent = Math.round(ML.scale * 100) + '%';
  mlSetCanvasSize(ML.imgW, ML.imgH);
  mlDrawBg(); mlDrawOverlay();
}

function mlDrawBg() {
  if (!mlBgCtx) return;
  const w = mlBG.width, h = mlBG.height;
  mlBgCtx.clearRect(0, 0, w, h);
  if (ML.certImg) {
    mlBgCtx.drawImage(ML.certImg, 0, 0, w, h);
  } else {
    mlBgCtx.fillStyle = '#f0f4f8'; mlBgCtx.fillRect(0, 0, w, h);
    mlBgCtx.strokeStyle = 'rgba(37,99,235,0.2)'; mlBgCtx.lineWidth = 1.5;
    mlBgCtx.strokeRect(6, 6, w - 12, h - 12);
    mlBgCtx.fillStyle = 'rgba(37,99,235,0.4)';
    mlBgCtx.font = '13px Bricolage Grotesque, sans-serif';
    mlBgCtx.textAlign = 'center';
    mlBgCtx.fillText('Upload a certificate image to begin', w / 2, h / 2);
  }
}

function mlApplyCase(str, c) {
  if (!str) return '';
  if (c === 'title') return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
  if (c === 'upper') return str.toUpperCase();
  return str;
}

function mlGetDisplayName() {
  const c = ML.selected !== null && ML.candidates[ML.selected] ? ML.candidates[ML.selected] : null;
  const caseEl = document.getElementById('mlNameCase');
  return mlApplyCase(c ? c.name : 'Candidate Name', caseEl ? caseEl.value : 'title');
}

function mlDrawOverlay() {
  if (!mlOvCtx) return;
  const w = mlOVR.width, h = mlOVR.height;
  mlOvCtx.clearRect(0, 0, w, h);
  const sx = ML.scale;
  const cx = ML.nameX * sx, cy = ML.nameY * sx, cw = ML.nameW * sx;
  const fsEl = document.getElementById('mlFontSize');
  const ffEl = document.getElementById('mlFontFamily');
  const colEl = document.getElementById('mlNameColor');
  const fs = parseInt(fsEl ? fsEl.value : 28) * sx;
  const ff = ffEl ? ffEl.value : 'Georgia';
  const col = colEl ? colEl.value : '#0a1628';
  const lsEl = document.getElementById('mlLetterSpacing');
  const ls = lsEl ? parseInt(lsEl.value) || 0 : 0;

  mlOvCtx.save();
  mlOvCtx.font = `${ML.italic ? 'italic ' : ''}${ML.bold ? 'bold ' : ''}${fs}px "${ff}"`;
  mlOvCtx.fillStyle = col;
  mlOvCtx.textAlign = 'center';
  mlOvCtx.textBaseline = 'middle';
  if (ML.underline) {
    const txt = mlGetDisplayName();
    const tw = mlOvCtx.measureText(txt).width;
    mlOvCtx.fillRect(cx - tw/2, cy + fs * 0.55, tw, Math.max(1, fs * 0.06));
  }
  mlOvCtx.letterSpacing = ls + 'px';
  mlOvCtx.fillText(mlGetDisplayName(), cx, cy);
  mlOvCtx.restore();

  // Name box guide
  mlOvCtx.strokeStyle = 'rgba(37,99,235,0.3)';
  mlOvCtx.lineWidth = 1;
  mlOvCtx.setLineDash([4, 3]);
  mlOvCtx.strokeRect(cx - cw/2, cy - fs * 0.7, cw, fs * 1.4);
  mlOvCtx.setLineDash([]);

  // Center dot
  mlOvCtx.fillStyle = 'rgba(37,99,235,0.5)';
  mlOvCtx.beginPath(); mlOvCtx.arc(cx, cy, 3, 0, Math.PI * 2); mlOvCtx.fill();

  // Coord bar
  const cb = document.getElementById('mlCoordBar');
  if (cb) cb.textContent = `x:${Math.round(ML.nameX)} y:${Math.round(ML.nameY)}`;
}

function mlRedraw() { mlDrawBg(); mlDrawOverlay(); }
function mlSyncHex() {
  const hex = document.getElementById('mlNameColorHex').value;
  if (/^#[0-9a-f]{6}$/i.test(hex)) document.getElementById('mlNameColor').value = hex;
  mlRedraw();
}

// ── Mouse events ──
function mlMouseDown(e) {
  const sx = ML.scale;
  const rx = e.offsetX / sx, ry = e.offsetY / sx;
  const fsEl = document.getElementById('mlFontSize');
  const fs = parseInt(fsEl ? fsEl.value : 28);
  if (Math.abs(rx - ML.nameX) < ML.nameW / 2 && Math.abs(ry - ML.nameY) < fs * 0.7) {
    ML.dragging = true;
    ML.dragOffX = rx - ML.nameX;
    ML.dragOffY = ry - ML.nameY;
  } else {
    ML.nameX = rx; ML.nameY = ry;
    mlRedraw();
  }
}
function mlMouseMove(e) {
  if (!ML.dragging) return;
  const sx = ML.scale;
  ML.nameX = e.offsetX / sx - ML.dragOffX;
  ML.nameY = e.offsetY / sx - ML.dragOffY;
  mlRedraw();
}
function mlMouseUp() { ML.dragging = false; }

// ── Load certificate image ──
function mlLoadCertImage(input) {
  const file = input.files[0]; if (!file) return;
  const nameEl = document.getElementById('mlImgName');
  if (nameEl) { nameEl.textContent = '✓ ' + file.name; nameEl.style.display = 'block'; }
  const reader = new FileReader();
  reader.onload = e => {
    ML.certDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      ML.certImg = img;
      ML.imgW = img.naturalWidth; ML.imgH = img.naturalHeight;
      ML.nameX = ML.imgW / 2; ML.nameY = ML.imgH * 0.42;
      ML.nameW = ML.imgW * 0.55;
      mlFitZoom();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function mlOnDrop(e) {
  e.preventDefault();
  document.getElementById('mlImgZone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer(); dt.items.add(file);
    document.getElementById('mlCertFile').files = dt.files;
    mlLoadCertImage(document.getElementById('mlCertFile'));
  }
}

// ── Load Excel/CSV Data ──
function mlLoadDataFile(input) {
  const file = input.files[0]; if (!file) return;
  const nameEl = document.getElementById('mlDataName');
  if (nameEl) { nameEl.textContent = '✓ ' + file.name; nameEl.style.display = 'block'; }
  mlConLog('info', 'Loading: ' + file.name);

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  if (isCsv) {
    reader.onload = e => { mlParseCSV(e.target.result); };
    reader.readAsText(file);
  } else {
    // Excel via SheetJS
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!data.length) { mlConLog('err', 'No data found in sheet'); return; }
        ML.rawHeaders = Object.keys(data[0]);
        mlBuildCandidatesFromRows(data);
        mlShowColumnMap();
        mlConLog('ok', data.length + ' rows loaded from Excel');
      } catch(err) { mlConLog('err', 'Excel parse failed: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }
}

function mlOnDataDrop(e) {
  e.preventDefault();
  document.getElementById('mlDataZone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const dt = new DataTransfer(); dt.items.add(file);
  document.getElementById('mlDataFile').files = dt.files;
  mlLoadDataFile(document.getElementById('mlDataFile'));
}

function mlParseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { mlConLog('err', 'CSV has no data rows'); return; }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  ML.rawHeaders = headers;
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
  mlBuildCandidatesFromRows(rows);
  mlShowColumnMap();
  mlConLog('ok', rows.length + ' rows loaded from CSV');
}

function mlBuildCandidatesFromRows(rows, nameCol, emailCol, genderCol, collegeCol) {
  // Auto-detect columns if not supplied
  const hdr = ML.rawHeaders;
  const findCol = (patterns) => hdr.find(h => patterns.some(p => h.toLowerCase().includes(p))) || '';
  nameCol    = nameCol    || findCol(['name','full name','participant']);
  emailCol   = emailCol   || findCol(['email','mail','e-mail']);
  genderCol  = genderCol  || findCol(['gender','sex']);
  collegeCol = collegeCol || findCol(['college','university','institute','org','school']);

  ML.candidates = rows.map((row, i) => {
    const name  = nameCol  ? (row[nameCol]  || '').trim() : '';
    const email = emailCol ? (row[emailCol] || '').trim() : '';
    if (!name && !email) return null;
    return {
      rowIndex: i + 2,
      name:    name  || ('Row ' + (i+2)),
      email:   email || '',
      gender:  genderCol  ? (row[genderCol]  || '') : '',
      college: collegeCol ? (row[collegeCol] || '') : '',
      status:  'Pending',
      certId:  '',
      sentAt:  '',
      error:   '',
      rawRow:  row
    };
  }).filter(Boolean);

  ML.filtered = ML.candidates.slice();
  mlUpdateDataStats();
  mlRenderList();
  mlPopCollegeFilter();
  mlRenderTracker();
  document.getElementById('mlDataStats').style.display = 'grid';
  mlConLog('info', ML.candidates.length + ' candidates ready');
}

function mlShowColumnMap() {
  const map = document.getElementById('mlColumnMap');
  if (!map) return;
  map.style.display = 'block';
  const hdr = ML.rawHeaders;
  ['mlColName','mlColEmail','mlColGender','mlColCollege'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const isOptional = id === 'mlColGender' || id === 'mlColCollege';
    sel.innerHTML = (isOptional ? '<option value="">-- none --</option>' : '<option value="">-- select --</option>') +
      hdr.map(h => `<option value="${mlEsc(h)}">${mlEsc(h)}</option>`).join('');
  });
  // Auto-select best guess
  const findBest = (patterns) => ML.rawHeaders.find(h => patterns.some(p => h.toLowerCase().includes(p))) || '';
  const n = document.getElementById('mlColName');
  const em = document.getElementById('mlColEmail');
  const g = document.getElementById('mlColGender');
  const co = document.getElementById('mlColCollege');
  if (n) n.value = findBest(['full name','name','participant']);
  if (em) em.value = findBest(['email','mail','e-mail']);
  if (g) g.value = findBest(['gender','sex']);
  if (co) co.value = findBest(['college','university','institute','org','school']);
}

function mlApplyMapping() {
  const nameCol   = document.getElementById('mlColName').value;
  const emailCol  = document.getElementById('mlColEmail').value;
  const genderCol = document.getElementById('mlColGender').value;
  const collCol   = document.getElementById('mlColCollege').value;
  if (!nameCol || !emailCol) { showToast('Name and Email columns are required', 'err'); return; }
  // Re-read current data from already-parsed rows
  const rows = ML.candidates.map(c => c.rawRow);
  mlBuildCandidatesFromRows(rows, nameCol, emailCol, genderCol, collCol);
  showToast('Mapping applied — ' + ML.candidates.length + ' candidates ✓', 'ok');
}

function mlUpdateDataStats() {
  let sent = 0, failed = 0, pending = 0;
  ML.candidates.forEach(c => {
    const s = (c.status || '').toLowerCase();
    if (s === 'sent') sent++;
    else if (s === 'failed') failed++;
    else pending++;
  });
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('mlStatTotal',   ML.candidates.length);
  setEl('mlStatPending', pending);
  setEl('mlStatSent',    sent);
  setEl('mlStatFailed',  failed);
}

// ── Candidate list ──
function mlFilterList() {
  const q   = (document.getElementById('mlSearchInput')?.value || '').toLowerCase();
  const st  = document.getElementById('mlFilterStatus')?.value || '';
  const col = document.getElementById('mlFilterCollege')?.value || '';
  ML.filtered = ML.candidates.filter(c => {
    const match = (c.name + c.email + (c.college || '')).toLowerCase().includes(q);
    const stMatch = !st || (c.status || 'Pending').toLowerCase() === st.toLowerCase();
    const colMatch = !col || (c.college || '') === col;
    return match && stMatch && colMatch;
  });
  const ct = document.getElementById('mlCandsCount');
  if (ct) ct.textContent = ML.filtered.length + ' records';
  mlRenderList();
}

function mlPopCollegeFilter() {
  const sel = document.getElementById('mlFilterCollege'); if (!sel) return;
  const cur = sel.value;
  const colleges = [...new Set(ML.candidates.map(c => c.college).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Colleges</option>' +
    colleges.map(c => `<option value="${mlEsc(c)}">${mlEsc(c)}</option>`).join('');
  sel.value = cur;
}

function mlRenderList() {
  const el = document.getElementById('mlCandList'); if (!el) return;
  if (!ML.filtered.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--mist);font-size:.74rem">No candidates match</div>'; return; }
  el.innerHTML = ML.filtered.map(c => {
    const ai = ML.candidates.indexOf(c);
    const st = c.status || 'Pending';
    const bc = st==='Sent' ? 'ml-b-sent' : st==='Failed' ? 'ml-b-failed' : 'ml-b-pending';
    const initials = (c.name || '?').split(' ').map(w => w[0] || '').join('').substr(0, 2).toUpperCase();
    if (mlEditMode) {
      return `<div class="ml-cand-row" style="align-items:flex-start;padding:8px 10px;gap:6px" data-edit-idx="${ai}">
        <input type="checkbox" class="ml-cand-cb" data-idx="${ai}" onclick="event.stopPropagation();mlUpdateBulkSel()" style="accent-color:#2563eb;width:13px;height:13px;flex-shrink:0;margin-top:6px">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
          <input type="text" value="${mlEsc(c.name)}" placeholder="Full Name"
            style="width:100%;padding:4px 7px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.76rem;font-family:inherit;outline:none;background:#fafbfd"
            oninput="ML.candidates[${ai}].name=this.value"
            onfocus="this.style.borderColor='#2563eb'"
            onblur="this.style.borderColor='#e2e8f0'">
          <input type="email" value="${mlEsc(c.email)}" placeholder="email@example.com"
            style="width:100%;padding:4px 7px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.72rem;font-family:inherit;outline:none;background:#fafbfd;color:var(--mist)"
            oninput="ML.candidates[${ai}].email=this.value"
            onfocus="this.style.borderColor='#2563eb'"
            onblur="this.style.borderColor='#e2e8f0'">
          <div style="display:flex;gap:4px">
            <input type="text" value="${mlEsc(c.college||'')}" placeholder="College / Organisation"
              style="flex:1;padding:4px 7px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.70rem;font-family:inherit;outline:none;background:#fafbfd"
              oninput="ML.candidates[${ai}].college=this.value"
              onfocus="this.style.borderColor='#2563eb'"
              onblur="this.style.borderColor='#e2e8f0'">
            <input type="text" value="${mlEsc(c.gender||'')}" placeholder="Gender"
              style="width:70px;padding:4px 7px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.70rem;font-family:inherit;outline:none;background:#fafbfd"
              oninput="ML.candidates[${ai}].gender=this.value"
              onfocus="this.style.borderColor='#2563eb'"
              onblur="this.style.borderColor='#e2e8f0'">
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end">
          <span class="ml-badge ${bc}" style="margin-bottom:2px">${st}</span>
          <button onclick="mlDeleteRow(${ai})" title="Delete row"
            style="padding:3px 9px;border-radius:6px;border:1.5px solid #fecaca;background:#fee2e2;color:#dc2626;font-size:.65rem;font-weight:700;cursor:pointer;font-family:inherit">🗑 Delete</button>
        </div>
      </div>`;
    }
    return `<div class="ml-cand-row${ai===ML.selected?' selected':''}" onclick="mlSelectCand(${ai})">
      <input type="checkbox" class="ml-cand-cb" data-idx="${ai}" onclick="event.stopPropagation();mlUpdateBulkSel()" ${ai===ML.selected?'checked':''} style="accent-color:#2563eb;width:13px;height:13px;flex-shrink:0">
      <div class="ml-cand-av">${mlEsc(initials)}</div>
      <div style="flex:1;min-width:0"><div style="font-size:.74rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mlEsc(c.name)}</div><div style="font-size:.62rem;color:var(--mist)">${mlEsc(c.email)}</div></div>
      <div style="flex:0 0 100px;font-size:.62rem;color:var(--mist);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mlEsc(c.college||'—')}</div>
      <div style="text-align:right;flex-shrink:0"><span class="ml-badge ${bc}">${st}</span>${c.certId?`<div style="font-size:.58rem;color:#2563eb;font-family:'DM Mono',monospace;margin-top:2px">${mlEsc(c.certId)}</div>`:''}</div>
    </div>`;
  }).join('');
}

function mlDeleteRow(ai) {
  if (!confirm('Delete this candidate?')) return;
  const c = ML.candidates[ai];
  ML.candidates.splice(ai, 1);
  ML.filtered = ML.candidates.filter(x => {
    const q = (document.getElementById('mlSearchInput')?.value || '').toLowerCase();
    const st = document.getElementById('mlFilterStatus')?.value || '';
    const col = document.getElementById('mlFilterCollege')?.value || '';
    const match = (x.name + x.email + (x.college||'')).toLowerCase().includes(q);
    const stMatch = !st || (x.status||'Pending').toLowerCase() === st.toLowerCase();
    const colMatch = !col || (x.college||'') === col;
    return match && stMatch && colMatch;
  });
  mlRenderList(); mlUpdateDataStats();
  showToast('Row deleted', 'info');
}

function mlSelectCand(i) { ML.selected = i; mlRenderList(); mlRedraw(); }
function mlSelectAll()  { document.querySelectorAll('.ml-cand-cb').forEach(cb => cb.checked = true); mlUpdateBulkSel(); }
function mlSelectNone() { document.querySelectorAll('.ml-cand-cb').forEach(cb => cb.checked = false); mlUpdateBulkSel(); }
function mlUpdateBulkSel() {
  const n = document.querySelectorAll('.ml-cand-cb:checked').length;
  const lbl = document.getElementById('mlBulkSelLabel');
  const btn = document.getElementById('mlSendSelectedBtn');
  if (lbl) lbl.textContent = n + ' selected';
  if (btn) btn.disabled = n === 0;
}
function mlPreviewCurrent() {
  if (ML.selected === null) { showToast('Select a candidate first', 'info'); return; }
  mlSwitchTab('designer'); mlRedraw();
  showToast('Previewing: ' + ML.candidates[ML.selected].name, 'ok');
}

// ── Feed filter state ──
let _mlFeedFilter = 'all';
function mlSetFeedFilter(f) {
  _mlFeedFilter = f;
  ['all','live','sent','failed','pending'].forEach(k => {
    const btn = document.getElementById('mlFeedFilter' + k[0].toUpperCase() + k.slice(1));
    if (btn) btn.classList.toggle('active', k === f);
  });
  mlRenderFeed();
}

// ── Render the live dispatch feed ──
function mlRenderFeed() {
  const el = document.getElementById('mlFeedList');
  const countEl = document.getElementById('mlFeedCount');
  const dotEl   = document.getElementById('mlFeedDot');
  if (!el) return;

  if (!ML.candidates.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px 20px;color:var(--mist);font-size:.74rem"><div style="font-size:1.8rem;margin-bottom:8px">📋</div>Start a send to see live dispatch status here</div>';
    if (countEl) countEl.textContent = '0 candidates';
    return;
  }

  // Determine which candidates to show
  let list = ML.candidates;
  if (_mlFeedFilter === 'live')    list = ML.candidates.filter(c => c.status === 'Sending' || c.status === 'Generating');
  else if (_mlFeedFilter === 'sent')    list = ML.candidates.filter(c => c.status === 'Sent');
  else if (_mlFeedFilter === 'failed')  list = ML.candidates.filter(c => c.status === 'Failed');
  else if (_mlFeedFilter === 'pending') list = ML.candidates.filter(c => !c.status || c.status === 'Pending');

  if (countEl) countEl.textContent = list.length + ' / ' + ML.candidates.length + ' candidates';

  // Pulse dot — red if running, green if done, grey if idle
  if (dotEl) {
    if (ML.bulkRunning) { dotEl.style.background = '#dc2626'; dotEl.style.animation = 'mlPulse 1.2s ease-in-out infinite'; }
    else if (ML.tracker.sent.length > 0) { dotEl.style.background = '#059669'; dotEl.style.animation = 'none'; }
    else { dotEl.style.background = '#b0b8c6'; dotEl.style.animation = 'none'; }
  }

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--mist);font-size:.72rem">No candidates match this filter</div>';
    return;
  }

  const now = Date.now();
  el.innerHTML = list.map((c, i) => {
    const globalIdx = ML.candidates.indexOf(c) + 1;
    const st = c.status || 'Pending';
    let badgeHtml = '';
    let rowClass  = '';

    if (st === 'Sending') {
      rowClass  = 'status-sending';
      badgeHtml = `<span class="ml-feed-badge b-sending"><span class="ml-feed-spinner"></span>Sending…</span>`;
    } else if (st === 'Generating') {
      rowClass  = 'status-generating';
      badgeHtml = `<span class="ml-feed-badge b-generating"><span class="ml-feed-spinner"></span>Generating…</span>`;
    } else if (st === 'Sent') {
      rowClass  = 'status-sent';
      const ts  = c.sentAt ? new Date(c.sentAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}) : '';
      badgeHtml = `<span class="ml-feed-badge b-sent">✓ Sent</span>${ts ? `<span style="font-size:.55rem;color:#059669;font-family:'DM Mono',monospace">${ts}</span>` : ''}`;
    } else if (st === 'Failed') {
      rowClass  = 'status-failed';
      const errShort = c.error ? (c.error.length > 32 ? c.error.slice(0,32)+'…' : c.error) : 'Error';
      badgeHtml = `<span class="ml-feed-badge b-failed" title="${mlEsc(c.error||'')}">✗ Failed</span><span style="font-size:.55rem;color:#dc2626;max-width:120px;text-align:right;word-break:break-all">${mlEsc(errShort)}</span>`;
    } else {
      rowClass  = 'status-pending';
      badgeHtml = `<span class="ml-feed-badge b-pending">⏳ Queued</span>`;
    }

    return `<div class="ml-feed-row ${rowClass}">
      <div class="ml-feed-idx">${globalIdx}</div>
      <div style="min-width:0">
        <div class="ml-feed-name">${mlEsc(c.name||'—')}</div>
        <div class="ml-feed-email">${mlEsc(c.email||'—')}</div>
      </div>
      <div class="ml-feed-org">${mlEsc(c.college||'—')}</div>
      <div class="ml-feed-certid">${c.certId ? mlEsc(c.certId) : '—'}</div>
      <div class="ml-feed-status">${badgeHtml}</div>
    </div>`;
  }).join('');

  // Auto-scroll to the currently sending row
  const sendingRows = el.querySelectorAll('.status-sending, .status-generating');
  if (sendingRows.length) sendingRows[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Tracker (stats + feed) ──
function mlRenderTracker() {
  let total = ML.candidates.length;
  let sent = ML.tracker.sent.length;
  let failed = ML.tracker.failed.length;
  let sending = ML.candidates.filter(c => c.status === 'Sending' || c.status === 'Generating').length;
  let pending = total - sent - failed - sending;
  if (pending < 0) pending = 0;
  const pct = total > 0 ? Math.round(sent / total * 100) : 0;
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('mlTrTotal', total);
  setEl('mlTrSent', sent);
  setEl('mlTrFailed', failed);
  setEl('mlTrPending', pending);
  setEl('mlTrSending', sending);
  const bar = document.getElementById('mlProgBar');
  const lbl = document.getElementById('mlProgPct');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct + '%';
  mlRenderFeed();
}

function mlResetTracker() {
  if (!confirm('Reset all tracker data? Sent statuses on candidates will also be cleared.')) return;
  ML.tracker = { sent: [], failed: [], startedAt: null, total: 0 };
  ML.candidates.forEach(c => { c.status = 'Pending'; c.certId = ''; c.sentAt = ''; c.error = ''; });
  ML.filtered = ML.candidates.slice();
  mlUpdateDataStats(); mlRenderList(); mlRenderTracker();
  mlConLog('warn', 'Tracker reset by user');
  showToast('Tracker reset ✓', 'ok');
}

// ── Certificate generation ──
function mlGenerateCertificate(candidate) {
  if (!ML.certDataUrl) return null;
  const canvas = document.createElement('canvas');
  canvas.width = ML.imgW; canvas.height = ML.imgH;
  const ctx = canvas.getContext('2d');

  const fsEl = document.getElementById('mlFontSize');
  const ffEl = document.getElementById('mlFontFamily');
  const colEl = document.getElementById('mlNameColor');
  const caseEl = document.getElementById('mlNameCase');

  const fs = parseInt(fsEl ? fsEl.value : 28);
  const ff = ffEl ? ffEl.value : 'Georgia';
  const col = colEl ? colEl.value : '#0a1628';

  ctx.drawImage(ML.certImg, 0, 0, ML.imgW, ML.imgH);
  ctx.font = `${ML.italic ? 'italic ' : ''}${ML.bold ? 'bold ' : ''}${fs}px "${ff}"`;
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mlApplyCase(candidate.name, caseEl ? caseEl.value : 'title'), ML.nameX, ML.nameY);
  return canvas.toDataURL('image/png');
}

// ── Bulk Send ──
function mlStartBulkSend() {
  if (!ML.certDataUrl) { showToast('Upload a certificate image first', 'err'); return; }
  if (!ML.candidates.length) { showToast('Upload participant data first', 'err'); return; }
  if (!U || !U.email) { showToast('Please login with Google first', 'err'); return; }
  if (!BREVO_API_KEY) {
    showToast('Brevo API key not configured — go to Settings → Integrations', 'err');
    return;
  }
  const queue = ML.candidates.filter(c => (c.status || '').toLowerCase() !== 'sent');
  if (!queue.length) { showToast('Nothing to send — all already sent', 'info'); return; }
  mlConLog('info', '📨 Sending via Gmail (' + U.email + ')');
  mlStartBulkSendWithQueue(queue);
}

function mlSendSelected() {
  const idxs = [];
  document.querySelectorAll('.ml-cand-cb:checked').forEach(cb => {
    const i = parseInt(cb.getAttribute('data-idx'));
    if (!isNaN(i)) idxs.push(i);
  });
  if (!idxs.length) return;
  if (!ML.certDataUrl) { showToast('Upload a certificate image first', 'err'); return; }
  const queue = idxs.map(i => ML.candidates[i]).filter(Boolean);
  mlStartBulkSendWithQueue(queue);
}

function mlStartBulkSendWithQueue(queue) {
  if (ML.bulkRunning) { showToast('Already running', 'info'); return; }
  ML.bulkRunning = true; ML.bulkStop = false; ML.isCoolingDown = false;
  ML.bulkQueue = queue; ML.bulkIdx = 0; ML.batchCount = 0; ML.totalBatchNum = 0;
  ML.tracker.startedAt = new Date(); ML.tracker.total = queue.length;

  const sendBtn = document.getElementById('mlSendBtn');
  const stopBtn = document.getElementById('mlStopBtn');
  const topBtn  = document.getElementById('mlTopSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  if (stopBtn) stopBtn.style.display = 'inline-flex';
  if (topBtn)  topBtn.disabled = true;

  mlSetConBadge('RUNNING');
  mlConLog('info', 'Starting dispatch — ' + queue.length + ' emails');
  mlSetSync('syncing', 'Sending…');
  mlSwitchTab('tracker');
  mlStartLiveTimer();
  mlRunNext();
}

function mlStopBulk() {
  ML.bulkStop = true;
  if (ML.cdTimer) { clearInterval(ML.cdTimer); ML.cdTimer = null; }
  document.getElementById('mlCooldownOverlay').classList.remove('active');
  mlFinishBulk();
  mlConLog('warn', 'Dispatch stopped by user');
}

function mlRunNext() {
  if (ML.bulkStop) { mlFinishBulk(); return; }
  if (ML.bulkIdx >= ML.bulkQueue.length) { mlFinishBulk(); return; }

  const safetyOn = document.getElementById('mlSafetyEnabled').checked;
  const batchSize = parseInt(document.getElementById('mlBatchSize').value) || 30;

  // Cooldown check
  if (safetyOn && ML.batchCount > 0 && ML.batchCount % batchSize === 0) {
    const cdMin = parseInt(document.getElementById('mlCdMin').value) || 60;
    const cdMax = parseInt(document.getElementById('mlCdMax').value) || 180;
    const cd = cdMin + Math.random() * (cdMax - cdMin);
    ML.totalBatchNum++;
    mlStartCooldown(Math.round(cd), ML.totalBatchNum, ML.bulkQueue.length - ML.bulkIdx, () => {
      if (!ML.bulkStop) mlRunNext();
    });
    return;
  }

  const candidate = ML.bulkQueue[ML.bulkIdx];
  ML.bulkIdx++; ML.batchCount++;
  mlSendOne(candidate);
}

async function mlSendOne(candidate) {
  // ── Step 1: Generating certificate ──
  candidate.status = 'Generating';
  const curEl = document.getElementById('mlTimerCurrent');
  if (curEl) curEl.textContent = candidate.name || candidate.email;
  mlRenderFeed();

  const certDataUrl = mlGenerateCertificate(candidate);
  if (!certDataUrl) {
    mlRecordFail(candidate, 'Certificate generation failed');
    mlRenderList(); mlRenderTracker(); mlUpdateDataStats();
    mlRunNext();
    return;
  }

  const certId = 'BFSI-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(100000 + Math.random() * 900000);

  // ── Step 2: Sending email ──
  mlSetLocalStatus(candidate.rowIndex, 'Sending', '', '', '');
  candidate.status = 'Sending';
  mlRenderFeed();

  // Use saved sender from Brevo settings
  var senderEmail   = localStorage.getItem('brevo_sender_email') || (U && U.email) || '';
  var displayName   = localStorage.getItem('brevo_sender_name')  || (U && (U.firstName + ' ' + (U.lastName || '')).trim()) || senderEmail || 'NOVA Studio';
  var recipientName = candidate.name || candidate.email;

  // Build email body from saved template (or default)
  var emailBody = brevoRenderTemplate(candidate, certId, displayName);

  if (!BREVO_API_KEY) {
    mlConLog('warn', 'Brevo API key not configured — go to Settings → Integrations');
    mlRecordFail(candidate, 'Brevo not configured — add your free API key in Settings → Integrations');
    mlRenderList(); mlRenderTracker(); mlUpdateDataStats();
    mlRunNext();
    return;
  }

  try {
    var emailSubject = brevoRenderSubject(candidate, displayName);
    await sendViaGmailAPI(
      candidate.email, recipientName,
      senderEmail, displayName,
      emailSubject,
      emailBody, certDataUrl, 'certificate_' + certId + '.png'
    );
    mlRecordSent(candidate, certId);
    mlConLog('ok', '✓ Sent: ' + candidate.name + ' <' + candidate.email + '>');
  } catch(err) {
    var errMsg = (err && (err.message || String(err))) || 'EmailJS send error';
    mlRecordFail(candidate, errMsg);
    mlConLog('err', '✗ Failed: ' + candidate.name + ' — ' + errMsg);
  }

  mlRenderList(); mlRenderTracker(); mlUpdateDataStats();
  mlRunNext();
};

async function _sendViaSmtpOrGAS(candidate, certId, activeSender, emailBody, certDataUrl) {
  if (activeSender && activeSender.pass && typeof Email !== 'undefined') {
    try {
      var displayName = activeSender.name || activeSender.email;
      var sendResult = await Email.send({
        Host: 'smtp.gmail.com', Username: activeSender.email, Password: activeSender.pass,
        To: candidate.email, From: '"' + displayName + '" <' + activeSender.email + '>',
        Subject: 'Your Certificate — ' + (candidate.college || 'Programme'),
        Body: emailBody, Attachments: [{ name: 'certificate_' + certId + '.png', data: certDataUrl }]
      });
      if (sendResult === 'OK') { mlRecordSent(candidate, certId); return; }
      throw new Error(sendResult || 'SMTP non-OK');
    } catch(e) {}
  }
  await _sendViaGAS(candidate, certId, activeSender);
}

async function _sendViaGAS(candidate, certId, activeSender) {
  var webUrl = document.getElementById('mlWebUrl').value.trim();
  if (!webUrl) {
    mlRecordFail(candidate, 'No GAS URL and direct Gmail send failed');
    return;
  }
  try {
    var certImg = mlGenerateCertificate(candidate);
    var formData = new FormData();
    formData.append('action', 'sendCertificate');
    formData.append('name', candidate.name);
    formData.append('email', candidate.email);
    formData.append('certId', certId);
    formData.append('gender', candidate.gender || '');
    formData.append('college', candidate.college || '');
    formData.append('certImage', certImg || '');
    if (activeSender) {
      formData.append('senderEmail', activeSender.email);
      formData.append('senderPass', activeSender.pass);
      formData.append('senderName', activeSender.name || activeSender.email);
    }
    await fetch(webUrl, { method: 'POST', body: formData, mode: 'no-cors' });
    mlRecordSent(candidate, certId);
    mlConLog('ok', 'GAS sent: ' + candidate.name);
  } catch(err) {
    mlRecordFail(candidate, (err && err.message) || 'Network error');
  }
}

// ── mlStartBulkSend — see definition above ──

// Close modal on backdrop click + init
document.addEventListener('click', function(e) {
  var modal = document.getElementById('emAccModal');
  if (modal && e.target === modal) emAccCloseModal();
});
window.addEventListener('load', function() { emAccLoad(); });

// ══════════════════════════════════════════════════════════════════
// ██ SETTINGS — Google Drive (College Portal) functions
// ══════════════════════════════════════════════════════════════════

function stgDriveLoad() {
  var url = localStorage.getItem('nova_gdrive_script_url') || '';
  var el  = document.getElementById('stgDriveScriptUrl');
  if (el) el.value = url;
  var status = document.getElementById('stgDriveStatus');
  if (status) {
    if (url) {
      status.style.display = 'block';
      status.style.background = 'var(--lime-p)';
      status.style.color = 'var(--ink)';
      status.textContent = '✅ Connected — Apps Script URL is set';
    } else {
      status.style.display = 'none';
    }
  }
}

function stgDriveSave() {
  var url    = (document.getElementById('stgDriveScriptUrl').value || '').trim();
  var status = document.getElementById('stgDriveStatus');

  if (!url) {
    localStorage.removeItem('nova_gdrive_script_url');
    if (status) { status.style.display = 'block'; status.style.background = '#fff5f5'; status.style.color = '#dc2626'; status.textContent = 'URL cleared.'; }
    return;
  }
  if (!url.includes('script.google.com/macros/s/')) {
    if (status) { status.style.display = 'block'; status.style.background = '#fff5f5'; status.style.color = '#dc2626'; status.textContent = "⚠️ That doesn't look like an Apps Script URL. It should contain script.google.com/macros/s/"; }
    return;
  }

  localStorage.setItem('nova_gdrive_script_url', url);
  if (status) {
    status.style.display = 'block';
    status.style.background = 'var(--lime-p)';
    status.style.color = 'var(--ink)';
    status.textContent = '✅ Saved! College Portal will now use this for template uploads.';
  }
  if (typeof showToast === 'function') showToast('Google Drive connected ✓', 'ok');
}

async function stgDriveTest() {
  var url    = (document.getElementById('stgDriveScriptUrl').value || '').trim();
  var status = document.getElementById('stgDriveStatus');
  if (!url) { if (typeof showToast === 'function') showToast('Paste your Apps Script URL first', 'info'); return; }

  if (status) { status.style.display = 'block'; status.style.background = 'var(--snow)'; status.style.color = 'var(--mist)'; status.textContent = '⏳ Testing connection…'; }

  try {
    var resp   = await fetch(url);
    var result = null;
    try { result = await resp.json(); } catch(e) {}
    if (result && result.ok) {
      if (status) { status.style.background = 'var(--lime-p)'; status.style.color = 'var(--ink)'; status.textContent = '✅ Connected! ' + (result.status || 'Apps Script is running.'); }
      if (typeof showToast === 'function') showToast('Drive connection OK ✓', 'ok');
    } else {
      throw new Error(result ? (result.error || 'Unknown error') : 'No response');
    }
  } catch(err) {
    if (status) { status.style.background = '#fff5f5'; status.style.color = '#dc2626'; status.textContent = '❌ Test failed: ' + err.message + '. Make sure the script is deployed and set to Anyone.'; }
  }
}

function stgDriveCopyCode() {
  var code = document.getElementById('stgDriveCode');
  if (!code) return;
  // Unescape HTML entities for copy
  var text = code.textContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById('stgDriveCopyBtn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy'; }, 2000); }
  });
}
