# NOVA STUDIO — Fix Notes (v4 → v4-fixed-final)

## What was fixed

### Bug 1: Drive URL template load failing (seen in screenshot)
"Could not load from Drive URL. Use the Upload from Device button instead"

Root cause: The original code tried only 3 URL patterns for Google Drive. Google
has tightened CORS restrictions, so all 3 were failing.

Fix (college-portal-admin.js → cpFetchTemplateFromUrl):
- Now tries 16+ URL combinations (4 Drive endpoints × 4 CORS proxies)
- Added 8-second timeout per attempt so slow proxies dont hang the UI
- Proxies used: corsproxy.io, allorigins.win, thingproxy.freeboard.io, cors-anywhere
- Better error message tells user exactly what failed and why

### Bug 2: Student certificate download failing (canvas tainted)
Students could see the preview but clicking Download did nothing / errored.

Root cause: Firebase Storage URLs cause canvas tainting in fresh browsers.
canvas.toDataURL() throws a security error on a tainted canvas.

Fixes:
- college-portal.html loadTemplateImage() rewritten: fetches image as Blob,
  converts to base64 via FileReader, draws base64 on canvas. Canvas never tainted.
- college-portal-admin.js: on file upload, base64 is stored in CP.templateUrl
  BEFORE the Firebase Storage upload. Base64 (not Storage URL) is saved to Firestore.
- If base64 is over 900KB, falls back to Storage URL with blob-fetch + proxy chain.

### Bug 3: Google Sheets student data not loading
Same proxy exhaustion issue as Bug 1.

Fix (college-portal-admin.js → cpFetchCsvFromUrl):
- Now tries 3 Sheet endpoints × 3 proxies = 9+ attempts with timeouts
- Clearer error message with checklist

## One-time Firebase Storage CORS setup

Run once in Google Cloud Shell:
  gsutil cors set cors.json gs://nova-studio-494013.firebasestorage.app

cors.json is included in this zip.

## If Drive URL still fails

Download the image from Drive to your device, then use Upload from Device.
It uploads to Firebase + converts to base64 automatically. Always works.

## Google Sheets checklist

1. Open the Sheet → Share → Anyone with the link → Viewer → Done
2. Copy URL from browser address bar (not from Share dialog)
3. Paste into College Portal Step 2 → Load
