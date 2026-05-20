// ══════════════════════════════════════════════════════════════════
//  NOVA STUDIO — Teams Manager  (v2.0)
//  Full-featured team workspace with data sharing & access control
//
//  Firestore Collections:
//    nova_teams/{teamId}                        — team document
//    nova_teams/{teamId}/members/{email}        — member sub-docs
//    nova_teams/{teamId}/shares/{shareId}       — shared links
//    nova_teams/{teamId}/posts/{postId}         — team feed posts
//    nova_teams/{teamId}/files/{fileId}         — shared file refs
<<<<<<< HEAD
//    nova_teams/{teamId}/tasks/{taskId}         — team tasks (assigned by leader/co-leader/manager)
=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
//
//  Public API:
//    TM.init()                 — call after auth
//    TM.openView()             — navigate to Teams view
//    TM.getMyTeams()           — returns array of teams user belongs to
//    TM.isMember(teamId,email) — async membership check
// ══════════════════════════════════════════════════════════════════

var TM = (function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────
  var _teams       = [];   // all teams user belongs to
  var _activeTeam  = null; // currently selected team
  var _unsub       = null; // firestore listener
  var _feedUnsub   = null; // feed listener
<<<<<<< HEAD
  var _tasksUnsub  = null; // tasks listener
  var _membersCache = {};  // teamId → members array
  var _memberRoles = {};   // teamId → { email → designation }

  // ─── Designation config ───────────────────────────────────────────
  var DESIGNATIONS = {
    'leader':     { label: '👑 Leader',     rank: 100, canAssignTasks: true,  canChangeRoles: true,  canInvite: true,  canRemove: true  },
    'co-leader':  { label: '🌟 Co-Leader',  rank: 80,  canAssignTasks: true,  canChangeRoles: false, canInvite: true,  canRemove: false },
    'manager':    { label: '🗂️ Manager',    rank: 60,  canAssignTasks: true,  canChangeRoles: false, canInvite: false, canRemove: false },
    'member':     { label: '👤 Member',     rank: 20,  canAssignTasks: false, canChangeRoles: false, canInvite: false, canRemove: false },
    'viewer':     { label: '👁️ Viewer',     rank: 10,  canAssignTasks: false, canChangeRoles: false, canInvite: false, canRemove: false }
  };

  function _getDesignation(team, email) {
    if (!team) return 'member';
    if (email === team.createdBy) return 'leader';
    var roles = (team.memberRoles || {});
    return roles[email] || 'member';
  }

  function _getDesignationInfo(d) {
    return DESIGNATIONS[d] || DESIGNATIONS['member'];
  }

  function _canDo(team, email, action) {
    var d = _getDesignation(team, email);
    var info = _getDesignationInfo(d);
    return !!info[action];
  }
=======
  var _membersCache = {};  // teamId → members array
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176

  // ─── Firestore helpers ────────────────────────────────────────────
  function _tCol()  { return fbDb.collection('nova_teams'); }
  function _uid()   { return U && U.email ? U.email : null; }
  function _uName() { return ((U&&U.firstName||'')+(U&&U.lastName?' '+U.lastName:'')).trim()||(U&&U.email)||'Unknown'; }
  function _esc(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmt(ts) {
    var d=new Date(ts), now=Date.now(), diff=now-ts;
    if(diff<60000) return 'just now';
    if(diff<3600000) return Math.floor(diff/60000)+'m ago';
    if(diff<86400000) return Math.floor(diff/3600000)+'h ago';
    if(diff<604800000) return Math.floor(diff/86400000)+'d ago';
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }
  function _avatar(name) {
    var parts=(name||'?').trim().split(/\s+/);
    var init=(parts[0][0]||'?')+(parts[1]?parts[1][0]:'');
    return init.toUpperCase();
  }
  function _color(str) {
    var colors=['#6d8400','#0891b2','#7c3aed','#db2777','#ea580c','#059669','#2563eb','#d97706'];
    var h=0; for(var i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))&0xffffffff;
    return colors[Math.abs(h)%colors.length];
  }

  // ─── Init ─────────────────────────────────────────────────────────
  function init() {
    if (!_uid()) return;
    _subscribeTeams();
  }

  function _subscribeTeams() {
    if (_unsub) _unsub();
    _unsub = _tCol()
      .where('memberEmails', 'array-contains', _uid())
      .orderBy('createdAt', 'desc')
      .onSnapshot(function(snap) {
        _teams = snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; });
        _renderView();
        // Re-sync NV (notifications) team list
        if (typeof NV !== 'undefined' && NV._refreshTeams) NV._refreshTeams(_teams);
      }, function(e){ console.warn('TM snap', e); });
  }

  // ─── Open view (called by goView — do NOT call goView from here) ─
  function openView() {
    _renderView();
  }

  // ─── Main render ─────────────────────────────────────────────────
  function _renderView() {
    var root = document.getElementById('viewTeams');
    if (!root) return;

    // If a team is open, render detail; otherwise render list
    if (_activeTeam) {
      _renderTeamDetail(root);
    } else {
      _renderTeamList(root);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEAM LIST VIEW
  // ═══════════════════════════════════════════════════════════════════
  function _renderTeamList(root) {
    var meId = _uid();

    root.innerHTML =
      // ── Header ──
      '<div class="tm-header">' +
        '<div class="tm-header-l">' +
          '<div class="tm-page-title">👥 My Teams</div>' +
          '<div class="tm-page-sub">Create workspaces, share data, collaborate with your team</div>' +
        '</div>' +
        '<button class="tm-btn-primary" onclick="TM._openCreateModal()">＋ New Team</button>' +
      '</div>' +

      // ── Stats bar ──
      '<div class="tm-stats-row">' +
        '<div class="tm-stat-card">' +
          '<div class="tm-stat-num" id="tmStatTeams">'+ _teams.length +'</div>' +
          '<div class="tm-stat-lbl">Teams</div>' +
        '</div>' +
        '<div class="tm-stat-card">' +
          '<div class="tm-stat-num" id="tmStatOwned">'+ _teams.filter(function(t){return t.createdBy===meId;}).length +'</div>' +
          '<div class="tm-stat-lbl">Owned</div>' +
        '</div>' +
        '<div class="tm-stat-card">' +
          '<div class="tm-stat-num" id="tmStatMembers">'+ _teams.reduce(function(a,t){return a+(t.memberEmails||[]).length;},0) +'</div>' +
          '<div class="tm-stat-lbl">Total Members</div>' +
        '</div>' +
      '</div>' +

      // ── Team grid ──
      '<div class="tm-grid" id="tmGrid">' +
        (_teams.length === 0 ?
          '<div class="tm-empty"><div class="tm-empty-ic">👥</div>' +
          '<div class="tm-empty-t">No teams yet</div>' +
          '<div class="tm-empty-s">Create your first team to start collaborating and sharing data securely.</div>' +
          '<button class="tm-btn-primary" onclick="TM._openCreateModal()" style="margin-top:16px;">＋ Create First Team</button>' +
          '</div>' :
          _teams.map(_renderTeamCard).join('')
        ) +
      '</div>' +

      // ── Create team modal ──
      _createTeamModalHTML() +
      // ── Invite modal ──
      _inviteModalHTML() +
      // ── Styles ──
      _inlineStyles();
  }

  function _renderTeamCard(team) {
    var meId = _uid();
    var isOwner = team.createdBy === meId;
    var members = team.memberEmails || [];
    var bg = team.color || _color(team.id);
    var initials = _avatar(team.name);
    var desc = _esc(team.description || 'No description');
    var company = team.company ? '<span class="tm-card-tag">🏢 '+_esc(team.company)+'</span>' : '';
    var project = team.project ? '<span class="tm-card-tag">📁 '+_esc(team.project)+'</span>' : '';

    // Member avatars (max 5)
    var memberAvatars = members.slice(0,5).map(function(em){
      var color = _color(em);
      var init  = (em||'?').slice(0,2).toUpperCase();
      return '<div class="tm-av" style="background:'+color+'" title="'+_esc(em)+'">'+init+'</div>';
    }).join('');
    var extra = members.length > 5 ? '<div class="tm-av tm-av-more">+' + (members.length-5) + '</div>' : '';

    return '<div class="tm-card" onclick="TM._openTeam(\''+team.id+'\')">' +
      '<div class="tm-card-top" style="background:'+bg+'">' +
        '<div class="tm-card-icon">'+initials+'</div>' +
        (isOwner ? '<div class="tm-card-owner-badge">Owner</div>' : '<div class="tm-card-member-badge">Member</div>') +
      '</div>' +
      '<div class="tm-card-body">' +
        '<div class="tm-card-name">'+_esc(team.name)+'</div>' +
        '<div class="tm-card-desc">'+desc+'</div>' +
        '<div class="tm-card-tags">'+company+project+'</div>' +
        '<div class="tm-card-footer">' +
          '<div class="tm-card-avs">'+memberAvatars+extra+'</div>' +
          '<div class="tm-card-count">'+members.length+' member'+(members.length!==1?'s':'')+'</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEAM DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════
  function _renderTeamDetail(root) {
    var team = _activeTeam;
    var meId = _uid();
    var isOwner = team.createdBy === meId;
    var members = team.memberEmails || [];
    var bg = team.color || _color(team.id);
    var initials = _avatar(team.name);

    root.innerHTML =
      // ── Back header ──
      '<div class="tm-detail-header">' +
        '<button class="tm-back-btn" onclick="TM._closeTeam()">← All Teams</button>' +
        '<div class="tm-detail-hero" style="background:'+bg+'">' +
          '<div class="tm-dh-icon">'+initials+'</div>' +
          '<div class="tm-dh-info">' +
            '<div class="tm-dh-name">'+_esc(team.name)+'</div>' +
            '<div class="tm-dh-meta">' +
              (team.company ? '🏢 '+_esc(team.company)+' · ' : '') +
              (team.project ? '📁 '+_esc(team.project)+' · ' : '') +
              members.length+' member'+(members.length!==1?'s':'') +
            '</div>' +
          '</div>' +
          '<div class="tm-dh-actions">' +
            (isOwner ?
              '<button class="tm-btn-sm" onclick="TM._openEditModal()" style="color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.15);">✏️ Edit</button>' +
              '<button class="tm-btn-sm" onclick="TM._openInviteModal(\''+team.id+'\')" style="color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.15);">＋ Add Member</button>'
              :
              '<button class="tm-btn-sm tm-btn-danger-sm" onclick="TM._leaveTeam(\''+team.id+'\')" style="color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.15);">🚪 Leave</button>'
            ) +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Tab bar ──
      '<div class="tm-tabs">' +
        '<button class="tm-tab active" id="tmTabFeed"    onclick="TM._switchTab(\'feed\')">💬 Team Feed</button>' +
<<<<<<< HEAD
        '<button class="tm-tab"        id="tmTabTasks"   onclick="TM._switchTab(\'tasks\')">✅ Tasks</button>' +
=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
        '<button class="tm-tab"        id="tmTabMembers" onclick="TM._switchTab(\'members\')">👥 Members</button>' +
        '<button class="tm-tab"        id="tmTabShares"  onclick="TM._switchTab(\'shares\')">🔗 Shared Links</button>' +
        '<button class="tm-tab"        id="tmTabFiles"   onclick="TM._switchTab(\'files\')">📁 Files</button>' +
        (isOwner ? '<button class="tm-tab" id="tmTabSettings" onclick="TM._switchTab(\'settings\')">⚙️ Settings</button>' : '') +
      '</div>' +

      // ── Tab panels ──
      '<div class="tm-tab-panels">' +
        '<div id="tmPanelFeed"    class="tm-panel active">'+_feedPanelHTML(team, isOwner)+'</div>' +
<<<<<<< HEAD
        '<div id="tmPanelTasks"   class="tm-panel">'+_tasksPanelHTML(team, isOwner)+'</div>' +
=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
        '<div id="tmPanelMembers" class="tm-panel">'+_membersPanelHTML(team, isOwner)+'</div>' +
        '<div id="tmPanelShares"  class="tm-panel">'+_sharesPanelHTML(team)+'</div>' +
        '<div id="tmPanelFiles"   class="tm-panel">'+_filesPanelHTML(team)+'</div>' +
        (isOwner ? '<div id="tmPanelSettings" class="tm-panel">'+_settingsPanelHTML(team)+'</div>' : '') +
      '</div>' +

      // ── Modals ──
      _editTeamModalHTML(team) +
      _inviteModalHTML() +
      _inlineStyles();

    // Load feed posts
<<<<<<< HEAD
    setTimeout(function(){ _loadFeed(team.id); _loadShares(team.id); _loadMembers(team.id); _loadFiles(team.id); _loadTasks(team.id); }, 100);
=======
    setTimeout(function(){ _loadFeed(team.id); _loadShares(team.id); _loadMembers(team.id); _loadFiles(team.id); }, 100);
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
  }

  // ─── Feed panel ──────────────────────────────────────────────────
  function _feedPanelHTML(team, isOwner) {
    return '<div class="tm-feed-wrap">' +
      // Post composer
      '<div class="tm-composer">' +
        '<div class="tm-composer-av" style="background:'+_color(_uid())+'">' + _avatar(_uName()) + '</div>' +
        '<div class="tm-composer-input">' +
          '<textarea id="tmPostText" placeholder="Share an update with your team…" rows="2" class="tm-textarea" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'"></textarea>' +
          '<div class="tm-composer-actions">' +
            '<div style="display:flex;gap:6px;">' +
              '<button class="tm-btn-ghost" onclick="TM._pickEmoji()">😊</button>' +
              '<button class="tm-btn-ghost" onclick="TM._attachLink()">🔗</button>' +
            '</div>' +
            '<button class="tm-btn-primary" onclick="TM._postToFeed(\''+team.id+'\')">Post →</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Feed list
      '<div id="tmFeedList" class="tm-feed-list">' +
        '<div class="tm-feed-loading">Loading team feed…</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Members panel ────────────────────────────────────────────────
  function _membersPanelHTML(team, isOwner) {
    var members = team.memberEmails || [];
<<<<<<< HEAD
    var meId = _uid();
    var myDesignation = _getDesignation(team, meId);
    var myInfo = _getDesignationInfo(myDesignation);
    var html = '<div class="tm-members-wrap">';

    // Invite bar for those with canInvite permission
    if (myInfo.canInvite) {
=======
    var html = '<div class="tm-members-wrap">';
    if (isOwner) {
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
      html += '<div class="tm-invite-bar">' +
        '<input id="tmInviteEmail" class="tm-input" placeholder="Invite by email address…" type="email">' +
        '<button class="tm-btn-primary" onclick="TM._inviteMember(\''+team.id+'\')">＋ Invite</button>' +
      '</div>';
    }
<<<<<<< HEAD

    // Designation legend
    html += '<div class="tm-role-legend">' +
      Object.keys(DESIGNATIONS).map(function(k){
        return '<span class="tm-role-badge tm-role-'+k+'">'+DESIGNATIONS[k].label+'</span>';
      }).join('') +
    '</div>';

=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
    html += '<div id="tmMembersList" class="tm-members-list">';
    if (members.length === 0) {
      html += '<div class="tm-empty-inline">No members found</div>';
    } else {
      html += members.map(function(em){
<<<<<<< HEAD
        var isMe = em === meId;
        var designation = _getDesignation(team, em);
        var dInfo = _getDesignationInfo(designation);
        var color = _color(em);
        var init  = (em||'?').slice(0,2).toUpperCase();
        var canChangeThis = myInfo.canChangeRoles && !isMe && em !== team.createdBy;
        var canAssignToThis = myInfo.canAssignTasks && !isMe;
        var canRemoveThis = myInfo.canRemove && !isMe && em !== team.createdBy;

        var actions = '';
        if (canChangeThis) {
          actions += '<button class="tm-btn-sm tm-role-change-btn" onclick="TM._openRoleModal(\''+team.id+'\',\''+_esc(em)+'\')" title="Change designation">🏷️ Role</button>';
        }
        if (canAssignToThis) {
          actions += '<button class="tm-btn-sm" style="background:rgba(37,99,235,.12);color:#2563eb;border-color:rgba(37,99,235,.3);" onclick="TM._openAssignTaskModal(\''+team.id+'\',\''+_esc(em)+'\')" title="Assign task">📋 Assign Task</button>';
        }
        if (canRemoveThis) {
          actions += '<button class="tm-btn-danger-sm" onclick="TM._removeMember(\''+team.id+'\',\''+_esc(em)+'\')">Remove</button>';
        }

=======
        var isMe = em === _uid();
        var isOwn = em === team.createdBy;
        var color = _color(em);
        var init  = (em||'?').slice(0,2).toUpperCase();
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
        return '<div class="tm-member-row">' +
          '<div class="tm-member-av" style="background:'+color+'">'+init+'</div>' +
          '<div class="tm-member-info">' +
            '<div class="tm-member-email">'+_esc(em)+(isMe?' <span class="tm-you-tag">you</span>':'')+'</div>' +
<<<<<<< HEAD
            '<div class="tm-member-role"><span class="tm-role-badge tm-role-'+designation+'">'+dInfo.label+'</span></div>' +
          '</div>' +
          (actions ? '<div class="tm-member-actions">'+actions+'</div>' : '') +
=======
            '<div class="tm-member-role">'+( isOwn ? '👑 Owner' : '👤 Member')+'</div>' +
          '</div>' +
          ( isOwner && !isOwn ?
            '<button class="tm-btn-danger-sm" onclick="TM._removeMember(\''+team.id+'\',\''+_esc(em)+'\')">Remove</button>'
            : ''
          ) +
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
        '</div>';
      }).join('');
    }
    html += '</div></div>';
<<<<<<< HEAD
    // Add modals
    html += _roleModalHTML(team) + _assignTaskModalHTML(team);
    return html;
  }

  // ─── Tasks panel ──────────────────────────────────────────────────
  function _tasksPanelHTML(team, isOwner) {
    var meId = _uid();
    var myDesignation = _getDesignation(team, meId);
    var myInfo = _getDesignationInfo(myDesignation);

    var assignBtn = myInfo.canAssignTasks
      ? '<button class="tm-btn-primary" onclick="TM._openAssignTaskModal(\''+team.id+'\',null)">＋ Assign Task</button>'
      : '';

    return '<div class="tm-tasks-wrap">' +
      '<div class="tm-tasks-header">' +
        '<div>' +
          '<div class="tm-tasks-title">Team Tasks</div>' +
          '<div class="tm-tasks-sub">Your role: <span class="tm-role-badge tm-role-'+myDesignation+'">'+myInfo.label+'</span></div>' +
        '</div>' +
        assignBtn +
      '</div>' +
      '<div class="tm-tasks-filters">' +
        '<button class="tm-filter-btn active" onclick="TM._filterTasks(\'all\',this)">All Tasks</button>' +
        '<button class="tm-filter-btn" onclick="TM._filterTasks(\'mine\',this)">My Tasks</button>' +
        '<button class="tm-filter-btn" onclick="TM._filterTasks(\'todo\',this)">To Do</button>' +
        '<button class="tm-filter-btn" onclick="TM._filterTasks(\'inprogress\',this)">In Progress</button>' +
        '<button class="tm-filter-btn" onclick="TM._filterTasks(\'done\',this)">Done</button>' +
      '</div>' +
      '<div id="tmTasksList" class="tm-tasks-list"><div class="tm-feed-loading">Loading tasks…</div></div>' +
      _assignTaskModalHTML(team) +
    '</div>';
  }

  // ─── Load tasks (real-time) ───────────────────────────────────────
  function _loadTasks(teamId) {
    if (_tasksUnsub) { _tasksUnsub(); _tasksUnsub = null; }
    var list = document.getElementById('tmTasksList');
    if (!list) return;

    _tasksUnsub = _tCol().doc(teamId).collection('tasks')
      .orderBy('createdAt', 'desc').limit(100)
      .onSnapshot(function(snap){
        var tasks = snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; });
        _renderTasksList(tasks, teamId);
      }, function(e){ console.warn('TM tasks', e); if(list) list.innerHTML='<div class="tm-empty-inline">Error loading tasks.</div>'; });
  }

  var _currentFilter = 'all';

  function _filterTasks(filter, btn) {
    _currentFilter = filter;
    document.querySelectorAll('.tm-filter-btn').forEach(function(b){ b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    // Re-render from cache
    _tCol().doc(_activeTeam.id).collection('tasks')
      .orderBy('createdAt', 'desc').limit(100).get()
      .then(function(snap){
        var tasks = snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; });
        _renderTasksList(tasks, _activeTeam.id);
      });
  }

  function _renderTasksList(tasks, teamId) {
    var list = document.getElementById('tmTasksList');
    if (!list) return;
    var meId = _uid();
    var team = _activeTeam;
    var myDesignation = _getDesignation(team, meId);
    var myInfo = _getDesignationInfo(myDesignation);

    // Filter
    var filtered = tasks.filter(function(t){
      if (_currentFilter === 'mine') return t.assignedTo === meId;
      if (_currentFilter === 'todo') return t.status === 'todo';
      if (_currentFilter === 'inprogress') return t.status === 'inprogress';
      if (_currentFilter === 'done') return t.status === 'done';
      return true;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<div class="tm-empty-inline"><div style="font-size:2rem;margin-bottom:8px;">✅</div>No tasks found. '+(myInfo.canAssignTasks?'Use "Assign Task" to create one!':'')+'</div>';
      return;
    }

    var statusColors = { todo: '#6b7280', inprogress: '#2563eb', done: '#16a34a' };
    var statusLabels = { todo: '⏳ To Do', inprogress: '🔄 In Progress', done: '✅ Done' };
    var priorityColors = { low: '#9ca3af', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed' };
    var priorityLabels = { low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High', urgent: '🟣 Urgent' };

    list.innerHTML = filtered.map(function(task){
      var isAssignee = task.assignedTo === meId;
      var canUpdateStatus = isAssignee || myInfo.canAssignTasks;
      var canDelete = myInfo.canAssignTasks || task.createdBy === meId;

      var statusBtn = canUpdateStatus
        ? '<select class="tm-task-status-sel" onchange="TM._updateTaskStatus(\''+teamId+'\',\''+task.id+'\',this.value)" title="Update status">' +
            ['todo','inprogress','done'].map(function(s){
              return '<option value="'+s+'"'+(task.status===s?' selected':'')+'>'+statusLabels[s]+'</option>';
            }).join('') +
          '</select>'
        : '<span class="tm-task-status-tag" style="background:'+statusColors[task.status||'todo']+'20;color:'+statusColors[task.status||'todo']+';border:1px solid '+statusColors[task.status||'todo']+'40;">'+statusLabels[task.status||'todo']+'</span>';

      var delBtn = canDelete
        ? '<button class="tm-task-del" onclick="TM._deleteTask(\''+teamId+'\',\''+task.id+'\')">✕</button>'
        : '';

      var assigneeName = task.assignedToName || task.assignedTo || 'Unknown';
      var assigneeColor = _color(task.assignedTo || '?');
      var assigneeInit = (assigneeName||'?').slice(0,2).toUpperCase();

      var due = task.dueDate ? '<span class="tm-task-due '+(new Date(task.dueDate)<new Date()&&task.status!=='done'?'tm-overdue':'')+'">📅 '+task.dueDate+'</span>' : '';
      var priority = task.priority ? '<span class="tm-task-priority" style="color:'+priorityColors[task.priority]+'">'+priorityLabels[task.priority]+'</span>' : '';

      return '<div class="tm-task-card '+(task.status==='done'?'tm-task-done':'')+'">' +
        '<div class="tm-task-top">' +
          '<div class="tm-task-title">'+_esc(task.title)+'</div>' +
          delBtn +
        '</div>' +
        (task.description ? '<div class="tm-task-desc">'+_esc(task.description)+'</div>' : '') +
        '<div class="tm-task-meta">' +
          '<div class="tm-task-assignee">' +
            '<div class="tm-task-av" style="background:'+assigneeColor+'">'+assigneeInit+'</div>' +
            '<span>'+_esc(assigneeName)+(isAssignee?' <span class="tm-you-tag">you</span>':'')+'</span>' +
          '</div>' +
          due + priority +
        '</div>' +
        '<div class="tm-task-footer">' +
          statusBtn +
          '<span class="tm-task-by">By '+_esc(task.createdByName||task.createdBy||'?')+' · '+_fmt(task.createdAt)+'</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ─── Assign task ──────────────────────────────────────────────────
  function _openAssignTaskModal(teamId, preselectedEmail) {
    // Render modal dynamically with member list
    var existing = document.getElementById('tmAssignTaskModal');
    if (!existing) return;
    existing.style.display = 'flex';
    existing.dataset.teamId = teamId;

    // Populate member select
    var sel = document.getElementById('tmTaskAssignee');
    if (sel && _activeTeam) {
      var members = _activeTeam.memberEmails || [];
      sel.innerHTML = members.map(function(em){
        var isMe = em === _uid();
        var d = _getDesignation(_activeTeam, em);
        var dInfo = _getDesignationInfo(d);
        return '<option value="'+_esc(em)+'"'+(em===preselectedEmail||isMe&&!preselectedEmail?' selected':'')+'>'+_esc(em)+' ('+dInfo.label+')</option>';
      }).join('');
    }

    // Reset form
    var fields = ['tmTaskTitle','tmTaskDesc','tmTaskDueDate'];
    fields.forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    var prio = document.getElementById('tmTaskPriority');
    if (prio) prio.value = 'medium';
  }

  function _closeAssignTaskModal() {
    var m = document.getElementById('tmAssignTaskModal');
    if (m) m.style.display = 'none';
  }

  async function _saveAssignTask() {
    var modal = document.getElementById('tmAssignTaskModal');
    if (!modal) return;
    var teamId = modal.dataset.teamId;
    var title = (document.getElementById('tmTaskTitle') && document.getElementById('tmTaskTitle').value || '').trim();
    var desc = (document.getElementById('tmTaskDesc') && document.getElementById('tmTaskDesc').value || '').trim();
    var assigneeEl = document.getElementById('tmTaskAssignee');
    var assignedTo = assigneeEl ? assigneeEl.value : '';
    var dueDate = document.getElementById('tmTaskDueDate') && document.getElementById('tmTaskDueDate').value || '';
    var priority = document.getElementById('tmTaskPriority') && document.getElementById('tmTaskPriority').value || 'medium';

    if (!title) return _toast('Task title is required','err');
    if (!assignedTo) return _toast('Select an assignee','err');

    // Get assignee display name
    var assigneeName = assignedTo;
    var assigneeOption = assigneeEl && assigneeEl.options[assigneeEl.selectedIndex];
    if (assigneeOption) assigneeName = assigneeOption.text.split(' (')[0];

    try {
      var team = _activeTeam || _teams.find(function(t){ return t.id===teamId; });
      await _tCol().doc(teamId).collection('tasks').add({
        title:           title,
        description:     desc,
        assignedTo:      assignedTo,
        assignedToName:  assigneeName,
        priority:        priority,
        dueDate:         dueDate,
        status:          'todo',
        createdBy:       _uid(),
        createdByName:   _uName(),
        createdAt:       Date.now()
      });

      // Notify assignee
      if (typeof NV !== 'undefined' && assignedTo !== _uid()) {
        NV.pushToUser(assignedTo, {
          type:  'task_assigned',
          title: 'New task assigned: "'+title+'"',
          body:  _uName()+' assigned you a task'+(team?' in team "'+team.name+'"':'')+': '+title,
          link:  null
        });
      }

      _closeAssignTaskModal();
      _toast('Task assigned ✓','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Update task status ───────────────────────────────────────────
  async function _updateTaskStatus(teamId, taskId, status) {
    try {
      await _tCol().doc(teamId).collection('tasks').doc(taskId).update({ status: status });
      _toast('Status updated ✓','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Delete task ──────────────────────────────────────────────────
  async function _deleteTask(teamId, taskId) {
    if (!confirm('Delete this task?')) return;
    try {
      await _tCol().doc(teamId).collection('tasks').doc(taskId).delete();
      _toast('Task deleted','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Change designation / role ────────────────────────────────────
  function _openRoleModal(teamId, email) {
    var m = document.getElementById('tmRoleModal');
    if (!m) return;
    m.dataset.teamId = teamId;
    m.dataset.email = email;
    m.style.display = 'flex';

    var nameEl = document.getElementById('tmRoleTargetName');
    if (nameEl) nameEl.textContent = email;

    var sel = document.getElementById('tmRoleSelect');
    if (sel && _activeTeam) {
      var current = _getDesignation(_activeTeam, email);
      // Only roles < leader (can't assign leader via UI; only 1 leader)
      sel.innerHTML = Object.keys(DESIGNATIONS).filter(function(k){ return k !== 'leader'; }).map(function(k){
        return '<option value="'+k+'"'+(current===k?' selected':'')+'>'+DESIGNATIONS[k].label+'</option>';
      }).join('');
    }
  }

  function _closeRoleModal() {
    var m = document.getElementById('tmRoleModal');
    if (m) m.style.display = 'none';
  }

  async function _saveRole() {
    var m = document.getElementById('tmRoleModal');
    if (!m) return;
    var teamId = m.dataset.teamId;
    var email  = m.dataset.email;
    var sel    = document.getElementById('tmRoleSelect');
    var role   = sel ? sel.value : 'member';

    try {
      // Firestore dot-notation update (e.g. "memberRoles.user@mail.com") treats
      // dots as field path separators and fails for email keys.
      // Fix: fetch current memberRoles, update in JS, then write the whole map back.
      var docSnap = await _tCol().doc(teamId).get();
      var currentRoles = (docSnap.exists && docSnap.data().memberRoles) || {};
      currentRoles[email] = role;
      await _tCol().doc(teamId).update({ memberRoles: currentRoles });

      // Notify member of role change
      if (typeof NV !== 'undefined' && email !== _uid()) {
        var dInfo = _getDesignationInfo(role);
        NV.pushToUser(email, {
          type:  'role_changed',
          title: 'Your team role was updated',
          body:  _uName()+' changed your designation to '+dInfo.label+((_activeTeam)?' in "'+_activeTeam.name+'"':''),
          link:  null
        });
      }

      // Immediately refresh _activeTeam so the UI reflects the change
      // without waiting for the Firestore snapshot (which may lag).
      if (_activeTeam && _activeTeam.id === teamId) {
        _activeTeam.memberRoles = currentRoles;
        _renderView();
      }

      _closeRoleModal();
      _toast('Designation updated ✓','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

=======
    return html;
  }

>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
  // ─── Shared links panel ───────────────────────────────────────────
  function _sharesPanelHTML(team) {
    return '<div class="tm-shares-wrap">' +
      '<div class="tm-shares-info">🔒 Only team members can view these links</div>' +
      '<div id="tmSharesList" class="tm-shares-list">' +
        '<div class="tm-feed-loading">Loading shared links…</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Settings panel ───────────────────────────────────────────────
  function _settingsPanelHTML(team) {
    var colors = ['#6d8400','#0891b2','#7c3aed','#db2777','#ea580c','#059669','#2563eb','#d97706'];
    var colorPicker = colors.map(function(c){
      var sel = (team.color===c) ? 'border:3px solid #000;' : '';
      return '<div class="tm-color-dot" style="background:'+c+';'+sel+'" onclick="TM._setColor(\''+team.id+'\',\''+c+'\')"></div>';
    }).join('');

    return '<div class="tm-settings-wrap">' +
      '<div class="tm-settings-section">' +
        '<div class="tm-settings-title">Team Color</div>' +
        '<div class="tm-color-row">'+colorPicker+'</div>' +
      '</div>' +
      '<div class="tm-settings-section">' +
        '<div class="tm-settings-title">Danger Zone</div>' +
        '<button class="tm-btn-danger" onclick="TM._deleteTeam(\''+team.id+'\')">🗑️ Delete This Team</button>' +
        '<div class="tm-settings-note">This will permanently delete the team and all its shared content. This cannot be undone.</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Switch tab ───────────────────────────────────────────────────
  function _switchTab(tab) {
<<<<<<< HEAD
    ['feed','tasks','members','shares','files','settings'].forEach(function(t){
=======
    ['feed','members','shares','files','settings'].forEach(function(t){
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
      var btn = document.getElementById('tmTab'+t[0].toUpperCase()+t.slice(1));
      var panel = document.getElementById('tmPanel'+t[0].toUpperCase()+t.slice(1));
      if (btn) btn.classList.toggle('active', t===tab);
      if (panel) panel.classList.toggle('active', t===tab);
    });
  }

  // ─── Load feed ────────────────────────────────────────────────────
  function _loadFeed(teamId) {
    if (_feedUnsub) { _feedUnsub(); _feedUnsub = null; }
    var list = document.getElementById('tmFeedList');
    if (!list) return;

    _feedUnsub = _tCol().doc(teamId).collection('posts')
      .orderBy('ts', 'desc').limit(30)
      .onSnapshot(function(snap){
        if (snap.empty) {
          list.innerHTML = '<div class="tm-empty-inline"><div style="font-size:2rem;margin-bottom:8px;">💬</div>No posts yet. Be the first to share an update!</div>';
          return;
        }
        list.innerHTML = snap.docs.map(function(d){
          var p = d.data(); p.id = d.id;
          var color = _color(p.authorEmail||'?');
          var init  = _avatar(p.authorName||p.authorEmail||'?');
          var isMe  = p.authorEmail === _uid();
          var linkHtml = p.link ?
            '<a href="'+_esc(p.link)+'" target="_blank" class="tm-post-link">🔗 '+_esc(p.linkTitle||p.link)+'</a>' : '';
          return '<div class="tm-post">' +
            '<div class="tm-post-av" style="background:'+color+'">'+init+'</div>' +
            '<div class="tm-post-content">' +
              '<div class="tm-post-meta">' +
                '<span class="tm-post-author">'+_esc(p.authorName||p.authorEmail)+'</span>' +
                (isMe ? '<span class="tm-you-tag">you</span>' : '') +
                '<span class="tm-post-time">'+_fmt(p.ts)+'</span>' +
              '</div>' +
              '<div class="tm-post-text">'+_esc(p.text)+'</div>' +
              linkHtml +
            '</div>' +
            (isMe ? '<button class="tm-post-del" title="Delete" onclick="TM._deletePost(\''+teamId+'\',\''+d.id+'\')">✕</button>' : '') +
          '</div>';
        }).join('');
      }, function(e){ console.warn('TM feed', e); });
  }

  // ─── Load shares ──────────────────────────────────────────────────
  function _loadShares(teamId) {
    var list = document.getElementById('tmSharesList');
    if (!list) return;
    _tCol().doc(teamId).collection('shares')
      .orderBy('sharedAt','desc').limit(30)
      .get().then(function(snap){
        if (snap.empty) {
          list.innerHTML = '<div class="tm-empty-inline">No shared links yet. Use the 🔗 Share with Team button on any content.</div>';
          return;
        }
        list.innerHTML = snap.docs.map(function(d){
          var s = d.data();
          var icons = {college:'🎓',tp:'🤝',generic:'🔗'};
          var icon = icons[s.type] || icons.generic;
          return '<div class="tm-share-row">' +
            '<div class="tm-share-icon">'+icon+'</div>' +
            '<div class="tm-share-info">' +
              '<div class="tm-share-title">'+_esc(s.title||'Shared Link')+'</div>' +
              '<div class="tm-share-meta">'+_esc(s.sharedBy||'')+'  ·  '+_fmt(s.sharedAt)+'</div>' +
            '</div>' +
            '<a href="'+_esc(s.url)+'" target="_blank" class="tm-share-open">Open →</a>' +
          '</div>';
        }).join('');
      }).catch(function(){ list.innerHTML = '<div class="tm-empty-inline">Error loading shares.</div>'; });
  }

  // ─── Load members (hydrate with display names from Firestore) ─────
  function _loadMembers(teamId) {
    // Already rendered from memberEmails; this could hydrate with names in future
  }

  // ─── Post to feed ─────────────────────────────────────────────────
  async function _postToFeed(teamId) {
    var textarea = document.getElementById('tmPostText');
    var text = (textarea && textarea.value || '').trim();
    if (!text) return _toast('Write something first','err');
    if (!_uid()) return _toast('Sign in first','err');

    var post = {
      text: text,
      authorEmail: _uid(),
      authorName:  _uName(),
      ts: Date.now(),
      link: null,
      linkTitle: null
    };

    // Check if text contains a URL
    var urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      post.link = urlMatch[0];
      post.linkTitle = urlMatch[0].replace(/https?:\/\//,'').slice(0,60);
    }

    try {
      await _tCol().doc(teamId).collection('posts').add(post);
      if (textarea) { textarea.value = ''; textarea.style.height='auto'; }

      // Notify all other members
      var team = _teams.find(function(t){ return t.id===teamId; });
      if (team && typeof NV !== 'undefined') {
        (team.memberEmails||[]).forEach(function(email){
          if (email === _uid()) return;
          NV.pushToUser(email, {
            type: 'team_post',
            title: _uName()+' posted in "'+team.name+'"',
            body: text.slice(0,80)+(text.length>80?'…':''),
            link: null
          });
        });
      }
      _toast('Posted ✓','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Delete post ──────────────────────────────────────────────────
  async function _deletePost(teamId, postId) {
    if (!confirm('Delete this post?')) return;
    try {
      await _tCol().doc(teamId).collection('posts').doc(postId).delete();
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Create team ─────────────────────────────────────────────────
  function _openCreateModal() {
    var m = document.getElementById('tmCreateModal');
    if (!m) return;
    m.style.display = 'flex';
    document.getElementById('tmNewName').focus();
  }

  function _closeCreateModal() {
    var m = document.getElementById('tmCreateModal');
    if (m) m.style.display = 'none';
  }

  async function _createTeam() {
    var name    = (document.getElementById('tmNewName')    && document.getElementById('tmNewName').value    || '').trim();
    var company = (document.getElementById('tmNewCompany') && document.getElementById('tmNewCompany').value || '').trim();
    var project = (document.getElementById('tmNewProject') && document.getElementById('tmNewProject').value || '').trim();
    var desc    = (document.getElementById('tmNewDesc')    && document.getElementById('tmNewDesc').value    || '').trim();
    var privacy = document.getElementById('tmNewPrivacy') && document.getElementById('tmNewPrivacy').value || 'members';

    if (!name) return _toast('Team name is required','err');
    if (!_uid()) return _toast('Sign in first','err');

    try {
      var ref = await _tCol().add({
        name:         name,
        company:      company,
        project:      project,
        description:  desc,
        privacy:      privacy,
        createdBy:    _uid(),
        memberEmails: [_uid()],
        color:        null,
        createdAt:    Date.now()
      });
      _closeCreateModal();

      // Push self-notification
      if (typeof NV !== 'undefined') {
        NV.pushToUser(_uid(), {
          type: 'team_create',
          title: 'Team "'+name+'" created!',
          body: 'You can now invite members and start sharing.',
          link: null
        });
      }
      _toast('Team "'+name+'" created ✓','ok');

      // Auto-open the new team
      setTimeout(function(){
        var newTeam = _teams.find(function(t){ return t.id===ref.id; });
        if (newTeam) { _activeTeam = newTeam; _renderView(); }
      }, 600);

    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Open/close team ──────────────────────────────────────────────
  function _openTeam(teamId) {
    var team = _teams.find(function(t){ return t.id===teamId; });
    if (!team) return;
    _activeTeam = team;
    _renderView();
  }

  function _closeTeam() {
    if (_feedUnsub) { _feedUnsub(); _feedUnsub = null; }
<<<<<<< HEAD
    if (_tasksUnsub) { _tasksUnsub(); _tasksUnsub = null; }
=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
    _activeTeam = null;
    _renderView();
  }

  // ─── Invite member ────────────────────────────────────────────────
  function _openInviteModal(teamId) {
    var m = document.getElementById('tmInviteModal');
    if (!m) return;
    m.dataset.teamId = teamId;
    m.style.display = 'flex';

    // Reset copy button state
    var copyBtn = document.getElementById('tmCopyLinkBtn');
    if (copyBtn) copyBtn.textContent = 'Copy';
    var msg = document.getElementById('tmInviteLinkMsg');
    if (msg) msg.style.display = 'none';

    // Generate invite token and set link
    var linkBox = document.getElementById('tmInviteLinkBox');
    if (linkBox) {
      linkBox.value = 'Generating…';
      var token = Date.now().toString(36) + Math.random().toString(36).slice(2);
      var team  = _teams.find(function(t){ return t.id === teamId; });
      fbDb.collection('nova_invites').doc(token).set({
        teamId:    teamId,
        teamName:  team ? team.name : teamId,
        toEmail:   null,
        fromEmail: _uid(),
        fromName:  (U && (U.firstName + (U.lastName ? ' '+U.lastName : ''))) || _uid(),
        createdAt: Date.now(),
        accepted:  false,
        multiUse:  true
      }).then(function() {
        var appUrl = window.location.origin + window.location.pathname;
        var link   = appUrl + '?accept_invite=' + token;
        linkBox.value = link;
        m.dataset.inviteLink = link;
      }).catch(function(e) {
        linkBox.value = 'Error generating link — check permissions';
      });
    }
  }

  function _copyInviteLink() {
    var m    = document.getElementById('tmInviteModal');
    var link = m && m.dataset.inviteLink;
    if (!link) return;
    navigator.clipboard.writeText(link).then(function() {
      var btn = document.getElementById('tmCopyLinkBtn');
      var msg = document.getElementById('tmInviteLinkMsg');
      if (btn) btn.textContent = 'Copied!';
      if (msg) msg.style.display = 'block';
      setTimeout(function(){ if (btn) btn.textContent = 'Copy'; }, 3000);
    });
  }

  function _closeInviteModal() {
    var m = document.getElementById('tmInviteModal');
    if (m) m.style.display = 'none';
  }

  async function _inviteMember(teamId) {
    var inp = document.getElementById('tmInviteEmail') || document.getElementById('tmInviteInput');
    var email = (inp && inp.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return _toast('Enter a valid email','err');

    var team = _activeTeam || _teams.find(function(t){ return t.id===teamId; });
    if (!team) return;
    if ((team.memberEmails||[]).includes(email)) return _toast('Already a member','err');

    try {
      // Generate a unique invite token stored in Firestore
      var inviteToken = Date.now().toString(36) + Math.random().toString(36).slice(2);
      var inviteRef = fbDb.collection('nova_invites').doc(inviteToken);
      await inviteRef.set({
        teamId:    teamId,
        teamName:  team.name,
        toEmail:   email,
        fromEmail: _uid(),
        fromName:  (U && (U.firstName + (U.lastName ? ' '+U.lastName : ''))) || _uid(),
        createdAt: Date.now(),
        accepted:  false
      });

      // Build accept link
      var appUrl = window.location.origin + window.location.pathname;
      var acceptLink = appUrl + '?accept_invite=' + inviteToken;

      // Push in-app notification to the invited user
      if (typeof NV !== 'undefined') {
        NV.pushToUser(email, {
          type:  'team_invite',
          title: 'You\'re invited to join "' + team.name + '"',
          body:  ((U && U.firstName) || _uid()) + ' invited you to join the team "' + team.name + '" on NOVA Studio.',
          link:  acceptLink
        });
      }

      // Send invitation email via Brevo if API key is configured
      var brevoKey = localStorage.getItem('brevo_api_key') || (typeof BREVO_API_KEY !== 'undefined' ? BREVO_API_KEY : '');
      if (brevoKey) {
        var senderName  = localStorage.getItem('brevo_sender_name')  || (U && U.firstName) || 'NOVA Studio';
        var senderEmail = localStorage.getItem('brevo_sender_email') || _uid();
        var inviterName = (U && (U.firstName + (U.lastName ? ' '+U.lastName : ''))) || _uid();
        var emailHtml =
          '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;">' +
          '<div style="font-size:2rem;margin-bottom:12px;">👥</div>' +
          '<h2 style="font-size:1.2rem;font-weight:800;color:#0d0f12;margin:0 0 8px;">You\'re invited to join a team!</h2>' +
          '<p style="color:#6b7280;font-size:.9rem;line-height:1.6;margin:0 0 20px;">' +
            '<b style="color:#0d0f12;">' + inviterName + '</b> has invited you to join the team ' +
            '<b style="color:#0d0f12;">"' + team.name + '"</b> on NOVA Studio.' +
          '</p>' +
          '<a href="' + acceptLink + '" style="display:inline-block;padding:12px 28px;background:#6d8400;color:#fff;font-weight:700;font-size:.9rem;border-radius:10px;text-decoration:none;margin-bottom:24px;">Accept Invitation →</a>' +
          '<p style="color:#9ca3af;font-size:.75rem;line-height:1.5;">If you don\'t have a NOVA Studio account yet, you\'ll be asked to create one first.<br>This invitation link expires after 7 days.</p>' +
          '<hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;">' +
          '<p style="color:#d1d5db;font-size:.68rem;">Sent via NOVA Studio</p>' +
          '</div>';

        fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'accept':'application/json', 'api-key': brevoKey, 'content-type':'application/json' },
          body: JSON.stringify({
            sender:      { name: senderName, email: senderEmail },
            to:          [{ email: email }],
            subject:     inviterName + ' invited you to join "' + team.name + '" on NOVA Studio',
            htmlContent: emailHtml
          })
        }).catch(function(e){ console.warn('Invite email error:', e); });
      }

      if (inp) inp.value = '';
      _closeInviteModal();
      _toast('Invitation sent to ' + email + ' ✓', 'ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Remove member ────────────────────────────────────────────────
  async function _removeMember(teamId, email) {
    if (!confirm('Remove '+email+' from this team?')) return;
    try {
      await _tCol().doc(teamId).update({
        memberEmails: firebase.firestore.FieldValue.arrayRemove(email)
      });
      _toast('Removed '+email,'ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Leave team ───────────────────────────────────────────────────
  async function _leaveTeam(teamId) {
    if (!confirm('Leave this team? You will lose access to all shared content.')) return;
    try {
      await _tCol().doc(teamId).update({
        memberEmails: firebase.firestore.FieldValue.arrayRemove(_uid())
      });
      _closeTeam();
      _toast('Left team','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Delete team ──────────────────────────────────────────────────
  async function _deleteTeam(teamId) {
    if (!confirm('DELETE this team? All posts and shared links will be permanently lost.')) return;
    try {
      // Delete sub-collections
      var batch = fbDb.batch();
      var [posts, shares] = await Promise.all([
        _tCol().doc(teamId).collection('posts').get(),
        _tCol().doc(teamId).collection('shares').get()
      ]);
      posts.forEach(function(d){ batch.delete(d.ref); });
      shares.forEach(function(d){ batch.delete(d.ref); });
      batch.delete(_tCol().doc(teamId));
      await batch.commit();
      _closeTeam();
      _toast('Team deleted','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Edit team ────────────────────────────────────────────────────
  function _openEditModal() {
    var m = document.getElementById('tmEditModal');
    if (m) m.style.display = 'flex';
  }

  function _closeEditModal() {
    var m = document.getElementById('tmEditModal');
    if (m) m.style.display = 'none';
  }

  async function _saveEdit(teamId) {
    var name    = (document.getElementById('tmEditName')    && document.getElementById('tmEditName').value    || '').trim();
    var company = (document.getElementById('tmEditCompany') && document.getElementById('tmEditCompany').value || '').trim();
    var project = (document.getElementById('tmEditProject') && document.getElementById('tmEditProject').value || '').trim();
    var desc    = (document.getElementById('tmEditDesc')    && document.getElementById('tmEditDesc').value    || '').trim();

    if (!name) return _toast('Name required','err');
    try {
      await _tCol().doc(teamId).update({ name, company, project, description: desc });
      _closeEditModal();
      _toast('Team updated ✓','ok');
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Set color ────────────────────────────────────────────────────
  async function _setColor(teamId, color) {
    try {
      await _tCol().doc(teamId).update({ color });
      _toast('Color updated ✓','ok');
      // Update dots
      document.querySelectorAll('.tm-color-dot').forEach(function(d){
        d.style.border = d.style.background === color ? '3px solid #000' : '';
      });
    } catch(e) { _toast('Error: '+e.message,'err'); }
  }

  // ─── Emoji / link helpers (stubs) ─────────────────────────────────
  function _pickEmoji() {
    var ta = document.getElementById('tmPostText');
    if (!ta) return;
    var emojis = ['👋','🎉','✅','🚀','💡','📌','🔥','👀','🤝','📊'];
    var e = emojis[Math.floor(Math.random()*emojis.length)];
    ta.value += e; ta.focus();
  }


  // ─── Files panel (Google Drive — shared with all members) ───────
  function _filesPanelHTML(team) {
    var hasDrive = !!(typeof NOVA_DRIVE_TOKEN !== 'undefined' && NOVA_DRIVE_TOKEN) ||
      !!(function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return false; } })();
    var statusMsg = hasDrive
      ? '&#9729;&#65039; Files saved to your Google Drive &mdash; NOVA Backend folder'
      : '&#128101; Shared team files &mdash; preview &amp; download directly';
    return '<div class="tm-files-wrap">' +
      '<div class="tm-gdrive-status tm-gdrive-ok" style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:1.1rem;">&#128194;</span>' +
        '<span>' + statusMsg + '</span>' +
      '</div>' +
      '<div class="tm-upload-zone" id="tmUploadZone"' +
        ' ondragover="event.preventDefault();this.classList.add(\'tm-dz-over\')"' +
        ' ondragleave="this.classList.remove(\'tm-dz-over\')"' +
        ' ondrop="event.preventDefault();this.classList.remove(\'tm-dz-over\');TM._handleDrop(event,\'' + team.id + '\')">' +
        '<div class="tm-upload-icon">&#128228;</div>' +
        '<div class="tm-upload-label">Drag and drop files here</div>' +
        '<div class="tm-upload-sub">or</div>' +
        '<label class="tm-btn-primary tm-upload-pick" style="cursor:pointer;display:inline-block;">Choose Files' +
          '<input type="file" id="tmFileInput" multiple style="display:none;" onchange="TM._uploadFiles(event,\'' + team.id + '\')">' +
        '</label>' +
        '<div class="tm-upload-hint">Files are stored securely and instantly visible to all team members</div>' +
      '</div>' +
      '<div id="tmUploadProgress" style="display:none;" class="tm-progress-wrap"></div>' +
      '<div id="tmFilesList" class="tm-files-list"><div class="tm-feed-loading">Loading files...</div></div>' +
    '</div>';
  }

  function _openDriveSetup() {
    if (typeof openGDriveModal === 'function') openGDriveModal();
    else alert('Go to Settings > Integrations > Google Drive to connect.');
  }

  function _loadFiles(teamId) {
    var list = document.getElementById('tmFilesList');
    if (!list) return;
    _tCol().doc(teamId).collection('files')
      .orderBy('uploadedAt', 'desc').limit(50)
      .get().then(function(snap) {
        if (snap.empty) {
          list.innerHTML = '<div class="tm-empty-inline"><div style="font-size:2rem;margin-bottom:8px;">&#128237;</div>No files yet. Upload something above!</div>';
          return;
        }
        list.innerHTML = snap.docs.map(function(d) {
          var f = d.data(); f.id = d.id;
          var isMe = f.uploadedBy === _uid();
          var size = _fmtSize(f.size || 0);
          var extLower = ((f.name||'').split('.').pop()||'').toLowerCase();
          var ext = extLower.toUpperCase().slice(0,4);
          var isDriveFile = !!f.driveFileId;

          // Determine the best available URL (Firebase Storage preferred, Drive fallback)
          var fileUrl = f.fileUrl || f.driveUrl || null;
          var driveViewUrl = f.driveViewUrl || null;
          var isPreviewable = fileUrl && /^(jpg|jpeg|png|gif|webp|pdf|mp4|webm|mp3)$/.test(extLower);

          // Thumbnail (mini visual preview)
          var thumbHtml = _renderFileThumb(f, extLower, isDriveFile);

          // Preview button
          var previewBtn = (fileUrl && isPreviewable)
            ? '<button class="tm-btn-sm" style="color:#fff;background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);" ' +
                'onclick="TM._previewFile(\'' + _esc(fileUrl) + '\',\'' + _esc(f.name) + '\',\'' + _esc(f.type||'') + '\')">&#128065; Preview</button>'
            : '';

          // Download button: use blob download for all files (Drive files now public)
          var downloadBtn = '';
          if (fileUrl || driveViewUrl) {
            // For public Drive files use direct URL; for private Drive fallback to viewer
            var dlUrl = fileUrl || driveViewUrl;
            var dlIsDrive = isDriveFile && !f.isPublic;
            downloadBtn = '<button class="tm-btn-sm" style="color:#fff;background:rgba(99,200,99,.25);border-color:rgba(99,200,99,.4);" ' +
              'onclick="TM._downloadFile(\'' + _esc(dlUrl) + '\',\'' + _esc(f.name) + '\',' + (dlIsDrive ? 'true' : 'false') + ')">&#11015; Download</button>';
          }

          var delBtn = isMe
            ? '<button class="tm-btn-danger-sm" onclick="TM._deleteFile(\'' + teamId + '\',\'' + d.id + '\',\'' + _esc(f.driveFileId||'') + '\')">&#128465; Remove</button>'
            : '';

          // Show "Fix Access" for old private Drive files uploaded before auto-share was added
          var fixAccessBtn = (isDriveFile && !f.isPublic && f.driveFileId && isMe)
            ? '<button class="tm-btn-sm" style="color:#fff;background:rgba(251,146,60,.25);border-color:rgba(251,146,60,.5);font-size:.7rem;" ' +
                'onclick="TM._fixFileAccess(\'' + d.id + '\',\'' + _esc(f.driveFileId) + '\',\'' + teamId + '\')" title="Make this file downloadable by all team members">⚠ Fix Access</button>'
            : '';

          return '<div class="tm-file-row">' +
            thumbHtml +
            '<div class="tm-file-info">' +
              '<div class="tm-file-name">' + _esc(f.name) + '</div>' +
              '<div class="tm-file-meta">' + size + ' &middot; ' + _esc(f.uploadedByName || f.uploadedBy || 'Unknown') + ' &middot; ' + _fmt(f.uploadedAt) + '</div>' +
            '</div>' +
            '<div class="tm-file-actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
              previewBtn + downloadBtn + fixAccessBtn + delBtn +
            '</div>' +
          '</div>';
        }).join('');
      }).catch(function() {
        if (list) list.innerHTML = '<div class="tm-empty-inline">Error loading files.</div>';
      });
  }

  // ─── File thumbnail renderer ─────────────────────────────────────
  function _renderFileThumb(f, extLower, isDriveFile) {
    var isImage  = /^(jpg|jpeg|png|gif|webp)$/.test(extLower);
    var isExcel  = /^(xlsx|xls|csv|ods|tsv)$/.test(extLower);
    var isPdf    = extLower === 'pdf';
    var isWord   = /^(doc|docx|odt|rtf)$/.test(extLower);
    var isPpt    = /^(ppt|pptx|odp)$/.test(extLower);
    var isVideo  = /^(mp4|webm|mov|avi)$/.test(extLower);
    var isAudio  = /^(mp3|wav|ogg|aac)$/.test(extLower);
    var isCode   = /^(js|ts|py|java|html|css|json|xml|yml|yaml|sh|php|rb|go|rs|c|cpp|cs|swift)$/.test(extLower);
    var ext4 = extLower.toUpperCase().slice(0,4);

    var base = 'flex-shrink:0;border-radius:8px;width:70px;height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;';

    if (isImage) {
      // Public Drive files: use direct thumbnail; Firebase: use fileUrl directly
      var thumbSrc = (isDriveFile && f.driveFileId)
        ? 'https://drive.google.com/thumbnail?id=' + f.driveFileId + '&sz=w160'
        : (f.fileUrl || '');
      return '<div style="' + base + 'background:#111;border:1.5px solid rgba(255,255,255,.12);">' +
        '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;" ' +
        'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
        '<div style="display:none;font-size:1.4rem;align-items:center;justify-content:center;width:100%;height:100%;">&#128247;</div>' +
        '</div>';
    }
    if (isExcel) {
      return '<div style="' + base + 'background:rgba(22,163,74,.12);border:1.5px solid rgba(22,163,74,.35);padding:5px;gap:3px;">' +
        '<div style="font-size:.55rem;font-weight:900;color:#16a34a;letter-spacing:.04em;">' + ext4 + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5px;width:100%;">' +
          '<div style="background:rgba(22,163,74,.5);border-radius:1px;height:6px;"></div>' +
          '<div style="background:rgba(22,163,74,.5);border-radius:1px;height:6px;"></div>' +
          '<div style="background:rgba(22,163,74,.5);border-radius:1px;height:6px;"></div>' +
          '<div style="background:rgba(22,163,74,.25);border-radius:1px;height:5px;"></div>' +
          '<div style="background:rgba(22,163,74,.25);border-radius:1px;height:5px;"></div>' +
          '<div style="background:rgba(22,163,74,.25);border-radius:1px;height:5px;"></div>' +
          '<div style="background:rgba(22,163,74,.15);border-radius:1px;height:5px;"></div>' +
          '<div style="background:rgba(22,163,74,.15);border-radius:1px;height:5px;"></div>' +
          '<div style="background:rgba(22,163,74,.15);border-radius:1px;height:5px;"></div>' +
        '</div>' +
      '</div>';
    }
    if (isPdf) {
      return '<div style="' + base + 'background:rgba(220,38,38,.12);border:1.5px solid rgba(220,38,38,.35);gap:2px;">' +
        '<div style="font-size:1.3rem;">&#128196;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#dc2626;letter-spacing:.04em;">PDF</div>' +
      '</div>';
    }
    if (isWord) {
      return '<div style="' + base + 'background:rgba(37,99,235,.12);border:1.5px solid rgba(37,99,235,.35);gap:2px;">' +
        '<div style="font-size:1.3rem;">&#128196;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#2563eb;letter-spacing:.04em;">' + ext4 + '</div>' +
      '</div>';
    }
    if (isPpt) {
      return '<div style="' + base + 'background:rgba(234,88,12,.12);border:1.5px solid rgba(234,88,12,.35);gap:2px;">' +
        '<div style="font-size:1.3rem;">&#128204;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#ea580c;letter-spacing:.04em;">' + ext4 + '</div>' +
      '</div>';
    }
    if (isVideo) {
      return '<div style="' + base + 'background:rgba(124,58,237,.12);border:1.5px solid rgba(124,58,237,.35);gap:2px;">' +
        '<div style="font-size:1.3rem;">&#127916;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#7c3aed;letter-spacing:.04em;">' + ext4 + '</div>' +
      '</div>';
    }
    if (isAudio) {
      return '<div style="' + base + 'background:rgba(219,39,119,.12);border:1.5px solid rgba(219,39,119,.35);gap:2px;">' +
        '<div style="font-size:1.3rem;">&#127925;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#db2777;letter-spacing:.04em;">' + ext4 + '</div>' +
      '</div>';
    }
    if (isCode) {
      return '<div style="' + base + 'background:rgba(15,23,42,.7);border:1.5px solid rgba(99,102,241,.4);gap:2px;">' +
        '<div style="font-size:1.1rem;">&#128187;</div>' +
        '<div style="font-size:.55rem;font-weight:900;color:#818cf8;letter-spacing:.04em;">' + ext4 + '</div>' +
      '</div>';
    }
    // Default: colored badge
    return '<div style="' + base + 'background:var(--lime-d,#6d8400);">' +
      '<div style="font-size:.6rem;font-weight:900;color:#fff;letter-spacing:.03em;">' + (ext4||'FILE') + '</div>' +
    '</div>';
  }

  // ─── Smart download ──────────────────────────────────────────────
  // isDrive=true only for OLD private Drive files — new uploads are public
  function _downloadFile(url, name, isDrive) {
    if (isDrive) {
      // Legacy private Drive file — open viewer so user can request access
      window.open(url, '_blank', 'noopener');
      return;
    }
    // Public Drive files (uc?export=download) and Firebase Storage: fetch as blob
    _toast('Preparing download…', 'ok');
    fetch(url, { mode: 'cors' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function(blob) {
        var a = document.createElement('a');
        var blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { URL.revokeObjectURL(blobUrl); a.remove(); }, 3000);
      })
      .catch(function() {
        // CORS blocked on blob fetch — open direct link as fallback (browser will download)
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { a.remove(); }, 1000);
      });
  }

  // ─── Preview modal ────────────────────────────────────────────────
  function _previewFile(url, name, type) {
    var existing = document.getElementById('tmPreviewModal');
    if (existing) existing.remove();
    var isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    var isPdf   = /\.pdf$/i.test(name);
    var isVideo = /\.(mp4|webm)$/i.test(name);
    var isAudio = /\.mp3$/i.test(name);
    var content;
    if (isImage) {
      content = '<img src="' + _esc(url) + '" style="max-width:100%;max-height:70vh;border-radius:8px;display:block;margin:auto;" alt="' + _esc(name) + '">';
    } else if (isPdf) {
      content = '<iframe src="' + _esc(url) + '" style="width:100%;height:70vh;border:none;border-radius:8px;"></iframe>';
    } else if (isVideo) {
      content = '<video controls style="max-width:100%;max-height:70vh;border-radius:8px;"><source src="' + _esc(url) + '">Your browser does not support video.</video>';
    } else if (isAudio) {
      content = '<audio controls style="width:100%;margin-top:16px;"><source src="' + _esc(url) + '">Your browser does not support audio.</audio>';
    } else {
      content = '<div style="text-align:center;padding:32px;font-size:1rem;opacity:.7;">Preview not available for this file type.</div>';
    }
    var modal = document.createElement('div');
    modal.id = 'tmPreviewModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML =
      '<div style="background:var(--bg-card,#1e2030);border-radius:16px;padding:24px;max-width:860px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.6);position:relative;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<div style="font-weight:600;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%;">' + _esc(name) + '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<a href="' + _esc(url) + '" download="' + _esc(name) + '" target="_blank" ' +
              'style="padding:6px 14px;border-radius:8px;background:rgba(99,200,99,.25);border:1px solid rgba(99,200,99,.4);color:#fff;text-decoration:none;font-size:.85rem;cursor:pointer;">&#11015; Download</a>' +
            '<button onclick="document.getElementById(\'tmPreviewModal\').remove()" ' +
              'style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;font-size:.85rem;">✕ Close</button>' +
          '</div>' +
        '</div>' +
        content +
      '</div>';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function _handleDrop(event, teamId) {
    var files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length) _doUpload(Array.from(files), teamId);
  }

  function _uploadFiles(event, teamId) {
    var files = event.target && event.target.files;
    if (files && files.length) _doUpload(Array.from(files), teamId);
  }

  function _doUpload(files, teamId) {
    if (!_uid()) { _toast('Sign in first', 'err'); return; }
    var MAX = 50 * 1024 * 1024;
    var progressWrap = document.getElementById('tmUploadProgress');
    if (progressWrap) progressWrap.style.display = 'block';
    var chain = Promise.resolve();
    Array.from(files).forEach(function(file) {
      if (file.size > MAX) { _toast('"' + file.name + '" exceeds 50 MB', 'err'); return; }
      chain = chain.then(function() { return _uploadOneFile(file, teamId, progressWrap); });
    });
    chain.then(function() {
      if (progressWrap) setTimeout(function() { progressWrap.style.display = 'none'; progressWrap.innerHTML = ''; }, 2000);
      _loadFiles(teamId);
      var inp = document.getElementById('tmFileInput');
      if (inp) inp.value = '';
    });
  }

  function _uploadOneFile(file, teamId, progressWrap) {
    return new Promise(function(resolve) {
      var barId = 'tmBar' + Date.now();
      if (progressWrap) {
        var row = document.createElement('div');
        row.className = 'tm-prog-row'; row.id = barId;
        row.innerHTML = '<div class="tm-prog-name">' + _esc(file.name) + '</div>' +
          '<div class="tm-prog-bar"><div class="tm-prog-fill" style="width:0%"></div></div>' +
          '<div class="tm-prog-pct">0%</div>';
        progressWrap.appendChild(row);
      }
      function sp(pct, lbl) {
        var el = document.getElementById(barId); if (!el) return;
        var f2 = el.querySelector('.tm-prog-fill'), lb = el.querySelector('.tm-prog-pct');
        if (f2) f2.style.width = pct + '%';
        if (lb) lb.textContent = lbl || (pct + '%');
      }

      // ── Get Drive token (must be Google login) ──
      var driveToken = (typeof NOVA_DRIVE_TOKEN !== 'undefined' && NOVA_DRIVE_TOKEN) ||
        (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();

      if (!driveToken) {
        // Fallback: Firebase Storage for email/password users
        sp(10, 'Uploading...');
        var storagePath = 'team_files/' + teamId + '/' + Date.now() + '_' + file.name;
        var storageRef = fbStorage.ref(storagePath);
        var uploadTask = storageRef.put(file);
        uploadTask.on('state_changed',
          function(snapshot) { sp(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 70) + 10); },
          function(err) { sp(0, 'Failed'); _toast('Upload error: ' + err.message, 'err'); resolve(); },
          function() {
            sp(85, 'Saving...');
            uploadTask.snapshot.ref.getDownloadURL().then(function(downloadUrl) {
              return _tCol().doc(teamId).collection('files').add({
                name: file.name, size: file.size,
                type: file.type || 'application/octet-stream',
                fileUrl: downloadUrl, storagePath: storagePath,
                uploadedBy: _uid(), uploadedByName: _uName(), uploadedAt: Date.now()
              });
            }).then(function() { sp(100, 'Done!'); _toast('"' + file.name + '" uploaded', 'ok'); _notifyMembers(teamId, file.name, null); resolve(); })
              .catch(function(err) { sp(0, 'Failed'); _toast('Save error: ' + err.message, 'err'); resolve(); });
          }
        );
        return;
      }

      // ── Primary: Google Drive API upload into "NOVA Backend" folder ──
      sp(10, 'Reading...');
      var reader = new FileReader();
      reader.onerror = function() { _toast('Could not read file', 'err'); resolve(); };
      reader.onload = function(e) {
        sp(30, 'Uploading to Drive...');

        // Get the NOVA Backend folder ID
        var folderId = (typeof NOVA_DRIVE_FOLDER_ID !== 'undefined' && NOVA_DRIVE_FOLDER_ID) ||
          (function(){ try { return sessionStorage.getItem('nova_drive_folder_id'); } catch(e){ return null; } })();

        // Build multipart upload body
        var metaObj = { name: file.name, mimeType: file.type || 'application/octet-stream' };
        if (folderId) metaObj.parents = [folderId];
        var boundary = 'nova_tm_' + Date.now();
        var metaStr = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metaObj) + '\r\n--' + boundary + '\r\nContent-Type: ' + (file.type || 'application/octet-stream') + '\r\n\r\n';
        var closeStr = '\r\n--' + boundary + '--';
        var base64Data = e.target.result.split(',')[1];

        // Decode base64 to binary for multipart body
        var binaryStr = atob(base64Data);
        var binaryArr = new Uint8Array(binaryStr.length);
        for (var i = 0; i < binaryStr.length; i++) binaryArr[i] = binaryStr.charCodeAt(i);

        var metaBytes  = new TextEncoder().encode(metaStr);
        var closeBytes = new TextEncoder().encode(closeStr);
        var body = new Uint8Array(metaBytes.byteLength + binaryArr.byteLength + closeBytes.byteLength);
        body.set(metaBytes, 0);
        body.set(binaryArr, metaBytes.byteLength);
        body.set(closeBytes, metaBytes.byteLength + binaryArr.byteLength);

        sp(60, 'Uploading...');
        fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + driveToken,
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          body: body
        })
        .then(function(r) {
          if (r.status === 401) throw new Error('Drive session expired — please sign in with Google again');
          if (!r.ok) throw new Error('Drive API error ' + r.status);
          return r.json();
        })
        .then(function(driveFile) {
          sp(80, 'Setting permissions...');
          // ── Make file accessible to anyone with the link (no "Request access" for members) ──
          return fetch('https://www.googleapis.com/drive/v3/files/' + driveFile.id + '/permissions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + driveToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          })
          .then(function() { return driveFile; }) // ignore permission errors — still save file
          .catch(function() { return driveFile; });
        })
        .then(function(driveFile) {
          sp(90, 'Saving...');
          // Build a direct public download URL (works once file is shared publicly)
          var publicUrl = 'https://drive.google.com/uc?export=download&id=' + driveFile.id;
          var driveViewUrl = driveFile.webViewLink || null;
          return _tCol().doc(teamId).collection('files').add({
            name: file.name, size: file.size,
            type: file.type || 'application/octet-stream',
            fileUrl: publicUrl,
            driveFileId: driveFile.id,
            driveViewUrl: driveViewUrl,
            isPublic: true,
            uploadedBy: _uid(), uploadedByName: _uName(), uploadedAt: Date.now()
          }).then(function() { return publicUrl; });
        })
        .then(function(fileUrl) {
          sp(100, 'Done!');
          _toast('"' + file.name + '" saved to Drive ✓', 'ok');
          _notifyMembers(teamId, file.name, fileUrl);
          resolve();
        })
        .catch(function(err) {
          sp(0, 'Failed');
          _toast('Upload error: ' + err.message, 'err');
          resolve();
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ─── Fix access for old private Drive files ─────────────────────
  function _fixFileAccess(fileDocId, driveFileId, teamId) {
    var driveToken = (typeof NOVA_DRIVE_TOKEN !== 'undefined' && NOVA_DRIVE_TOKEN) ||
      (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
    if (!driveToken) {
      _toast('Sign in with Google to fix file access', 'err');
      return;
    }
    _toast('Updating file permissions…', 'ok');
    fetch('https://www.googleapis.com/drive/v3/files/' + driveFileId + '/permissions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + driveToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Permission API ' + r.status);
      // Update Firestore doc: mark as public and set public download URL
      var publicUrl = 'https://drive.google.com/uc?export=download&id=' + driveFileId;
      return _tCol().doc(teamId).collection('files').doc(fileDocId).update({
        isPublic: true,
        fileUrl: publicUrl
      });
    })
    .then(function() {
      _toast('✓ File is now accessible to all members!', 'ok');
      _loadFiles(teamId);
    })
    .catch(function(err) {
      _toast('Could not update permission: ' + err.message, 'err');
    });
  }

  function _notifyMembers(teamId, fileName, fileUrl) {
    var team = _teams.find(function(t) { return t.id === teamId; });
    if (team && typeof NV !== 'undefined') {
      (team.memberEmails||[]).forEach(function(email) {
        if (email === _uid()) return;
        NV.pushToUser(email, {
          type: 'team_file',
          title: _uName() + ' uploaded in "' + team.name + '"',
          body: fileName,
          link: fileUrl || ''
        });
      });
    }
  }

  function _deleteFile(teamId, fileId, driveFileId) {
    if (!confirm('Remove this file from the team?\nThis cannot be undone.')) return;
    var tasks = [_tCol().doc(teamId).collection('files').doc(fileId).delete()];

    // Also delete from Google Drive if we have a driveFileId and a token
    if (driveFileId) {
      var driveToken = (typeof NOVA_DRIVE_TOKEN !== 'undefined' && NOVA_DRIVE_TOKEN) ||
        (function(){ try { return sessionStorage.getItem('nova_drive_token'); } catch(e){ return null; } })();
      if (driveToken) {
        tasks.push(
          fetch('https://www.googleapis.com/drive/v3/files/' + driveFileId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + driveToken }
          }).catch(function() {}) // ignore — file may already be deleted
        );
      }
    }

    Promise.all(tasks)
      .then(function() { _toast('Removed', 'ok'); _loadFiles(teamId); })
      .catch(function(e) { _toast('Error: ' + e.message, 'err'); });
  }

  function _fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1048576).toFixed(1) + ' MB';
  }

  function _attachLink() {
    var url = prompt('Paste a URL to attach:');
    if (!url) return;
    var ta = document.getElementById('tmPostText');
    if (ta) { ta.value += (ta.value ? ' ' : '') + url; ta.focus(); }
  }

  // ─── Membership check (used externally) ───────────────────────────
  async function isMember(teamId, email) {
    try {
      var snap = await _tCol().doc(teamId).get();
      if (!snap.exists) return false;
      return (snap.data().memberEmails||[]).includes(email);
    } catch(e) { return false; }
  }

  function getMyTeams() { return _teams; }

  // ─── HTML helpers ─────────────────────────────────────────────────
  function _createTeamModalHTML() {
    return '<div id="tmCreateModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9800;align-items:center;justify-content:center;" onclick="if(event.target===this)TM._closeCreateModal()">' +
      '<div class="tm-modal">' +
        '<div class="tm-modal-header">' +
          '<div class="tm-modal-title">🏗️ Create New Team</div>' +
          '<button class="tm-modal-close" onclick="TM._closeCreateModal()">✕</button>' +
        '</div>' +
        '<div class="tm-modal-body">' +
          '<label class="tm-label">Team Name <span style="color:#dc2626">*</span></label>' +
          '<input id="tmNewName" class="tm-input" placeholder="e.g. Design Squad, HR Team…">' +
          '<label class="tm-label">Company / Organisation</label>' +
          '<input id="tmNewCompany" class="tm-input" placeholder="e.g. NOVA Corp">' +
          '<label class="tm-label">Project</label>' +
          '<input id="tmNewProject" class="tm-input" placeholder="e.g. Q3 Campaign">' +
          '<label class="tm-label">Description</label>' +
          '<textarea id="tmNewDesc" class="tm-textarea" rows="2" placeholder="What is this team for?"></textarea>' +
          '<label class="tm-label">Data Privacy</label>' +
          '<select id="tmNewPrivacy" class="tm-input">' +
            '<option value="members">🔒 Members Only — only invited members can see team data</option>' +
            '<option value="invite">✉️ Invite Required — join by invitation only</option>' +
          '</select>' +
        '</div>' +
        '<div class="tm-modal-footer">' +
          '<button class="tm-btn-ghost" onclick="TM._closeCreateModal()">Cancel</button>' +
          '<button class="tm-btn-primary" onclick="TM._createTeam()">Create Team →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _inviteModalHTML() {
    return '<div id="tmInviteModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9800;align-items:center;justify-content:center;" onclick="if(event.target===this)TM._closeInviteModal()">' +
      '<div class="tm-modal" style="max-width:420px;">' +
        '<div class="tm-modal-header">' +
          '<div class="tm-modal-title">🔗 Invite Link</div>' +
          '<button class="tm-modal-close" onclick="TM._closeInviteModal()">✕</button>' +
        '</div>' +
        '<div class="tm-modal-body">' +
          '<div style="font-size:.78rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">Share this link to invite anyone</div>' +
          '<div style="font-size:.71rem;color:var(--mist,#9ca3af);margin-bottom:12px;line-height:1.5;">Anyone who opens this link and is logged in to NOVA Studio will join this team automatically. Share it via WhatsApp, email, or anywhere.</div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input id="tmInviteLinkBox" class="tm-input" type="text" readonly style="font-size:.7rem;background:var(--fog,#f9fafb);cursor:text;flex:1;" value="Generating link…">' +
            '<button onclick="TM._copyInviteLink()" style="padding:9px 14px;border-radius:9px;background:var(--lime-d,#6d8400);color:#fff;font-weight:700;font-size:.75rem;border:none;cursor:pointer;white-space:nowrap;" id="tmCopyLinkBtn">Copy</button>' +
          '</div>' +
          '<div id="tmInviteLinkMsg" style="font-size:.7rem;color:var(--lime-d,#6d8400);margin-top:8px;display:none;">✅ Link copied! Share it anywhere.</div>' +
          '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--fog2,#e5e7eb);">' +
            '<div style="font-size:.72rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">Or enter their NOVA Studio email directly</div>' +
            '<div style="display:flex;gap:8px;">' +
              '<input id="tmInviteInput" class="tm-input" placeholder="colleague@example.com" type="email" style="flex:1;font-size:.78rem;">' +
              '<button onclick="TM._inviteMember(document.getElementById(\'tmInviteModal\').dataset.teamId)" style="padding:9px 14px;border-radius:9px;background:var(--ink,#111);color:#fff;font-weight:700;font-size:.75rem;border:none;cursor:pointer;white-space:nowrap;">Add →</button>' +
            '</div>' +
            '<div style="font-size:.68rem;color:var(--mist,#9ca3af);margin-top:5px;">They will get a notification in their NOVA Studio account.</div>' +
          '</div>' +
        '</div>' +
        '<div class="tm-modal-footer">' +
          '<button class="tm-btn-ghost" onclick="TM._closeInviteModal()">Done</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _editTeamModalHTML(team) {
    return '<div id="tmEditModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9800;align-items:center;justify-content:center;" onclick="if(event.target===this)TM._closeEditModal()">' +
      '<div class="tm-modal">' +
        '<div class="tm-modal-header">' +
          '<div class="tm-modal-title">✏️ Edit Team</div>' +
          '<button class="tm-modal-close" onclick="TM._closeEditModal()">✕</button>' +
        '</div>' +
        '<div class="tm-modal-body">' +
          '<label class="tm-label">Team Name</label>' +
          '<input id="tmEditName" class="tm-input" value="'+_esc(team.name)+'">' +
          '<label class="tm-label">Company / Organisation</label>' +
          '<input id="tmEditCompany" class="tm-input" value="'+_esc(team.company||'')+'">' +
          '<label class="tm-label">Project</label>' +
          '<input id="tmEditProject" class="tm-input" value="'+_esc(team.project||'')+'">' +
          '<label class="tm-label">Description</label>' +
          '<textarea id="tmEditDesc" class="tm-textarea" rows="2">'+_esc(team.description||'')+'</textarea>' +
        '</div>' +
        '<div class="tm-modal-footer">' +
          '<button class="tm-btn-ghost" onclick="TM._closeEditModal()">Cancel</button>' +
          '<button class="tm-btn-primary" onclick="TM._saveEdit(\''+team.id+'\')">Save Changes →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

<<<<<<< HEAD
  // ─── Role change modal HTML ───────────────────────────────────────
  function _roleModalHTML(team) {
    return '<div id="tmRoleModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9900;align-items:center;justify-content:center;" onclick="if(event.target===this)TM._closeRoleModal()">' +
      '<div class="tm-modal" style="max-width:380px;">' +
        '<div class="tm-modal-header">' +
          '<div class="tm-modal-title">🏷️ Change Designation</div>' +
          '<button class="tm-modal-close" onclick="TM._closeRoleModal()">✕</button>' +
        '</div>' +
        '<div class="tm-modal-body">' +
          '<div style="font-size:.75rem;color:var(--mist,#9ca3af);margin-bottom:12px;">Changing role for: <strong id="tmRoleTargetName" style="color:var(--ink,#111);"></strong></div>' +
          '<label class="tm-label">New Designation</label>' +
          '<select id="tmRoleSelect" class="tm-input"></select>' +
          '<div class="tm-role-info-box" id="tmRoleInfoBox">' +
            '<div style="font-size:.72rem;font-weight:700;color:var(--ink,#111);margin-bottom:6px;">Designation Permissions</div>' +
            Object.keys(DESIGNATIONS).filter(function(k){return k!=='leader';}).map(function(k){
              var d = DESIGNATIONS[k];
              var perms = [];
              if (d.canAssignTasks) perms.push('Assign Tasks');
              if (d.canChangeRoles) perms.push('Change Roles');
              if (d.canInvite) perms.push('Invite Members');
              if (d.canRemove) perms.push('Remove Members');
              return '<div class="tm-role-perm-row"><span class="tm-role-badge tm-role-'+k+'">'+d.label+'</span><span style="font-size:.68rem;color:var(--mist,#9ca3af);">'+(perms.length?perms.join(', '):'View only')+'</span></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="tm-modal-footer">' +
          '<button class="tm-btn-ghost" onclick="TM._closeRoleModal()">Cancel</button>' +
          '<button class="tm-btn-primary" onclick="TM._saveRole()">Save Designation →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Assign task modal HTML ───────────────────────────────────────
  function _assignTaskModalHTML(team) {
    if (document.getElementById('tmAssignTaskModal')) return ''; // already rendered
    return '<div id="tmAssignTaskModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9900;align-items:center;justify-content:center;" onclick="if(event.target===this)TM._closeAssignTaskModal()">' +
      '<div class="tm-modal" style="max-width:460px;">' +
        '<div class="tm-modal-header">' +
          '<div class="tm-modal-title">📋 Assign Task</div>' +
          '<button class="tm-modal-close" onclick="TM._closeAssignTaskModal()">✕</button>' +
        '</div>' +
        '<div class="tm-modal-body">' +
          '<label class="tm-label">Task Title <span style="color:#dc2626">*</span></label>' +
          '<input id="tmTaskTitle" class="tm-input" placeholder="e.g. Review Q3 report, Fix login bug…">' +
          '<label class="tm-label">Description</label>' +
          '<textarea id="tmTaskDesc" class="tm-textarea" rows="2" placeholder="Optional task details…"></textarea>' +
          '<label class="tm-label">Assign To <span style="color:#dc2626">*</span></label>' +
          '<select id="tmTaskAssignee" class="tm-input"></select>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div>' +
              '<label class="tm-label">Priority</label>' +
              '<select id="tmTaskPriority" class="tm-input">' +
                '<option value="low">🟢 Low</option>' +
                '<option value="medium" selected>🟡 Medium</option>' +
                '<option value="high">🔴 High</option>' +
                '<option value="urgent">🟣 Urgent</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label class="tm-label">Due Date</label>' +
              '<input id="tmTaskDueDate" class="tm-input" type="date">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tm-modal-footer">' +
          '<button class="tm-btn-ghost" onclick="TM._closeAssignTaskModal()">Cancel</button>' +
          '<button class="tm-btn-primary" onclick="TM._saveAssignTask()">Assign Task →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
  // ─── Toast ────────────────────────────────────────────────────────
  function _toast(msg, type) {
    if (typeof showToast === 'function') { showToast(msg, type==='ok'?'ok':'err'); return; }
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;font-size:.78rem;font-weight:700;z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,.15);white-space:nowrap;';
    t.style.background = type==='ok' ? '#dcfce7' : '#fee2e2';
    t.style.color      = type==='ok' ? '#15803d' : '#dc2626';
    t.style.border     = '1.5px solid '+(type==='ok'?'#86efac':'#fca5a5');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }

  // ─── Inline styles ────────────────────────────────────────────────
  function _inlineStyles() {
    if (document.getElementById('tmStyles')) return '';
    var style = document.createElement('style');
    style.id = 'tmStyles';
    style.textContent = `
      /* ── Teams View ── */
      #viewTeams { flex-direction:column; overflow-y:auto; }
      .tm-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
        padding:24px 28px 0; flex-shrink:0; }
      .tm-page-title { font-size:1.4rem; font-weight:900; letter-spacing:-.03em; color:var(--ink,#111); }
      .tm-page-sub { font-size:.75rem; color:var(--mist,#9ca3af); margin-top:3px; }
      .tm-stats-row { display:flex; gap:12px; padding:18px 28px 0; flex-shrink:0; flex-wrap:wrap; }
      .tm-stat-card { background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:12px;
        padding:14px 20px; min-width:90px; text-align:center; }
      .tm-stat-num { font-size:1.5rem; font-weight:900; color:var(--lime-d,#6d8400); letter-spacing:-.03em; }
      .tm-stat-lbl { font-size:.67rem; color:var(--mist,#9ca3af); font-weight:600; margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
      .tm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:16px;
        padding:20px 28px 28px; }
      /* ── Team Card ── */
      .tm-card { background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:16px;
        overflow:hidden; cursor:pointer; transition:transform .15s, box-shadow .15s; }
      .tm-card:hover { transform:translateY(-3px); box-shadow:0 10px 30px rgba(0,0,0,.1); }
      .tm-card-top { height:80px; display:flex; align-items:flex-end; justify-content:space-between;
        padding:10px 14px; position:relative; }
      .tm-card-icon { width:48px; height:48px; background:rgba(255,255,255,.25); border-radius:12px;
        display:flex; align-items:center; justify-content:center; font-size:1.1rem; font-weight:900;
        color:#fff; letter-spacing:-.02em; backdrop-filter:blur(4px); border:2px solid rgba(255,255,255,.3); }
      .tm-card-owner-badge { font-size:.6rem; font-weight:800; background:rgba(255,255,255,.25);
        color:#fff; padding:3px 8px; border-radius:20px; border:1px solid rgba(255,255,255,.4); backdrop-filter:blur(4px); }
      .tm-card-member-badge { font-size:.6rem; font-weight:800; background:rgba(0,0,0,.15);
        color:#fff; padding:3px 8px; border-radius:20px; border:1px solid rgba(255,255,255,.2); }
      .tm-card-body { padding:14px 16px 16px; }
      .tm-card-name { font-size:.9rem; font-weight:800; color:var(--ink,#111); margin-bottom:4px; }
      .tm-card-desc { font-size:.72rem; color:var(--mist,#9ca3af); line-height:1.45; margin-bottom:10px;
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .tm-card-tags { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; }
      .tm-card-tag { font-size:.63rem; font-weight:700; background:var(--fog,#f3f4f6); color:var(--ink3,#6b7280);
        border-radius:20px; padding:2px 8px; border:1px solid var(--fog2,#e5e7eb); }
      .tm-card-footer { display:flex; align-items:center; justify-content:space-between; }
      .tm-card-avs { display:flex; flex-direction:row-reverse; }
      .tm-av { width:26px; height:26px; border-radius:50%; font-size:.62rem; font-weight:800;
        color:#fff; display:flex; align-items:center; justify-content:center; border:2px solid var(--card,#fff);
        margin-left:-6px; flex-shrink:0; }
      .tm-av-more { background:var(--fog,#e5e7eb); color:var(--ink3,#6b7280); font-size:.58rem; }
      .tm-card-count { font-size:.68rem; color:var(--mist,#9ca3af); font-weight:600; }
      /* ── Empty ── */
      .tm-empty { grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--mist,#9ca3af); }
      .tm-empty-ic { font-size:3rem; margin-bottom:12px; opacity:.4; }
      .tm-empty-t { font-size:.9rem; font-weight:800; color:var(--ink3,#6b7280); margin-bottom:6px; }
      .tm-empty-s { font-size:.75rem; line-height:1.5; max-width:320px; margin:0 auto; }
      .tm-empty-inline { text-align:center; padding:36px 20px; color:var(--mist,#9ca3af); font-size:.78rem; }
      /* ── Detail header ── */
      .tm-detail-header { flex-shrink:0; }
      .tm-back-btn { background:none; border:none; font-size:.78rem; font-weight:700; color:var(--lime-d,#6d8400);
        cursor:pointer; padding:16px 28px 0; display:block; }
      .tm-detail-hero { display:flex; align-items:center; gap:16px; padding:18px 28px 22px;
        flex-wrap:wrap; position:relative; }
      .tm-dh-icon { width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,.2);
        display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:900;
        color:#fff; border:2px solid rgba(255,255,255,.35); flex-shrink:0; }
      .tm-dh-info { flex:1; min-width:0; }
      .tm-dh-name { font-size:1.25rem; font-weight:900; color:#fff; letter-spacing:-.02em; }
      .tm-dh-meta { font-size:.72rem; color:rgba(255,255,255,.75); margin-top:3px; }
      .tm-dh-actions { display:flex; gap:8px; flex-wrap:wrap; }
      /* ── Tabs ── */
      .tm-tabs { display:flex; gap:0; border-bottom:1.5px solid var(--fog,#e5e7eb);
        padding:0 28px; flex-shrink:0; overflow-x:auto; }
      .tm-tab { background:none; border:none; font-size:.78rem; font-weight:700; color:var(--mist,#9ca3af);
        cursor:pointer; padding:12px 16px; border-bottom:2.5px solid transparent; white-space:nowrap;
        transition:all .15s; }
      .tm-tab.active { color:var(--lime-d,#6d8400); border-bottom-color:var(--lime-d,#6d8400); }
      .tm-tab:hover:not(.active) { color:var(--ink,#111); }
      .tm-tab-panels { flex:1; overflow-y:auto; }
      .tm-panel { display:none; }
      .tm-panel.active { display:block; }
      /* ── Feed ── */
      .tm-feed-wrap { padding:20px 28px; max-width:700px; }
      .tm-composer { display:flex; gap:12px; align-items:flex-start; margin-bottom:24px;
        background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:14px; padding:14px; }
      .tm-composer-av { width:36px; height:36px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:.75rem; font-weight:900; color:#fff; flex-shrink:0; }
      .tm-composer-input { flex:1; min-width:0; }
      .tm-composer-actions { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
      .tm-feed-list { display:flex; flex-direction:column; gap:12px; }
      .tm-feed-loading { font-size:.78rem; color:var(--mist,#9ca3af); text-align:center; padding:24px; }
      .tm-post { display:flex; gap:10px; background:var(--card,#fff);
        border:1.5px solid var(--fog,#e5e7eb); border-radius:12px; padding:14px; position:relative; }
      .tm-post-av { width:34px; height:34px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:.72rem; font-weight:900; color:#fff; flex-shrink:0; }
      .tm-post-content { flex:1; min-width:0; }
      .tm-post-meta { display:flex; align-items:center; gap:6px; margin-bottom:5px; flex-wrap:wrap; }
      .tm-post-author { font-size:.78rem; font-weight:800; color:var(--ink,#111); }
      .tm-post-time { font-size:.67rem; color:var(--mist,#9ca3af); }
      .tm-post-text { font-size:.8rem; color:var(--ink2,#374151); line-height:1.5; white-space:pre-wrap; }
      .tm-post-link { display:inline-block; margin-top:7px; font-size:.72rem; font-weight:700;
        color:var(--lime-d,#6d8400); text-decoration:none; border:1px solid var(--lime,#9ec000);
        border-radius:7px; padding:3px 10px; background:var(--lime-p,#f0f7d4); }
      .tm-post-del { position:absolute; top:10px; right:10px; background:none; border:none; font-size:.8rem;
        color:var(--mist,#9ca3af); cursor:pointer; padding:2px 5px; border-radius:5px; }
      .tm-post-del:hover { background:#fee2e2; color:#dc2626; }
      /* ── Members ── */
      .tm-members-wrap { padding:20px 28px; max-width:600px; }
      .tm-invite-bar { display:flex; gap:8px; margin-bottom:16px; }
      .tm-members-list { display:flex; flex-direction:column; gap:8px; }
      .tm-member-row { display:flex; align-items:center; gap:12px; padding:12px 14px;
        background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:12px; }
      .tm-member-av { width:38px; height:38px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:.75rem; font-weight:900; color:#fff; flex-shrink:0; }
      .tm-member-info { flex:1; min-width:0; }
      .tm-member-email { font-size:.8rem; font-weight:700; color:var(--ink,#111); display:flex; align-items:center; gap:6px; }
<<<<<<< HEAD
      .tm-member-role { font-size:.68rem; color:var(--mist,#9ca3af); margin-top:4px; }
      .tm-member-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      /* ── Designation badges ── */
      .tm-role-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px;
        font-size:.65rem; font-weight:800; letter-spacing:.02em; white-space:nowrap; }
      .tm-role-leader    { background:rgba(234,179,8,.15);  color:#a16207;  border:1px solid rgba(234,179,8,.3); }
      .tm-role-co-leader { background:rgba(99,102,241,.15); color:#4338ca;  border:1px solid rgba(99,102,241,.3); }
      .tm-role-manager   { background:rgba(14,165,233,.15); color:#0369a1;  border:1px solid rgba(14,165,233,.3); }
      .tm-role-member    { background:rgba(107,114,128,.12);color:#374151;  border:1px solid rgba(107,114,128,.25); }
      .tm-role-viewer    { background:rgba(16,185,129,.1);  color:#065f46;  border:1px solid rgba(16,185,129,.25); }
      .tm-role-legend { display:flex; gap:6px; flex-wrap:wrap; padding:10px 0 14px; }
      .tm-role-change-btn { background:rgba(234,179,8,.1)!important; color:#a16207!important;
        border-color:rgba(234,179,8,.35)!important; }
      /* ── Role info box ── */
      .tm-role-info-box { background:var(--fog,#f9fafb); border:1.5px solid var(--fog2,#e5e7eb);
        border-radius:10px; padding:12px; margin-top:10px; }
      .tm-role-perm-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
      .tm-role-perm-row:last-child { margin-bottom:0; }
      /* ── Tasks panel ── */
      .tm-tasks-wrap { padding:20px 28px; max-width:800px; }
      .tm-tasks-header { display:flex; align-items:flex-start; justify-content:space-between;
        margin-bottom:16px; gap:12px; flex-wrap:wrap; }
      .tm-tasks-title { font-size:1rem; font-weight:800; color:var(--ink,#111); }
      .tm-tasks-sub { font-size:.72rem; color:var(--mist,#9ca3af); margin-top:4px; display:flex;
        align-items:center; gap:6px; }
      .tm-tasks-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
      .tm-filter-btn { padding:5px 12px; border-radius:20px; font-size:.72rem; font-weight:700;
        border:1.5px solid var(--fog2,#e5e7eb); background:var(--card,#fff);
        color:var(--ink,#111); cursor:pointer; transition:all .15s; }
      .tm-filter-btn.active { background:var(--lime-d,#6d8400); color:#fff; border-color:var(--lime-d,#6d8400); }
      .tm-tasks-list { display:flex; flex-direction:column; gap:10px; }
      /* ── Task card ── */
      .tm-task-card { background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb);
        border-radius:14px; padding:14px 16px; transition:box-shadow .15s; }
      .tm-task-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.07); }
      .tm-task-done { opacity:.65; }
      .tm-task-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px; }
      .tm-task-title { font-size:.85rem; font-weight:800; color:var(--ink,#111); }
      .tm-task-desc { font-size:.75rem; color:var(--mist,#9ca3af); margin-bottom:8px; line-height:1.5; }
      .tm-task-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
      .tm-task-assignee { display:flex; align-items:center; gap:6px; font-size:.73rem; font-weight:700;
        color:var(--ink,#111); }
      .tm-task-av { width:22px; height:22px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:.55rem; font-weight:900; color:#fff; flex-shrink:0; }
      .tm-task-due { font-size:.68rem; color:var(--mist,#9ca3af); }
      .tm-task-due.tm-overdue { color:#dc2626; font-weight:700; }
      .tm-task-priority { font-size:.65rem; font-weight:700; }
      .tm-task-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .tm-task-status-sel { padding:4px 8px; border-radius:8px; font-size:.72rem; font-weight:700;
        border:1.5px solid var(--fog2,#e5e7eb); background:var(--card,#fff); color:var(--ink,#111);
        cursor:pointer; }
      .tm-task-status-tag { padding:3px 8px; border-radius:8px; font-size:.68rem; font-weight:700; }
      .tm-task-by { font-size:.65rem; color:var(--mist,#9ca3af); }
      .tm-task-del { background:none; border:none; color:var(--mist,#9ca3af); cursor:pointer;
        font-size:.75rem; padding:2px 6px; border-radius:6px; transition:all .12s; flex-shrink:0; }
      .tm-task-del:hover { background:#fee2e2; color:#dc2626; }
=======
      .tm-member-role { font-size:.68rem; color:var(--mist,#9ca3af); margin-top:2px; }
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
      /* ── Shares ── */
      .tm-shares-wrap { padding:20px 28px; max-width:700px; }
      .tm-shares-info { font-size:.72rem; color:var(--mist,#9ca3af); background:var(--fog,#f9fafb);
        border:1.5px solid var(--fog2,#e5e7eb); border-radius:9px; padding:8px 12px; margin-bottom:14px; }
      .tm-shares-list { display:flex; flex-direction:column; gap:8px; }
      .tm-share-row { display:flex; align-items:center; gap:12px; padding:12px 14px;
        background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:12px; }
      .tm-share-icon { font-size:1.3rem; flex-shrink:0; }
      .tm-share-info { flex:1; min-width:0; }
      .tm-share-title { font-size:.8rem; font-weight:700; color:var(--ink,#111); white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis; }
      .tm-share-meta { font-size:.67rem; color:var(--mist,#9ca3af); margin-top:2px; }
      .tm-share-open { font-size:.68rem; font-weight:700; color:var(--lime-d,#6d8400);
        text-decoration:none; border:1px solid var(--lime,#9ec000); border-radius:7px; padding:4px 10px;
        white-space:nowrap; background:var(--lime-p,#f0f7d4); }
      /* ── Files tab ── */
      .tm-gdrive-status { font-size:.75rem; padding:9px 14px; border-radius:10px; margin-bottom:14px; font-weight:600; }
      .tm-gdrive-ok { background:#d1fae5; color:#065f46; border:1.5px solid #6ee7b7; }
      .tm-gdrive-warn { background:#fef3c7; color:#92400e; border:1.5px solid #fcd34d; }
      .tm-files-wrap { padding:20px 28px; max-width:700px; }
      .tm-upload-zone { border:2px dashed var(--fog2,#e5e7eb); border-radius:16px; padding:36px 20px;
        text-align:center; background:var(--fog,#f9fafb); transition:border-color .2s,background .2s; margin-bottom:16px; }
      .tm-dz-over { border-color:var(--lime,#9ec000) !important; background:var(--lime-p,#f0f7d4) !important; }
      .tm-upload-icon { font-size:2.4rem; margin-bottom:8px; }
      .tm-upload-label { font-size:.9rem; font-weight:700; color:var(--ink,#111); margin-bottom:4px; }
      .tm-upload-sub { font-size:.72rem; color:var(--mist,#9ca3af); margin-bottom:12px; }
      .tm-upload-pick { padding:8px 22px; border-radius:10px; }
      .tm-upload-hint { font-size:.66rem; color:var(--mist,#9ca3af); margin-top:10px; }
      .tm-progress-wrap { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
      .tm-prog-row { background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:10px; padding:10px 14px; }
      .tm-prog-name { font-size:.75rem; font-weight:600; color:var(--ink,#111); margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tm-prog-bar { height:6px; background:var(--fog2,#e5e7eb); border-radius:99px; overflow:hidden; }
      .tm-prog-fill { height:100%; background:var(--lime,#9ec000); border-radius:99px; transition:width .3s; }
      .tm-prog-pct { font-size:.65rem; color:var(--mist,#9ca3af); margin-top:4px; text-align:right; }
      .tm-files-list { display:flex; flex-direction:column; gap:8px; }
      .tm-file-row { display:flex; align-items:center; gap:12px; padding:10px 14px;
        background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb); border-radius:12px; transition:box-shadow .15s; }
      .tm-file-row:hover { box-shadow:0 2px 12px rgba(0,0,0,.07); }
      .tm-file-ext { font-size:.6rem; font-weight:900; color:#fff; background:var(--lime-d,#6d8400);
        border-radius:6px; padding:3px 5px; flex-shrink:0; min-width:34px; text-align:center; letter-spacing:.03em; }
      .tm-file-info { flex:1; min-width:0; }
      .tm-file-name { font-size:.8rem; font-weight:700; color:var(--ink,#111); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tm-file-meta { font-size:.67rem; color:var(--mist,#9ca3af); margin-top:2px; }
      .tm-file-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
      /* ── Settings ── */
      .tm-settings-wrap { padding:20px 28px; max-width:500px; }
      .tm-settings-section { background:var(--card,#fff); border:1.5px solid var(--fog,#e5e7eb);
        border-radius:14px; padding:18px; margin-bottom:16px; }
      .tm-settings-title { font-size:.82rem; font-weight:800; color:var(--ink,#111); margin-bottom:12px; }
      .tm-settings-note { font-size:.7rem; color:var(--mist,#9ca3af); margin-top:8px; line-height:1.5; }
      .tm-color-row { display:flex; gap:10px; flex-wrap:wrap; }
      .tm-color-dot { width:32px; height:32px; border-radius:50%; cursor:pointer;
        transition:transform .15s, box-shadow .15s; border:2.5px solid transparent; }
      .tm-color-dot:hover { transform:scale(1.15); box-shadow:0 4px 12px rgba(0,0,0,.2); }
      /* ── Shared ── */
      .tm-you-tag { font-size:.58rem; font-weight:800; background:var(--lime-p,#f0f7d4);
        color:var(--lime-d,#6d8400); border:1px solid var(--lime,#9ec000); border-radius:20px; padding:1px 6px; }
      /* ── Buttons ── */
      .tm-btn-primary { background:var(--lime-d,#6d8400); color:#fff; border:none; border-radius:10px;
        padding:9px 18px; font-size:.78rem; font-weight:800; cursor:pointer; transition:opacity .15s; }
      .tm-btn-primary:hover { opacity:.85; }
      .tm-btn-ghost { background:transparent; color:var(--ink2,#374151); border:1.5px solid var(--fog2,#e5e7eb);
        border-radius:10px; padding:8px 14px; font-size:.78rem; font-weight:700; cursor:pointer; }
      .tm-btn-ghost:hover { background:var(--fog,#f9fafb); }
      .tm-btn-sm { background:transparent; color:var(--ink,#111); border:1.5px solid var(--fog2,#e5e7eb);
        border-radius:8px; padding:6px 12px; font-size:.72rem; font-weight:700; cursor:pointer; }
      .tm-btn-danger { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5;
        border-radius:10px; padding:9px 16px; font-size:.78rem; font-weight:700; cursor:pointer; }
      .tm-btn-danger-sm { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5;
        border-radius:8px; padding:4px 10px; font-size:.68rem; font-weight:700; cursor:pointer; }
      /* ── Form ── */
      .tm-label { display:block; font-size:.72rem; font-weight:700; color:var(--ink3,#6b7280);
        margin-bottom:5px; margin-top:12px; }
      .tm-label:first-child { margin-top:0; }
      .tm-input { width:100%; padding:9px 12px; border:1.5px solid var(--fog2,#e5e7eb);
        border-radius:9px; font-size:.8rem; background:var(--card,#fff); color:var(--ink,#111);
        outline:none; transition:border-color .15s; box-sizing:border-box; }
      .tm-input:focus { border-color:var(--lime,#9ec000); }
      .tm-textarea { width:100%; padding:9px 12px; border:1.5px solid var(--fog2,#e5e7eb);
        border-radius:9px; font-size:.8rem; background:var(--card,#fff); color:var(--ink,#111);
        outline:none; resize:vertical; font-family:inherit; transition:border-color .15s; box-sizing:border-box; }
      .tm-textarea:focus { border-color:var(--lime,#9ec000); }
      /* ── Modal ── */
      .tm-modal { background:var(--card,#fff); border-radius:18px; width:min(500px,96vw);
        max-height:92vh; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,.25); overflow:hidden; }
      .tm-modal-header { display:flex; align-items:center; justify-content:space-between;
        padding:20px 22px 16px; border-bottom:1.5px solid var(--fog,#e5e7eb); flex-shrink:0; }
      .tm-modal-title { font-size:.92rem; font-weight:800; color:var(--ink,#111); }
      .tm-modal-close { background:none; border:none; font-size:1.1rem; cursor:pointer; color:var(--mist,#9ca3af); }
      .tm-modal-body { flex:1; overflow-y:auto; padding:20px 22px; }
      .tm-modal-footer { display:flex; gap:8px; padding:14px 22px; border-top:1.5px solid var(--fog,#e5e7eb);
        flex-shrink:0; justify-content:flex-end; }
      /* ── Responsive ── */
      @media(max-width:600px) {
        .tm-header { padding:16px 16px 0; }
        .tm-stats-row { padding:12px 16px 0; }
        .tm-grid { padding:14px 16px 20px; }
        .tm-feed-wrap, .tm-members-wrap, .tm-shares-wrap, .tm-files-wrap, .tm-settings-wrap { padding:14px 16px; }
        .tm-detail-hero { padding:14px 16px 16px; }
        .tm-tabs { padding:0 16px; }
        .tm-back-btn { padding:12px 16px 0; }
      }
    `;
    document.head.appendChild(style);
    return '';
  }

  // ─── Public surface ───────────────────────────────────────────────
  return {
    init:         init,
    openView:     openView,
    getMyTeams:   getMyTeams,
    isMember:     isMember,
    _openCreateModal: _openCreateModal,
    _closeCreateModal: _closeCreateModal,
    _createTeam:  _createTeam,
    _openTeam:    _openTeam,
    _closeTeam:   _closeTeam,
    _openInviteModal: _openInviteModal,
    _closeInviteModal: _closeInviteModal,
    _copyInviteLink: _copyInviteLink,
    _inviteMember: _inviteMember,
    _removeMember: _removeMember,
    _leaveTeam:   _leaveTeam,
    _deleteTeam:  _deleteTeam,
    _openEditModal: _openEditModal,
    _closeEditModal: _closeEditModal,
    _saveEdit:    _saveEdit,
    _setColor:    _setColor,
    _switchTab:   _switchTab,
    _postToFeed:  _postToFeed,
    _deletePost:  _deletePost,
    _pickEmoji:   _pickEmoji,
    _attachLink:  _attachLink,
    _uploadFiles: _uploadFiles,
    _handleDrop:  _handleDrop,
    _deleteFile:  _deleteFile,
    _previewFile: _previewFile,
    _downloadFile: _downloadFile,
    _fixFileAccess: _fixFileAccess,
    _openDriveSetup: _openDriveSetup,
<<<<<<< HEAD
    // ─── Task management ───────────────────────────────
    _openAssignTaskModal: _openAssignTaskModal,
    _closeAssignTaskModal: _closeAssignTaskModal,
    _saveAssignTask: _saveAssignTask,
    _updateTaskStatus: _updateTaskStatus,
    _deleteTask:  _deleteTask,
    _filterTasks: _filterTasks,
    // ─── Role/designation management ───────────────────
    _openRoleModal:  _openRoleModal,
    _closeRoleModal: _closeRoleModal,
    _saveRole:       _saveRole,
=======
>>>>>>> 046c32f91252e3f8651df4911ab7ec8a8fd9f176
  };
})();
