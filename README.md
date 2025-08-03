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
- Planned Tauri v2 frontend for a modern desktop UI
- ABSOLUTELY no external data transfer, everything is stored locally and will never leave your machine
- Open-source under the AGPL-3.0 license (See [LICENSE](LICENSE))

---

## 🚀 Quick Start

```bash
git clone https://github.com/ber2minsin/intime.git
cd intime
cargo build --release
cargo run
```

The application creates a local SQLite database at `./data/intime.db` by default.

---

## 📝 License

AGPL-3.0 — see the LICENSE file for details.

---

<p align="center">Made with ❤️ by <a href="https://github.com/ber2minsin">Ber2</a></p>
