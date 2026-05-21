# NOVA Studio - Setup & Fix Notes

## Step 1 - Run A Local Server

Do not open `index.html` directly by double-clicking it. Firebase, Google login,
and Drive API features do not work correctly from `file://` URLs.

Use:

```powershell
START_SERVER.bat
```

Then open:

```text
http://localhost:8080
```

If the batch file does not work, open Command Prompt in this folder and run:

```powershell
python -m http.server 8080
```

## Step 2 - Firebase Console

Add localhost to authorized domains:

```text
Firebase Console -> Authentication -> Settings -> Authorized domains -> Add domain -> localhost
```

Update Firestore rules:

```text
Firebase Console -> Firestore Database -> Rules
```

Replace the rules with the contents of `firestore.rules`, then publish.

Update Storage rules:

```text
Firebase Console -> Storage -> Rules
```

Replace the rules with the contents of `storage.rules`, then publish.

## Step 3 - Firebase Storage CORS

The college portal template upload uses Firebase Storage from the browser. The
bucket must allow upload methods, not only `GET`.

Run this once from Google Cloud Shell or a terminal with Google Cloud SDK:

```powershell
gsutil cors set cors.json gs://nova-studio-494013.appspot.com
```

If your Firebase console also shows the newer bucket name, run this too:

```powershell
gsutil cors set cors.json gs://nova-studio-494013.firebasestorage.app
```

## Step 4 - Google Cloud Console

Enable Google Drive API:

```text
console.cloud.google.com -> APIs & Services -> Enable APIs & Services -> Google Drive API -> Enable
```

## What Changed In This Build

- Fixed the college portal deployment/upload CORS issue.
- Added Firestore long-polling auto detection for hosted-domain stability.
- Portal templates uploaded from device now save a Firebase Storage URL.
- If Firebase Storage CORS is still blocked, portal publish falls back to a compressed Firestore-safe template so deployment can continue.
- College Portal now has adaptive quality compression: device uploads and Drive image links are resized/encoded to the best quality under a safe portal size target before publish.
- Existing portals that saved a Google Drive thumbnail URL should be opened in admin, template re-uploaded or reloaded, and published again.
- Kept the full app files: profile, settings, teams, drive manager, notifications, folders, certificate, mailer, projects, data sync, and portal.
