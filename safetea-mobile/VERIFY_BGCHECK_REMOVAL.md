# Background Check Removal — Verification Instructions

Run these commands in Claude Code (from the repo root) to confirm the Background Check feature is fully removed.

## 1. Delete the stub files

```bash
git rm safetea-mobile/app/background-check.tsx
git rm safetea-mobile/store/backgroundCheckStore.ts
```

## 2. Search for any remaining references

```bash
# Should return ZERO results (excluding this file)
grep -rin "background.check\|bgcheck\|bg_check\|screening/background\|ios-hide-bgcheck\|ios-show-bgcheck" \
  --include='*.html' --include='*.js' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' \
  . | grep -v node_modules | grep -v '.git/' | grep -v VERIFY_BGCHECK_REMOVAL
```

If anything shows up, remove it.

## 3. Verify vercel.json has no screening/background route

```bash
grep "screening/background" vercel.json
# Should return nothing
```

## 4. Verify privacy.html and terms.html are clean

```bash
grep -i "background.check" public/privacy.html public/terms.html
# Should return nothing
```

## 5. Verify mobile app has no background check imports or navigation

```bash
grep -r "backgroundCheck\|background-check\|BackgroundCheck" safetea-mobile/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v VERIFY_BGCHECK_REMOVAL
# Should return nothing (or only the stub files before git rm)
```

## 6. Verify index.html has no iOS-gating classes

```bash
grep "ios-hide-bgcheck\|ios-show-bgcheck" index.html
# Should return nothing
```

## 7. Commit and push

```bash
git add -A
git commit -m "feat: remove Background Check feature entirely

- Delete background-check.tsx and backgroundCheckStore.ts
- Remove Background Check tool cards from search.tsx
- Remove iOS-gated background check content from index.html
- Remove screening/background route from vercel.json
- Clean up privacy.html, terms.html, subscription.tsx, welcome.tsx
- Replace background check references with generic safety language"
git push origin main
```

## What was removed

| File | Change |
|------|--------|
| `safetea-mobile/app/background-check.tsx` | Deleted |
| `safetea-mobile/store/backgroundCheckStore.ts` | Deleted |
| `safetea-mobile/app/(tabs)/search.tsx` | Removed BG check + sex offender cards, kept Safety Resources |
| `safetea-mobile/app/(auth)/welcome.tsx` | Changed "Background Check Tools" → "Safety Resources" |
| `safetea-mobile/app/(tabs)/index.tsx` | Replaced BG check tip with community safety tip |
| `safetea-mobile/app/subscription.tsx` | Changed "Background check credits" → "Advanced safety tools" |
| `vercel.json` | Removed `/api/screening/background` route |
| `public/privacy.html` | Removed 5 background check references |
| `public/terms.html` | Removed "background check service" language |
| `index.html` | Removed all `ios-hide-bgcheck`/`ios-show-bgcheck` dual content, removed BG check + sex offender tool cards, removed FCRA disclaimers |
