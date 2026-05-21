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
  let _welcomeShown = false;

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
    // Add user message to history
    chatHistory.push({ role: 'user', content: userMessage });

    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Nova AI is not integrated. Please contact your administrator.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: NOVA_KNOWLEDGE,
        messages: chatHistory
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

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

    // Add assistant reply to history
    chatHistory.push({ role: 'assistant', content: rawText });
    return { text: displayText, action: parsedAction };
  }

  // ── Build UI ─────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── NOVA AI Bot — full isolation reset ── */

      /* FAB button */
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

      /* Panel — hard reset ALL inherited properties */
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

      /* Header */
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
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
        border-radius: 11px !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: .95rem !important;
        flex-shrink: 0 !important;
        box-shadow: 0 2px 8px rgba(200,241,53,.3) !important;
      }
      #nova-ai-panel .nai-header-text {
        flex: 1 !important;
        min-width: 0 !important;
        overflow: hidden !important;
      }
      #nova-ai-panel .nai-title {
        font-size: .82rem !important;
        font-weight: 800 !important;
        color: var(--ink, #0d0f12) !important;
        display: block !important;
        white-space: nowrap !important;
      }
      #nova-ai-panel .nai-subtitle {
        font-size: .67rem !important;
        color: var(--mist, #8b94a3) !important;
        margin-top: 1px !important;
        display: block !important;
        white-space: nowrap !important;
      }
      #nova-ai-panel .nai-close {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        border-radius: 8px !important;
        border: none !important;
        background: rgba(0,0,0,.05) !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: .85rem !important;
        color: var(--mist, #8b94a3) !important;
        transition: background .15s, color .15s;
        flex-shrink: 0 !important;
      }
      #nova-ai-panel .nai-close:hover {
        background: rgba(0,0,0,.1) !important;
        color: var(--ink, #0d0f12) !important;
      }

      /* Messages area */
      #nova-ai-panel .nai-messages {
        flex: 1 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding: 14px 14px 8px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 10px !important;
        scroll-behavior: smooth !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-messages::-webkit-scrollbar { width: 4px !important; }
      #nova-ai-panel .nai-messages::-webkit-scrollbar-track { background: transparent !important; }
      #nova-ai-panel .nai-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,.1) !important; border-radius: 4px !important; }

      /* Message bubbles */
      #nova-ai-panel .nai-msg {
        max-width: 88% !important;
        min-width: 40px !important;
        width: auto !important;
        line-height: 1.55 !important;
        font-size: .78rem !important;
        border-radius: 14px !important;
        padding: 9px 13px !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
        white-space: pre-wrap !important;
        box-sizing: border-box !important;
        display: block !important;
        animation: naiMsgIn .2s ease both !important;
      }
      @keyframes naiMsgIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #nova-ai-panel .nai-msg.user {
        align-self: flex-end !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--lime-d, #9ec000)) !important;
        color: var(--ink, #0d0f12) !important;
        font-weight: 500 !important;
        border-bottom-right-radius: 4px !important;
      }
      #nova-ai-panel .nai-msg.bot {
        align-self: flex-start !important;
        background: var(--surface, #f4f6fa) !important;
        color: var(--ink, #0d0f12) !important;
        border-bottom-left-radius: 4px !important;
        border: 1px solid rgba(0,0,0,.05) !important;
      }
      #nova-ai-panel .nai-msg.bot code {
        background: rgba(0,0,0,.07) !important;
        padding: 1px 5px !important;
        border-radius: 4px !important;
        font-family: 'DM Mono', monospace !important;
        font-size: .72rem !important;
        white-space: pre-wrap !important;
      }
      #nova-ai-panel .nai-msg.bot strong { font-weight: 700 !important; }
      #nova-ai-panel .nai-msg.system {
        align-self: center !important;
        background: transparent !important;
        color: var(--mist, #8b94a3) !important;
        font-size: .68rem !important;
        padding: 2px 8px !important;
        max-width: 100% !important;
        text-align: center !important;
      }

      /* Action card */
      #nova-ai-panel .nai-action-card {
        align-self: flex-start !important;
        background: var(--lime-p, rgba(200,241,53,.1)) !important;
        border: 1.5px solid rgba(158,192,0,.25) !important;
        border-radius: 12px !important;
        padding: 10px 13px !important;
        max-width: 88% !important;
        font-size: .75rem !important;
        color: var(--ink, #0d0f12) !important;
        box-sizing: border-box !important;
        display: block !important;
        animation: naiMsgIn .2s ease both !important;
      }
      #nova-ai-panel .nai-action-card .nai-action-label {
        font-weight: 700 !important;
        font-size: .7rem !important;
        color: var(--lime-d, #9ec000) !important;
        margin-bottom: 5px !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 5px !important;
      }
      #nova-ai-panel .nai-action-btns {
        display: flex !important;
        flex-direction: row !important;
        gap: 7px !important;
        margin-top: 9px !important;
      }
      #nova-ai-panel .nai-action-btns button {
        padding: 5px 12px !important;
        border-radius: 7px !important;
        border: 1.5px solid !important;
        font-size: .7rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all .15s;
      }
      #nova-ai-panel .nai-btn-confirm {
        background: var(--lime, #c8f135) !important;
        border-color: var(--lime-d, #9ec000) !important;
        color: var(--ink, #0d0f12) !important;
      }
      #nova-ai-panel .nai-btn-confirm:hover { transform: scale(1.03) !important; }
      #nova-ai-panel .nai-btn-deny {
        background: transparent !important;
        border-color: rgba(0,0,0,.12) !important;
        color: var(--mist, #8b94a3) !important;
      }
      #nova-ai-panel .nai-btn-deny:hover {
        border-color: rgba(0,0,0,.25) !important;
        color: var(--ink, #0d0f12) !important;
      }

      /* Typing indicator */
      #nova-ai-panel .nai-typing {
        align-self: flex-start !important;
        background: var(--surface, #f4f6fa) !important;
        border: 1px solid rgba(0,0,0,.05) !important;
        border-radius: 14px !important;
        border-bottom-left-radius: 4px !important;
        padding: 11px 15px !important;
        display: flex !important;
        flex-direction: row !important;
        gap: 5px !important;
        align-items: center !important;
      }
      #nova-ai-panel .nai-typing span {
        width: 6px !important;
        height: 6px !important;
        border-radius: 50% !important;
        background: var(--mist, #8b94a3) !important;
        animation: naiDot 1.2s ease-in-out infinite !important;
        display: inline-block !important;
        flex-shrink: 0 !important;
      }
      #nova-ai-panel .nai-typing span:nth-child(2) { animation-delay: .2s !important; }
      #nova-ai-panel .nai-typing span:nth-child(3) { animation-delay: .4s !important; }
      @keyframes naiDot {
        0%,60%,100% { transform: scale(1); opacity: .5; }
        30% { transform: scale(1.4); opacity: 1; }
      }

      /* Suggestion chips */
      #nova-ai-panel .nai-suggestions {
        padding: 0 14px 8px !important;
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        flex-shrink: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-chip {
        padding: 5px 11px !important;
        border-radius: 20px !important;
        border: 1.5px solid rgba(0,0,0,.08) !important;
        background: var(--card, #fff) !important;
        font-size: .69rem !important;
        font-weight: 600 !important;
        color: var(--ink2, #1a1f27) !important;
        cursor: pointer !important;
        transition: all .15s;
        white-space: nowrap !important;
        display: inline-block !important;
      }
      #nova-ai-panel .nai-chip:hover {
        border-color: var(--lime-d, #9ec000) !important;
        background: var(--lime-p, rgba(200,241,53,.1)) !important;
        color: var(--lime-d, #9ec000) !important;
      }

      /* Input row */
      #nova-ai-panel .nai-input-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: flex-end !important;
        gap: 8px !important;
        padding: 10px 14px 14px !important;
        border-top: 1px solid rgba(0,0,0,.06) !important;
        flex-shrink: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-input {
        flex: 1 !important;
        min-width: 0 !important;
        border: 1.5px solid rgba(0,0,0,.1) !important;
        border-radius: 12px !important;
        padding: 9px 13px !important;
        font-size: .78rem !important;
        font-family: inherit !important;
        background: var(--surface, #f4f6fa) !important;
        color: var(--ink, #0d0f12) !important;
        resize: none !important;
        outline: none !important;
        line-height: 1.45 !important;
        max-height: 90px !important;
        overflow-y: auto !important;
        transition: border-color .2s, box-shadow .2s;
        box-sizing: border-box !important;
        display: block !important;
        writing-mode: horizontal-tb !important;
      }
      #nova-ai-panel .nai-input:focus {
        border-color: var(--lime-d, #9ec000) !important;
        box-shadow: 0 0 0 3px rgba(158,192,0,.14) !important;
        background: var(--card, #fff) !important;
      }
      #nova-ai-panel .nai-send {
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        border-radius: 11px !important;
        border: none !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 1rem !important;
        flex-shrink: 0 !important;
        transition: transform .15s, opacity .15s;
        box-shadow: 0 3px 10px rgba(200,241,53,.3) !important;
      }
      #nova-ai-panel .nai-send:hover:not(:disabled) { transform: scale(1.08) !important; }
      #nova-ai-panel .nai-send:disabled { opacity: .45 !important; cursor: not-allowed !important; }

      /* API key setup screen */
      #nova-ai-panel .nai-setup {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px 20px !important;
        gap: 12px !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-setup-icon {
        font-size: 2rem !important;
        line-height: 1 !important;
        margin-bottom: 4px !important;
      }
      #nova-ai-panel .nai-setup-title {
        font-size: .88rem !important;
        font-weight: 800 !important;
        color: var(--ink, #0d0f12) !important;
        margin: 0 !important;
      }
      #nova-ai-panel .nai-setup-sub {
        font-size: .72rem !important;
        color: var(--mist, #8b94a3) !important;
        line-height: 1.5 !important;
        max-width: 260px !important;
        margin: 0 !important;
      }
      #nova-ai-panel .nai-setup-sub a {
        color: var(--lime-d, #9ec000) !important;
        font-weight: 700 !important;
        text-decoration: none !important;
      }
      #nova-ai-panel .nai-key-input {
        width: 100% !important;
        border: 1.5px solid rgba(0,0,0,.12) !important;
        border-radius: 10px !important;
        padding: 10px 13px !important;
        font-size: .75rem !important;
        font-family: 'DM Mono', monospace !important;
        background: var(--surface, #f4f6fa) !important;
        color: var(--ink, #0d0f12) !important;
        outline: none !important;
        box-sizing: border-box !important;
        writing-mode: horizontal-tb !important;
      }
      #nova-ai-panel .nai-key-input:focus {
        border-color: var(--lime-d, #9ec000) !important;
        box-shadow: 0 0 0 3px rgba(158,192,0,.14) !important;
      }
      #nova-ai-panel .nai-key-btn {
        width: 100% !important;
        padding: 10px !important;
        border-radius: 10px !important;
        border: none !important;
        background: linear-gradient(135deg, var(--lime, #c8f135), var(--teal, #0fd9b4)) !important;
        color: var(--ink, #0d0f12) !important;
        font-size: .78rem !important;
        font-weight: 800 !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-key-error {
        font-size: .68rem !important;
        color: #dc2626 !important;
        display: none !important;
      }
      #nova-ai-panel .nai-key-note {
        font-size: .65rem !important;
        color: var(--mist, #8b94a3) !important;
        line-height: 1.5 !important;
        padding: 8px 10px !important;
        background: var(--surface, #f4f6fa) !important;
        border-radius: 8px !important;
        text-align: left !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      #nova-ai-panel .nai-clear-key {
        font-size: .65rem !important;
        color: var(--mist, #8b94a3) !important;
        background: none !important;
        border: none !important;
        cursor: pointer !important;
        text-decoration: underline !important;
        padding: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  const NOVA_AI_KEY_STORE = 'nova_ai_api_key';

  function getApiKey() {
    return localStorage.getItem(NOVA_AI_KEY_STORE) || '';
  }

  function saveApiKey(key) {
    localStorage.setItem(NOVA_AI_KEY_STORE, key.trim());
  }

  function clearApiKey() {
    localStorage.removeItem(NOVA_AI_KEY_STORE);
  }

  function showSetupScreen() {
    const msgs = document.getElementById('naiMessages');
    const sugg = document.getElementById('naiSuggestions');
    const inputRow = document.querySelector('#nova-ai-panel .nai-input-row');

    msgs.style.display = 'none';
    sugg.style.display = 'none';
    inputRow.style.display = 'none';

    // Remove any existing setup screen
    document.getElementById('naiSetup')?.remove();

    const setup = document.createElement('div');
    setup.className = 'nai-setup';
    setup.id = 'naiSetup';
    setup.innerHTML = `
      <div class="nai-setup-icon">✦</div>
      <div class="nai-setup-title">Nova AI Not Integrated</div>
      <p class="nai-setup-sub">
        Nova AI has not been set up yet.<br>
        Please contact your administrator to get access.
      </p>
      <div class="nai-key-note">⚙️ Admins can enable Nova AI via <strong>Settings → Integrations</strong>.</div>
    `;

    // Insert before input row
    const panel = document.getElementById('nova-ai-panel');
    panel.insertBefore(setup, inputRow);
  }

  function hideSetupScreen() {
    document.getElementById('naiSetup')?.remove();
    const msgs = document.getElementById('naiMessages');
    const sugg = document.getElementById('naiSuggestions');
    const inputRow = document.querySelector('#nova-ai-panel .nai-input-row');
    msgs.style.display = '';
    sugg.style.display = '';
    inputRow.style.display = '';

    // Show welcome now that key is set
    if (!_welcomeShown) {
      _welcomeShown = true;
      addBotMessage("Hi! I'm **NOVA AI** — I know the entire NOVA Studio codebase.\n\nAsk me how any function works, get step-by-step guidance, or let me perform actions for you (with your permission). What can I help you with?");
    }
    setTimeout(() => document.getElementById('naiInput').focus(), 100);
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

    // Make input-row relative for the key button
    document.querySelector('#nova-ai-panel .nai-input-row').style.position = 'relative';

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

    if (!getApiKey()) {
      // No key yet — show setup screen
      showSetupScreen();
      return;
    }

    // Key exists — ensure setup screen is gone and show welcome once
    document.getElementById('naiSetup')?.remove();
    if (!_welcomeShown) {
      _welcomeShown = true;
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
    // Expose a reset hook for the settings page
    window._novaAiWelcomeReset = function() { _welcomeShown = false; };
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
