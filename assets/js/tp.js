// ══════════════════════════════════════════════════════
//  Training Partners (TP) Module — NOVA Studio v2
//  · Owner identity (avatar + name + username) on every card
//  · Connections list visible to ALL users (avatars + names)
//  · Phone + Location fields
//  · 5-star feedback, rankings, connect tick
// ══════════════════════════════════════════════════════
'use strict';

function _tpCol()        { return fbDb.collection('tp_directory'); }
function _tpFbkCol(tpId) { return fbDb.collection('tp_directory').doc(tpId).collection('feedback'); }
function _tpConnCol()    { return fbDb.collection('tp_connections'); }

var TP_DATA        = [];
var TP_MY_CONNECTS = {};
var TP_ALL_CONNS   = {};   // {tpId: [{userEmail,userName,userAvatar,userUsername,connectedAt}]}
var TP_MY_FEEDS    = {};
var TP_TAB         = 'all';
var TP_STAR_VAL    = 0;
var TP_INITIALIZED = false;

/* ══ INIT ══ */
async function tpInit() {
  if (!U || !U.email) return;
  tpRenderStats();
  await Promise.all([tpLoadAllConnects(), tpLoadMyFeeds()]);
  if (!TP_INITIALIZED) {
    TP_INITIALIZED = true;
    _tpCol().orderBy('createdAt','desc').onSnapshot(function(snap) {
      TP_DATA = snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; });
      // Reload my feeds now that TP_DATA is populated (avoids collectionGroup index)
      tpLoadMyFeeds().then(function(){ tpRenderList(); });
      tpRenderStats(); tpRenderHomeWidget();
    }, function(e){ console.warn('TP snap',e); });
    _tpConnCol().onSnapshot(function(snap) {
      TP_ALL_CONNS={};TP_MY_CONNECTS={};
      snap.forEach(function(d){
        var c=d.data();
        if(!TP_ALL_CONNS[c.tpId])TP_ALL_CONNS[c.tpId]=[];
        TP_ALL_CONNS[c.tpId].push(c);
        if(c.userEmail===U.email)TP_MY_CONNECTS[c.tpId]=true;
      });
      tpRenderList(); tpRenderStats();
    }, function(e){ console.warn('TP conn snap',e); });
  } else { tpRenderList(); }
}

async function tpLoadAllConnects() {
  TP_ALL_CONNS={};TP_MY_CONNECTS={};
  try {
    var snap = await _tpConnCol().get();
    snap.forEach(function(d){
      var c=d.data();
      if(!TP_ALL_CONNS[c.tpId])TP_ALL_CONNS[c.tpId]=[];
      TP_ALL_CONNS[c.tpId].push(c);
      if(c.userEmail===(U&&U.email))TP_MY_CONNECTS[c.tpId]=true;
    });
  } catch(e){ console.warn(e); }
}

async function tpLoadMyFeeds() {
  TP_MY_FEEDS={};
  // Avoid collectionGroup query (requires Firestore index) —
  // instead read each TP's feedback subcollection for ones I've written
  try {
    if(!TP_DATA.length) return; // nothing to check yet
    var promises = TP_DATA.map(function(tp){
      return _tpFbkCol(tp.id).where('reviewerEmail','==',U.email).limit(1).get()
        .then(function(s){
          if(!s.empty){
            var d=s.docs[0];
            TP_MY_FEEDS[tp.id]=Object.assign({id:d.id},d.data());
          }
        }).catch(function(){});
    });
    await Promise.all(promises);
  } catch(e){ console.warn('tpLoadMyFeeds',e); }
}

