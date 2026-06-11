# Legacy vanilla UI (snapshot)

A point-in-time **code snapshot** of the original single-page vanilla frontend
(`index.html` + `styles.css` + `app.js`), kept for reference / rollback before
the portal re-skin.

The re-skin did NOT change the validation engine (`/validators`, `/workers`) or
the API + report logic — only the UI markup/styles. To roll back, restore these
three files to the repo root (the engine lives at the repo root, so a rollback
copy works from there, not from inside this folder).
