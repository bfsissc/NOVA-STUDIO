// =====================================================
// NOVA AI Assistant — Codebase-aware AI bot
// Drop this file in assets/js/ and add one <script> tag
// to index.html just before </body>
// =====================================================

(function () {
  'use strict';

  // ── Codebase knowledge map ──────────────────────────────────────────────
  // Gives the AI structured context about every module in NOVA Studio
  const NOVA_KNOWLEDGE = `
You are NOVA AI, an intelligent assistant embedded inside NOVA Studio — a web-based creative workspace for BFSI (Banking, Financial Services & Insurance) training and certification teams.

NOVA Studio is built with vanilla HTML/CSS/JS, Firebase/Firestore for auth and real-time data, and is hosted on Netlify.

== MODULES & KEY FUNCTIONS ==

1. CERTIFICATE MAKER (view: 'cert')
   - certDraw(overrideData) — renders certificate preview on canvas
   - certRenderFull(overrideData) — full render for export/download
   - certSubstitute(text, data) — replaces {{placeholders}} in text
   - certLoadBg(inp) / certBgDrop(e) — load background image
   - certRemoveBg() — remove background
   - certSetBgFit(fit) — 'fill'|'fit'|'center' bg fit mode
   - certSetOpacity(v) — bg image opacity 0–1
   - certSetBgColor(v) — solid background color
   - certLoadLogo(inp) / certLogoDrop(e) — load logo image
   - certRemoveLogo() — remove logo
   - certUpdateLogo() — refresh logo position/size after param change
   - certAddText() — add a new text element to certificate
   - certDeleteEl(id) — delete element by id
   - certSelectEl(id) — select/highlight element
   - certRenderElList() — refresh the elements sidebar
   - certShowElProps(el) — show properties panel for element
   - certResizeCanvas() / certUpdateCanvasSize() — resize canvas
   - certPreset(w,h) — apply preset size (A4, Letter, etc.)
   - certFitZoom() — auto-fit canvas to viewport
   - certDrawSelHandle() — render selection handles
   - certExportSingle() — download single certificate as PNG
   - certExportAll() — bulk export all from CSV
   - certBulkLoad(inp) — load CSV for bulk generation
   - How to use: Go to Certificate Maker → Upload background image → Add text elements with {{Name}}, {{Course}} placeholders → Upload CSV with matching column headers → Export All.

2. CERTIFICATE MAILER (view: 'mailer')
   - mlInitCanvas() — initialize mailer preview canvas
   - mlSendAll() — send certificates to all recipients via Brevo API
   - mlLoadCsv(inp) — load recipient CSV
   - mlRenderQueue() — render recipient queue
   - mlSendOne(idx) — send to single recipient
   - Requires Brevo API key saved in Settings → Integrations.
   - How to use: Load same CSV as certificate maker → Configure Brevo API key → Preview email template → Send All.

3. COLLEGE PORTAL (view: 'portal')
   - cpInit() — initialise portal manager
   - cpCreate() / cpDelete(id) — create/delete a portal
   - cpCopyLink(id) — copy shareable link
   - Portals are Google-Sheets-backed, sharing data with specific colleges.

4. DATA SYNC (view: 'sync')
   - syncOnViewOpen() — init/refresh sync view
   - Real-time collaborative spreadsheet powered by Firestore.
   - Supports multi-sheet tabs, drag-drop import, column schemas, presence tracking.
   - syncCreateRoom() / syncJoinRoom() — manage sync rooms
   - syncPushRow() — push a row to shared workbook

5. TEAMS (view: 'teams')
   - TM.init() — initialise team module
   - TM.openView() — open teams panel
   - TM.inviteMember(email, role) — invite a team member
   - TM.removeMember(email) — remove member
   - Roles: admin, editor, viewer

6. FOLLOWUP TRACKER (view: 'followup')
   - FU.init() / FU.openView() — init tracker
   - Tracks college-level data collection progress with status columns.

7. TRAINING PARTNERS (view: 'tp')
   - tpInit() — load training partners
   - tpRenderHomeWidget() — show TP widget on dashboard
   - tpApply(id) / tpWithdraw(id) — apply or withdraw from TP

8. IMAGE RESIZER (view: 'imgcomp')
   - Bulk image compression and resize. Supports quality slider and size targets.
   - icRefreshUI() / icRenderCards() / icZipAndDownload() — core functions

9. IMAGE EDITOR (view: 'imgedit')
   - Canvas-based editor with crop, filters, overlays.
   - ieLoadToCanvas(id) / ieCropApply() / ieRender()

10. FILE CONVERTER (view: 'fileconv')
    - fcDoConvert(file, group, fmt) — convert file between formats
    - Supports PDF, DOCX, images. fcRenderList() shows queued files.

11. DRAFT PROPOSALS (view: 'drafts')
    - dpInit() — init draft manager
    - dpFilterRender() — filter/render draft list
    - dpDeleteActive() — delete selected draft
    - _draftSaveOne(draft) / _draftDeleteOne(id) — Firestore CRUD

12. ANALYTICS (view: 'analytics')
    - caBootstrap() — bootstrap analytics view
    - caRenderPanel1/2/3/4() — render four data panels
    - caLoadSample() — load sample data for testing

13. PROJECTS (view: 'projects')
    - projRender() — render project cards
    - projCreate() / projDelete(id) — manage projects

14. SETTINGS (view: 'settings')
    - stgTab(tab) — switch settings tab ('appearance','workspace','notifications','privacy','data','dataupload','integrations')
    - stgGetSettings() / stgApplyUI() — get/apply settings
    - Key integrations: Brevo API key (mailer), Google Drive token

15. NAVIGATION & AUTH
    - goView(v) — navigate to a view. Values: 'home','cert','mailer','portal','sync','teams','followup','tp','imgcomp','fileconv','imgedit','drafts','analytics','projects','profile','settings','help'
    - launchTool('cert'|'mailer') — open a tool with stats tracking
    - boot(anim) — boot the app after auth
    - doLogin() / doLogout() / doSignup() — auth functions
    - triggerGoogleLogin() — initiate Google OAuth
    - U — the current logged-in user object {firstName, lastName, email, role, stats, ...}

16. NOTIFICATIONS
    - NV.init() — init notification system
    - showToast(msg, type) — show a toast. type: 'ok'|'err'|'info'

17. DRIVE INTEGRATION
    - NOVA_DRIVE_TOKEN — current Google Drive OAuth token
    - _driveRestoreFolderOnLoad(email, token) — restore Drive folder
    - drive-manager.js handles all Drive REST API calls

18. FIREBASE
    - fbAuth — Firebase Auth instance
    - fbDb — Firestore instance
    - fbStorage — Firebase Storage instance
    - Config in assets/js/config.js

== PERMISSION-BASED ACTIONS ==
When a user asks you to perform an action (navigate, click, fill a field, etc.), you MUST:
1. Describe what you will do.
2. Ask for explicit permission: "May I do this for you?"
3. Only execute after the user confirms with yes/ok/sure/go ahead.
4. After execution, confirm what was done.

== YOUR PERSONALITY ==
- You are concise, helpful, and slightly playful.
- You know the NOVA Studio codebase deeply.
- You can explain how any function works, what parameters it takes, and what it does.
- You can navigate the app, switch views, trigger functions, fill inputs, and guide the user step-by-step.
- Always be honest if something is outside your ability.
`;

  // ── Conversation history ─────────────────────────────────────────────────
  let chatHistory = [];
  let isOpen = false;
  let isTyping = false;
  let pendingAction = null;

  // ── Action executor ──────────────────────────────────────────────────────
  // Maps action keys from AI response to real JS calls
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
      if (el) {
        el.click();
        return `Clicked element: ${params.id || params.selector}`;
      }
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
        // Only allow whitelisted function names for safety
        const ALLOWED = ['certAddText','certExportSingle','certResizeCanvas','certRenderFull',
          'certRemoveBg','certRemoveLogo','mlRenderQueue','syncOnViewOpen','tpInit',
          'projRender','dpInit','dpFilterRender','caBootstrap','stgApplyUI','updateStats',
          'updateGreeting','favRenderSidebar','NV.init','TM.openView','FU.openView'];
        if (!ALLOWED.includes(params.fn)) return `Function "${params.fn}" is not in the allowed list for safety.`;
        // Handle namespaced like TM.openView
        const parts = params.fn.split('.');
        let fn = window;
        for (const p of parts) fn = fn?.[p];
        if (typeof fn === 'function') {
          const result = fn(...(params.args || []));
          return `Called ${params.fn}() successfully.`;
        }
        return `Function ${params.fn} not found on window.`;
      } catch (e) {
        return `Error calling ${params.fn}: ${e.message}`;
      }
    }
  };

  // ── Execute action from AI ───────────────────────────────────────────────
  function executeAction(action) {
    const handler = ACTIONS[action.type];
    if (!handler) return `Unknown action type: ${action.type}`;
    return handler(action.params || {});
  }

  // ── Call Claude API ──────────────────────────────────────────────────────
  async function callAI(userMessage) {
    chatHistory.push({ role: 'user', content: userMessage });

    // Build messages with system context injected as first user turn
    const messages = chatHistory.length === 1
      ? [
          { role: 'user', content: `${NOVA_KNOWLEDGE}\n\n---\n\nUser: ${userMessage}` }
        ]
      : chatHistory;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: NOVA_KNOWLEDGE,
        messages: chatHistory
      })
    });

    const data = await response.json();
    const rawText = data.content?.map(b => b.text || '').join('') || 'Sorry, I could not get a response.';

    // Parse optional ACTION block from AI response
    let displayText = rawText;
    let parsedAction = null;

    const actionMatch = rawText.match(/```action\n([\s\S]*?)\n```/);
    if (actionMatch) {
      try {
        parsedAction = JSON.parse(actionMatch[1]);
        displayText = rawText.replace(/```action\n[\s\S]*?\n```/, '').trim();
      } catch (e) { /* ignore parse error */ }
    }

    chatHistory.push({ role: 'assistant', content: rawText });
    return { text: displayText, action: parsedAction };
  }

  // ── Build UI ─────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* NOVA AI Bot */
      #nova-ai-fab {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 99999;
        width: 54px;
        height: 54px;
        border-radius: 18px;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        border: none;
        cursor: pointer;
        box-shadow: 0 6px 24px rgba(0,0,0,.18), 0 2px 8px rgba(200,241,53,.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
        transition: transform .2s, box-shadow .2s;
        outline: none;
      }
      #nova-ai-fab:hover {
        transform: scale(1.08) translateY(-2px);
        box-shadow: 0 10px 32px rgba(0,0,0,.22), 0 3px 12px rgba(200,241,53,.4);
      }
      #nova-ai-fab .fab-pulse {
        position: absolute;
        inset: -4px;
        border-radius: 22px;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        opacity: 0;
        animation: naiPulse 2.4s ease-in-out infinite;
        z-index: -1;
      }
      @keyframes naiPulse {
        0%,100% { opacity: 0; transform: scale(1); }
        50% { opacity: .18; transform: scale(1.15); }
      }
      #nova-ai-panel {
        position: fixed;
        bottom: 94px;
        right: 28px;
        z-index: 99998;
        width: 370px;
        max-width: calc(100vw - 40px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: var(--card, #fff);
        border: 1.5px solid rgba(0,0,0,.07);
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,.16), 0 4px 16px rgba(0,0,0,.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform-origin: bottom right;
        animation: naiSlideIn .25s cubic-bezier(.34,1.56,.64,1) both;
        writing-mode: horizontal-tb;
        direction: ltr;
        text-orientation: mixed;
      }
      @keyframes naiSlideIn {
        from { opacity: 0; transform: scale(.88) translateY(16px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #nova-ai-panel.closing {
        animation: naiSlideOut .18s ease-in both;
      }
      @keyframes naiSlideOut {
        to { opacity: 0; transform: scale(.9) translateY(12px); }
      }
      .nai-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(0,0,0,.06);
        flex-shrink: 0;
        background: linear-gradient(135deg, rgba(200,241,53,.08), rgba(15,217,180,.06));
      }
      .nai-avatar {
        width: 34px;
        height: 34px;
        border-radius: 11px;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: .95rem;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(200,241,53,.3);
      }
      .nai-header-text { flex: 1; }
      .nai-title {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: .82rem;
        font-weight: 800;
        color: var(--ink, #0d0f12);
        letter-spacing: -.01em;
      }
      .nai-subtitle {
        font-size: .67rem;
        color: var(--mist, #8b94a3);
        margin-top: 1px;
      }
      .nai-close {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: none;
        background: rgba(0,0,0,.05);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: .85rem;
        color: var(--mist, #8b94a3);
        transition: background .15s, color .15s;
      }
      .nai-close:hover { background: rgba(0,0,0,.1); color: var(--ink, #0d0f12); }
      .nai-messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 14px 14px 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        scroll-behavior: smooth;
        width: 100%;
        box-sizing: border-box;
      }
      .nai-messages::-webkit-scrollbar { width: 4px; }
      .nai-messages::-webkit-scrollbar-track { background: transparent; }
      .nai-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,.1); border-radius: 4px; }
      .nai-msg {
        max-width: 88%;
        min-width: 0;
        width: auto;
        line-height: 1.5;
        font-size: .78rem;
        border-radius: 14px;
        padding: 9px 13px;
        word-break: break-word;
        overflow-wrap: break-word;
        white-space: normal;
        writing-mode: horizontal-tb;
        box-sizing: border-box;
        animation: naiMsgIn .2s ease both;
      }
      @keyframes naiMsgIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .nai-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--lime-d, #9ec000));
        color: var(--ink, #0d0f12);
        font-weight: 500;
        border-bottom-right-radius: 4px;
      }
      .nai-msg.bot {
        align-self: flex-start;
        background: var(--surface, #f4f6fa);
        color: var(--ink, #0d0f12);
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(0,0,0,.05);
      }
      .nai-msg.bot code {
        background: rgba(0,0,0,.07);
        padding: 1px 5px;
        border-radius: 4px;
        font-family: 'DM Mono', monospace;
        font-size: .72rem;
      }
      .nai-msg.bot strong { font-weight: 700; }
      .nai-msg.system {
        align-self: center;
        background: transparent;
        color: var(--mist, #8b94a3);
        font-size: .68rem;
        padding: 2px 8px;
        max-width: 100%;
        text-align: center;
      }
      .nai-action-card {
        align-self: flex-start;
        background: var(--lime-p, rgba(200,241,53,.1));
        border: 1.5px solid rgba(158,192,0,.25);
        border-radius: 12px;
        padding: 10px 13px;
        max-width: 88%;
        font-size: .75rem;
        color: var(--ink, #0d0f12);
        animation: naiMsgIn .2s ease both;
      }
      .nai-action-card .nai-action-label {
        font-weight: 700;
        font-size: .7rem;
        color: var(--lime-d, #9ec000);
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .nai-action-btns {
        display: flex;
        gap: 7px;
        margin-top: 9px;
      }
      .nai-action-btns button {
        padding: 5px 12px;
        border-radius: 7px;
        border: 1.5px solid;
        font-size: .7rem;
        font-weight: 700;
        cursor: pointer;
        transition: all .15s;
      }
      .nai-btn-confirm {
        background: var(--lime, #c8f135);
        border-color: var(--lime-d, #9ec000) !important;
        color: var(--ink, #0d0f12);
      }
      .nai-btn-confirm:hover { transform: scale(1.03); }
      .nai-btn-deny {
        background: transparent;
        border-color: rgba(0,0,0,.12) !important;
        color: var(--mist, #8b94a3);
      }
      .nai-btn-deny:hover { border-color: rgba(0,0,0,.25) !important; color: var(--ink, #0d0f12); }
      .nai-typing {
        align-self: flex-start;
        background: var(--surface, #f4f6fa);
        border: 1px solid rgba(0,0,0,.05);
        border-radius: 14px;
        border-bottom-left-radius: 4px;
        padding: 11px 15px;
        display: flex;
        gap: 5px;
        align-items: center;
      }
      .nai-typing span {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--mist, #8b94a3);
        animation: naiDot 1.2s ease-in-out infinite;
      }
      .nai-typing span:nth-child(2) { animation-delay: .2s; }
      .nai-typing span:nth-child(3) { animation-delay: .4s; }
      @keyframes naiDot {
        0%,60%,100% { transform: scale(1); opacity: .5; }
        30% { transform: scale(1.4); opacity: 1; }
      }
      .nai-suggestions {
        padding: 0 14px 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
      }
      .nai-chip {
        padding: 5px 11px;
        border-radius: 20px;
        border: 1.5px solid rgba(0,0,0,.08);
        background: var(--card, #fff);
        font-size: .69rem;
        font-weight: 600;
        color: var(--ink2, #1a1f27);
        cursor: pointer;
        transition: all .15s;
        white-space: nowrap;
      }
      .nai-chip:hover {
        border-color: var(--lime-d, #9ec000);
        background: var(--lime-p, rgba(200,241,53,.1));
        color: var(--lime-d, #9ec000);
      }
      .nai-input-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 10px 14px 14px;
        border-top: 1px solid rgba(0,0,0,.06);
        flex-shrink: 0;
      }
      .nai-input {
        flex: 1;
        border: 1.5px solid rgba(0,0,0,.1);
        border-radius: 12px;
        padding: 9px 13px;
        font-size: .78rem;
        font-family: inherit;
        background: var(--surface, #f4f6fa);
        color: var(--ink, #0d0f12);
        resize: none;
        outline: none;
        line-height: 1.45;
        max-height: 90px;
        overflow-y: auto;
        transition: border-color .2s, box-shadow .2s;
      }
      .nai-input:focus {
        border-color: var(--lime-d, #9ec000);
        box-shadow: 0 0 0 3px rgba(158,192,0,.14);
        background: var(--card, #fff);
      }
      .nai-send {
        width: 38px;
        height: 38px;
        border-radius: 11px;
        border: none;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        flex-shrink: 0;
        transition: transform .15s, opacity .15s;
        box-shadow: 0 3px 10px rgba(200,241,53,.3);
      }
      .nai-send:hover:not(:disabled) { transform: scale(1.08); }
      .nai-send:disabled { opacity: .45; cursor: not-allowed; transform: none; }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    // FAB button
    const fab = document.createElement('button');
    fab.id = 'nova-ai-fab';
    fab.title = 'NOVA AI Assistant';
    fab.innerHTML = `<div class="fab-pulse"></div>✦`;
    fab.addEventListener('click', togglePanel);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'nova-ai-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="nai-header">
        <div class="nai-avatar">✦</div>
        <div class="nai-header-text">
          <div class="nai-title">NOVA AI</div>
          <div class="nai-subtitle">Codebase-aware assistant</div>
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

    // Events
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

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    isOpen = true;
    const panel = document.getElementById('nova-ai-panel');
    panel.style.display = 'flex';
    panel.classList.remove('closing');
    if (chatHistory.length === 0) {
      addBotMessage("Hi! I'm **NOVA AI** — I know the entire NOVA Studio codebase.\n\nAsk me how any function works, get step-by-step guidance, or let me perform actions for you (with your permission). What can I help you with?");
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
    // Simple markdown: **bold**, `code`, newlines
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

  function hideTyping() {
    document.getElementById('naiTyping')?.remove();
  }

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

    // Clear suggestions after first real message
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

      if (action) {
        // AI wants to perform an action — ask permission
        const desc = buildActionDescription(action);
        addActionCard(action, desc);
      }
    } catch (err) {
      hideTyping();
      addBotMessage(`Hmm, I hit an error: \`${err.message}\`. Check your network connection.`);
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
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
