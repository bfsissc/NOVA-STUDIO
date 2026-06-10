/* ╔══════════════════════════════════════════════════════════════════╗
   ║  NOVA TOUR — Interactive Onboarding & Feature Guide             ║
   ║  Integrates with Nova AI panel for contextual walkthroughs      ║
   ╚══════════════════════════════════════════════════════════════════╝ */

(function () {
  'use strict';

  // ── Tour step definitions ───────────────────────────────────────────────
  // Each step: { target: CSS selector, title, body, position: 'right'|'bottom'|'left'|'top' }

  const DASHBOARD_TOUR = [
    {
      target: null,
      title: '👋 Welcome to NOVA Studio!',
      body: "Let's take a quick 30-second tour so you know where everything lives. You can skip at any time.",
      position: 'center',
    },
    {
      target: '#sbHome',
      title: '🏠 Dashboard',
      body: 'This is your home base. See analytics, quick-access favourites, and get an overview of your workspace at a glance.',
      position: 'right',
    },
    {
      target: '#sbCert',
      title: '🎓 Certificate Maker',
      body: 'Design stunning certificates on a canvas editor. Upload backgrounds, add dynamic text placeholders like {{Name}}, then bulk-export from a CSV in one click.',
      position: 'right',
    },
    {
      target: '#sbMailer',
      title: '📧 Certificate Mailer',
      body: 'Send your generated certificates directly to recipients via email (powered by Brevo). Just load the same CSV you used for certificates.',
      position: 'right',
    },
    {
      target: '#sbPortal',
      title: '🏫 College Portal',
      body: 'Create shareable portals linked to Google Sheets. Give colleges a live view of their data without giving them spreadsheet access.',
      position: 'right',
    },
    {
      target: '#sbSync',
      title: '🔄 Data Sync',
      body: 'Real-time collaborative workspace. Create or join a room and all members see data updates instantly — no page refresh needed.',
      position: 'right',
    },
    {
      target: '#sbTeams',
      title: '👥 My Teams',
      body: 'Invite colleagues with role-based access: Admin, Editor, or Viewer. Great for managing who can do what inside NOVA.',
      position: 'right',
    },
    {
      target: '#sbFollowup',
      title: '📂 Followup Tracker',
      body: 'Track data collection status per college — toggle cells between Pending / Received / Verified. Filter to quickly see what\'s still outstanding.',
      position: 'right',
    },
    {
      target: '#nova-ai-fab',
      title: '✦ Nova AI — Your Guide',
      body: 'This is your AI assistant. Ask it how any feature works, or click the <strong>Features</strong> tab to browse all modules and get a step-by-step walkthrough for any one of them.',
      position: 'left',
    },
  ];

  // Per-module single-step spotlights (triggered from AI panel)
  const MODULE_TOURS = {
    cert: [
      {
        target: '#sbCert',
        title: '🎓 Certificate Maker',
        body: '<strong>Step 1:</strong> Click here in the sidebar to open Certificate Maker.',
        position: 'right',
      },
      {
        target: null,
        title: '🎓 Certificate Maker — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>Upload Background</b> to set your design image</li><li>Click <b>Add Text</b> → use <code>{{Name}}</code>, <code>{{Course}}</code> as placeholders</li><li>Upload a <b>CSV file</b> with matching column headers</li><li>Click <b>Export All</b> to bulk-generate all certificates as PNGs</li></ol>',
        position: 'center',
      },
    ],
    mailer: [
      {
        target: '#sbMailer',
        title: '📧 Certificate Mailer',
        body: '<strong>Step 1:</strong> Click here in the sidebar to open the Mailer.',
        position: 'right',
      },
      {
        target: null,
        title: '📧 Mailer — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Save your <b>Brevo API key</b> in Settings → Integrations</li><li>Load the same <b>CSV file</b> you used for certificates</li><li>Set your sender name & email in Settings → Integrations</li><li>Click <b>Send All</b> — Brevo sends up to 300 free emails/day</li></ol>',
        position: 'center',
      },
    ],
    portal: [
      {
        target: '#sbPortal',
        title: '🏫 College Portal',
        body: '<strong>Step 1:</strong> Click here to open the College Portal builder.',
        position: 'right',
      },
      {
        target: null,
        title: '🏫 College Portal — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>Create Portal</b> and enter the college name</li><li>Paste a <b>Google Sheet URL</b> as the data source</li><li>Click <b>Copy Link</b> to share the portal with the college</li></ol>',
        position: 'center',
      },
    ],
    sync: [
      {
        target: '#sbSync',
        title: '🔄 Data Sync',
        body: '<strong>Step 1:</strong> Click here to open the real-time Data Sync workspace.',
        position: 'right',
      },
      {
        target: null,
        title: '🔄 Data Sync — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>Create Room</b> to start a new shared workspace</li><li>Share the <b>Room Code</b> with collaborators</li><li>Import data via drag-and-drop CSV, or add rows manually</li><li>All members see changes <b>in real-time</b> — no refresh needed</li></ol>',
        position: 'center',
      },
    ],
    teams: [
      {
        target: '#sbTeams',
        title: '👥 My Teams',
        body: '<strong>Step 1:</strong> Click here to open Team Management.',
        position: 'right',
      },
      {
        target: null,
        title: '👥 Teams — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>Invite Member</b> and enter their email + role</li><li>Roles: <b>Admin</b> (full access), <b>Editor</b> (can edit), <b>Viewer</b> (read-only)</li><li>Remove members using the <b>trash icon</b> next to their name</li></ol>',
        position: 'center',
      },
    ],
    followup: [
      {
        target: '#sbFollowup',
        title: '📂 Followup Tracker',
        body: '<strong>Step 1:</strong> Click here to open the Followup Tracker.',
        position: 'right',
      },
      {
        target: null,
        title: '📂 Followup Tracker — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Each <b>row</b> = one college; columns show data collection status</li><li>Click any <b>status cell</b> to cycle: Pending → Received → Verified</li><li>Use the <b>filter bar</b> to view only incomplete colleges</li></ol>',
        position: 'center',
      },
    ],
    tp: [
      {
        target: '#sbTp',
        title: '🤝 Training Partners',
        body: '<strong>Step 1:</strong> Click here to open Training Partners.',
        position: 'right',
      },
      {
        target: null,
        title: '🤝 Training Partners — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Browse available partner organisations</li><li>Click <b>Apply</b> to submit a partnership request</li><li>Click <b>Withdraw</b> to cancel an existing application</li></ol>',
        position: 'center',
      },
    ],
    imgcomp: [
      {
        target: '#sbImgComp',
        title: '🖼️ Image Resizer',
        body: '<strong>Step 1:</strong> Click here to open the Image Resizer & Compressor.',
        position: 'right',
      },
      {
        target: null,
        title: '🖼️ Image Resizer — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Drag and drop images (or click to browse)</li><li>Set <b>quality</b> (0–100) and <b>max dimension</b></li><li>Click <b>Compress All</b></li><li>Click <b>Download ZIP</b> to get all compressed images</li></ol>',
        position: 'center',
      },
    ],
    imgedit: [
      {
        target: '#sbImgEdit',
        title: '🎨 Image Editor',
        body: '<strong>Step 1:</strong> Click here to open the Image Editor.',
        position: 'right',
      },
      {
        target: null,
        title: '🎨 Image Editor — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>Load Image</b> to upload a photo</li><li>Use <b>Crop</b> to select and apply a crop region</li><li>Apply <b>Filters</b> via the sliders (brightness, contrast, etc.)</li><li>Add <b>Overlays</b> (text, shapes) from the toolbar</li><li>Click <b>Download</b> to save</li></ol>',
        position: 'center',
      },
    ],
    fileconv: [
      {
        target: '#sbFileConv',
        title: '🔄 File Converter',
        body: '<strong>Step 1:</strong> Click here to open the File Converter.',
        position: 'right',
      },
      {
        target: null,
        title: '🔄 File Converter — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Drag files into the upload zone</li><li>Select the <b>output format</b> from the dropdown</li><li>Click <b>Convert</b></li><li>Download the converted file when ready</li></ol>',
        position: 'center',
      },
    ],
    drafts: [
      {
        target: '#sbDrafts',
        title: '✉️ Draft Proposals',
        body: '<strong>Step 1:</strong> Click here to open Draft Proposals.',
        position: 'right',
      },
      {
        target: null,
        title: '✉️ Draft Proposals — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Click <b>New Draft</b> to start writing</li><li>Fill in title, content, and tags</li><li>Save — it syncs to Firestore automatically</li><li>Use <b>Filter</b> to search drafts by tag or status</li></ol>',
        position: 'center',
      },
    ],
    analytics: [
      {
        target: '#dashAnalyticsSection',
        title: '📊 Analytics',
        body: '<strong>Step 1:</strong> The Analytics panel is right here on your dashboard.',
        position: 'bottom',
      },
      {
        target: null,
        title: '📊 Analytics — How it works',
        body: '<ol style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li>Four panels load automatically on the dashboard</li><li>Click <b>Load Sample</b> to preview with demo data</li><li>Panels show: Certificate exports, Email stats, College completion rates, App usage</li><li>Upload your own CSV to power the charts with real data</li></ol>',
        position: 'center',
      },
    ],
    settings: [
      {
        target: '#sbSettings',
        title: '⚙️ Settings',
        body: '<strong>Step 1:</strong> Click here to open Settings.',
        position: 'right',
      },
      {
        target: null,
        title: '⚙️ Settings — What\'s inside',
        body: '<ul style="margin:8px 0 0 16px;padding:0;line-height:1.9"><li><b>Appearance</b> — Theme (Light/Dark/System) & accent colour</li><li><b>Workspace</b> — Default views & layout prefs</li><li><b>Notifications</b> — Toggle alerts and sounds</li><li><b>Integrations</b> — Brevo API key, Google Drive token</li><li><b>Data & Storage</b> — Export/import, clear bin</li></ul>',
        position: 'center',
      },
    ],
  };

  // ── State ────────────────────────────────────────────────────────────────
  let _steps    = [];
  let _stepIdx  = 0;
  let _onDone   = null;
  let _active   = false;

  const LS_KEY  = 'nova_tour_done_v1';

  // ── Inject CSS ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('nova-tour-styles')) return;
    const s = document.createElement('style');
    s.id = 'nova-tour-styles';
    s.textContent = `
      /* ── Overlay ── */
      #ntOverlay {
        position: fixed; inset: 0; z-index: 199990;
        pointer-events: none;
        transition: opacity .3s;
      }
      #ntOverlay.nt-active { pointer-events: auto; }

      /* SVG mask fills screen; transparent hole punched over target */
      #ntOverlaySvg {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
      }

      /* ── Tooltip card ── */
      #ntTooltip {
        position: fixed; z-index: 199999;
        width: 310px; max-width: calc(100vw - 32px);
        background: var(--card, #fff);
        border: 1.5px solid rgba(0,0,0,.08);
        border-radius: 18px;
        box-shadow: 0 24px 64px rgba(0,0,0,.2), 0 4px 16px rgba(0,0,0,.1);
        padding: 20px 20px 16px;
        font-family: 'Bricolage Grotesque', -apple-system, sans-serif;
        color: var(--ink, #0d0f12);
        font-size: 14px; line-height: 1.55;
        opacity: 0; pointer-events: none;
        transition: opacity .22s, transform .22s;
        transform: translateY(8px);
        box-sizing: border-box;
      }
      #ntTooltip.nt-visible {
        opacity: 1; pointer-events: auto;
        transform: translateY(0);
      }

      /* Progress dots */
      #ntProgress {
        display: flex; gap: 5px; margin-bottom: 12px; align-items: center;
      }
      .nt-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: rgba(0,0,0,.15);
        transition: background .2s, width .2s;
      }
      .nt-dot.active {
        background: var(--lime-d, #9ec000);
        width: 18px; border-radius: 3px;
      }
      .nt-dot.done { background: var(--lime-d, #9ec000); opacity: .5; }

      /* Step label */
      #ntStepLabel {
        font-size: .62rem; font-weight: 700; letter-spacing: .06em;
        color: var(--lime-d, #9ec000); text-transform: uppercase;
        margin-bottom: 4px;
      }

      /* Title */
      #ntTitle {
        font-size: 1rem; font-weight: 700;
        color: var(--ink, #0d0f12);
        margin-bottom: 8px;
        line-height: 1.3;
      }

      /* Body */
      #ntBody {
        font-size: .82rem;
        color: var(--ink2, #3a414d);
        line-height: 1.6;
        margin-bottom: 16px;
      }
      #ntBody code {
        background: rgba(0,0,0,.06);
        border-radius: 4px; padding: 1px 5px;
        font-size: .78rem; font-family: 'DM Mono', monospace;
      }
      #ntBody ol, #ntBody ul { margin-top: 8px; }

      /* Buttons */
      #ntBtns {
        display: flex; gap: 8px; align-items: center; justify-content: flex-end;
      }
      .nt-btn-skip {
        flex: 1;
        background: none; border: none; cursor: pointer;
        font-size: .72rem; color: var(--mist, #8b94a3);
        font-family: inherit; padding: 0; text-align: left;
        transition: color .15s;
      }
      .nt-btn-skip:hover { color: var(--ink, #0d0f12); }
      .nt-btn-prev {
        background: none;
        border: 1.5px solid rgba(0,0,0,.1);
        border-radius: 10px; cursor: pointer;
        font-size: .75rem; font-weight: 600; padding: 7px 14px;
        font-family: inherit; color: var(--ink2, #3a414d);
        transition: border-color .15s;
      }
      .nt-btn-prev:hover { border-color: var(--lime-d, #9ec000); }
      .nt-btn-next {
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        border: none; border-radius: 10px; cursor: pointer;
        font-size: .75rem; font-weight: 700; padding: 7px 18px;
        font-family: inherit; color: #0d0f12;
        box-shadow: 0 3px 10px rgba(200,241,53,.3);
        transition: transform .15s, box-shadow .15s;
      }
      .nt-btn-next:hover { transform: scale(1.04); }

      /* Highlight ring around target */
      #ntHighlightRing {
        position: fixed; pointer-events: none; z-index: 199995;
        border: 2.5px solid var(--lime, #c8f135);
        border-radius: 12px;
        box-shadow: 0 0 0 4px rgba(200,241,53,.18);
        transition: all .28s cubic-bezier(.34,1.2,.64,1);
        opacity: 0;
      }
      #ntHighlightRing.nt-ring-visible { opacity: 1; }

      /* ── Floating entry popover (first-login) ── */
      #ntWelcomeBadge {
        position: fixed; bottom: 96px; right: 92px; z-index: 199998;
        background: var(--card, #fff);
        border: 1.5px solid rgba(0,0,0,.08);
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0,0,0,.18);
        padding: 12px 16px;
        font-family: 'Bricolage Grotesque', -apple-system, sans-serif;
        font-size: .8rem; color: var(--ink2, #3a414d);
        max-width: 220px;
        animation: ntBadgeIn .4s cubic-bezier(.34,1.56,.64,1) both;
        cursor: pointer;
        line-height: 1.5;
      }
      @keyframes ntBadgeIn {
        from { opacity: 0; transform: scale(.8) translateY(10px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #ntWelcomeBadge strong { display: block; font-size: .85rem; color: var(--ink, #0d0f12); margin-bottom: 3px; }
      #ntWelcomeBadge .nt-badge-cta {
        margin-top: 10px; text-align: center;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        border-radius: 8px; padding: 6px 12px;
        font-size: .72rem; font-weight: 700; color: #0d0f12;
        box-shadow: 0 2px 8px rgba(200,241,53,.3);
      }
      #ntWelcomeBadge .nt-badge-skip {
        text-align: center; margin-top: 6px;
        font-size: .65rem; color: var(--mist, #8b94a3); cursor: pointer;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Build DOM ────────────────────────────────────────────────────────────
  function buildDOM() {
    if (document.getElementById('ntOverlay')) return;

    // Overlay (dim + hole)
    const overlay = document.createElement('div');
    overlay.id = 'ntOverlay';
    overlay.innerHTML = `
      <svg id="ntOverlaySvg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="ntHoleMask">
            <rect width="100%" height="100%" fill="white"/>
            <rect id="ntHoleRect" x="0" y="0" width="0" height="0" rx="12" fill="black"/>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(10,12,18,0.55)" mask="url(#ntHoleMask)"/>
      </svg>`;

    // Highlight ring
    const ring = document.createElement('div');
    ring.id = 'ntHighlightRing';

    // Tooltip
    const tip = document.createElement('div');
    tip.id = 'ntTooltip';
    tip.innerHTML = `
      <div id="ntProgress"></div>
      <div id="ntStepLabel"></div>
      <div id="ntTitle"></div>
      <div id="ntBody"></div>
      <div id="ntBtns">
        <button class="nt-btn-skip" id="ntSkip">Skip tour</button>
        <button class="nt-btn-prev" id="ntPrev" style="display:none">← Back</button>
        <button class="nt-btn-next" id="ntNext">Next →</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(ring);
    document.body.appendChild(tip);

    document.getElementById('ntSkip').addEventListener('click', endTour);
    document.getElementById('ntNext').addEventListener('click', nextStep);
    document.getElementById('ntPrev').addEventListener('click', prevStep);

    // Click overlay to advance (but not click-through when active)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.id === 'ntOverlaySvg') nextStep();
    });
  }

  // ── Tour engine ──────────────────────────────────────────────────────────
  function startTour(steps, onDone) {
    if (_active) endTour();
    injectStyles();
    buildDOM();
    _steps   = steps;
    _stepIdx = 0;
    _onDone  = onDone || null;
    _active  = true;
    const ov = document.getElementById('ntOverlay');
    ov.style.opacity = '';
    ov.style.pointerEvents = '';
    ov.classList.add('nt-active');
    renderStep();
  }

  function renderStep() {
    const step = _steps[_stepIdx];
    if (!step) { endTour(); return; }

    const tooltip  = document.getElementById('ntTooltip');
    const ring     = document.getElementById('ntHighlightRing');
    const holeRect = document.getElementById('ntHoleRect');
    const overlay  = document.getElementById('ntOverlay');

    // Hide tooltip during transition
    tooltip.classList.remove('nt-visible');

    // Update progress dots
    const prog = document.getElementById('ntProgress');
    prog.innerHTML = '';
    _steps.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'nt-dot' + (i === _stepIdx ? ' active' : i < _stepIdx ? ' done' : '');
      prog.appendChild(d);
    });

    // Step label
    document.getElementById('ntStepLabel').textContent =
      `Step ${_stepIdx + 1} of ${_steps.length}`;

    // Content
    document.getElementById('ntTitle').textContent = step.title;
    document.getElementById('ntBody').innerHTML = step.body;

    // Prev/Next/Skip
    const prevBtn = document.getElementById('ntPrev');
    const nextBtn = document.getElementById('ntNext');
    const skipBtn = document.getElementById('ntSkip');
    prevBtn.style.display = _stepIdx > 0 ? '' : 'none';
    nextBtn.textContent   = _stepIdx === _steps.length - 1 ? '✓ Got it!' : 'Next →';
    skipBtn.style.display = _stepIdx === _steps.length - 1 ? 'none' : '';

    // Target highlight
    const PAD = 10;
    if (step.target && step.position !== 'center') {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => {
          const r = el.getBoundingClientRect();
          const rx = r.left - PAD, ry = r.top - PAD;
          const rw = r.width + PAD * 2, rh = r.height + PAD * 2;

          // SVG hole
          const hr = document.getElementById('ntHoleRect');
          hr.setAttribute('x', rx);
          hr.setAttribute('y', ry);
          hr.setAttribute('width', rw);
          hr.setAttribute('height', rh);

          // Ring
          ring.style.left   = rx + 'px';
          ring.style.top    = ry + 'px';
          ring.style.width  = rw + 'px';
          ring.style.height = rh + 'px';
          ring.classList.add('nt-ring-visible');

          placeTooltip(step, r);
        }, 80);
        return;
      }
    }

    // No target — center modal
    holeRect.setAttribute('width', '0');
    holeRect.setAttribute('height', '0');
    ring.classList.remove('nt-ring-visible');
    placeCentered();
  }

  function placeTooltip(step, targetRect) {
    const tip  = document.getElementById('ntTooltip');
    const TW   = 320, PAD = 16;
    const vw   = window.innerWidth, vh = window.innerHeight;

    tip.classList.remove('nt-visible');
    tip.style.left = tip.style.top = tip.style.right = tip.style.bottom = '';

    let left, top;

    if (step.position === 'right') {
      left = Math.min(targetRect.right + 18, vw - TW - PAD);
      top  = Math.max(PAD, Math.min(targetRect.top, vh - 300));
    } else if (step.position === 'left') {
      left = Math.max(PAD, targetRect.left - TW - 18);
      top  = Math.max(PAD, Math.min(targetRect.top, vh - 300));
    } else if (step.position === 'bottom') {
      left = Math.max(PAD, Math.min(targetRect.left, vw - TW - PAD));
      top  = targetRect.bottom + 18;
    } else {
      left = Math.max(PAD, Math.min(targetRect.right + 18, vw - TW - PAD));
      top  = Math.max(PAD, Math.min(targetRect.top, vh - 300));
    }

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
    tip.style.width = TW + 'px';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => tip.classList.add('nt-visible'));
    });
  }

  function placeCentered() {
    const tip = document.getElementById('ntTooltip');
    tip.classList.remove('nt-visible');
    tip.style.left   = '50%';
    tip.style.top    = '50%';
    tip.style.width  = '340px';
    tip.style.transform = 'translate(-50%, -50%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tip.classList.add('nt-visible');
        tip.style.transform = 'translate(-50%, -50%) translateY(0)';
      });
    });
  }

  function nextStep() {
    // Reset centered transform before placing next step
    document.getElementById('ntTooltip').style.transform = '';
    _stepIdx++;
    if (_stepIdx >= _steps.length) { endTour(); return; }
    renderStep();
  }

  function prevStep() {
    document.getElementById('ntTooltip').style.transform = '';
    if (_stepIdx > 0) { _stepIdx--; renderStep(); }
  }

  function endTour() {
    _active = false;
    const overlay = document.getElementById('ntOverlay');
    const tip     = document.getElementById('ntTooltip');
    const ring    = document.getElementById('ntHighlightRing');
    if (overlay) { overlay.classList.remove('nt-active'); overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    if (tip)   { tip.classList.remove('nt-visible'); tip.style.transform = ''; }
    if (ring)  ring.classList.remove('nt-ring-visible');
    if (typeof _onDone === 'function') _onDone();
    _onDone = null;
  }

  // ── First-login welcome badge ─────────────────────────────────────────────
  function showWelcomeBadge() {
    if (document.getElementById('ntWelcomeBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'ntWelcomeBadge';
    badge.innerHTML = `
      <strong>👋 First time here?</strong>
      Take a quick tour to learn how NOVA Studio works.
      <div class="nt-badge-cta" id="ntBadgeCta">✦ Start Tour</div>
      <div class="nt-badge-skip" id="ntBadgeSkip">Skip for now</div>`;
    document.body.appendChild(badge);

    document.getElementById('ntBadgeCta').addEventListener('click', function () {
      badge.remove();
      startDashboardTour();
    });
    document.getElementById('ntBadgeSkip').addEventListener('click', function () {
      badge.remove();
      markTourDone();
    });

    // Auto-remove after 18 seconds if ignored
    setTimeout(() => { badge.remove(); }, 18000);
  }

  function markTourDone() {
    try { localStorage.setItem(LS_KEY, '1'); } catch (e) {}
  }

  function isTourDone() {
    try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; }
  }

  // ── Public launchers ──────────────────────────────────────────────────────
  function startDashboardTour() {
    startTour(DASHBOARD_TOUR, function () {
      markTourDone();
    });
  }

  function startModuleTour(moduleKey) {
    const steps = MODULE_TOURS[moduleKey];
    if (!steps) return;
    startTour(steps, null);
  }

  // ── Auto-trigger on first login ───────────────────────────────────────────
  // Waits until the app is visible (boot() adds .visible to #app)
  function waitForApp() {
    const app = document.getElementById('app');
    if (!app) { setTimeout(waitForApp, 300); return; }

    const observer = new MutationObserver(function (mutations) {
      for (const m of mutations) {
        if (m.target.classList.contains('visible')) {
          observer.disconnect();
          if (!isTourDone()) {
            injectStyles();
            setTimeout(showWelcomeBadge, 1400);
          }
          break;
        }
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });

    // Also catch if already visible
    if (app.classList.contains('visible') && !isTourDone()) {
      injectStyles();
      setTimeout(showWelcomeBadge, 1400);
    }
  }

  // ── Expose public API ─────────────────────────────────────────────────────
  window.NovaTour = {
    startDashboard : startDashboardTour,
    startModule    : startModuleTour,
    resetTour      : function () {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
    },
    isActive       : function () { return _active; },
  };

  // ── Dev Tours trigger (called from outside IIFE via window slot) ─────────
  // nova-dev-tours.js sets window.__novaPendingSteps then calls this
  window.__novaTriggerPendingSteps = function () {
    var pending = window.__novaPendingSteps;
    if (!pending || !Array.isArray(pending.steps)) return;
    window.__novaPendingSteps = null;
    startTour(pending.steps, pending.onDone || null);
  };

  // ── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForApp);
  } else {
    waitForApp();
  }

})();

// ── Dev Tours bridge (appended by nova-dev-tours integration) ──────────────
// nova-dev-tours.js dispatches 'nova:run-steps' with { steps, onDone }
// This listener forwards it to the internal startTour engine.
// Must be outside the IIFE so it attaches after the IIFE sets up NovaTour.
window.addEventListener('nova:run-steps', function (e) {
  if (!e.detail || !Array.isArray(e.detail.steps)) return;
  if (window.NovaTour && window.NovaTour.isActive()) return; // don't stack tours
  // Kick off via a thin adapter: temporarily swap startDashboard steps
  // then trigger — the IIFE's startTour is private, so we dispatch back
  // into startModule with a trick: inject a temp key into MODULE_TOURS.
  // Actually: just use the existing endTour + direct re-fire approach.
  // Since nova-tour.js's startTour is enclosed, we re-use startDashboard
  // which has access. We pass via a shared window slot.
  window.__novaPendingSteps = { steps: e.detail.steps, onDone: e.detail.onDone || null };
  window.__novaTriggerPendingSteps && window.__novaTriggerPendingSteps();
});
