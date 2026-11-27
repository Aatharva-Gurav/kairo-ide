# Build and Packaging

This document describes how **Kairo IDE** is built for static Next.js export and packaged into native desktop installers with **Tauri v2**.

## Build Configuration Overview

### 1. Next.js Static Export (`next.config.ts`)
- `output: "export"` exports the full frontend into `out/` during `npm run build`.
- `images: { unoptimized: true }` disables dynamic server image optimization so static bundling works offline inside Tauri's WebView.
- `reactStrictMode: true` is enabled.

### 2. Tauri Bundle Configuration (`src-tauri/tauri.conf.json`)
| Setting | Value | Notes |
| :--- | :--- | :--- |
| `productName` | `kairo-ide` | Desktop application name |
| `version` | `0.1.0` | Application version |
| `identifier` | `com.kairo.ide` | Bundle identifier |
| `build.frontendDist` | `../out` | Reads static export output from Next.js |
| `build.beforeBuildCommand` | `npm run build` | Builds frontend automatically before Tauri packaging |
| `bundle.active` | `true` | Enables OS installer bundling |
| `bundle.targets` | `all` | Builds platform-native bundle formats (`.msi`/`.exe` on Windows, `.dmg`/`.app` on macOS, `.deb`/`.AppImage` on Linux depending on host OS) |
| `bundle.icon` | `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico` | Desktop icon assets under `src-tauri/icons/` |

## Packaging Steps

1. Run pre-release verification across frontend and Rust:
   ```bash
   npx tsc --noEmit
   npm run lint
   npm test
   cargo fmt --manifest-path src-tauri/Cargo.toml --check
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
   ```
2. Build the production desktop bundle:
   ```bash
   npx tauri build
   ```
   Tauri will invoke `npm run build` to populate `out/`, compile `src-tauri` in `--release` profile, embed the production CSP from `tauri.conf.json`, and output installers under `src-tauri/target/release/bundle/`.

## Security Differences Between Dev and Production Builds

- **`devCsp` (`npx tauri dev`)**: Allows `'unsafe-inline'`, `'unsafe-eval'`, `http://localhost:3000`, and `ws://localhost:3000` for Next.js HMR and React Fast Refresh.
- **`csp` (`npx tauri build`)**: Enforces strict production isolation:
  ```text
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: asset: http://asset.localhost https://asset.localhost;
  media-src 'self' asset: http://asset.localhost https://asset.localhost;
  font-src 'self' data:;
  connect-src 'self';
  worker-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ```
- **Asset Protocol**: Enabled (`assetProtocol.enable = true`) with declarative `scope: []`, delegating all file access checks to Rust's `WorkspaceGuard` and `asset_protocol.rs` custom handler.

## Related Documentation

- [Architecture Overview](../architecture/architecture-overview.md)
- [Development Setup](../development/setup.md)
- [Development Workflow](../development/development-workflow.md)
