# Local POS — Phase 1

Phase 1 runs the **production** Next.js POS from the cashier PC. The UI and
JavaScript load from `127.0.0.1`; the cloud API is used only for background
refresh/sync and login.

This phase still uses browser IndexedDB. SQLite is Phase 2.

## One-time owner setup

Requirements:

- Windows 10/11
- Node.js 20 LTS or newer
- Google Chrome
- Thermal printer installed as the Windows default printer
- Internet for setup, first login, and initial cloud synchronization
- The deployed API URL ending in `/api/v1`

Steps:

1. Copy/pull this repository onto the owner-managed shop PC.
2. Open `pos\scripts\Setup-Local-POS.bat`.
3. If prompted, enter the deployed API URL (not a localhost URL).
4. Wait for dependency installation and the production build.
5. The setup creates a **Krunchies POS** desktop shortcut.
6. Open that shortcut once while online, sign in, and wait until the sidebar
   shows a successful sync.
7. Test New Order, Pending, History, printing, and then repeat with Wi-Fi off.

Do not use `npm run dev` at the shop. Development mode compiles routes on click
and is intentionally much slower.

## Daily staff use

Cashiers only double-click **Krunchies POS**. The shortcut:

1. Starts the local production server hidden if it is not already running.
2. Waits until the local server is ready.
3. Opens Chrome in app mode with silent kiosk printing.

Repeated clicks do not start duplicate servers.

## Local data behavior

- A fresh localhost database is seeded immediately with the bundled official
  products, sizes, and categories.
- Screens read IndexedDB first and start cloud refreshes in the background.
- Walk-in order create/edit/complete/cancel writes locally and queues sync.
- Website orders reach the cloud first, then the sync engine pulls them into
  the local Pending list when internet is available.
- Dashboard/Analytics open with their last local snapshot and refresh later.

## Files and diagnostics

- Local browser profile/data:
  `%LOCALAPPDATA%\KrunchiesPOS\chrome-profile`
- Local server logs:
  `%LOCALAPPDATA%\KrunchiesPOS\logs`
- Emergency remote launcher:
  `pos\scripts\Launch-POS.bat`

The Vercel POS remains an emergency fallback. Daily till work is this local shortcut and IndexedDB — not the Vercel URL.

## Updating Phase 1

The owner/developer pulls the new repository version and reruns
`Setup-Local-POS.bat`. The cashier shortcut does not change. Local IndexedDB is
stored in the dedicated Chrome profile and is not removed by rebuilding.

Phase 3 will replace this owner-managed setup with a proper installer/updater.
