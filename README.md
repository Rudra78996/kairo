# Kairo

Kairo is a calm, local-first focus timer and study tracker. It combines open-ended focus sessions, customizable Pomodoro cycles, study history, lightweight insights, and a distraction-free YouTube music shelf in one desktop-sized interface.

![Kairo focus screen](docs/kairo-focus.png)

## Highlights

- Open-ended, custom-duration, and configurable Pomodoro timers
- Short and long breaks, round controls, and optional automatic phase starts
- Refresh-safe timers that restore running or paused state accurately
- Daily goals, lifetime totals, streaks, session history, weekly rhythm, and activity heatmap
- Multiple YouTube playlists with reorderable track queues and continuous playback
- Persistent music while navigating between sections
- Fullscreen focus mode and completion sound
- Custom wallpapers stored locally in IndexedDB
- Portable JSON backup and restore
- No account, analytics service, database, or cloud sync

## Local-first by design

Kairo stores sessions, playlists, timer state, and preferences in browser storage. Uploaded wallpapers use IndexedDB. Nothing is sent to a Kairo server, because there is no Kairo server.

This makes the current web app private and simple, but browser data can be removed by clearing site storage. Use **Settings → Export backup** if you want a portable copy.

## Getting started

Requirements:

- Node.js 20 or newer
- npm 10 or newer

```bash
git clone https://github.com/Rudra78996/kairo.git
cd kairo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables are required.

## Linux desktop app

Kairo includes a Tauri 2 desktop shell. Linux releases target AppImage and `.deb` packages.

On Ubuntu or Debian, install the native build prerequisites first:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Install Rust with [rustup](https://rustup.rs/), then run:

```bash
npm run desktop:dev
npm run desktop:build
```

Desktop bundles are written under `src-tauri/target/release/bundle`. Pushing a version tag such as `v0.1.0` runs the GitHub Actions release workflow and creates a draft release with both Linux packages.

## Commands

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run build    # Create the static production export
npm run desktop:dev    # Open Kairo in the Tauri development shell
npm run desktop:build  # Build AppImage and .deb packages
```

## Tech stack

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui with Base UI primitives
- Recharts
- Lucide icons
- Browser `localStorage` and IndexedDB
- Tauri 2 for the Linux desktop shell

## YouTube playback

Kairo embeds YouTube videos and playlists using YouTube's privacy-enhanced domain. Playback availability is still controlled by YouTube and the video owner; private, removed, region-restricted, age-restricted, or embedding-disabled videos may not play.

## Contributing

Issues and focused pull requests are welcome. Please run `npm run lint` and `npm run build` before opening a pull request.

## License

Kairo is released under the [MIT License](LICENSE).

The default Kairo night wallpaper was generated specifically for this project. It is distributed with the project under the same MIT License.
