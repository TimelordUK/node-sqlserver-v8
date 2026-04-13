# Building from source

Most users don't need this. `npm install msnodesqlv8` downloads a prebuilt binary matching your platform, Node ABI and (on Linux) glibc/musl. Build from source only if:

- No prebuilt binary exists for your Node / Electron version
- You need to patch the native code
- Your libc is older than any published build

This page assumes you're comfortable with native Node addons, `node-gyp`, and either MSBuild or a POSIX toolchain. It is not a tutorial.

## What you need

**All platforms**
- Node.js ≥ 20, or Electron ≥ 32
- Python 3 (for `node-gyp`)
- `node-gyp` available (installs automatically as a build dep)
- An ODBC SDK providing `sql.h`, `sqlext.h`, `sqltypes.h` — i.e. the ODBC driver *and* its headers

**Linux** (Ubuntu, Debian, Fedora ≥ 24, Alpine, RHEL-family)
- GCC 9+ or Clang 10+, `make`
- `unixodbc-dev` (Debian/Ubuntu) / `unixODBC-devel` (Fedora/RHEL) / `unixodbc-dev` (Alpine)
- Microsoft ODBC Driver 17 or 18 installed — see [Microsoft's install guide](https://learn.microsoft.com/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server)

**macOS**
- Xcode Command Line Tools (`xcode-select --install`)
- `unixodbc` and the Microsoft ODBC driver via Homebrew

**Windows**
- Visual Studio Build Tools with the "Desktop development with C++" workload (MSBuild + Windows 10/11 SDK)
- Microsoft ODBC Driver 17 or 18 from the MSI installer — the driver package ships the headers

## Build

```sh
# force a rebuild against the local toolchain
npm install msnodesqlv8 --build-from-source

# or, in a checkout of this repo
npm ci
npx node-gyp rebuild
```

On Electron, pass `--runtime=electron` and the target ABI to `node-gyp`, or use `electron-rebuild` — standard Electron native-module workflow, nothing special to this library.

## OpenSSL note

Historically the library crashed with a `double free` / core dump on Ubuntu and Debian when running under Node 18 and 20, caused by a mismatch between Node's bundled OpenSSL and the system OpenSSL pulled in by the ODBC driver. This is **not** a bug in the driver — it's a load-order / symbol-clash problem outside the native addon.

- **Node 24+**: appears fixed. No special action needed on recent distros.
- **Node 18 / 20**: if you hit this, install OpenSSL 3.2 system-wide. A working example is `tool/openssl.sh` in this repo.
- **Alpine, Fedora ≥ 24, current macOS, Windows**: not affected in our testing.

## Known-good build hosts

Actively exercised in CI or reported as working by maintainers:

- Ubuntu 20.04, 22.04, 24.04 (x64)
- Alpine 3.16+ (x64, musl)
- Fedora ≥ 24 (x64)
- Debian 10+ (x64)
- macOS 13+ (x64, arm64) — via GitHub Actions
- Windows Server 2019 / 2022 (x64, ia32) — via GitHub Actions

## If the build fails

- `node-gyp` errors usually mean the ODBC headers aren't where the linker expects. `pkg-config --cflags odbc` should print an include path on Linux; if it doesn't, the `-dev` package isn't installed.
- `fatal error: sql.h: No such file` → missing `unixodbc-dev` / `unixODBC-devel`.
- Windows: `MSB8036: The Windows SDK was not found` → install the Windows SDK component in Visual Studio Build Tools.
- On a crash at runtime after a successful build, check the OpenSSL note above before filing an issue.

For anything else, open a GitHub issue with the full `npm install` log, your OS, Node version and `odbcinst -q -d` output.
