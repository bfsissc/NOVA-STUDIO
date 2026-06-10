/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  NOVA DEV TOURS — Developer-Configurable User Walkthroughs             ║
   ║  • Dev: Build per-feature tours from the DCP → "🎭 Tours" tab          ║
   ║  • User: ⓘ button on every sidebar item triggers the tour              ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────
  var STORAGE_KEY = 'nova_dev_tours_v1';

  // Maps feature key → sidebar element ID (for info button injection)
  var SIDEBAR_MAP = {
    cert:        '#sbCert',
    mailer:      '#sbMailer',
    portal:      '#sbPortal',
    sync:        '#sbSync',
    teams:       '#sbTeams',
    followup:    '#sbFollowup',
    tp:          '#sbTp',
    imgresizer:  '#sbImgComp',
    fileconv:    '#sbFileConv',
    imgedit:     '#sbImgEdit',
    drafts:      '#sbDrafts',
    settings:    '#sbSettings',
  };

  // Feature registry (mirrors DEV_LOCK_FUNCTIONS for display)
  var FEATURES = [
    { key:'cert',         label:'Certificates',       icon:'🎓', category:'tools' },
    { key:'mailer',       label:'Cert Mailer',         icon:'📧', category:'tools' },
    { key:'portal',       label:'College Portal',      icon:'🏫', category:'tools' },
    { key:'sync',         label:'Data Sync',           icon:'🔄', category:'tools' },
    { key:'teams',        label:'My Teams',            icon:'👥', category:'tools' },
    { key:'followup',     label:'Followup Tracker',    icon:'📂', category:'tools' },
    { key:'tp',           label:'Training Partners',   icon:'🤝', category:'tools' },
    { key:'imgresizer',   label:'Image Resizer',       icon:'🖼️', category:'tools' },
    { key:'fileconv',     label:'File Converter',      icon:'🔄', category:'tools' },
    { key:'imgedit',      label:'Image Editor',        icon:'🎨', category:'tools' },
    { key:'drafts',       label:'Draft Proposals',     icon:'✉️', category:'tools' },
    { key:'novaai',       label:'Nova AI Assistant',   icon:'✦',  category:'tools' },
    { key:'settings',     label:'Settings',            icon:'⚙️', category:'account' },
    { key:'profile',      label:'My Profile',          icon:'👤', category:'account' },
    { key:'projects',     label:'My Projects',         icon:'📁', category:'account' },
  ];

  // Position options
  var POSITIONS = ['center','right','left','bottom','top'];

  // ── Storage ─────────────────────────────────────────────────────────────────
  function toursGet() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
  }
  function toursSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
  }
  function getFeatureTour(key) {
    return toursGet()[key] || null;
  }
  function setFeatureTour(key, steps) {
    var all = toursGet();
    if (!steps || steps.length === 0) { delete all[key]; }
    else { all[key] = steps; }
    toursSave(all);
  }

  // ── NovaTour bridge ─────────────────────────────────────────────────────────
  // Override NovaTour.startModule to check dev-configured tours first
  function patchNovaTour() {
    var ready = function() {
      if (!window.NovaTour) { setTimeout(ready, 200); return; }
      var _orig = window.NovaTour.startModule;
      window.NovaTour.startModule = function(key) {
        var devSteps = getFeatureTour(key);
        if (devSteps && devSteps.length) {
          // Use dev-configured steps directly
          if (typeof window._novaTourStart === 'function') {
            window._novaTourStart(devSteps, null);
          } else {
            // Fallback: expose internal startTour via a hook set below
            _orig.call(window.NovaTour, key);
          }
        } else {
          _orig.call(window.NovaTour, key);
        }
      };
    };
    ready();
  }

  // Expose internal startTour so our override can use it
  // We patch it after nova-tour.js runs by exposing a wrapper on window
  function exposeStartTour() {
    // nova-tour.js exposes NovaTour. We add a helper to trigger any steps array.
    var check = function() {
      if (!window.NovaTour) { setTimeout(check, 200); return; }
      if (!window._novaTourStart) {
        // Build a wrapper that re-uses NovaTour's internals via startDashboard replacement trick
        // We do this by temporarily swapping the module tour steps
        window._novaTourStart = function(steps, onDone) {
          // Temporarily inject under a unique key
          var tmpKey = '__nova_dev_custom__';
          // Patch NovaTour to handle this
          window.NovaTour._runSteps(steps, onDone);
        };
      }
    };
    check();
  }

  // Simpler approach: patch NovaTour by adding _runSteps after it loads
  function patchNovaTourFull() {
    var attempts = 0;
    var check = function() {
      attempts++;
      if (attempts > 50) return; // give up after 10s
      if (!window.NovaTour) { setTimeout(check, 200); return; }

      // Inject _runSteps if not already there
      if (!window.NovaTour._runSteps) {
        // We need access to the internal startTour — do this by hijacking startDashboard
        // then immediately restoring it after one call
        window.NovaTour._runSteps = function(steps, onDone) {
          // Swap dashboard tour temporarily
          var _origDash = window.NovaTour.startDashboard;
          window.NovaTour.startDashboard = function() {
            // The nova-tour.js IIFE calls startTour(DASHBOARD_TOUR, cb)
            // We can't access startTour directly from outside the IIFE
            // Instead we dispatch a custom event that nova-tour.js listens to (we add that listener)
            window.NovaTour.startDashboard = _origDash;
          };
          // Dispatch custom event carrying steps
          window.dispatchEvent(new CustomEvent('nova:run-steps', { detail: { steps: steps, onDone: onDone || null } }));
        };
      }

      // Patch startModule
      if (!window.NovaTour._devPatched) {
        window.NovaTour._devPatched = true;
        var _orig = window.NovaTour.startModule;
        window.NovaTour.startModule = function(key) {
          var devSteps = getFeatureTour(key);
          if (devSteps && devSteps.length) {
            window.dispatchEvent(new CustomEvent('nova:run-steps', { detail: { steps: devSteps, onDone: null } }));
          } else {
            _orig.call(window.NovaTour, key);
          }
        };
      }
    };
    check();
  }

  // ── Sidebar ⓘ buttons ────────────────────────────────────────────────────────
  function injectInfoButtons() {
    FEATURES.forEach(function(f) {
      var sbSel = SIDEBAR_MAP[f.key];
      if (!sbSel) return;
      var sbEl = document.querySelector(sbSel);
      if (!sbEl || sbEl.querySelector('.nova-tour-info-btn')) return;

      var btn = document.createElement('button');
      btn.className = 'nova-tour-info-btn';
      btn.setAttribute('title', 'How to use ' + f.label);
      btn.setAttribute('aria-label', 'Tour: ' + f.label);
      btn.innerHTML = 'ⓘ';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        triggerTour(f.key, f.label);
      });
      sbEl.appendChild(btn);
    });
  }

  function triggerTour(key, label) {
    if (!window.NovaTour) {
      alert('Tour system not loaded yet — please wait a moment.');
      return;
    }
    window.NovaTour.startModule(key);
  }

  // Inject CSS for info buttons (page-side)
  function injectInfoButtonStyles() {
    if (document.getElementById('nova-tour-info-styles')) return;
    var s = document.createElement('style');
    s.id = 'nova-tour-info-styles';
    s.textContent = `
      /* ⓘ info button on sidebar items */
      .sb-i { position: relative; }
      .nova-tour-info-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px; height: 18px;
        border-radius: 50%;
        border: 1.5px solid transparent;
        background: transparent;
        color: var(--mist, #8b94a3);
        font-size: .65rem;
        font-weight: 700;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        opacity: 0;
        transition: opacity .15s, background .15s, color .15s, border-color .15s;
        padding: 0;
        line-height: 1;
        z-index: 10;
        font-family: inherit;
      }
      .sb-i:hover .nova-tour-info-btn,
      .sb-i.on .nova-tour-info-btn {
        opacity: 1;
      }
      .nova-tour-info-btn:hover {
        background: var(--lime, #c8f135);
        color: #0d0f12;
        border-color: var(--lime, #c8f135);
        opacity: 1 !important;
      }
      /* Custom tour indicator dot */
      .nova-tour-info-btn.has-custom::after {
        content: '';
        position: absolute;
        top: -2px; right: -2px;
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--lime-d, #9ec000);
      }
    `;
    document.head.appendChild(s);
  }

  // Update info buttons to show custom-tour indicator
  function refreshInfoButtonIndicators() {
    var all = toursGet();
    document.querySelectorAll('.nova-tour-info-btn').forEach(function(btn) {
      var key = btn.closest('[id]') ? btn.closest('[id]').id.replace('sb', '').toLowerCase() : null;
      // map sb ID back to feature key
      var featureKey = Object.keys(SIDEBAR_MAP).find(function(k) {
        return SIDEBAR_MAP[k] === '#' + (btn.closest('[id]')||{id:''}).id;
      });
      if (featureKey && all[featureKey]) {
        btn.classList.add('has-custom');
        btn.title = 'Custom tour set — click to run';
      } else {
        btn.classList.remove('has-custom');
      }
    });
  }

  // ── DCP Tab Injection ────────────────────────────────────────────────────────
  var _toursPanelBuilt = false;
  var _selectedFeatureKey = FEATURES[0].key;
  var _editingStepIdx = -1; // -1 = adding new, ≥0 = editing existing

  function injectDCPTab() {
    var workspace = document.getElementById('novaDevWorkspace');
    var tabs      = document.getElementById('novaDevTabs');
    if (!workspace || !tabs) return;
    if (document.getElementById('novaDevTab-tours')) return; // already injected

    // Add tab button
    var tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'nova-dev-tab';
    tabBtn.setAttribute('data-tab', 'tours');
    tabBtn.textContent = '🎭 Tours';
    tabs.appendChild(tabBtn);

    // Add tab panel
    var panel = document.createElement('div');
    panel.className = 'nova-dev-tab-panel';
    panel.id = 'novaDevTab-tours';
    panel.innerHTML = buildToursTabHTML();
    workspace.appendChild(panel);

    // Inject DCP-side styles
    injectDCPStyles();

    // Wire events
    wireToursPanelEvents(panel);

    // Patch tab switch to call renderToursPanel
    var tabsEl = document.getElementById('novaDevTabs');
    tabsEl.addEventListener('click', function(e) {
      var btn = e.target.closest('.nova-dev-tab');
      if (btn && btn.dataset.tab === 'tours') {
        setTimeout(function() { renderToursPanel(); }, 0);
      }
    });

    _toursPanelBuilt = true;
  }

  function buildToursTabHTML() {
    return `<div class="ndcp-tours-layout">

      <!-- Left: Feature List -->
      <div class="ndcp-tours-sidebar" id="ndcpToursSidebar">
        <div class="ndcp-tours-sidebar-head">
          <div style="font-size:.72rem;font-weight:800;color:#c8f135;text-transform:uppercase;letter-spacing:.06em">Features</div>
          <div style="font-size:.6rem;color:#5a5e5c">Select to edit tour</div>
        </div>
        <div id="ndcpToursFeatureList"></div>
      </div>

      <!-- Right: Step Editor -->
      <div class="ndcp-tours-editor" id="ndcpToursEditor">
        <div id="ndcpToursEditorContent">
          <div class="ndcp-tours-empty">← Select a feature to edit its tour</div>
        </div>
      </div>

    </div>`;
  }

  function renderToursPanel() {
    renderFeatureList();
    renderStepEditor();
  }

  // ── Feature list ─────────────────────────────────────────────────────────────
  function renderFeatureList() {
    var el = document.getElementById('ndcpToursFeatureList');
    if (!el) return;
    var all = toursGet();
    var cats = [
      { id:'tools',   label:'🛠️ Tools' },
      { id:'account', label:'👤 Account' }
    ];
    var html = '';
    cats.forEach(function(cat) {
      var features = FEATURES.filter(function(f){ return f.category === cat.id; });
      html += '<div class="ndcp-tours-cat-label">' + cat.label + '</div>';
      features.forEach(function(f) {
        var hasCustom = !!(all[f.key] && all[f.key].length);
        var stepCount = hasCustom ? all[f.key].length : 0;
        var isActive  = f.key === _selectedFeatureKey;
        html += '<div class="ndcp-tours-feat-item' + (isActive ? ' active' : '') + '" data-key="' + f.key + '">' +
          '<span class="ndcp-tours-feat-icon">' + f.icon + '</span>' +
          '<span class="ndcp-tours-feat-label">' + f.label + '</span>' +
          (hasCustom
            ? '<span class="ndcp-tours-feat-badge custom">' + stepCount + ' step' + (stepCount !== 1 ? 's' : '') + '</span>'
            : '<span class="ndcp-tours-feat-badge default">default</span>'
          ) +
        '</div>';
      });
    });
    el.innerHTML = html;
  }

  // ── Step editor ──────────────────────────────────────────────────────────────
  function renderStepEditor() {
    var el = document.getElementById('ndcpToursEditorContent');
    if (!el) return;
    var feat = FEATURES.find(function(f){ return f.key === _selectedFeatureKey; });
    if (!feat) { el.innerHTML = '<div class="ndcp-tours-empty">← Select a feature</div>'; return; }

    var all      = toursGet();
    var steps    = all[_selectedFeatureKey] || [];
    var hasCustom = steps.length > 0;

    var html = '';

    // Header
    html += '<div class="ndcp-tours-editor-head">' +
      '<div>' +
        '<div style="font-size:.8rem;font-weight:800;color:#dce0dd">' + feat.icon + ' ' + feat.label + '</div>' +
        '<div style="font-size:.62rem;color:#6f7571;margin-top:2px">' +
          (hasCustom ? '✅ Custom tour — ' + steps.length + ' step(s)' : '📋 Using default tour from nova-tour.js') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="ndcp-btn-ghost-sm" id="ndcpToursPreview" title="Preview tour now">▶ Preview</button>' +
        (hasCustom ? '<button class="ndcp-btn-danger-sm" id="ndcpToursReset">↩ Reset</button>' : '') +
      '</div>' +
    '</div>';

    // Step list
    if (steps.length) {
      html += '<div class="ndcp-tours-steps" id="ndcpTourStepList">';
      steps.forEach(function(step, i) {
        var isEditing = (_editingStepIdx === i);
        html += buildStepRow(step, i, steps.length, isEditing);
      });
      html += '</div>';
    } else {
      html += '<div class="ndcp-tours-no-steps">No custom steps yet. Add one below — or leave empty to use the default tour.</div>';
    }

    // Add / edit step form
    html += buildAddStepForm(_editingStepIdx === -1 ? null : null);

    el.innerHTML = html;

    // Wire editor events
    wireTourEditorEvents(el, steps);
  }

  function buildStepRow(step, idx, total, isEditing) {
    if (isEditing) {
      return '<div class="ndcp-tours-step-row editing" id="ndcpTourStep-' + idx + '">' +
        buildStepFormFields(step, idx) +
        '<div style="display:flex;gap:6px;margin-top:10px">' +
          '<button class="ndcp-btn-primary" data-action="save-step" data-idx="' + idx + '">✓ Save Step</button>' +
          '<button class="ndcp-btn-ghost" data-action="cancel-edit">Cancel</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="ndcp-tours-step-row" id="ndcpTourStep-' + idx + '">' +
      '<div class="ndcp-tours-step-num">' + (idx + 1) + '</div>' +
      '<div class="ndcp-tours-step-info">' +
        '<div class="ndcp-tours-step-title">' + escHtml(step.title || '(no title)') + '</div>' +
        '<div class="ndcp-tours-step-meta">' +
          (step.target ? '🎯 <code>' + escHtml(step.target) + '</code>' : '📍 Centered') +
          ' &nbsp;·&nbsp; ' + (step.position || 'center') +
        '</div>' +
      '</div>' +
      '<div class="ndcp-tours-step-actions">' +
        (idx > 0 ? '<button class="ndcp-tours-step-btn" data-action="move-up" data-idx="' + idx + '" title="Move up">↑</button>' : '') +
        (idx < total-1 ? '<button class="ndcp-tours-step-btn" data-action="move-down" data-idx="' + idx + '" title="Move down">↓</button>' : '') +
        '<button class="ndcp-tours-step-btn edit" data-action="edit-step" data-idx="' + idx + '" title="Edit">✏️</button>' +
        '<button class="ndcp-tours-step-btn danger" data-action="delete-step" data-idx="' + idx + '" title="Delete">✕</button>' +
      '</div>' +
    '</div>';
  }

  function buildStepFormFields(step, idx) {
    var s = step || {};
    var idPfx = 'ndcpStep' + (idx === undefined ? 'New' : idx);
    return '<div class="ndcp-tours-form-fields">' +
      '<div class="ndcp-field">' +
        '<div class="ndcp-label">Step Title</div>' +
        '<input class="ndcp-input" id="' + idPfx + 'Title" type="text" placeholder="e.g. Open the Certificates tool" value="' + escAttr(s.title||'') + '">' +
      '</div>' +
      '<div class="ndcp-field">' +
        '<div class="ndcp-label">Body <span style="font-weight:400;opacity:.6">(HTML allowed)</span></div>' +
        '<textarea class="ndcp-input" id="' + idPfx + 'Body" rows="3" placeholder="Describe what the user should do...">' + escHtml(s.body||'') + '</textarea>' +
      '</div>' +
      '<div class="ndcp-field-row">' +
        '<div class="ndcp-field" style="flex:2">' +
          '<div class="ndcp-label">Target Element <span style="font-weight:400;opacity:.6">(CSS selector, blank = centered)</span></div>' +
          '<input class="ndcp-input" id="' + idPfx + 'Target" type="text" placeholder="#sbCert or .some-button" value="' + escAttr(s.target||'') + '">' +
        '</div>' +
        '<div class="ndcp-field" style="flex:1">' +
          '<div class="ndcp-label">Position</div>' +
          '<select class="ndcp-input" id="' + idPfx + 'Position">' +
            POSITIONS.map(function(p){ return '<option value="' + p + '"' + (s.position===p?' selected':'') + '>' + p + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function buildAddStepForm() {
    if (_editingStepIdx !== -1) return ''; // in edit mode, don't show add form
    return '<div class="ndcp-tours-add-form">' +
      '<div style="font-size:.68rem;font-weight:800;color:#c8f135;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">+ Add Step</div>' +
      buildStepFormFields(null, undefined) +
      '<button class="ndcp-btn-primary" id="ndcpToursAddStep" style="margin-top:10px">+ Add Step</button>' +
    '</div>';
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────
  function wireToursPanelEvents(panel) {
    // Feature list clicks (delegated)
    panel.querySelector('#ndcpToursSidebar').addEventListener('click', function(e) {
      var item = e.target.closest('[data-key]');
      if (!item) return;
      _selectedFeatureKey = item.dataset.key;
      _editingStepIdx = -1;
      renderToursPanel();
    });
  }

  function wireTourEditorEvents(el, steps) {
    // Preview
    var prevBtn = el.querySelector('#ndcpToursPreview');
    if (prevBtn) prevBtn.addEventListener('click', function() {
      previewTour(_selectedFeatureKey);
    });

    // Reset to default
    var resetBtn = el.querySelector('#ndcpToursReset');
    if (resetBtn) resetBtn.addEventListener('click', function() {
      if (!confirm('Remove custom tour for this feature and revert to the built-in default?')) return;
      setFeatureTour(_selectedFeatureKey, null);
      _editingStepIdx = -1;
      renderToursPanel();
      refreshInfoButtonIndicators();
    });

    // Add step
    var addBtn = el.querySelector('#ndcpToursAddStep');
    if (addBtn) addBtn.addEventListener('click', function() {
      var s = readStepForm('ndcpStepNew');
      if (!s.title && !s.body) { showNdcpToast('Add a title or description first', 'err'); return; }
      var all = toursGet();
      var cur = all[_selectedFeatureKey] || [];
      cur.push(s);
      setFeatureTour(_selectedFeatureKey, cur);
      _editingStepIdx = -1;
      renderToursPanel();
      refreshInfoButtonIndicators();
      showNdcpToast('Step added ✓', 'ok');
    });

    // Delegated: edit, delete, move, save, cancel
    el.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var idx    = btn.dataset.idx !== undefined ? parseInt(btn.dataset.idx) : -1;
      var all    = toursGet();
      var cur    = (all[_selectedFeatureKey] || []).slice();

      if (action === 'edit-step') {
        _editingStepIdx = idx;
        renderStepEditor();

      } else if (action === 'cancel-edit') {
        _editingStepIdx = -1;
        renderStepEditor();

      } else if (action === 'save-step') {
        var s = readStepForm('ndcpStep' + idx);
        if (!s.title && !s.body) { showNdcpToast('Step needs a title or description', 'err'); return; }
        cur[idx] = s;
        setFeatureTour(_selectedFeatureKey, cur);
        _editingStepIdx = -1;
        renderToursPanel();
        refreshInfoButtonIndicators();
        showNdcpToast('Step saved ✓', 'ok');

      } else if (action === 'delete-step') {
        if (!confirm('Delete step ' + (idx+1) + '?')) return;
        cur.splice(idx, 1);
        setFeatureTour(_selectedFeatureKey, cur);
        _editingStepIdx = -1;
        renderToursPanel();
        refreshInfoButtonIndicators();
        showNdcpToast('Step deleted', 'ok');

      } else if (action === 'move-up' && idx > 0) {
        var tmp = cur[idx-1]; cur[idx-1] = cur[idx]; cur[idx] = tmp;
        setFeatureTour(_selectedFeatureKey, cur);
        renderStepEditor();

      } else if (action === 'move-down' && idx < cur.length-1) {
        var tmp2 = cur[idx+1]; cur[idx+1] = cur[idx]; cur[idx] = tmp2;
        setFeatureTour(_selectedFeatureKey, cur);
        renderStepEditor();
      }
    });
  }

  function readStepForm(idPfx) {
    return {
      title:    (document.getElementById(idPfx+'Title')||{value:''}).value.trim(),
      body:     (document.getElementById(idPfx+'Body')||{value:''}).value.trim(),
      target:   (document.getElementById(idPfx+'Target')||{value:''}).value.trim() || null,
      position: (document.getElementById(idPfx+'Position')||{value:'center'}).value || 'center',
    };
  }

  // ── Preview ───────────────────────────────────────────────────────────────────
  function previewTour(key) {
    if (!window.NovaTour) { showNdcpToast('NovaTour not loaded yet', 'err'); return; }
    // Close DCP temporarily during preview
    var shell = document.getElementById('novaDevControl');
    if (shell) shell.style.visibility = 'hidden';

    window.NovaTour.startModule(key);

    // Wait for tour to end, then re-show DCP
    var pollEnd = setInterval(function() {
      if (!window.NovaTour.isActive()) {
        clearInterval(pollEnd);
        if (shell) shell.style.visibility = '';
        // Re-render panel to reflect any changes
        renderToursPanel();
      }
    }, 400);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) {
    return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function showNdcpToast(msg, type) {
    // Reuse app's showToast if available
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    var el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
      background: type==='err' ? '#dc2626' : '#15803d',
      color:'#fff', padding:'8px 16px', borderRadius:'8px',
      fontSize:'.75rem', fontWeight:'700', zIndex:'999999',
      transition:'opacity .3s', fontFamily:'inherit',
    });
    document.body.appendChild(el);
    setTimeout(function(){ el.style.opacity='0'; }, 1800);
    setTimeout(function(){ el.remove(); }, 2200);
  }

  // ── DCP Styles ────────────────────────────────────────────────────────────────
  function injectDCPStyles() {
    if (document.getElementById('nova-dev-tours-dcp-styles')) return;
    var s = document.createElement('style');
    s.id = 'nova-dev-tours-dcp-styles';
    s.textContent = `
      /* Tours tab layout */
      .ndcp-tours-layout {
        display: flex;
        height: 100%;
        overflow: hidden;
      }

      /* Feature list sidebar */
      .ndcp-tours-sidebar {
        width: 220px;
        flex-shrink: 0;
        border-right: 1px solid #252826;
        overflow-y: auto;
        padding: 0;
      }
      .ndcp-tours-sidebar-head {
        padding: 14px 14px 10px;
        border-bottom: 1px solid #252826;
        position: sticky; top: 0;
        background: #141713; z-index: 1;
      }
      .ndcp-tours-cat-label {
        font-size: .58rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #4d524f;
        padding: 12px 14px 5px;
      }
      .ndcp-tours-feat-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        cursor: pointer;
        border-left: 2.5px solid transparent;
        transition: background .12s, border-color .12s;
        font-size: .73rem;
        color: #9ea29e;
      }
      .ndcp-tours-feat-item:hover {
        background: #1e2220;
        color: #dce0dd;
      }
      .ndcp-tours-feat-item.active {
        background: #1e2220;
        border-left-color: #c8f135;
        color: #dce0dd;
      }
      .ndcp-tours-feat-icon { font-size: .85rem; flex-shrink: 0; }
      .ndcp-tours-feat-label { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ndcp-tours-feat-badge {
        font-size: .55rem;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 99px;
        flex-shrink: 0;
      }
      .ndcp-tours-feat-badge.custom {
        background: rgba(200,241,53,.15);
        color: #9ec000;
        border: 1px solid rgba(200,241,53,.25);
      }
      .ndcp-tours-feat-badge.default {
        background: #1e2220;
        color: #4d524f;
        border: 1px solid #252826;
      }

      /* Step editor */
      .ndcp-tours-editor {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }
      .ndcp-tours-empty {
        text-align: center;
        color: #4d524f;
        font-size: .75rem;
        margin-top: 60px;
      }
      .ndcp-tours-editor-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid #252826;
      }
      .ndcp-tours-no-steps {
        font-size: .68rem;
        color: #4d524f;
        padding: 10px 0 14px;
        text-align: center;
      }

      /* Step rows */
      .ndcp-tours-steps {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
      }
      .ndcp-tours-step-row {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #1a1d1b;
        border: 1px solid #252826;
        border-radius: 9px;
        padding: 9px 10px;
        transition: border-color .15s;
      }
      .ndcp-tours-step-row:hover { border-color: #3a3f3c; }
      .ndcp-tours-step-row.editing {
        flex-direction: column;
        align-items: stretch;
        border-color: #c8f135;
        padding: 12px;
      }
      .ndcp-tours-step-num {
        width: 22px; height: 22px;
        border-radius: 6px;
        background: #252826;
        color: #c8f135;
        font-size: .65rem;
        font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ndcp-tours-step-info { flex: 1; min-width: 0; }
      .ndcp-tours-step-title {
        font-size: .73rem;
        font-weight: 700;
        color: #dce0dd;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ndcp-tours-step-meta {
        font-size: .6rem;
        color: #5a5e5c;
        margin-top: 2px;
      }
      .ndcp-tours-step-meta code {
        background: #252826;
        padding: 0 4px;
        border-radius: 3px;
        font-size: .58rem;
        color: #9ec000;
      }
      .ndcp-tours-step-actions {
        display: flex; gap: 4px; flex-shrink: 0;
      }
      .ndcp-tours-step-btn {
        width: 26px; height: 26px;
        border-radius: 6px;
        border: 1px solid #252826;
        background: #1e2220;
        color: #5a5e5c;
        font-size: .7rem;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .12s, color .12s, border-color .12s;
        padding: 0;
      }
      .ndcp-tours-step-btn:hover { background: #252826; color: #dce0dd; border-color: #3a3f3c; }
      .ndcp-tours-step-btn.edit:hover { background: rgba(200,241,53,.12); color: #c8f135; border-color: rgba(200,241,53,.3); }
      .ndcp-tours-step-btn.danger:hover { background: rgba(220,38,38,.12); color: #ef4444; border-color: rgba(220,38,38,.3); }

      /* Add step form */
      .ndcp-tours-add-form {
        background: #141713;
        border: 1.5px dashed #2d312e;
        border-radius: 10px;
        padding: 14px;
        margin-top: 6px;
      }
      .ndcp-tours-form-fields { display: flex; flex-direction: column; gap: 10px; }

      /* DCP tab panel scroll */
      #novaDevTab-tours {
        padding: 0;
        overflow: hidden;
        height: calc(100% - 0px);
      }
      #novaDevTab-tours.active { display: flex; flex-direction: column; }
      .ndcp-tours-layout { flex: 1; min-height: 0; }
    `;
    document.head.appendChild(s);
  }

  // ── Boot: watch for DCP being inserted ──────────────────────────────────────
  function waitForDCP() {
    var obs = new MutationObserver(function() {
      if (document.getElementById('novaDevWorkspace')) {
        obs.disconnect();
        // Small delay so DCP fully renders
        setTimeout(function() {
          injectDCPTab();
          injectInfoButtonStyles();
          injectInfoButtons();
          refreshInfoButtonIndicators();
          patchNovaTourFull();
        }, 120);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Also handle case DCP is already open
    if (document.getElementById('novaDevWorkspace')) {
      setTimeout(function() {
        injectDCPTab();
        injectInfoButtonStyles();
        injectInfoButtons();
        refreshInfoButtonIndicators();
        patchNovaTourFull();
      }, 120);
    }
  }

  // Also inject info buttons when sidebar becomes visible
  function waitForSidebar() {
    var check = function() {
      if (document.querySelector('.sidebar')) {
        injectInfoButtonStyles();
        injectInfoButtons();
        refreshInfoButtonIndicators();
      } else {
        setTimeout(check, 500);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', check);
    } else {
      check();
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  waitForSidebar();
  waitForDCP();

  // Expose public API
  window.NovaDevTours = {
    get:     getFeatureTour,
    set:     function(key, steps) { setFeatureTour(key, steps); refreshInfoButtonIndicators(); },
    clear:   function(key) { setFeatureTour(key, null); refreshInfoButtonIndicators(); },
    clearAll: function() { toursSave({}); refreshInfoButtonIndicators(); },
    preview: previewTour,
    refresh: function() { renderToursPanel(); refreshInfoButtonIndicators(); },
  };

})();
