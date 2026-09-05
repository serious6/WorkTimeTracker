# Installation guide

How to get WorkTimeTracker running on your computer. No prior knowledge is required: follow the
section that matches your situation from top to bottom.

Developers who want to run the application from the source code use
[`docs/development.md`](development.md) instead.

## 1. What you need

- A Windows or macOS computer. Linux is supported when you build from source.
- A database connection. WorkTimeTracker stores your times in a Postgres database and ships with
  none: you either receive the connection settings from whoever runs the database for you, or you
  run your own (see [`docs/development.md`](development.md)).
- Nothing else. There is no account to create with us and no online service to sign up for.

## 2. Download

Every version is published on the
[releases page](https://github.com/serious6/WorkTimeTracker/releases). Open the newest release and
pick one file:

| File | Choose it when |
| --- | --- |
| `.msi` (Windows) | You may install programs on this computer. |
| `.dmg` (macOS) | You may install programs on this computer. |
| `windows-x86_64-WorkTimeTracker-portable.zip` | You may not install anything, for example on a managed work laptop. |
| `macos-aarch64-WorkTimeTracker-portable.zip` | Same, on a Mac with Apple silicon. |

## 3. Install

### Windows installer

1. Double-click the `.msi` file and follow the steps.
2. Start WorkTimeTracker from the start menu.

### macOS installer

1. Double-click the `.dmg` file and drag WorkTimeTracker into the `Applications` folder.
2. Start it from the launchpad.

### Portable version (no administrator rights)

1. Unpack the ZIP file into any folder you may write to, for example one in your user folder.
2. Windows: start `WorkTimeTracker.exe`. macOS: start `WorkTimeTracker.app`.
3. Keep the whole folder together; the settings file described below lives next to the program.

Use a normal hard disk or network drive that keeps file permissions. A FAT-formatted USB stick does
not, and the application refuses to start from it.

On Windows the application draws its window with the WebView2 runtime. Windows 11 and most Windows
10 machines already have it. If the program complains that it is missing, install the
[Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) once — it works
without administrator rights.

## 4. First start warnings

The downloads are not signed, so the operating system warns you once:

- **Windows**: SmartScreen shows "Windows protected your PC". Choose *More info* → *Run anyway*.
- **macOS**: Gatekeeper says the app cannot be verified. Right-click the app → *Open* → *Open*. If
  macOS still refuses, run this in the Terminal, in the folder that holds the app:

  ```sh
  xattr -d com.apple.quarantine WorkTimeTracker.app
  ```

## 5. Enter your database connection

The application reads its connection from a file named `WorkTimeTracker.env` that sits **next to the
program**: beside `WorkTimeTracker.exe` on Windows, beside `WorkTimeTracker.app` on macOS (not
inside it, so it survives an update).

1. Copy `WorkTimeTracker.env.example` (included in the portable archive, also in
   [`portable/`](../portable/WorkTimeTracker.env.example)) and rename the copy to
   `WorkTimeTracker.env`.
2. Fill in the values you were given. Either the single `DATABASE_URL`, or the separate
   `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` and
   `SUPABASE_DB_NAME`. Keep `WORK_TIME_TRACKER_ENV=production` for a remote database.
3. Point `SUPABASE_DB_ROOT_CERT` at the certificate file of the database. A relative path is read
   from the same folder, so the certificate can travel with the program. A remote database is only
   ever contacted over a verified encrypted connection; there is no switch to turn that off.
4. Allow only your own account to read the file:
   - macOS: `chmod 600 WorkTimeTracker.env`
   - Windows: open *Properties* → *Security* and remove every account except your own.
5. Start the application.

On the first start the password and the connection string are moved into the password store of your
user account — the Windows Credential Manager or the macOS Keychain — and the file keeps the marker
`stored-in-credential-store` in their place. Only the host, port, database name and certificate path
stay readable, so the folder can be copied or synchronized without carrying a secret. The stored
secrets belong to that folder; a second copy keeps its own connection, and deleting the file makes
the next start forget the secrets as well.

## 6. Update

- Installer versions: run the installer of the new release over the old one.
- Portable versions: unpack the new archive and replace the program, keeping your
  `WorkTimeTracker.env` file. There is no automatic update.

## 7. Uninstall

- Windows: *Settings* → *Apps* → *WorkTimeTracker* → *Uninstall*, or simply delete the folder of the
  portable version.
- macOS: move the app to the trash.

Your times stay in the database and are not removed by uninstalling.

## 8. When something does not work

The application writes what went wrong to
`<app data directory>/logs/work-time-tracker.log`, with passwords and similar values removed. It is
rotated at 512 KiB.

| Message | What to do |
| --- | --- |
| The application refuses to start and names a setting | That setting is missing or misspelled in `WorkTimeTracker.env`. |
| It complains that others may read the file | Restrict `WorkTimeTracker.env` to your account, see step 4 above. |
| It cannot verify the certificate | `SUPABASE_DB_ROOT_CERT` points at a missing or wrong certificate file. |
| It cannot store or read back a secret | The password store of your account is unavailable; on Windows this happens with a roaming or temporary profile. |

Error messages always name the file and the setting, never a value. Still stuck? Open an issue on
the [issue tracker](https://github.com/serious6/WorkTimeTracker/issues) and attach the last lines of
the log file.
