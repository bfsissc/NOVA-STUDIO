// =====================================================
// NOVA AI Assistant — Codebase-aware AI bot
// No API key required — fully local knowledge engine
// Drop this file in assets/js/ and add one <script> tag
// to index.html just before </body>
// =====================================================

(function () {
  'use strict';

  // ── Conversation history ─────────────────────────────────────────────────
  let chatHistory = [];
  let isOpen = false;
  let isTyping = false;
  let pendingAction = null;
  let _welcomeShown = false;

  // ── Action executor ──────────────────────────────────────────────────────
  const ACTIONS = {
    navigate: (params) => {
      if (typeof goView === 'function') {
        goView(params.view);
        return `Navigated to "${params.view}" view.`;
      }
      return 'Navigation function not available.';
    },
    showToast: (params) => {
      if (typeof showToast === 'function') {
        showToast(params.message, params.type || 'info');
        return `Showed toast: "${params.message}"`;
      }
      return 'Toast function not available.';
    },
    openSettings: (params) => {
      if (typeof goView === 'function' && typeof stgTab === 'function') {
        goView('settings');
        setTimeout(() => stgTab(params.tab || 'appearance'), 120);
        return `Opened Settings → ${params.tab || 'appearance'} tab.`;
      }
      return 'Settings function not available.';
    },
    launchTool: (params) => {
      if (typeof launchTool === 'function') {
        launchTool(params.tool);
        return `Launched tool: "${params.tool}"`;
      }
      return 'launchTool not available.';
    },
    clickElement: (params) => {
      const el = document.getElementById(params.id) || document.querySelector(params.selector);
      if (el) { el.click(); return `Clicked element: ${params.id || params.selector}`; }
      return `Element "${params.id || params.selector}" not found.`;
    },
    fillInput: (params) => {
      const el = document.getElementById(params.id) || document.querySelector(params.selector);
      if (el) {
        el.value = params.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return `Filled input "${params.id || params.selector}" with value.`;
      }
      return `Input "${params.id || params.selector}" not found.`;
    },
    callFunction: (params) => {
      try {
        const ALLOWED = ['certAddText','certExportSingle','certResizeCanvas','certRenderFull',
          'certRemoveBg','certRemoveLogo','mlRenderQueue','syncOnViewOpen','tpInit',
          'projRender','dpInit','dpFilterRender','caBootstrap','stgApplyUI','updateStats',
          'updateGreeting','favRenderSidebar','NV.init','TM.openView','FU.openView'];
        if (!ALLOWED.includes(params.fn)) return `Function "${params.fn}" is not in the allowed list for safety.`;
        const parts = params.fn.split('.');
        let fn = window;
        for (const p of parts) fn = fn?.[p];
        if (typeof fn === 'function') { fn(...(params.args || [])); return `Called ${params.fn}() successfully.`; }
        return `Function ${params.fn} not found on window.`;
      } catch (e) {
        return `Error calling ${params.fn}: ${e.message}`;
      }
    }
  };

  function executeAction(action) {
    const handler = ACTIONS[action.type];
    if (!handler) return `Unknown action type: ${action.type}`;
    return handler(action.params || {});
  }

  // ── Local Knowledge Base ─────────────────────────────────────────────────
  const NOVA_KB = {
    modules: {
      cert: {
        name: 'Certificate Maker',
        view: 'cert',
        aliases: ['certificate','cert maker','cert editor','certificate maker','certmaker'],
        description: 'A canvas-based tool for designing certificates with custom backgrounds, logos, and text placeholders. Supports bulk generation from CSV.',
        howTo: `**How to use Certificate Maker:**\n1. Go to **Certificate Maker** (sidebar or say "Open Certificates")\n2. Click **Upload Background** to set your certificate design image\n3. Click **Add Text** to create text elements — use \`{{Name}}\`, \`{{Course}}\`, \`{{College}}\` as placeholders\n4. Upload a **CSV file** with columns matching your placeholder names\n5. Click **Export All** to bulk-generate and download all certificates as PNGs`,
        functions: {
          certDraw: 'Renders the certificate preview on the canvas. Accepts optional overrideData to preview with specific values.',
          certRenderFull: 'Full-quality render for export/download — same as certDraw but at full resolution.',
          certSubstitute: 'Replaces {{placeholders}} in a text string with actual data. Usage: certSubstitute("Hello {{Name}}", {Name:"Alice"}) → "Hello Alice"',
          certLoadBg: 'Loads a background image from a file input element. Called when user uploads background.',
          certRemoveBg: 'Removes the current background image from the certificate.',
          certSetBgFit: 'Sets how background image fits the canvas. Values: "fill" (stretch), "fit" (letterbox), "center" (no scale).',
          certSetOpacity: 'Sets background image opacity. Value 0–1 (0=invisible, 1=fully visible).',
          certSetBgColor: 'Sets the solid background color behind the image.',
          certLoadLogo: 'Loads a logo image from a file input. Logo is overlaid on the certificate.',
          certRemoveLogo: 'Removes the current logo from the certificate.',
          certUpdateLogo: 'Refreshes logo position and size after changing parameters like x, y, width.',
          certAddText: 'Adds a new draggable text element to the certificate canvas.',
          certDeleteEl: 'Deletes a text/logo element by its ID. Usage: certDeleteEl("el_1")',
          certSelectEl: 'Selects and highlights an element for editing. Usage: certSelectEl("el_1")',
          certRenderElList: 'Refreshes the elements list in the sidebar panel.',
          certShowElProps: 'Shows the properties panel (font, size, color, position) for a given element.',
          certResizeCanvas: 'Resizes the canvas to match current width/height settings.',
          certUpdateCanvasSize: 'Updates canvas dimensions — same as certResizeCanvas but also triggers a redraw.',
          certPreset: 'Applies a preset canvas size. Usage: certPreset(1123, 794) for A4 landscape.',
          certFitZoom: 'Auto-fits the canvas zoom level so the whole certificate is visible in the viewport.',
          certExportSingle: 'Downloads the current certificate as a single PNG file.',
          certExportAll: 'Bulk-exports all certificates from the loaded CSV, downloading each as a PNG.',
          certBulkLoad: 'Loads a CSV file for bulk generation. CSV columns must match placeholder names.',
        }
      },
      mailer: {
        name: 'Certificate Mailer',
        view: 'mailer',
        aliases: ['mailer','cert mailer','email','send certificates','certificate mailer'],
        description: 'Sends certificates to recipients via email using the Brevo API. Loads the same CSV as Certificate Maker.',
        howTo: `**How to use Certificate Mailer:**\n1. Go to **Cert Mailer** in the sidebar\n2. Make sure you have a **Brevo API key** saved in Settings → Integrations\n3. Load your **CSV file** (same format as Certificate Maker)\n4. Set your sender name and email in Settings → Integrations\n5. Preview the email template\n6. Click **Send All** to dispatch certificates to all recipients\n\n⚠️ Brevo allows 300 free emails/day. Get a key at brevo.com`,
        functions: {
          mlInitCanvas: 'Initialises the mailer preview canvas to show the certificate template.',
          mlSendAll: 'Sends certificates to all recipients in the loaded CSV queue via Brevo API.',
          mlLoadCsv: 'Loads a recipient CSV file. Columns: Name, Email, College (and any custom placeholders).',
          mlRenderQueue: 'Renders the list of recipients in the send queue UI.',
          mlSendOne: 'Sends a certificate to a single recipient by index. Usage: mlSendOne(0) sends to the first person.',
        }
      },
      portal: {
        name: 'College Portal',
        view: 'portal',
        aliases: ['portal','college portal','portals','college'],
        description: 'Creates shareable portals for individual colleges backed by Google Sheets data.',
        howTo: `**How to use College Portal:**\n1. Go to **College Portal** in the sidebar\n2. Click **Create Portal** and enter the college name\n3. Link a Google Sheet URL as the data source\n4. Click **Copy Link** to share the portal URL with the college\n5. The portal shows that college's data only`,
        functions: {
          cpInit: 'Initialises the portal manager, loading existing portals from storage.',
          cpCreate: 'Creates a new college portal. Prompts for name and Google Sheet URL.',
          cpDelete: 'Deletes a portal by ID. Usage: cpDelete("portal_abc123")',
          cpCopyLink: 'Copies the shareable portal link to clipboard. Usage: cpCopyLink("portal_abc123")',
        }
      },
      sync: {
        name: 'Data Sync',
        view: 'sync',
        aliases: ['data sync','sync','realtime','firestore sync','collaborative','spreadsheet'],
        description: 'Real-time collaborative spreadsheet powered by Firestore. Supports multi-sheet tabs, drag-drop CSV import, column schema templates, and live presence tracking.',
        howTo: `**How to use Data Sync:**\n1. Go to **Data Sync** in the sidebar\n2. Click **Create Room** to start a new shared workspace, or **Join Room** with a room code\n3. Import data via **drag-and-drop CSV** or add rows manually\n4. All collaborators see changes in real-time\n5. Use the **Schema** dropdown to apply column templates for BFSI data`,
        functions: {
          syncOnViewOpen: 'Called automatically when the Data Sync view is opened. Initialises or refreshes the sync state.',
          syncCreateRoom: 'Creates a new Firestore-backed sync room and returns the room code.',
          syncJoinRoom: 'Joins an existing sync room by code. Loads all shared data.',
          syncPushRow: 'Pushes a single row to the shared workbook. Usage: syncPushRow({Name:"Alice", Score:90})',
        }
      },
      teams: {
        name: 'Teams',
        view: 'teams',
        aliases: ['teams','team','members','invite','roles'],
        description: 'Manages team members with role-based access. Roles: admin, editor, viewer.',
        howTo: `**How to manage Teams:**\n1. Go to **My Teams** in the sidebar\n2. Click **Invite Member** and enter their email + role\n3. Roles: **Admin** (full access), **Editor** (can edit data), **Viewer** (read-only)\n4. Remove members using the trash icon next to their name`,
        functions: {
          'TM.init': 'Initialises the team module, loading members from Firestore.',
          'TM.openView': 'Opens the teams panel in the UI.',
          'TM.inviteMember': 'Invites a new member. Usage: TM.inviteMember("email@x.com", "editor")',
          'TM.removeMember': 'Removes a member from the team. Usage: TM.removeMember("email@x.com")',
        }
      },
      followup: {
        name: 'Followup Tracker',
        view: 'followup',
        aliases: ['followup','follow up','tracker','follow-up','data collection','status'],
        description: 'Tracks data collection progress across colleges with per-column status indicators.',
        howTo: `**How to use Followup Tracker:**\n1. Go to **Followup Tracker** in the sidebar\n2. Each row represents a college — columns show data collection status\n3. Click a status cell to toggle between Pending / Received / Verified\n4. Use filters to view only incomplete colleges`,
        functions: {
          'FU.init': 'Initialises the followup tracker, loading data from Firestore.',
          'FU.openView': 'Opens the tracker view.',
        }
      },
      tp: {
        name: 'Training Partners',
        view: 'tp',
        aliases: ['training partners','tp','partners','training'],
        description: 'Lists available training partner organisations. Users can apply or withdraw from partnerships.',
        howTo: `**How to use Training Partners:**\n1. Go to **Training Partners** in the sidebar\n2. Browse available training partner organisations\n3. Click **Apply** to submit a partnership request\n4. Click **Withdraw** to cancel a pending application`,
        functions: {
          tpInit: 'Loads and renders the list of training partners from storage.',
          tpRenderHomeWidget: 'Renders the Training Partners widget on the home dashboard.',
          tpApply: 'Submits a partnership application for a TP. Usage: tpApply("tp_id")',
          tpWithdraw: 'Withdraws an existing application. Usage: tpWithdraw("tp_id")',
        }
      },
      imgcomp: {
        name: 'Image Resizer',
        view: 'imgcomp',
        aliases: ['image resizer','image compressor','compress','resize','bulk image','imgcomp'],
        description: 'Bulk image compression and resize tool. Supports quality slider, size targets, and batch ZIP download.',
        howTo: `**How to use Image Resizer:**\n1. Go to **Image Resizer** in the sidebar\n2. Drag and drop images onto the upload zone (or click to browse)\n3. Set your target **quality** (0–100) and **max dimension**\n4. Click **Compress All** to process\n5. Click **Download ZIP** to get all compressed images in one file`,
        functions: {
          icRefreshUI: 'Refreshes the Image Resizer UI — updates card states and totals.',
          icRenderCards: 'Renders the image cards showing original vs compressed size for each file.',
          icZipAndDownload: 'Packages all compressed images into a ZIP file and triggers a browser download.',
        }
      },
      imgedit: {
        name: 'Image Editor',
        view: 'imgedit',
        aliases: ['image editor','edit image','crop','filter','overlay','imgedit'],
        description: 'Canvas-based image editor with crop, filters, and overlay tools.',
        howTo: `**How to use Image Editor:**\n1. Go to **Image Editor** in the sidebar\n2. Click **Load Image** to upload a photo\n3. Use the **Crop** tool to select and apply a crop region\n4. Apply **Filters** (brightness, contrast, saturation) via the sliders\n5. Add **Overlays** (text, shapes) from the overlay toolbar\n6. Click **Download** to save the edited image`,
        functions: {
          ieLoadToCanvas: 'Loads an image onto the editor canvas by element ID.',
          ieCropApply: 'Applies the current crop selection to the canvas.',
          ieRender: 'Re-renders the full canvas with all current edits and filters applied.',
        }
      },
      fileconv: {
        name: 'File Converter',
        view: 'fileconv',
        aliases: ['file converter','convert','pdf to','docx','file convert','fileconv'],
        description: 'Converts files between formats — PDF, DOCX, and images.',
        howTo: `**How to use File Converter:**\n1. Go to **File Converter** in the sidebar\n2. Drag files into the upload zone\n3. Select the **output format** from the dropdown\n4. Click **Convert** — the file will process in the browser\n5. Download the converted file`,
        functions: {
          fcDoConvert: 'Runs the conversion. Usage: fcDoConvert(file, "pdf", "png") converts a PDF to PNG.',
          fcRenderList: 'Renders the queued file list showing conversion status for each file.',
        }
      },
      drafts: {
        name: 'Draft Proposals',
        view: 'drafts',
        aliases: ['drafts','proposals','draft','proposal'],
        description: 'Manages draft proposals stored in Firestore with filter and CRUD operations.',
        howTo: `**How to use Draft Proposals:**\n1. Go to **Draft Proposals** in the sidebar\n2. Click **New Draft** to start a proposal\n3. Fill in the title, content, and tags\n4. Save — it syncs to Firestore automatically\n5. Use the **Filter** bar to search by tag or status`,
        functions: {
          dpInit: 'Initialises the draft manager, loading all drafts from Firestore.',
          dpFilterRender: 'Filters and re-renders the draft list based on current search/tag criteria.',
          dpDeleteActive: 'Deletes the currently selected/active draft from Firestore.',
          _draftSaveOne: 'Internal — saves a single draft object to Firestore.',
          _draftDeleteOne: 'Internal — deletes a draft by ID from Firestore.',
        }
      },
      analytics: {
        name: 'Analytics',
        view: 'analytics',
        aliases: ['analytics','stats','statistics','reports','charts','data'],
        description: 'Shows four analytics panels with certificate, mailer, college, and usage statistics.',
        howTo: `**How to use Analytics:**\n1. Go to **Analytics** in the sidebar\n2. The dashboard loads four panels automatically\n3. Click **Load Sample** to preview with demo data if real data isn't available yet\n4. Panels show: Certificate exports, Email dispatch stats, College completion rates, App usage`,
        functions: {
          caBootstrap: 'Bootstraps the analytics view — loads data and renders all four panels.',
          caRenderPanel1: 'Renders Panel 1: Certificate export statistics.',
          caRenderPanel2: 'Renders Panel 2: Email dispatch statistics.',
          caRenderPanel3: 'Renders Panel 3: College completion rates.',
          caRenderPanel4: 'Renders Panel 4: Overall app usage metrics.',
          caLoadSample: 'Loads sample/demo data into all analytics panels for testing.',
        }
      },
      settings: {
        name: 'Settings',
        view: 'settings',
        aliases: ['settings','preferences','config','appearance','theme','brevo','api key','integrations'],
        description: 'Workspace settings: appearance, notifications, privacy, data management, file uploads, integrations (Brevo, Drive).',
        howTo: `**Settings tabs:**\n- **Appearance** — Theme (Light/Dark/System) and accent color\n- **Workspace** — Default views, layout preferences\n- **Notifications** — Toggle alerts and sounds\n- **Privacy** — Data sharing preferences\n- **Data & Storage** — View usage, export/import projects, clear bin\n- **Data Upload** — Upload candidate CSV data for the whole workspace\n- **Integrations** — Brevo API key, Google Drive token`,
        functions: {
          stgTab: 'Switches the active settings tab. Values: "appearance","workspace","notifications","privacy","data","dataupload","integrations"',
          stgGetSettings: 'Returns the current settings object from localStorage.',
          stgApplyUI: 'Applies all saved settings to the UI (theme, accent color, etc.).',
        }
      },
      nav: {
        name: 'Navigation & Auth',
        aliases: ['navigate','login','logout','signup','auth','go to','open','switch','view'],
        description: 'Core navigation and authentication functions.',
        functions: {
          goView: 'Navigates to a view. Values: "home","cert","mailer","portal","sync","teams","followup","tp","imgcomp","fileconv","imgedit","drafts","analytics","projects","profile","settings","help"',
          launchTool: 'Opens a tool and tracks usage stats. Usage: launchTool("cert") or launchTool("mailer")',
          boot: 'Boots the app after successful authentication. Called internally after login.',
          doLogin: 'Triggers the email/password login flow.',
          doLogout: 'Logs out the current user and returns to the login screen.',
          doSignup: 'Triggers the signup flow for new users.',
          triggerGoogleLogin: 'Initiates Google OAuth login.',
        }
      },
      notifications: {
        name: 'Notifications',
        aliases: ['toast','notification','alert','notify','showtoast'],
        description: 'Toast notification system for user feedback.',
        functions: {
          'NV.init': 'Initialises the notification system.',
          showToast: 'Shows a toast notification. Usage: showToast("Message here", "ok") — types: "ok", "err", "info"',
        }
      },
      firebase: {
        name: 'Firebase / Firestore',
        aliases: ['firebase','firestore','database','db','storage','auth','fbauth','fbdb'],
        description: 'Firebase services used across NOVA Studio.',
        functions: {
          fbAuth: 'Firebase Auth instance — used for login/logout and getting the current user.',
          fbDb: 'Firestore database instance — used by all modules for real-time data storage.',
          fbStorage: 'Firebase Storage instance — used for storing files and images.',
        }
      }
    },

    faq: [
      { q: ['what is nova studio','what does nova studio do','what is this app','tell me about nova'], a: 'NOVA Studio is an all-in-one creative workspace for **BFSI (Banking, Financial Services & Insurance)** training and certification teams.\n\nIt includes:\n→ **Certificate Maker** — design & bulk-export certificates\n→ **Certificate Mailer** — email certificates via Brevo\n→ **College Portal** — shareable college-specific data views\n→ **Data Sync** — real-time collaborative spreadsheet\n→ **Teams** — role-based team management\n→ **Analytics** — stats and reporting\n→ And more tools for image editing, file conversion, and draft proposals.' },
      { q: ['how do i login','how to login','sign in','how to sign in'], a: 'To log in to NOVA Studio:\n1. On the login screen, enter your **email and password**\n2. Or click **Sign in with Google** for one-click Google OAuth login\n3. If you don\'t have an account, click **Sign Up** to create one\n\nThe relevant function is `doLogin()` for email login and `triggerGoogleLogin()` for Google OAuth.' },
      { q: ['what is brevo','brevo api','email api','how to send email','configure brevo'], a: '**Brevo** is the email service NOVA Studio uses to send certificates.\n\nTo configure it:\n1. Go to **Settings → Integrations**\n2. Paste your Brevo API key (starts with `xkeysib-`)\n3. Set your verified sender email\n\nGet a free Brevo key at **brevo.com** — the free plan allows 300 emails/day.\n\nOnce configured, the Certificate Mailer will use it to send certificates with attachments.' },
      { q: ['what is data sync','how does firestore work','real time','collaborative'], a: '**Data Sync** is a real-time collaborative spreadsheet powered by **Firestore**.\n\nMultiple users can join the same "room" and see each other\'s edits live. It supports:\n→ Multi-sheet tabs\n→ Drag-and-drop CSV import\n→ Column schema templates\n→ Presence tracking (see who\'s online)\n\nUse `syncCreateRoom()` to create a room and `syncJoinRoom()` to join one.' },
      { q: ['how do i add text','add placeholder','certificate placeholder','template variable'], a: 'To add text placeholders to a certificate:\n1. Open **Certificate Maker**\n2. Click **Add Text** — a new text element appears on the canvas\n3. Double-click to edit it and type your placeholder like `{{Name}}` or `{{College}}`\n4. When you bulk-export with a CSV, the function `certSubstitute()` replaces each `{{placeholder}}` with the matching CSV column value automatically.' },
      { q: ['bulk export','export all','download all','batch download','export certificates'], a: 'To bulk-export certificates:\n1. Open **Certificate Maker**\n2. Design your certificate with `{{Name}}`, `{{Course}}`, etc. placeholders\n3. Click **Load CSV** and upload a file with matching column headers\n4. Click **Export All** — this calls `certExportAll()` which loops through every row, substitutes placeholders via `certSubstitute()`, renders the full canvas via `certRenderFull()`, and saves each as a PNG file.' },
      { q: ['csv format','what columns','csv structure','how to format csv'], a: 'The CSV format for NOVA Studio should have:\n- **Name** — recipient\'s full name (matches `{{Name}}` placeholder)\n- **Email** — for the mailer\n- **College** — organisation/college name\n- Any other column you add will automatically become available as a `{{ColumnName}}` placeholder in certificates\n\nExample:\n```\nName,Email,College,Course\nAlice Sharma,alice@example.com,IIT Mumbai,Data Analytics\n```' },
      { q: ['how to navigate','go to view','switch view','open tool'], a: 'You can navigate in NOVA Studio by:\n1. **Clicking the sidebar** — each item switches the view\n2. **Programmatically** — `goView("cert")` opens the Certificate Maker\n3. **Via me** — just say "Open the Mailer" and I\'ll navigate for you!\n\nValid views: `home`, `cert`, `mailer`, `portal`, `sync`, `teams`, `followup`, `tp`, `imgcomp`, `fileconv`, `imgedit`, `drafts`, `analytics`, `projects`, `profile`, `settings`, `help`' },
      { q: ['who is u','who are you','what are you','what can you do','nova ai capabilities'], a: 'I\'m **Nova AI** — your built-in assistant for NOVA Studio!\n\nI can help you:\n→ **Find any function** — tell me a function name and I\'ll explain what it does\n→ **How-to guides** — step-by-step instructions for any feature\n→ **Navigate the app** — say "Open the Mailer" and I\'ll take you there\n→ **Explain modules** — ask about any module and I\'ll break it down\n→ **Debug workflows** — describe what\'s not working and I\'ll guide you\n\nI\'m always ready — no setup needed.' },
    ],

    navCommands: [
      { triggers: ['open cert','go to cert','open certificate','switch to cert'], view: 'cert', name: 'Certificate Maker' },
      { triggers: ['open mailer','go to mailer','open certificate mailer','switch to mailer'], view: 'mailer', name: 'Certificate Mailer' },
      { triggers: ['open portal','go to portal','open college portal'], view: 'portal', name: 'College Portal' },
      { triggers: ['open sync','go to sync','open data sync','switch to sync'], view: 'sync', name: 'Data Sync' },
      { triggers: ['open teams','go to teams','my teams','switch to teams'], view: 'teams', name: 'Teams' },
      { triggers: ['open followup','go to followup','open tracker','followup tracker'], view: 'followup', name: 'Followup Tracker' },
      { triggers: ['open analytics','go to analytics','open stats','view analytics'], view: 'analytics', name: 'Analytics' },
      { triggers: ['open settings','go to settings','open preferences'], view: 'settings', name: 'Settings' },
      { triggers: ['go home','open home','open dashboard','go to dashboard','home'], view: 'home', name: 'Dashboard' },
      { triggers: ['open image resizer','open resizer','compress images','go to resizer'], view: 'imgcomp', name: 'Image Resizer' },
      { triggers: ['open image editor','edit image','go to image editor'], view: 'imgedit', name: 'Image Editor' },
      { triggers: ['open file converter','convert files','go to converter'], view: 'fileconv', name: 'File Converter' },
      { triggers: ['open drafts','go to drafts','open proposals'], view: 'drafts', name: 'Draft Proposals' },
      { triggers: ['open training partners','training partners','go to tp'], view: 'tp', name: 'Training Partners' },
      { triggers: ['open projects','my projects','go to projects'], view: 'projects', name: 'My Projects' },
      { triggers: ['open profile','my profile','go to profile'], view: 'profile', name: 'My Profile' },
      { triggers: ['open help','help guide','go to help'], view: 'help', name: 'Help & Guide' },
    ]
  };

  // ── Local AI Engine ──────────────────────────────────────────────────────
  async function callAI(userMessage) {
    chatHistory.push({ role: 'user', content: userMessage });
    await new Promise(r => setTimeout(r, 320 + Math.random() * 380));

    const q = userMessage.toLowerCase().trim();
    let reply = '';
    let action = null;

    // 1. Navigation commands
    for (const nav of NOVA_KB.navCommands) {
      if (nav.triggers.some(t => q.includes(t))) {
        reply = `Sure! Navigating you to **${nav.name}** right now.`;
        action = { type: 'navigate', params: { view: nav.view } };
        chatHistory.push({ role: 'assistant', content: reply });
        return { text: reply, action };
      }
    }

    // 2. Function lookup
    const funcMatch = matchFunction(q);
    if (funcMatch) {
      reply = funcMatch;
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action: null };
    }

    // 3. Module how-to
    const moduleHowTo = matchModuleHowTo(q);
    if (moduleHowTo) {
      reply = moduleHowTo;
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action: null };
    }

    // 4. FAQ matching
    const faqMatch = matchFaq(q);
    if (faqMatch) {
      reply = faqMatch;
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action: null };
    }

    // 5. Module overview
    const moduleOverview = matchModuleOverview(q);
    if (moduleOverview) {
      reply = moduleOverview;
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action: null };
    }

    // 6. Settings navigation shortcuts
    if (q.includes('integrations') || q.includes('brevo key') || q.includes('api key settings')) {
      reply = 'Opening **Settings → Integrations** where you can configure Brevo and Google Drive.';
      action = { type: 'openSettings', params: { tab: 'integrations' } };
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action };
    }

    // 7. Generic module list
    if (q.includes('list') && (q.includes('module') || q.includes('feature') || q.includes('tool'))) {
      reply = listAllModules();
      chatHistory.push({ role: 'assistant', content: reply });
      return { text: reply, action: null };
    }

    // 8. Fallback
    reply = buildFallback(userMessage);
    chatHistory.push({ role: 'assistant', content: reply });
    return { text: reply, action: null };
  }

  // ── Matchers ─────────────────────────────────────────────────────────────

  function matchFunction(q) {
    for (const [modKey, mod] of Object.entries(NOVA_KB.modules)) {
      if (!mod.functions) continue;
      for (const [fnName, fnDesc] of Object.entries(mod.functions)) {
        const fnLower = fnName.toLowerCase();
        if (q.includes(fnLower) || q.includes(fnName)) {
          return `**\`${fnName}()\`** — ${mod.name}\n\n${fnDesc}\n\n**Module:** ${mod.name}\n**View:** \`${mod.view || 'global'}\``;
        }
      }
    }
    return null;
  }

  function matchModuleHowTo(q) {
    const howToPhrases = ['how do i use','how to use','how do i','how to','step by step','guide for','tutorial','walk me through','teach me'];
    const isHowTo = howToPhrases.some(p => q.includes(p));
    if (!isHowTo) return null;
    for (const [modKey, mod] of Object.entries(NOVA_KB.modules)) {
      if (!mod.aliases) continue;
      if (mod.aliases.some(a => q.includes(a)) || q.includes(modKey)) {
        return mod.howTo || `**${mod.name}**\n\n${mod.description}`;
      }
    }
    return null;
  }

  function matchFaq(q) {
    for (const faq of NOVA_KB.faq) {
      if (faq.q.some(phrase => q.includes(phrase))) return faq.a;
    }
    return null;
  }

  function matchModuleOverview(q) {
    for (const [modKey, mod] of Object.entries(NOVA_KB.modules)) {
      if (!mod.aliases) continue;
      const matched = mod.aliases.some(a => q.includes(a)) || q.includes(modKey);
      if (!matched) continue;
      let resp = `**${mod.name}**\n\n${mod.description}\n\n`;
      if (mod.howTo) resp += mod.howTo + '\n\n';
      if (mod.functions) {
        const fnList = Object.keys(mod.functions).slice(0, 5).map(f => `→ \`${f}()\``).join('\n');
        resp += `**Key functions:**\n${fnList}`;
        if (Object.keys(mod.functions).length > 5) {
          resp += `\n→ ...and ${Object.keys(mod.functions).length - 5} more. Ask me about a specific function!`;
        }
      }
      return resp;
    }
    return null;
  }

  function listAllModules() {
    const lines = Object.values(NOVA_KB.modules)
      .filter(m => m.name && m.view)
      .map(m => `→ **${m.name}** (\`${m.view}\`) — ${m.description.split('.')[0]}`);
    return `**NOVA Studio Modules:**\n\n${lines.join('\n')}\n\nAsk me about any module for a full guide and function list!`;
  }

  function buildFallback(originalQ) {
    const q = originalQ.toLowerCase();
    const suggestions = [];
    for (const [modKey, mod] of Object.entries(NOVA_KB.modules)) {
      if (mod.aliases && mod.aliases.some(a => q.split(' ').some(w => a.includes(w) && w.length > 3))) {
        suggestions.push(`**${mod.name}**`);
      }
    }
    let resp = `I'm not sure I caught that exactly. `;
    if (suggestions.length > 0) resp += `Were you asking about ${suggestions.slice(0,2).join(' or ')}?\n\n`;
    resp += `Here's what I can help with:\n→ **"How do I use [module name]?"** — step-by-step guide\n→ **"How does [function name] work?"** — function explanation\n→ **"Open [module name]"** — navigate directly\n→ **"List all modules"** — see everything NOVA Studio has\n\nTry rephrasing or pick a suggestion below!`;
    return resp;
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #nova-ai-fab {
        all: unset;
        position: fixed !important;
        bottom: 28px !important;
        right: 28px !important;
        z-index: 99999 !important;
        width: 54px !important;
        height: 54px !important;
        border-radius: 18px !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        cursor: pointer !important;
        box-shadow: 0 6px 24px rgba(0,0,0,.18), 0 2px 8px rgba(200,241,53,.3) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 1.35rem !important;
        writing-mode: horizontal-tb !important;
        direction: ltr !important;
        transition: transform .2s, box-shadow .2s;
        outline: none;
      }
      #nova-ai-fab:hover {
        transform: scale(1.08) translateY(-2px) !important;
        box-shadow: 0 10px 32px rgba(0,0,0,.22), 0 3px 12px rgba(200,241,53,.4) !important;
      }
      #nova-ai-fab .fab-pulse {
        position: absolute !important;
        inset: -4px !important;
        border-radius: 22px !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        opacity: 0 !important;
        animation: naiPulse 2.4s ease-in-out infinite !important;
        z-index: -1 !important;
      }
      @keyframes naiPulse {
        0%,100% { opacity: 0; transform: scale(1); }
        50% { opacity: .18; transform: scale(1.15); }
      }

      #nova-ai-panel,
      #nova-ai-panel * {
        writing-mode: horizontal-tb !important;
        direction: ltr !important;
        text-orientation: mixed !important;
        unicode-bidi: normal !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        text-transform: none !important;
        font-variant: normal !important;
      }

      #nova-ai-panel {
        position: fixed !important;
        bottom: 94px !important;
        right: 28px !important;
        z-index: 99998 !important;
        width: 370px !important;
        max-width: calc(100vw - 40px) !important;
        height: 520px !important;
        max-height: calc(100vh - 120px) !important;
        background: var(--card, #fff) !important;
        border: 1.5px solid rgba(0,0,0,.07) !important;
        border-radius: 20px !important;
        box-shadow: 0 20px 60px rgba(0,0,0,.16), 0 4px 16px rgba(0,0,0,.08) !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        transform-origin: bottom right !important;
        animation: naiSlideIn .25s cubic-bezier(.34,1.56,.64,1) both !important;
        box-sizing: border-box !important;
        font-family: 'Bricolage Grotesque', -apple-system, sans-serif !important;
        color: var(--ink, #0d0f12) !important;
        line-height: 1.5 !important;
        font-size: 14px !important;
      }
      @keyframes naiSlideIn {
        from { opacity: 0; transform: scale(.88) translateY(16px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #nova-ai-panel.closing {
        animation: naiSlideOut .18s ease-in both !important;
      }
      @keyframes naiSlideOut {
        to { opacity: 0; transform: scale(.9) translateY(12px); }
      }

      #nova-ai-panel .nai-header {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 14px 16px !important;
        border-bottom: 1px solid rgba(0,0,0,.06) !important;
        flex-shrink: 0 !important;
        background: linear-gradient(135deg, rgba(200,241,53,.08), rgba(15,217,180,.06)) !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-avatar {
        width: 34px !important; height: 34px !important; min-width: 34px !important;
        border-radius: 11px !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-size: .95rem !important; flex-shrink: 0 !important;
        box-shadow: 0 2px 8px rgba(200,241,53,.3) !important;
      }
      #nova-ai-panel .nai-header-text { flex: 1 !important; min-width: 0 !important; overflow: hidden !important; }
      #nova-ai-panel .nai-title { font-size: .82rem !important; font-weight: 800 !important; color: var(--ink, #0d0f12) !important; display: block !important; white-space: nowrap !important; }
      #nova-ai-panel .nai-subtitle { font-size: .67rem !important; color: var(--mist, #8b94a3) !important; margin-top: 1px !important; display: block !important; white-space: nowrap !important; }
      #nova-ai-panel .nai-close {
        width: 28px !important; height: 28px !important; min-width: 28px !important;
        border-radius: 8px !important; border: none !important;
        background: rgba(0,0,0,.05) !important; cursor: pointer !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-size: .85rem !important; color: var(--mist, #8b94a3) !important;
        transition: background .15s, color .15s; flex-shrink: 0 !important;
      }
      #nova-ai-panel .nai-close:hover { background: rgba(0,0,0,.1) !important; color: var(--ink, #0d0f12) !important; }

      #nova-ai-panel .nai-messages {
        flex: 1 !important; overflow-y: auto !important; overflow-x: hidden !important;
        padding: 14px 14px 8px !important;
        display: flex !important; flex-direction: column !important; align-items: flex-start !important;
        gap: 10px !important; scroll-behavior: smooth !important;
        width: 100% !important; box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-messages::-webkit-scrollbar { width: 4px !important; }
      #nova-ai-panel .nai-messages::-webkit-scrollbar-track { background: transparent !important; }
      #nova-ai-panel .nai-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,.1) !important; border-radius: 4px !important; }

      #nova-ai-panel .nai-msg {
        max-width: 88% !important; min-width: 40px !important; width: auto !important;
        line-height: 1.55 !important; font-size: .78rem !important;
        border-radius: 14px !important; padding: 9px 13px !important;
        word-break: break-word !important; overflow-wrap: break-word !important;
        white-space: pre-wrap !important; box-sizing: border-box !important;
        display: block !important; animation: naiMsgIn .2s ease both !important;
      }
      @keyframes naiMsgIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #nova-ai-panel .nai-msg.user {
        align-self: flex-end !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--lime-d, #9ec000)) !important;
        color: var(--ink, #0d0f12) !important; font-weight: 500 !important;
        border-bottom-right-radius: 4px !important;
      }
      #nova-ai-panel .nai-msg.bot {
        align-self: flex-start !important;
        background: var(--surface, #f4f6fa) !important;
        color: var(--ink, #0d0f12) !important;
        border-bottom-left-radius: 4px !important;
        border: 1px solid rgba(0,0,0,.05) !important;
      }
      #nova-ai-panel .nai-msg.bot code { background: rgba(0,0,0,.07) !important; padding: 1px 5px !important; border-radius: 4px !important; font-family: 'DM Mono', monospace !important; font-size: .72rem !important; white-space: pre-wrap !important; }
      #nova-ai-panel .nai-msg.bot strong { font-weight: 700 !important; }
      #nova-ai-panel .nai-msg.system {
        align-self: center !important; background: transparent !important;
        color: var(--mist, #8b94a3) !important; font-size: .68rem !important;
        padding: 2px 8px !important; max-width: 100% !important; text-align: center !important;
      }

      #nova-ai-panel .nai-action-card {
        align-self: flex-start !important;
        background: var(--lime-p, rgba(200,241,53,.1)) !important;
        border: 1.5px solid rgba(158,192,0,.25) !important;
        border-radius: 12px !important; padding: 10px 13px !important;
        max-width: 88% !important; font-size: .75rem !important;
        color: var(--ink, #0d0f12) !important; box-sizing: border-box !important;
        display: block !important; animation: naiMsgIn .2s ease both !important;
      }
      #nova-ai-panel .nai-action-card .nai-action-label {
        font-weight: 700 !important; font-size: .7rem !important;
        color: var(--lime-d, #9ec000) !important; margin-bottom: 5px !important;
        display: flex !important; flex-direction: row !important; align-items: center !important; gap: 5px !important;
      }
      #nova-ai-panel .nai-action-btns { display: flex !important; flex-direction: row !important; gap: 7px !important; margin-top: 9px !important; }
      #nova-ai-panel .nai-action-btns button { padding: 5px 12px !important; border-radius: 7px !important; border: 1.5px solid !important; font-size: .7rem !important; font-weight: 700 !important; cursor: pointer !important; transition: all .15s; }
      #nova-ai-panel .nai-btn-confirm { background: var(--lime, #c8f135) !important; border-color: var(--lime-d, #9ec000) !important; color: var(--ink, #0d0f12) !important; }
      #nova-ai-panel .nai-btn-confirm:hover { transform: scale(1.03) !important; }
      #nova-ai-panel .nai-btn-deny { background: transparent !important; border-color: rgba(0,0,0,.12) !important; color: var(--mist, #8b94a3) !important; }
      #nova-ai-panel .nai-btn-deny:hover { border-color: rgba(0,0,0,.25) !important; color: var(--ink, #0d0f12) !important; }

      #nova-ai-panel .nai-typing {
        align-self: flex-start !important;
        background: var(--surface, #f4f6fa) !important;
        border: 1px solid rgba(0,0,0,.05) !important;
        border-radius: 14px !important; border-bottom-left-radius: 4px !important;
        padding: 11px 15px !important;
        display: flex !important; flex-direction: row !important; gap: 5px !important; align-items: center !important;
      }
      #nova-ai-panel .nai-typing span {
        width: 6px !important; height: 6px !important; border-radius: 50% !important;
        background: var(--mist, #8b94a3) !important;
        animation: naiDot 1.2s ease-in-out infinite !important;
        display: inline-block !important; flex-shrink: 0 !important;
      }
      #nova-ai-panel .nai-typing span:nth-child(2) { animation-delay: .2s !important; }
      #nova-ai-panel .nai-typing span:nth-child(3) { animation-delay: .4s !important; }
      @keyframes naiDot {
        0%,60%,100% { transform: scale(1); opacity: .5; }
        30% { transform: scale(1.4); opacity: 1; }
      }

      #nova-ai-panel .nai-suggestions {
        padding: 0 14px 8px !important;
        display: flex !important; flex-direction: row !important; flex-wrap: wrap !important;
        gap: 6px !important; flex-shrink: 0 !important;
        width: 100% !important; box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-chip {
        padding: 5px 11px !important; border-radius: 20px !important;
        border: 1.5px solid rgba(0,0,0,.08) !important;
        background: var(--card, #fff) !important;
        font-size: .69rem !important; font-weight: 600 !important;
        color: var(--ink2, #1a1f27) !important; cursor: pointer !important;
        transition: all .15s; white-space: nowrap !important; display: inline-block !important;
      }
      #nova-ai-panel .nai-chip:hover {
        border-color: var(--lime-d, #9ec000) !important;
        background: var(--lime-p, rgba(200,241,53,.1)) !important;
        color: var(--lime-d, #9ec000) !important;
      }

      #nova-ai-panel .nai-input-row {
        display: flex !important; flex-direction: row !important;
        align-items: flex-end !important; gap: 8px !important;
        padding: 10px 14px 14px !important;
        border-top: 1px solid rgba(0,0,0,.06) !important;
        flex-shrink: 0 !important; width: 100% !important; box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-input {
        flex: 1 !important; min-width: 0 !important;
        border: 1.5px solid rgba(0,0,0,.1) !important; border-radius: 12px !important;
        padding: 9px 13px !important; font-size: .78rem !important;
        font-family: inherit !important;
        background: var(--surface, #f4f6fa) !important;
        color: var(--ink, #0d0f12) !important; resize: none !important;
        outline: none !important; line-height: 1.45 !important;
        max-height: 90px !important; overflow-y: auto !important;
        transition: border-color .2s, box-shadow .2s;
        box-sizing: border-box !important; display: block !important;
        writing-mode: horizontal-tb !important;
      }
      #nova-ai-panel .nai-input:focus {
        border-color: var(--lime-d, #9ec000) !important;
        box-shadow: 0 0 0 3px rgba(158,192,0,.14) !important;
        background: var(--card, #fff) !important;
      }
      #nova-ai-panel .nai-send {
        width: 38px !important; height: 38px !important; min-width: 38px !important;
        border-radius: 11px !important; border: none !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        cursor: pointer !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-size: 1rem !important; flex-shrink: 0 !important;
        transition: transform .15s, opacity .15s;
        box-shadow: 0 3px 10px rgba(200,241,53,.3) !important;
      }
      #nova-ai-panel .nai-send:hover:not(:disabled) { transform: scale(1.08) !important; }
      #nova-ai-panel .nai-send:disabled { opacity: .45 !important; cursor: not-allowed !important; }

      /* Active indicator dot on FAB */
      #nova-ai-fab .fab-dot {
        position: absolute !important;
        top: 6px !important; right: 6px !important;
        width: 8px !important; height: 8px !important;
        border-radius: 50% !important;
        background: #22c55e !important;
        border: 2px solid #fff !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build UI ─────────────────────────────────────────────────────────────
  function buildPanel() {
    const fab = document.createElement('button');
    fab.id = 'nova-ai-fab';
    fab.title = 'NOVA AI Assistant';
    fab.innerHTML = `<div class="fab-pulse"></div><div class="fab-dot"></div>✦`;
    fab.addEventListener('click', togglePanel);

    const panel = document.createElement('div');
    panel.id = 'nova-ai-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="nai-header">
        <div class="nai-avatar">✦</div>
        <div class="nai-header-text">
          <div class="nai-title">NOVA AI</div>
          <div class="nai-subtitle">Always ready · No setup needed</div>
        </div>
        <button class="nai-close" id="naiClose" title="Close">✕</button>
      </div>
      <div class="nai-messages" id="naiMessages"></div>
      <div class="nai-suggestions" id="naiSuggestions"></div>
      <div class="nai-input-row">
        <textarea class="nai-input" id="naiInput" placeholder="Ask about any NOVA feature…" rows="1"></textarea>
        <button class="nai-send" id="naiSend" title="Send">➤</button>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    document.getElementById('naiClose').addEventListener('click', closePanel);
    document.getElementById('naiSend').addEventListener('click', handleSend);
    const inp = document.getElementById('naiInput');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 90) + 'px';
    });

    renderSuggestions(INITIAL_SUGGESTIONS);
  }

  const INITIAL_SUGGESTIONS = [
    'How do I bulk export certificates?',
    'How does certSubstitute work?',
    'Open the Mailer for me',
    'How do I add a team member?',
    'What is Data Sync?',
  ];

  function renderSuggestions(chips) {
    const el = document.getElementById('naiSuggestions');
    el.innerHTML = '';
    chips.forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'nai-chip';
      chip.textContent = text;
      chip.addEventListener('click', () => {
        document.getElementById('naiInput').value = text;
        handleSend();
      });
      el.appendChild(chip);
    });
  }

  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  function openPanel() {
    isOpen = true;
    const panel = document.getElementById('nova-ai-panel');
    panel.style.display = 'flex';
    panel.classList.remove('closing');

    // Always show welcome — no key check needed
    if (!_welcomeShown) {
      _welcomeShown = true;
      addBotMessage("Hi! I'm **NOVA AI** — your built-in assistant for NOVA Studio.\n\nAsk me how any function works, get step-by-step guides for any feature, or just say **\"Open [module name]\"** and I'll take you there.\n\nWhat can I help you with?");
    }
    setTimeout(() => document.getElementById('naiInput').focus(), 100);
  }

  function closePanel() {
    isOpen = false;
    const panel = document.getElementById('nova-ai-panel');
    panel.classList.add('closing');
    setTimeout(() => { panel.style.display = 'none'; }, 180);
  }

  // ── Message rendering ────────────────────────────────────────────────────
  function addUserMessage(text) {
    const msgs = document.getElementById('naiMessages');
    const div = document.createElement('div');
    div.className = 'nai-msg user';
    div.textContent = text;
    msgs.appendChild(div);
    scrollBottom();
  }

  function addBotMessage(text) {
    const msgs = document.getElementById('naiMessages');
    const div = document.createElement('div');
    div.className = 'nai-msg bot';
    div.innerHTML = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    msgs.appendChild(div);
    scrollBottom();
    return div;
  }

  function addSystemMsg(text) {
    const msgs = document.getElementById('naiMessages');
    const div = document.createElement('div');
    div.className = 'nai-msg system';
    div.textContent = text;
    msgs.appendChild(div);
    scrollBottom();
  }

  function showTyping() {
    const msgs = document.getElementById('naiMessages');
    const div = document.createElement('div');
    div.className = 'nai-typing';
    div.id = 'naiTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(div);
    scrollBottom();
  }

  function hideTyping() { document.getElementById('naiTyping')?.remove(); }

  function addActionCard(action, description) {
    const msgs = document.getElementById('naiMessages');
    const card = document.createElement('div');
    card.className = 'nai-action-card';
    card.innerHTML = `
      <div class="nai-action-label">⚡ Action Request</div>
      <div>${description}</div>
      <div class="nai-action-btns">
        <button class="nai-btn-confirm" id="naiConfirm">✓ Yes, do it</button>
        <button class="nai-btn-deny" id="naiDeny">✕ No thanks</button>
      </div>
    `;
    msgs.appendChild(card);
    scrollBottom();

    document.getElementById('naiConfirm').addEventListener('click', () => {
      card.remove();
      const result = executeAction(action);
      addSystemMsg(`✓ Done — ${result}`);
      pendingAction = null;
    });
    document.getElementById('naiDeny').addEventListener('click', () => {
      card.remove();
      addSystemMsg('Action cancelled.');
      pendingAction = null;
    });
  }

  function scrollBottom() {
    const msgs = document.getElementById('naiMessages');
    setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 20);
  }

  // ── Send handler ─────────────────────────────────────────────────────────
  async function handleSend() {
    const inp = document.getElementById('naiInput');
    const text = inp.value.trim();
    if (!text || isTyping) return;

    document.getElementById('naiSuggestions').innerHTML = '';
    inp.value = '';
    inp.style.height = 'auto';
    isTyping = true;
    document.getElementById('naiSend').disabled = true;

    addUserMessage(text);
    showTyping();

    try {
      const { text: reply, action } = await callAI(text);
      hideTyping();
      addBotMessage(reply);
      if (action) addActionCard(action, buildActionDescription(action));
    } catch (err) {
      hideTyping();
      addBotMessage(`Hmm, I hit an error: \`${err.message}\`. Please try again.`);
    }

    isTyping = false;
    document.getElementById('naiSend').disabled = false;
    inp.focus();
  }

  function buildActionDescription(action) {
    const descriptions = {
      navigate:     `Navigate to the **${action.params?.view}** view`,
      showToast:    `Show a notification: "${action.params?.message}"`,
      openSettings: `Open **Settings → ${action.params?.tab}** tab`,
      launchTool:   `Launch the **${action.params?.tool}** tool`,
      clickElement: `Click element **${action.params?.id || action.params?.selector}**`,
      fillInput:    `Fill input **${action.params?.id || action.params?.selector}** with a value`,
      callFunction: `Call function **${action.params?.fn}()**`,
    };
    return descriptions[action.type] || `Perform action: ${action.type}`;
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildPanel();
    // Expose reset hook (kept for compatibility)
    window._novaAiWelcomeReset = function() { _welcomeShown = false; };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
