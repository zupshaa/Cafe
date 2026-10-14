# Our Little Café Scrapbook

A shared café journal. **Frontend:** GitHub Pages (this repo). **Backend:** Google Apps Script. **Database:** a private Google Sheet. **Photos:** a private Google Drive folder.

## Files in this repo
| File | Purpose |
|---|---|
| `index.html`, `style.css`, `script.js`, `api.js` | The website |
| `config.js` | The Apps Script web app address (ends in `/exec`). Not a secret |
| `images/` | Background tile, icons, favicon |
| `.gitignore` | Keeps junk files out of the repo |

The Apps Script files (`Code.gs`, `Setup.gs`, `Sheets.gs`, `Test.gs`) are **not** run by GitHub. They are pasted into the Apps Script editor and deployed there.

## Publish
1. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, folder **/ (root)** → **Save**.
2. After a minute the site is at `https://USERNAME.github.io/REPO-NAME/`.

## Change the backend address
Edit `config.js` and commit. Redeploying the backend as a **new version** (Deploy → Manage deployments → pencil → New version) keeps the same address.

## Security notes
- No PINs, tokens or folder IDs are in this repo. PINs are stored as hashes in Apps Script Script Properties.
- A 4-digit PIN is only a casual barrier. Anyone with a username can try PINs (5 wrong tries lock that name for 15 minutes).
- Everything in this repo is public. Do not put private information in the journal.
