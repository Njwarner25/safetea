# iOS Rebrand Recovery — LinkHer / SafeTea Quick Fix

## Goal
Restore the iOS app functionality to the pre-rebrand state. The rebrand should have only changed:
- Logo
- App name / wording
- Store-facing branding
- Tea-related terminology where needed for Apple compliance

It should NOT have broken or removed core features.

## Current Problems
The current iOS version is broken after the rebrand:

1. Photo Scanner / Photo Verify
- Fails when uploading a photo.
- User should be able to upload/select an image.
- The feature should process the uploaded image the same way it did before the rebrand.

2. Safety Vault
- Fails when creating a folder.
- User should be able to create folders and save items.
- Restore the prior working behavior.

3. Chat Scanner / Conversation Scanner
- Should allow user to upload screenshots.
- User should be able to select one or multiple screenshots from device storage/photos.
- App should analyze uploaded screenshots, not require manual text only.

4. Logo / Branding
- Current logo looks bad.
- The LinkHer logo needs to look blended, polished, and part of the app.
- Do not just drop a random logo asset in.
- Use the final LinkHer identity:
  - Name: LinkHer
  - Slogan: Stay connected. Stay safe.
  - Colors: pink / purple gradient
  - Style: modern, feminine, safety-tech
- The logo should work as:
  - App icon
  - Header logo
  - Website corner logo
  - Splash screen logo

## Important Instruction
Do NOT rebuild the app from scratch.

Do NOT remove features.

Do NOT redesign the whole app.

This is a recovery task:
- Compare current rebrand branch against the last working SafeTea version.
- Restore broken feature logic.
- Keep the new iOS-safe wording and LinkHer branding.
- Make sure the app functions like it did before the rebrand.

## Required Audit
Before coding, check:
- Image picker permissions
- iOS photo library permissions
- Upload API endpoint
- Auth token handling
- File/form-data request formatting
- Backend route names
- Storage bucket/folder creation logic
- Any renamed variables caused by the rebrand
- Any deleted service files
- Any mock data replacing real API calls

## Expected Fixes
### Photo Verify
- Restore image picker.
- Restore upload handling.
- Verify backend receives the image.
- Show success/error states clearly.

### Safety Vault
- Restore create-folder API call.
- Verify authenticated user ID is passed correctly.
- Verify database/storage folder creation works.
- Show created folder in UI immediately after success.

### Chat Scanner
- Add screenshot upload support.
- Allow selecting screenshots from device.
- Send uploaded screenshot(s) to scanner workflow.
- Preserve existing manual text option if present.

### Branding
- Replace bad logo with polished LinkHer logo assets.
- Use consistent logo across splash, header, app icon, and auth screens.
- The logo must look integrated into the UI, not pasted on.

## QA Checklist
Test on iOS simulator and physical device if possible:

- Login works
- Photo Verify upload works
- Safety Vault folder creation works
- Chat Scanner screenshot upload works
- Logo displays cleanly on splash screen
- Logo displays cleanly in app header
- No SafeTea wording remains where iOS should say LinkHer
- No feature was removed from the old working app

## Final Deliverable
Create a clear summary with:
- Files changed
- Bugs fixed
- Features restored
- Screens tested
- Any remaining issues