/* ══ TABS ══ */
function tpSetTab(tab) {
  TP_TAB=tab;
  ['all','connected','mine','ranking'].forEach(function(t){
    var el=document.getElementById('tpTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if(el)el.classList.toggle('active',t===tab);
  });
  tpRenderList();
}

/* ══ STATS ══ */
function tpRenderStats() {
  var el=document.getElementById('tpStatsStrip'); if(!el)return;
  var totalConns=Object.values(TP_ALL_CONNS).reduce(function(s,a){return s+a.length;},0);
  var rated=TP_DATA.filter(function(t){return t.avgRating>0;});
  var avg=rated.length?(rated.reduce(function(s,t){return s+t.avgRating;},0)/rated.length).toFixed(1):'—';
  el.style.display='grid';
  el.innerHTML=[
    {n:TP_DATA.length,       l:'Total Partners'},
    {n:totalConns,           l:'Total Connections'},
    {n:Object.keys(TP_MY_CONNECTS).length, l:'My Connections'},
    {n:avg,                  l:'Community Avg ⭐'},
    {n:TP_DATA.filter(function(t){return t.ownerEmail===(U&&U.email);}).length, l:'My Entries'},
  ].map(function(s){return '<div class="tp-stat-mini"><div class="n">'+s.n+'</div><div class="l">'+s.l+'</div></div>';}).join('');
}

/* ══ LIST RENDER ══ */
function tpRenderList() {
  var listEl=document.getElementById('tpList'),emptyEl=document.getElementById('tpEmpty');
  if(!listEl||!emptyEl)return;
  var q=((document.getElementById('tpSearch')||{}).value||'').toLowerCase();
  var sort=((document.getElementById('tpSortSelect')||{}).value)||'rating';
  var data=TP_DATA.slice();
  if(TP_TAB==='connected')data=data.filter(function(t){return TP_MY_CONNECTS[t.id];});
  else if(TP_TAB==='mine')data=data.filter(function(t){return t.ownerEmail===(U&&U.email);});
  if(q)data=data.filter(function(t){
    return (t.name||'').toLowerCase().includes(q)||(t.org||'').toLowerCase().includes(q)
      ||(t.skills||'').toLowerCase().includes(q)||(t.location||'').toLowerCase().includes(q)
      ||(t.bio||'').toLowerCase().includes(q);
  });
  data.sort(function(a,b){
    if(sort==='rating')return (b.avgRating||0)-(a.avgRating||0);
    if(sort==='name')return (a.name||'').localeCompare(b.name||'');
    if(sort==='newest')return (b.createdAt||0)-(a.createdAt||0);
    if(sort==='connections')return (TP_ALL_CONNS[b.id]||[]).length-(TP_ALL_CONNS[a.id]||[]).length;
    return 0;
  });
  if(TP_TAB==='ranking'){ listEl.innerHTML=tpRenderRankings(data); emptyEl.style.display=data.length?'none':'block'; return; }
  if(!data.length){listEl.innerHTML='';emptyEl.style.display='block';return;}
  emptyEl.style.display='none';
  listEl.innerHTML=data.map(tpCardHTML).join('');
}

/* ══ AVATAR ══ */
function tpAvatarHTML(name,photo,size,fs) {
  size=size||32; fs=fs||'.75rem';
  var ini=((name||'?').split(' ').map(function(w){return w[0]||'';}).slice(0,2).join('')||'?').toUpperCase();
  var st='width:'+size+'px;height:'+size+'px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:'+fs+';overflow:hidden;';
  if(photo)return '<div style="'+st+'background:#eee;border:2px solid var(--fog);"><img src="'+_esc(photo)+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentNode.textContent=\''+ini+'\';this.parentNode.style.background=\'linear-gradient(135deg,var(--lime),var(--teal))\';this.parentNode.style.color=\'var(--ink)\';"></div>';
  return '<div style="'+st+'background:linear-gradient(135deg,var(--lime),var(--teal));color:var(--ink);">'+ini+'</div>';
}

/* ══ CARD ══ */
function tpCardHTML(tp) {
  var isOwner=U&&U.email===tp.ownerEmail;
  var isConn=TP_MY_CONNECTS[tp.id];
  var myFeed=TP_MY_FEEDS[tp.id];
  var skills=(tp.skills||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var conns=TP_ALL_CONNS[tp.id]||[];
  var stars=tpStarsHTML(tp.avgRating||0);
  var rLabel=tp.ratingCount?(tp.avgRating.toFixed(1)+' ('+tp.ratingCount+' review'+(tp.ratingCount!==1?'s':'')+')' ):'No ratings yet';

  // Connections avatar strip (with work roles)
  var myConn = conns.find(function(c){ return c.userEmail===(U&&U.email); });
  var connStrip='';
  if(conns.length){
    connStrip='<div style="margin-top:10px;padding:10px 12px;background:var(--snow);border-radius:8px;border:1px solid var(--fog);">';
    connStrip+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    connStrip+='<span style="font-size:.63rem;font-weight:700;color:var(--mist);">🔗 Connected by:</span>';
    connStrip+='<div style="display:flex;align-items:center;">';
    conns.slice(0,6).forEach(function(c,i){
      var rawName2=c.userName||'';
      var cn=(rawName2&&!rawName2.includes('@'))?rawName2:(rawName2.split('@')[0]||'User');
      var tip=cn+(c.workRole?' — '+c.workRole:'');
      connStrip+='<div title="'+_esc(tip)+'" style="margin-left:'+(i>0?'-10px':'0')+'px;z-index:'+(20-i)+';position:relative;border:2px solid var(--card);border-radius:50%;">'+tpAvatarHTML(cn,c.userAvatar,32,'.68rem')+'</div>';
    });
    connStrip+='</div>';
    var nameList=conns.slice(0,3).map(function(c){
      var rawN=c.userName||'';
      var dispN=(rawN&&!rawN.includes('@'))?rawN:(rawN.split('@')[0]||'User');
      var n='<b>'+_esc(dispN)+'</b>';
      if(c.workRole) n+=' <span style="color:var(--mist);font-size:.6rem;">('+_esc(c.workRole)+')</span>';
      return n;
    }).join(', ');
    if(conns.length>3)nameList+=' <span style="color:var(--mist);">& '+(conns.length-3)+' others</span>';
    connStrip+='<span style="font-size:.65rem;color:var(--ink3);">'+nameList+'</span>';
    connStrip+='<button class="tp-action-btn" style="margin-left:auto;font-size:.6rem;" onclick="tpViewConnections(\''+tp.id+'\',\''+_esc(tp.name)+'\')">See all</button>';
    connStrip+='</div>';
    if(myConn){
      connStrip+='<div style="margin-top:8px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;">';
      connStrip+='<span style="font-size:.65rem;font-weight:700;color:var(--lime-d);">My work:</span>';
      if(myConn.workRole){
        connStrip+='<span style="font-size:.65rem;padding:2px 10px;border-radius:20px;background:var(--lime-p);border:1px solid rgba(158,192,0,.25);color:var(--ink);font-weight:600;">'+_esc(myConn.workRole)+'</span>';
      } else {
        connStrip+='<span style="font-size:.65rem;color:var(--mist);font-style:italic;">Not set yet</span>';
      }
      connStrip+='<button class="tp-action-btn" style="font-size:.6rem;padding:2px 9px;" onclick="tpSetMyWorkRole(\''+tp.id+'\')">✏ Set Work</button>';
      connStrip+='</div>';
    }
    connStrip+='</div>';
  }

  // Added-by strip
  var addedBy='<div style="display:flex;align-items:center;gap:7px;margin-top:8px;padding:7px 10px;background:var(--lime-p);border-radius:7px;border:1px solid rgba(158,192,0,.15);">'
    +tpAvatarHTML(tp.ownerName||tp.ownerEmail||'?',tp.ownerAvatar,24,'.55rem')
    +'<span style="font-size:.65rem;color:var(--ink3);">Added by <b>'+_esc(tp.ownerName||tp.ownerEmail||'Unknown')+'</b>'
    +(tp.ownerUsername?' <span style="font-family:\'DM Mono\',monospace;color:var(--mist);font-size:.6rem;">@'+_esc(tp.ownerUsername)+'</span>':'')
    +'</span></div>';

  // Meta (location + phone)
  var meta=[];
  if(tp.location)meta.push('📍 '+_esc(tp.location));
  if(tp.phone)meta.push('📞 '+_esc(tp.phone));
  var metaLine=meta.length?'<div style="font-size:.7rem;color:var(--mist);margin-top:5px;display:flex;gap:14px;flex-wrap:wrap;">'+meta.join('')+'</div>':'';

  return '<div class="tp-card" id="tpCard_'+tp.id+'">'
    +'<div style="display:flex;align-items:flex-start;gap:14px;">'
    +tpAvatarHTML(tp.name,null,46,'1.05rem')
    +'<div style="flex:1;min-width:0;">'
    +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    +'<div class="tp-name">'+_esc(tp.name)+'</div>'
    +(isOwner?'<span class="tp-badge-owner">My Entry</span>':'')
    +'</div>'
    +(tp.org?'<div class="tp-org">🏢 '+_esc(tp.org)+'</div>':'')
    +metaLine
    +'<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">'
    +'<span class="tp-star-display">'+stars+'</span>'
    +'<span class="tp-rating-count">'+rLabel+'</span>'
    +'</div>'
    +(tp.bio?'<div style="font-size:.75rem;color:var(--ink3);margin-top:8px;line-height:1.6;">'+_esc(tp.bio)+'</div>':'')
    +(skills.length?'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:9px;">'+skills.map(function(s){return '<span class="tp-skill-tag">'+_esc(s)+'</span>';}).join('')+'</div>':'')
    +addedBy
    +connStrip
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--fog);align-items:center;">'
    +(!isOwner && !isConn?'<button class="tp-connect-btn" onclick="tpToggleConnect(\''+tp.id+'\')">+ Connect</button>':'')
    +(!isOwner && isConn?'<button class="tp-connect-btn connected" onclick="tpToggleConnect(\''+tp.id+'\')">✔ Connected</button>':'')
    +(!isOwner?'<button class="tp-action-btn" onclick="tpOpenFeedback(\''+tp.id+'\',\''+_esc(tp.name)+'\''+')">'+(myFeed?'✏ Edit My Review':'⭐ Leave Feedback')+'</button>':'')
    +'<button class="tp-action-btn" onclick="tpViewFeedback(\''+tp.id+'\',\''+_esc(tp.name)+'\')">💬 Reviews</button>'
    +'<button class="tp-action-btn" onclick="tpViewConnections(\''+tp.id+'\',\''+_esc(tp.name)+'\')">🔗 '+conns.length+' Connections</button>'
    +(tp.link?'<a href="'+_esc(tp.link)+'" target="_blank" class="tp-action-btn" style="text-decoration:none;">🔗 Profile</a>':'')
    +(tp.email?'<a href="mailto:'+_esc(tp.email)+'" class="tp-action-btn" style="text-decoration:none;">✉ Contact</a>':'')
    +(isOwner?'<button class="tp-action-btn" onclick="tpOpenEdit(\''+tp.id+'\')">✏ Edit</button>':'')
    +(isOwner?'<button class="tp-action-btn danger" onclick="tpDelete(\''+tp.id+'\',\''+_esc(tp.name)+'\')">🗑 Delete</button>':'')
    +'</div>'+'</div>'+'</div>'+'</div>';
}

/* ══ RANKINGS ══ */
function tpRenderRankings(data) {
  if(!data.length)return '';
  var medals=['🥇','🥈','🥉'];
  return '<div style="background:var(--card);border:1.5px solid var(--fog);border-radius:14px;overflow:hidden;">'
    +'<div style="padding:14px 18px;border-bottom:1.5px solid var(--fog);font-weight:800;font-size:.85rem;">🏆 TP Rankings — by Avg Rating</div>'
    +data.map(function(tp,i){
      var conns=(TP_ALL_CONNS[tp.id]||[]).length;
      var medal=medals[i]||('<span style="font-size:.78rem;font-weight:800;color:var(--mist);">#'+(i+1)+'</span>');
      return '<div style="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--fog);transition:background .15s;" onmouseover="this.style.background=\'var(--snow)\'" onmouseout="this.style.background=\'\'"> '
        +'<div class="tp-rank-medal">'+medal+'</div>'
        +tpAvatarHTML(tp.name,null,36,'.8rem')
        +'<div style="flex:1;min-width:0;">'
        +'<div class="tp-name" style="font-size:.85rem;">'+_esc(tp.name)+'</div>'
        +(tp.org?'<div class="tp-org">'+_esc(tp.org)+'</div>':'')
        +(tp.location?'<div style="font-size:.62rem;color:var(--mist);">📍 '+_esc(tp.location)+'</div>':'')
        +'<div style="display:flex;align-items:center;gap:5px;margin-top:3px;">'
        +tpAvatarHTML(tp.ownerName||tp.ownerEmail||'?',tp.ownerAvatar,16,'.4rem')
        +'<span style="font-size:.6rem;color:var(--mist);">Added by <b>'+_esc(tp.ownerName||tp.ownerEmail||'?')+'</b>'+(tp.ownerUsername?' @'+_esc(tp.ownerUsername):'')+'</span>'
        +'</div></div>'
        +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:.92rem;font-weight:800;color:var(--ink);">'+(tp.avgRating?tp.avgRating.toFixed(1):'—')+'</div>'
        +'<div class="tp-star-display" style="font-size:.8rem;">'+tpStarsHTML(tp.avgRating||0)+'</div>'
        +'<div style="font-size:.6rem;color:var(--mist);margin-top:2px;">'+(tp.ratingCount||0)+' reviews · '+conns+' connections</div>'
        +'</div></div>';
    }).join('')+'</div>';
}

function tpStarsHTML(r){var f=Math.round(r),s='';for(var i=1;i<=5;i++)s+=i<=f?'★':'☆';return s;}

/* ══ CONNECT ══ */
async function tpToggleConnect(tpId) {
  if(!U||!U.email)return;
  var docId=tpId+'_'+U.email.replace(/[@.]/g,'_');
  var ref=_tpConnCol().doc(docId);
  var tpRef=_tpCol().doc(tpId);
  if(TP_MY_CONNECTS[tpId]){
    delete TP_MY_CONNECTS[tpId];
    if(TP_ALL_CONNS[tpId])TP_ALL_CONNS[tpId]=TP_ALL_CONNS[tpId].filter(function(c){return c.userEmail!==U.email;});
    try{await ref.delete();await tpRef.update({connectionCount:firebase.firestore.FieldValue.increment(-1)});}catch(e){console.warn(e);}
    tpRenderList(); tpRenderStats();
  } else {
    // Show work role modal before connecting
    tpOpenWorkRoleModal(tpId, null, true);
  }
}

/* ══ WORK ROLE MODAL ══ */
var TP_WORK_ROLE_PENDING = null; // {tpId, isNewConnect}

var TP_WORK_PRESETS = [
  'Calling','Field Visit','Data Entry','Marketing','Training',
  'Follow-up','Recruitment','Survey','Support','Lead Generation','Other'
];

function tpOpenWorkRoleModal(tpId, currentRole, isNewConnect) {
  TP_WORK_ROLE_PENDING = {tpId: tpId, isNewConnect: !!isNewConnect};
  var conns = TP_ALL_CONNS[tpId] || [];
  var myConn = conns.find(function(c){ return c.userEmail === (U&&U.email); });
  var existing = currentRole || (myConn && myConn.workRole) || '';

  var tp = TP_DATA.find(function(t){ return t.id === tpId; });
  var tpName = tp ? tp.name : 'this TP';

  var modal = document.getElementById('tpWorkRoleModal');
  if(!modal) { _tpBuildWorkRoleModal(); modal = document.getElementById('tpWorkRoleModal'); }

  document.getElementById('tpWorkRoleForName').textContent = 'Set your role for: ' + tpName;
  document.getElementById('tpWorkRoleInput').value = existing;
  document.getElementById('tpWorkRoleTitle').textContent = isNewConnect ? '🔗 Connect & Set Your Work' : '✏️ Update Your Work Role';

  // Render preset chips
  var presetEl = document.getElementById('tpWorkRolePresets');
  presetEl.innerHTML = TP_WORK_PRESETS.map(function(p){
    var sel = existing === p;
    return '<button class="tp-role-chip'+(sel?' selected':'')+'" onclick="tpSelectRolePreset(this,\''+p+'\')">'+_esc(p)+'</button>';
  }).join('');

  modal.style.display = 'flex';
  setTimeout(function(){ document.getElementById('tpWorkRoleInput').focus(); }, 80);
}

function _tpBuildWorkRoleModal() {
  var div = document.createElement('div');
  div.id = 'tpWorkRoleModal';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:8100;align-items:center;justify-content:center;';
  div.innerHTML = [
    '<div style="background:var(--card);border-radius:18px;padding:28px;width:min(460px,96vw);box-shadow:0 24px 64px rgba(0,0,0,.28);">',
      '<div style="font-size:1rem;font-weight:800;margin-bottom:4px;" id="tpWorkRoleTitle">🔗 Connect & Set Your Work</div>',
      '<div style="font-size:.75rem;color:var(--mist);margin-bottom:18px;" id="tpWorkRoleForName"></div>',
      '<div style="margin-bottom:10px;">',
        '<div style="font-size:.72rem;font-weight:700;margin-bottom:8px;">Quick Pick</div>',
        '<div id="tpWorkRolePresets" style="display:flex;flex-wrap:wrap;gap:7px;"></div>',
      '</div>',
      '<div style="margin-bottom:18px;">',
        '<div style="font-size:.72rem;font-weight:700;margin-bottom:6px;">Custom Work Description</div>',
        '<input id="tpWorkRoleInput" class="tp-inp" placeholder="e.g. Calling, Field visits, Data entry…" maxlength="80" oninput="tpRoleInputSync(this)">',
        '<div style="font-size:.66rem;color:var(--mist);margin-top:4px;">This will be visible to everyone connected to this TP.</div>',
      '</div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end;">',
        '<button class="btn bo btn-sm" onclick="tpCloseWorkRoleModal()">Cancel</button>',
        '<button class="btn bl btn-sm" onclick="tpSaveWorkRole()">Save & Connect</button>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(div);
  div.addEventListener('click', function(e){ if(e.target===div) tpCloseWorkRoleModal(); });
}

function tpSelectRolePreset(btn, val) {
  document.getElementById('tpWorkRoleInput').value = val;
  document.querySelectorAll('.tp-role-chip').forEach(function(c){ c.classList.remove('selected'); });
  btn.classList.add('selected');
}

function tpRoleInputSync(inp) {
  var v = inp.value.trim().toLowerCase();
  document.querySelectorAll('.tp-role-chip').forEach(function(c){
    c.classList.toggle('selected', c.textContent.toLowerCase() === v);
  });
}

function tpCloseWorkRoleModal() {
  var m = document.getElementById('tpWorkRoleModal');
  if(m) m.style.display = 'none';
  TP_WORK_ROLE_PENDING = null;
}

async function tpSaveWorkRole() {
  if(!TP_WORK_ROLE_PENDING) return;
  var tpId = TP_WORK_ROLE_PENDING.tpId;
  var isNew = TP_WORK_ROLE_PENDING.isNewConnect;
  var role = (document.getElementById('tpWorkRoleInput').value || '').trim();
  if(!U||!U.email) return tpToast('You must be signed in.','err');

  var docId = tpId+'_'+U.email.replace(/[@.]/g,'_');
  var ref = _tpConnCol().doc(docId);
  var tpRef = _tpCol().doc(tpId);

  tpCloseWorkRoleModal();

  if(isNew) {
    TP_MY_CONNECTS[tpId] = true;
    var _authUser = (typeof fbAuth !== 'undefined' && fbAuth.currentUser) ? fbAuth.currentUser : null;
    var _fullName = ((U.firstName||'')+' '+(U.lastName||'')).trim()
      || (_authUser && _authUser.displayName ? _authUser.displayName.trim() : '')
      || (U.email ? U.email.split('@')[0] : 'User');
    var _avatar = U.avatar || (_authUser && _authUser.photoURL) || null;
    var nc = {
      tpId:tpId, userEmail:U.email,
      userName: _fullName,
      userAvatar: _avatar, userUsername:U.username||null,
      workRole: role || '', connectedAt:Date.now()
    };
    if(!TP_ALL_CONNS[tpId]) TP_ALL_CONNS[tpId] = [];
    // Remove any stale local entry first
    TP_ALL_CONNS[tpId] = TP_ALL_CONNS[tpId].filter(function(c){ return c.userEmail !== U.email; });
    TP_ALL_CONNS[tpId].push(nc);
    try {
      await ref.set(nc);
      await tpRef.update({connectionCount:firebase.firestore.FieldValue.increment(1)});
      tpToast('Connected'+(role?' as: '+role:'')+' ✓','ok');
    } catch(e){ console.warn(e); tpToast('Error: '+e.message,'err'); }
  } else {
    // Update existing connection's work role
    var conns = TP_ALL_CONNS[tpId] || [];
    var myConn = conns.find(function(c){ return c.userEmail === U.email; });
    if(myConn) myConn.workRole = role;
    try {
      await ref.update({workRole: role});
      tpToast('Work role updated ✓','ok');
    } catch(e){ console.warn(e); tpToast('Error: '+e.message,'err'); }
  }
  tpRenderList(); tpRenderStats();
}

/* ══ SET WORK ROLE (for already-connected users) ══ */
function tpSetMyWorkRole(tpId) {
  if(!TP_MY_CONNECTS[tpId]) return;
  var conns = TP_ALL_CONNS[tpId] || [];
  var myConn = conns.find(function(c){ return c.userEmail === (U&&U.email); });
  tpOpenWorkRoleModal(tpId, myConn ? myConn.workRole : '', false);
  // Change the save button label
  setTimeout(function(){
    var btn = document.querySelector('#tpWorkRoleModal .btn.bl');
    if(btn) btn.textContent = 'Update Role';
  }, 30);
}

/* ══ CONNECTIONS MODAL ══ */
function tpViewConnections(tpId,tpName){
  var conns=(TP_ALL_CONNS[tpId]||[]).slice().sort(function(a,b){return(a.connectedAt||0)-(b.connectedAt||0);});
  var html='<div style="max-height:55vh;overflow-y:auto;padding:4px 0;">';
  if(!conns.length){html+='<div style="text-align:center;color:var(--mist);padding:28px;font-size:.8rem;">No connections yet — be the first!</div>';}
  else html+=conns.map(function(c){
    var rawName=c.userName||'';
    var cn=(rawName&&!rawName.includes('@'))?rawName:(rawName.split('@')[0]||'User');
    var isMe=c.userEmail===(U&&U.email);
    var date=c.connectedAt?new Date(c.connectedAt).toLocaleDateString():'';
    return '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--fog);">'
      +tpAvatarHTML(cn,c.userAvatar,42,'.88rem')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:.82rem;font-weight:700;">'+_esc(cn)+(isMe?' <span style="font-size:.6rem;color:#2563eb;font-weight:700;">(You)</span>':'')+'</div>'
      +(c.workRole?'<div style="margin-top:4px;"><span style="font-size:.62rem;padding:2px 9px;border-radius:20px;background:var(--lime-p);border:1px solid rgba(158,192,0,.2);color:var(--ink3);font-weight:600;">'+_esc(c.workRole)+'</span></div>':'<div style="font-size:.6rem;color:var(--mist);margin-top:2px;font-style:italic;">No work role set</div>')
      +'</div>'
      +'<div style="font-size:.63rem;color:var(--mist);flex-shrink:0;">'+date+'</div>'
      +'</div>';
  }).join('');
  html+='</div><div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn bo btn-sm" onclick="this.closest(\'.tp-ovl\').remove()">Close</button></div>';
  tpShowOverlay('🔗 Connections — '+_esc(tpName),conns.length+' connection'+(conns.length!==1?'s':''),html);
}

/* ══ ADD/EDIT MODAL ══ */
function tpOpenAddModal(){
  document.getElementById('tpEditId').value='';
  document.getElementById('tpModalTitle').textContent='Add Training Partner';
  ['tpFName','tpFOrg','tpFSkills','tpFEmail','tpFPhone','tpFLocation','tpFLink','tpFBio'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tpModal').style.display='flex';
}

function tpOpenEdit(tpId){
  var tp=TP_DATA.find(function(t){return t.id===tpId;});
  if(!tp)return;
  if(tp.ownerEmail!==(U&&U.email))return tpToast('Only the creator can edit this entry.','err');
  document.getElementById('tpEditId').value=tpId;
  document.getElementById('tpModalTitle').textContent='Edit Training Partner';
  document.getElementById('tpFName').value=tp.name||'';
  document.getElementById('tpFOrg').value=tp.org||'';
  document.getElementById('tpFSkills').value=tp.skills||'';
  document.getElementById('tpFEmail').value=tp.email||'';
  document.getElementById('tpFPhone').value=tp.phone||'';
  document.getElementById('tpFLocation').value=tp.location||'';
  document.getElementById('tpFLink').value=tp.link||'';
  document.getElementById('tpFBio').value=tp.bio||'';
  document.getElementById('tpModal').style.display='flex';
}

function tpCloseModal(){document.getElementById('tpModal').style.display='none';}

async function tpSaveTP(){
  var name=(document.getElementById('tpFName').value||'').trim();
  if(!name)return tpToast('Name is required.','err');
  if(!U||!U.email)return tpToast('You must be signed in.','err');
  var editId=document.getElementById('tpEditId').value;
  var p={
    name:name,
    org:(document.getElementById('tpFOrg').value||'').trim(),
    skills:(document.getElementById('tpFSkills').value||'').trim(),
    email:(document.getElementById('tpFEmail').value||'').trim(),
    phone:(document.getElementById('tpFPhone').value||'').trim(),
    location:(document.getElementById('tpFLocation').value||'').trim(),
    link:(document.getElementById('tpFLink').value||'').trim(),
    bio:(document.getElementById('tpFBio').value||'').trim(),
    updatedAt:Date.now(),
  };
  try{
    if(editId){
      var tp=TP_DATA.find(function(t){return t.id===editId;});
      if(!tp||tp.ownerEmail!==U.email)return tpToast('Permission denied.','err');
      await _tpCol().doc(editId).update(p);
      tpToast('Training Partner updated ✓','ok');
    }else{
      p.ownerEmail=U.email;
      p.ownerName=((U.firstName||'')+' '+(U.lastName||'')).trim()||U.email;
      p.ownerAvatar=U.avatar||null;
      p.ownerUsername=U.username||null;
      p.createdAt=Date.now();p.avgRating=0;p.ratingCount=0;p.connectionCount=0;
      await _tpCol().add(p);
      tpToast('Training Partner added ✓','ok');
    }
    tpCloseModal();
  }catch(e){console.error(e);tpToast('Error: '+e.message,'err');}
}

async function tpDelete(tpId,name){
  if(!confirm('Delete "'+name+'"? This cannot be undone.'))return;
  var tp=TP_DATA.find(function(t){return t.id===tpId;});
  if(!tp||tp.ownerEmail!==(U&&U.email))return tpToast('Permission denied.','err');
  try{await _tpCol().doc(tpId).delete();tpToast('Deleted.','ok');}catch(e){tpToast('Error: '+e.message,'err');}
}

/* ══ FEEDBACK ══ */
function tpOpenFeedback(tpId,tpName){
  if(!U||!U.email)return tpToast('You must be signed in.','err');
  var ex=TP_MY_FEEDS[tpId];
  TP_STAR_VAL=ex?ex.rating:0;
  document.getElementById('tpFeedbackTpId').value=tpId;
  document.getElementById('tpFeedbackExistingId').value=ex?ex.id:'';
  document.getElementById('tpFeedbackForName').textContent='For: '+tpName;
  document.getElementById('tpFeedbackComment').value=ex?(ex.comment||''):'';
  tpPickStar(TP_STAR_VAL);
  document.getElementById('tpFeedbackModal').style.display='flex';
}

function tpCloseFeedbackModal(){document.getElementById('tpFeedbackModal').style.display='none';}

function tpPickStar(val){
  TP_STAR_VAL=val;
  var labels=['','Poor','Fair','Good','Very Good','Excellent'];
  document.getElementById('tpStarLabel').textContent=val?labels[val]+' ('+val+'/5)':'Click a star to rate';
  document.querySelectorAll('.tp-star').forEach(function(s){var v=parseInt(s.dataset.v);s.textContent=v<=val?'★':'☆';s.style.color=v<=val?'#f59e0b':'var(--mist2)';});
}

async function tpSubmitFeedback(){
  if(!TP_STAR_VAL)return tpToast('Please select a star rating.','err');
  var tpId=document.getElementById('tpFeedbackTpId').value;
  var existId=document.getElementById('tpFeedbackExistingId').value;
  var comment=(document.getElementById('tpFeedbackComment').value||'').trim();
  var fp={rating:TP_STAR_VAL,comment:comment,reviewerEmail:U.email,
    reviewerName:((U.firstName||'')+' '+(U.lastName||'')).trim()||U.email,
    reviewerAvatar:U.avatar||null,reviewerUsername:U.username||null,createdAt:Date.now()};
  try{
    var fbkRef=_tpFbkCol(tpId);
    if(existId)await fbkRef.doc(existId).update(fp);else await fbkRef.add(fp);
    var all=await fbkRef.get(); var ratings=[];
    all.forEach(function(d){ratings.push(d.data().rating||0);});
    var avg=ratings.length?ratings.reduce(function(s,r){return s+r;},0)/ratings.length:0;
    await _tpCol().doc(tpId).update({avgRating:parseFloat(avg.toFixed(2)),ratingCount:ratings.length});
    TP_MY_FEEDS[tpId]=Object.assign({id:existId||'new'},fp);
    tpCloseFeedbackModal();tpToast('Feedback submitted ✓','ok');
  }catch(e){console.error(e);tpToast('Error: '+e.message,'err');}
}

async function tpViewFeedback(tpId,tpName){
  var snap;
  try{snap=await _tpFbkCol(tpId).orderBy('createdAt','desc').get();}catch(e){tpToast('Error loading reviews.','err');return;}
  var items=[];snap.forEach(function(d){items.push(Object.assign({id:d.id},d.data()));});
  var html='<div style="max-height:60vh;overflow-y:auto;padding:4px 0;">';
  if(!items.length)html+='<div style="text-align:center;color:var(--mist);padding:28px;font-size:.8rem;">No reviews yet — be the first!</div>';
  else html+=items.map(function(f){
    var isMe=f.reviewerEmail===(U&&U.email);
    var rName=f.reviewerName||f.reviewerEmail||'Anonymous';
    var date=f.createdAt?new Date(f.createdAt).toLocaleDateString():'';
    return '<div class="tp-feedback-item">'
      +'<div style="display:flex;align-items:center;gap:10px;">'
      +tpAvatarHTML(rName,f.reviewerAvatar,32,'.7rem')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:.8rem;font-weight:700;">'+_esc(rName)+(isMe?' <span style="font-size:.6rem;color:#2563eb;">(You)</span>':'')+'</div>'
      +(f.reviewerUsername?'<div style="font-size:.62rem;color:var(--mist);font-family:\'DM Mono\',monospace;">@'+_esc(f.reviewerUsername)+'</div>':'')
      +'</div>'
      +'<div style="text-align:right;"><div style="color:#f59e0b;font-size:.9rem;">'+tpStarsHTML(f.rating)+'</div><div style="font-size:.62rem;color:var(--mist);">'+date+'</div></div>'
      +'</div>'
      +(f.comment?'<div style="font-size:.75rem;color:var(--ink3);margin-top:6px;line-height:1.6;padding-left:42px;">'+_esc(f.comment)+'</div>':'')
      +'</div>';
  }).join('');
  html+='</div><div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn bo btn-sm" onclick="this.closest(\'.tp-ovl\').remove()">Close</button></div>';
  tpShowOverlay('💬 Reviews — '+_esc(tpName),items.length+' review'+(items.length!==1?'s':''),html);
}

function tpShowOverlay(title,sub,body){
  var ovl=document.createElement('div');
  ovl.className='tp-ovl';
  ovl.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
  ovl.innerHTML='<div style="background:var(--card);border-radius:16px;padding:24px;width:min(520px,96vw);max-height:90vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    +'<div style="font-size:1rem;font-weight:800;margin-bottom:3px;">'+title+'</div>'
    +'<div style="font-size:.72rem;color:var(--mist);margin-bottom:16px;">'+sub+'</div>'
    +body+'</div>';
  document.body.appendChild(ovl);
  ovl.addEventListener('click',function(e){if(e.target===ovl)ovl.remove();});
}

/* ══ HOME WIDGET ══ */
function tpRenderHomeWidget(){
  var el=document.getElementById('tpHomeWidget');if(!el)return;
  if(!TP_DATA.length){el.innerHTML='<div style="text-align:center;color:var(--mist);font-size:.75rem;padding:20px;">No Training Partners yet. <a onclick="goView(\'tp\')" style="color:var(--lime-d);font-weight:700;cursor:pointer;">Add one →</a></div>';return;}
  var top3=TP_DATA.slice().sort(function(a,b){return(b.avgRating||0)-(a.avgRating||0);}).slice(0,3);
  el.innerHTML=top3.map(function(tp,i){
    var medals=['🥇','🥈','🥉'];
    var conns=(TP_ALL_CONNS[tp.id]||[]).length;
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--fog);">'
      +'<div style="font-size:1.1rem;width:22px;text-align:center;">'+medals[i]+'</div>'
      +tpAvatarHTML(tp.name,null,30,'.68rem')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:.78rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_esc(tp.name)+'</div>'
      +'<div style="display:flex;align-items:center;gap:5px;">'
      +tpAvatarHTML(tp.ownerName||tp.ownerEmail||'?',tp.ownerAvatar,14,'.4rem')
      +'<span style="font-size:.6rem;color:var(--mist);">'+_esc(tp.ownerName||tp.ownerEmail||'?')+'</span>'
      +'<span style="font-size:.6rem;color:var(--mist);">· '+(tp.avgRating?tp.avgRating.toFixed(1)+' ⭐ · ':'')+conns+' conn.</span>'
      +'</div></div>'
      +(TP_MY_CONNECTS[tp.id]?'<span style="font-size:.6rem;font-weight:700;color:#15803d;background:#f0fdf4;padding:2px 7px;border-radius:20px;">✔</span>':'')
      +'</div>';
  }).join('')+'<div style="text-align:right;padding-top:8px;"><a onclick="goView(\'tp\')" style="font-size:.72rem;font-weight:700;color:var(--lime-d);cursor:pointer;">See all partners →</a></div>';
}

function _esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function tpToast(msg,type){
  var t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:22px;right:22px;padding:10px 18px;border-radius:10px;font-size:.78rem;font-weight:700;z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,.15);';
  t.style.background=type==='ok'?'#dcfce7':'#fee2e2';
  t.style.color=type==='ok'?'#15803d':'#dc2626';
  t.style.border='1.5px solid '+(type==='ok'?'#86efac':'#fca5a5');
  t.textContent=msg;document.body.appendChild(t);
  setTimeout(function(){t.remove();},3200);
}
