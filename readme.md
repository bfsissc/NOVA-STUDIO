# NOVA Studio

NOVA Studio has been split from the original single HTML file into a static multi-file project.

## Entry Pages

- index.html - dashboard
- certificate.html - certificate generator
- mailer.html - certificate mailer
- erify.html - certificate verification workflow
- projects.html - saved certificate projects
- data-sync.html - live workbook/data sync
- settings.html - app settings and integrations
- profile.html - user profile

## Assets

- ssets/css/styles.css - shared application styles
- ssets/js/config.js - Brevo and Firebase configuration
- ssets/js/storage-polyfill.js - local/session storage fallback
- ssets/js/vendor.sheetjs.js - bundled spreadsheet/ZIP helper library
- ssets/js/app.js - main NOVA Studio application logic
- ssets/js/workbook.js - workbook/data sync logic
- ssets/js/page-init.js - page-specific startup routing

Run with a static server from this folder, for example:

`powershell
python -m http.server 5500
`

Then open http://localhost:5500/.