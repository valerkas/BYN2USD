---
name: release-extension
description: >-
  Bump the Chrome extension version in manifest.json and build a Chrome Web Store
  zip (BYN2USD-X.Y.Z.zip). Use whenever the user asks to update/bump version,
  package, build a zip, prepare a release, or publish the extension — including
  phrases like "обнови версию", "сделай zip", "пакет для публикации", "release".
---

# Release Chrome extension (version + zip)

## When this applies

Use this skill for BYN2USD publish packaging: bump `manifest.json` version and produce the upload zip.

## Workflow

1. Confirm bump type with the user if unclear:
   - **patch** (default) — `1.0.10` → `1.0.11`
   - **minor** — `1.0.10` → `1.1.0`
   - **major** — `1.0.10` → `2.0.0`
   - explicit version — e.g. `1.2.0`
   - zip only (no bump) — rebuild zip from current version
2. From the repo root, run the packaging script (Windows PowerShell):

```powershell
# patch bump (default)
.\scripts\package.ps1

# minor / major
.\scripts\package.ps1 -Bump minor
.\scripts\package.ps1 -Bump major

# explicit version
.\scripts\package.ps1 -Version 1.2.0

# zip only, keep current version
.\scripts\package.ps1 -NoBump
```

3. Report back:
   - old → new version
   - path to the zip (`BYN2USD-<version>.zip` in repo root)
4. Do **not** commit or push unless the user explicitly asks.

## What the zip contains

Only Chrome extension runtime files (same set as a Web Store upload):

- `manifest.json`
- `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`
- `src/background.js`, `src/content.js`, `src/popup.html`, `src/popup.js`

Exclude from the zip: `README.md`, `.git`, `scripts/`, `dist/`, source images (e.g. `128x128.jpg`), and any other `BYN2USD-*.zip`.

The script removes older `BYN2USD-*.zip` files so only the current artifact remains.

## Manual fallback

If the script cannot run:

1. Edit `"version"` in `manifest.json` to the new `X.Y.Z` value.
2. Create `BYN2USD-X.Y.Z.zip` with the include list above (forward-slash entry names).
3. Delete previous `BYN2USD-*.zip` files.
