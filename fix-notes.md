# NOVA Studio - College Portal Fix Notes

## What changed

### Firebase Storage upload CORS

The previous `cors.json` allowed only `GET`. Firebase browser uploads need upload
methods too, otherwise the browser preflight fails and the portal template upload
shows a CORS error from `firebasestorage.googleapis.com`.

The included `cors.json` now allows:

- `GET`
- `HEAD`
- `POST`
- `PUT`
- `DELETE`

Apply it once to the Firebase Storage bucket before testing portal deployment.
The console error you shared uses the appspot bucket, so run this for that bucket:

```powershell
gsutil cors set cors.json gs://nova-studio-494013.appspot.com
```

If your Firebase console shows the newer bucket name too, apply it there as well:

```powershell
gsutil cors set cors.json gs://nova-studio-494013.firebasestorage.app
```

### Firestore Listen 400 errors

`assets/js/config.js` now enables Firestore long-polling auto detection. This is
more reliable on hosted domains and networks that break WebChannel streaming.

### Drive template URLs

Google Drive thumbnail URLs are not reliable as certificate template URLs because
browsers block them with CORS. The admin flow now copies a loaded Drive template
into Firebase Storage and stores the Firebase download URL in Firestore.

That means newly published portals no longer depend on Drive thumbnails for the
student download page.

## Important

Existing portals that already have a Drive thumbnail URL saved in Firestore may
still fail. Open the portal in admin, reload or upload the template, then publish
again so the saved `templateUrl` becomes a Firebase Storage URL.
