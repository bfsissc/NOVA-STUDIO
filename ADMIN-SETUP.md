# NOVA Studio — Admin Panel Setup Guide

## Files Added

| File | Purpose |
|------|---------|
| `admin.html` | Admin panel UI — separate page, restricted access |
| `assets/js/admin.js` | All admin panel logic |
| `firestore.rules` | Updated rules with `isAdmin()` helper function |

---

## Step 1 — Deploy Updated Firestore Rules

Copy the contents of `firestore.rules` and paste them into:
**Firebase Console → Firestore Database → Rules → Edit rules → Publish**

The new rules add an `isAdmin()` helper that all collections use.

---

## Step 2 — Grant Yourself Admin Access

You must do this **manually** in Firebase Console the first time:

1. Go to **Firebase Console → Firestore Database → Data**
2. Navigate to: `users` → `your-email@domain.com`
3. Click **+ Add field**:
   - Field name: `isAdmin`
   - Type: `boolean`
   - Value: `true`
4. Click **Add**

After this, the Admin Panel will recognize you.

---

## Step 3 — Access the Admin Panel

Open `admin.html` in your browser (same domain as your site):
```
https://yourdomain.com/admin.html
```

Log in with the same email/password you use for NOVA Studio.

---

## Admin Panel Features

### 📊 Dashboard
- Live stats: total users, admins, portals, teams, sync rooms
- Recent sign-ups table
- Quick action shortcuts
- System info

### 👤 User Management
- View, search, and filter all users
- Edit user profile fields (name, role, company)
- Grant or revoke admin access
- Ban / unban users
- Delete users
- Add new admin by email

### 🏫 College Portals
- View all portals with student counts
- Activate / deactivate portals
- Edit portal name
- Delete portals (with confirmation)

### 👥 Teams
- View all teams
- See member counts and owners
- Delete teams

### 📡 Live Sessions
- View all live/past sessions
- Delete sessions

### 🔄 Sync Rooms
- View all workbook sync rooms
- Delete rooms

### ⚙️ Site Configuration
- Site title, support email
- Announcement banner (text + color)
- Feature flags: toggle registration, Google login, demo mode, maintenance mode, and individual features
- Danger zone: enable maintenance mode, delete all portals

### 🗄️ Firestore Explorer
- Browse any collection (users, portals, teams, etc.)
- View raw document JSON
- Edit documents in JSON editor
- Delete documents

### 🔒 Security Rules
- View recommended rules with admin support
- One-click copy to deploy

### 📋 Activity Logs
- All admin actions are logged to `nova_admin_logs` collection
- Clear logs

---

## Security Notes

- The `isAdmin` flag is stored in Firestore and checked server-side via rules
- Admin Panel page itself is just an HTML file — add server-side protection (e.g. Netlify auth, .htaccess) for extra security
- For Netlify: add `admin.html` to a protected route in `netlify.toml`
- Never share `admin.html` URL publicly

### Optional: Netlify Password Protection for admin.html

Add to `netlify.toml`:
```toml
[[redirects]]
  from = "/admin.html"
  to = "/admin.html"
  status = 200
  conditions = {Role = ["admin"]}
```

Or use Netlify Identity to gate access at the CDN level.
