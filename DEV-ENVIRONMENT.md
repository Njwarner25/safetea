# SafeTea Dev Environment Runbook

How the SafeTea development setup actually works across machines.

---

## Architecture Overview

Everything lives inside a **SafeTea HQ** folder synced via OneDrive.
Each Claude Code agent gets its own folder with its own git clone so
agents never step on each other's working trees.

```
SafeTea HQ/                          ← OneDrive-synced root
├── CLAUDE.md                        ← executive-assistant routing rules
├── 1-operations/
│   ├── CLAUDE.md                    ← agent instructions
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 2-product/
│   ├── CLAUDE.md
│   └── safetea/                     ← git clone (Njwarner25/safetea-landing)
├── 3-research/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 4-finance/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 5-marketing/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 6-security/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 7-legal/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 8-qa/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── 9-community/
│   └── safetea/                     ← git clone (Njwarner25/safetea)
├── safetea-fresh/                   ← clean main-branch clone (Njwarner25/safetea)
├── safetea-ios/                     ← git clone (Njwarner25/safetea-ios)
├── safetea-landing/                 ← git clone (Njwarner25/safetea-landing)
├── safetea-landing-fresh/           ← git clone (Njwarner25/safetea-landing)
├── app-builds/                      ← .aab files for Play Store
├── app-store-assets/                ← screenshots, metadata
├── docs/                            ← shared docs, talking points
├── legal/                           ← non-code legal docs
└── ...
```

## GitHub Repos

| Repo | What it is |
|------|-----------|
| `Njwarner25/safetea` | Main app — Vercel serverless API + public frontend + React Native mobile |
| `Njwarner25/safetea-landing` | Landing page at getsafetea.app |
| `Njwarner25/safetea-ios` | iOS-specific mobile build |

## Per-Agent Clones

Each numbered agent folder (`1-operations/`, `2-product/`, etc.) contains:
- A `CLAUDE.md` with that agent's role and instructions
- A `safetea/` subfolder that is an independent git clone

This means agents can be on different branches simultaneously. For example,
`1-operations/safetea` might be on `cron/stripe-sync` while `8-qa/safetea`
stays on `main` for testing.

**Why per-agent clones?** Claude Code sessions open at a folder root and use
the git state they find there. Separate clones prevent one agent's uncommitted
work or branch switch from breaking another agent's context.

## OneDrive Sync + Git

The entire `SafeTea HQ` folder syncs through OneDrive. This means `.git/`
directories are also synced. Known trade-offs:

- **Pro:** Every machine sees the same folder structure, agent instructions,
  and working state without manual setup.
- **Risk:** OneDrive can create sync conflicts on `.git/index.lock` or
  packfiles if two machines edit the same clone simultaneously.
- **Mitigation:** Only work from one machine at a time per agent folder.
  If you see a stale `.git/index.lock`, delete it — it's from a process
  that was interrupted by sync, not a running git process.

## Setting Up a New Machine

1. Sign into OneDrive — `SafeTea HQ` syncs automatically.
2. Install prerequisites: Node.js, git, Vercel CLI, GitHub CLI (`gh`).
3. Authenticate:
   ```bash
   gh auth login
   npx vercel login
   ```
4. In any agent clone that needs env vars:
   ```bash
   cd <agent>/safetea
   npx vercel link          # select the SafeTea project
   npx vercel env pull      # pulls .env.local from Vercel
   ```
5. Install dependencies:
   ```bash
   npm install
   ```
6. You're ready. Open Claude Code at `SafeTea HQ/` and it routes tasks
   to the correct agent folder via the root `CLAUDE.md`.

## Secrets & Environment Variables

| Secret type | Where it lives | How to sync |
|-------------|---------------|-------------|
| API keys, DB credentials | Vercel Environment Variables | `vercel env pull` |
| `.env.local` | Local only (gitignored) | Regenerated via `vercel env pull` |
| App signing keystores | `~/.safetea/` | Manual copy or secure vault |
| App Store / Play Store creds | `1-operations/APP-STORE-CONNECT-SECRETS.md` | OneDrive sync |

**Never commit `.env` files or keystores to git.**

## Common Tasks

### Pull latest code across all agent clones
```bash
for dir in SafeTea\ HQ/*/safetea; do
  [ -d "$dir/.git" ] && echo "--- $dir ---" && git -C "$dir" pull --ff-only
done
```

### Check which branch each agent is on
```bash
for dir in SafeTea\ HQ/*/safetea; do
  [ -d "$dir/.git" ] && printf "%-20s %s\n" "$(basename $(dirname $dir))" "$(git -C "$dir" branch --show-current)"
done
```

### Fix stale lock files (OneDrive artifact)
```bash
find "SafeTea HQ" -name "index.lock" -path "*/.git/*" -delete
```

## What Goes Where

| Content | Location | Syncs via |
|---------|----------|-----------|
| Application code | `<agent>/safetea/` | git + GitHub |
| Secrets / `.env` | Vercel | `vercel env pull` |
| Agent instructions | `<agent>/CLAUDE.md` | OneDrive |
| Docs, assets, legal, finance | Top-level HQ folders | OneDrive |
| App builds (.aab) | `app-builds/` | OneDrive |
