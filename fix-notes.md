# NOVA Studio — Setup & Fix Notes

===========================================
  STEP 1 — RUN A LOCAL SERVER (REQUIRED)
===========================================

DO NOT open index.html directly by double-clicking it.
Firebase, Google Login, and Drive API do NOT work from file:// URLs.

How to run the server:
  - Double-click START_SERVER.bat
  - Then open http://localhost:8080 in your browser

If START_SERVER.bat doesn't work, open Command Prompt in this folder and run:
  python -m http.server 8080


===========================================
  STEP 2 — FIREBASE CONSOLE (one-time)
===========================================

A) Add localhost to Authorized Domains:
   Firebase Console -> Authentication -> Settings -> Authorized domains
   Click "Add domain" -> type: localhost
   (This allows Google login to work on your local server)

B) Update Firestore Rules:
   Firebase Console -> Firestore Database -> Rules
   Replace ALL content with the text inside firestore.rules
   Click Publish

C) Set Storage Rules:
   Firebase Console -> Storage -> Rules
   Replace ALL content with the text inside storage.rules
   Click Publish


===========================================
  STEP 3 — GOOGLE CLOUD CONSOLE (one-time)
===========================================

Enable Google Drive API:
  1. Go to console.cloud.google.com
  2. Select the same project as your Firebase app (nova-studio-494013)
  3. APIs & Services -> Enable APIs & Services
  4. Search "Google Drive API" -> Click it -> Click Enable

That's it. No API key needed — Firebase handles auth automatically.


===========================================
  WHAT CHANGED IN THIS BUILD
===========================================

1. SYNTAX ERROR FIXED — teams.js line 968 (corrupted string)

2. AUTO GOOGLE DRIVE SETUP:
   - User clicks "Continue with Google"
   - App silently creates "NOVA Backend" folder in their Drive
   - All uploads go there automatically — no Apps Script, no manual setup

3. TEAM FILES — all members can preview & download directly
   - No need to open Google Drive separately

4. "Could not save profile" error — FIXED
   - Updated Firestore rules (firestore.rules included)

5. START_SERVER.bat — now works with Python or Node.js automatically
