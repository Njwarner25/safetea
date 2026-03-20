# SafeTea Mobile App

Privacy-first dating transparency platform built with React Native & Expo.

## Tech Stack
- **Framework:** React Native with Expo SDK 52
- **Routing:** Expo Router v4 (file-based)
- **State:** Zustand
- **Language:** TypeScript

## Getting Started

```bash
cd safetea-mobile
npm install
npx expo start
```

## Test Accounts

| Role | Email | Password | Pseudonym |
|------|-------|----------|-----------|
| Admin | admin@getsafetea.app | SafeTea2026! | TeaAdmin |
| Moderator | mod@getsafetea.app | ModTest2026! | CoralGuardian |
| Member | user@getsafetea.app | UserTest2026! | VelvetOrchid |

## Project Structure

```
safetea-mobile/
  app/                  # Expo Router screens
    (auth)/             # Auth flow screens
    (tabs)/             # Main tab screens
    post/               # Post detail
    mod/                # Moderator screens
  constants/            # Design tokens, data
  store/                # Zustand state stores
  utils/                # Utility functions
  services/             # API client
```

## Key Features
- Pseudonym identity system (generate or create)
- Avatar selection (no photo uploads)
- 5-step moderator approval process
- City-based communities (200-vote threshold)
- FCRA-compliant safety tools
- Community alerts & AMBER alerts
- Anonymous posting option

## Domain
- **Web:** getsafetea.app
- **API:** api.getsafetea.app (planned)
