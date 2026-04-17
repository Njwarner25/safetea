# Move SafeTea Off Google Drive

Running a git repo inside a Google Drive synced folder will eventually corrupt
the repo. This guide moves the code out of Google Drive while keeping a
`SafeTea HQ` folder in Drive for non-code files (docs, branding, receipts).

Do this on **each** PC that currently has SafeTea inside Google Drive.

---

## 1. Save any uncommitted work first

Open a terminal in the Google Drive copy and run:

```bash
git status
git log origin/main..HEAD         # commits you have but haven't pushed (main)
git log origin/HEAD..HEAD         # same, current branch
```

If anything shows up:

```bash
git add -A
git commit -m "wip: saving before gdrive migration"
git push
```

Don't skip this — once you delete the Drive copy, anything not pushed to GitHub
is gone.

---

## 2. Close anything holding the folder open

- Quit VS Code / Cursor / your editor
- Stop any `npm run dev` / `vercel dev` / `node` processes running from that folder
- Close any terminal `cd`'d into it

On Windows, also close File Explorer windows pointed at the folder — Windows
will block rename/delete otherwise.

---

## 3. Pause Google Drive sync for the SafeTea folder

- **Windows / Mac:** Click the Google Drive tray icon → gear → Preferences →
  Google Drive → uncheck the `SafeTea` folder (or move it to "online only").
- This stops Drive from re-downloading files after you delete them locally.

---

## 4. Clone fresh to a clean local path

Pick a path **outside** Google Drive / OneDrive / Dropbox:

- **Windows:** `C:\dev\safetea`
- **Mac / Linux:** `~/dev/safetea`

```bash
mkdir -p ~/dev              # or md C:\dev  on Windows
cd ~/dev
git clone https://github.com/njwarner25/safetea.git
cd safetea
```

---

## 5. Restore the environment

```bash
npm install
npx vercel link             # select the SafeTea project
npx vercel env pull         # pulls .env.local from Vercel — do NOT commit it
```

`vercel env pull` replaces the old `.env` / `.env.local` you had inside the
Drive copy. You never need to hand-copy secrets between PCs again — they come
from Vercel.

---

## 6. Verify the new clone works

```bash
node --check api/cron/seed-daily.js   # sanity: syntax parses
git status                            # should say "nothing to commit, clean"
git pull                              # should say "Already up to date"
```

---

## 7. Delete the old Google Drive copy

Once step 6 passes, delete the `SafeTea` folder that was inside Google Drive.
This removes it from Drive on every other synced PC as well.

---

## 8. (Recommended) Keep a real `SafeTea HQ` folder in Drive

Create a fresh top-level `SafeTea HQ` folder in Google Drive for non-code files
only:

```
SafeTea HQ/
├── Legal/              (incorporation docs, trademarks)
├── Finance/            (tax, Stripe statements, invoices)
├── Marketing/          (branding assets, ad creatives, screenshots)
├── Ops/                (SOPs, vendor contacts, runbooks)
└── Notes/              (strategy, meeting notes)
```

This is Drive's actual strength — syncing arbitrary files between PCs. Keep it
far away from anything with a `.git/` directory.

---

## Rule of thumb going forward

| File type         | Lives in          | Syncs via         |
| ----------------- | ----------------- | ----------------- |
| Code              | `~/dev/safetea`   | git + GitHub      |
| Secrets / `.env`  | Vercel            | `vercel env pull` |
| Docs / ops / art  | `SafeTea HQ/`     | Google Drive      |

Never mix the three.
