<p align="center">
  <img src="banner.svg" alt="intime Banner" width="45%">
</p>
<p align="center">
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/ber2minsin/intime">
  <img alt="GitHub contributors" src="https://img.shields.io/github/contributors/ber2minsin/intime">
  <img alt="Issues" src="https://img.shields.io/github/issues/ber2minsin/intime">
  <img alt="Rust Version" src="https://img.shields.io/badge/rust-1.85+-orange">
  <img alt="License" src="https://img.shields.io/github/license/ber2minsin/intime">
</p>

---

[intime](https://github.com/ber2minsin/intime) is a privacy-focused time tracking application written in **Rust**. It automatically monitors your **active windows** and **applications** to help you understand how you spend your time on your computer.

---

## Features

- Automatic tracking of active windows and applications
- Windows API integration (Linux/macOS planned)
- SQLite database for fast, local storage ([SQLx](https://github.com/launchbadge/sqlx))
- ABSOLUTELY no external data transfer, everything is stored locally and will never leave your machine
- Open-source under the AGPL-3.0 license (See [LICENSE](LICENSE))
- 90% vibe-coded front-end with Tauri v2 and React+TypeScript using shadcn/ui components
---

## 📥 Download

Download the latest release from [GitHub Releases](https://github.com/ber2minsin/intime/releases).

---

## 🔧 Development Environment / Compiling from Source

```bash
git clone https://github.com/ber2minsin/intime.git
cd intime
```

You can run the full application in development mode using:

```bash
cargo tauri dev
```

The application creates a local SQLite database at `%APPDATA%/Roaming/intime/data/intime.db` by default and stores its configuration file at `%APPDATA%/Roaming/intime/intime_config.toml`. All data and configuration are stored locally and will never leave your machine. Everything in `intime_config.toml` can be changed through "Settings" tab in the UI.

For development environments, you can set up an environment file using the provided `.env.example` as a template at the project root. Make sure to use the `file:` protocol in your database URL or SQLx might raise an error.

If the database fails to create automatically, you can manually create it using the following commands:

```bash
# install sqlx-cli if you haven't already
cargo install sqlx-cli --no-default-features --features sqlite
```

Then, run the following commands to create the database and apply migrations:

```bash
sqlx db create
sqlx migrate run
```

For offline compilation support, you can prepare SQL queries:

```bash
cargo sqlx prepare --workspace
```

---

## 📝 License

AGPL-3.0 — see the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ by <a href="https://github.com/ber2minsin">Ber2</a></p>
