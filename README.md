<div align="center">

<br/>

```
██╗   ██╗███████╗████████╗██████╗  █████╗
██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
██║   ██║█████╗     ██║   ██████╔╝███████║
╚██╗ ██╔╝██╔══╝     ██║   ██╔══██╗██╔══██║
 ╚████╔╝ ███████╗   ██║   ██║  ██║██║  ██║
  ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
```

### **Talk freely. No noise. Just connection.**

<br/>

[![Download](https://img.shields.io/badge/⬇%20Download-Vetra-black?style=for-the-badge)](https://github.com/Blamp26/vetra-client/releases)
[![Version](https://img.shields.io/badge/version-1.0.0-white?style=for-the-badge)]()
[![Platform](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-available-grey?style=for-the-badge)]()

<br/>

</div>

---

<br/>

## ✦ Why Vetra?

Most messengers are bloated. Ads. Subscriptions. Tracking. Slow.

**Vetra is different.**

It's fast, private, and built around the way people actually communicate — in real time, with friends, teams, or communities. No distractions. No compromises.

<br/>

---

<br/>

## ✦ What you get

<br/>

### 💬 &nbsp; Instant Messaging
Send messages that arrive in milliseconds. Edit them, react to them, reply to them, search through them. Everything you'd expect — done right.

<br/>

### 🖥️ &nbsp; Servers & Channels
Create your own space. Organise conversations into channels by topic. Invite your people. You're in control.

<br/>

### 📞 &nbsp; Crystal-clear Voice Calls
One click to call anyone. One click to call anyone. No accounts to link, no call limits, no waiting rooms.

<br/>

### 🖼️ &nbsp; Media Sharing
Drop a photo, a video clip, a file — right into the chat. Instantly previewed, instantly delivered.

<br/>

### 😄 &nbsp; Reactions
Say more with less. React to any message with an emoji and keep the conversation flowing without cluttering it.

<br/>

### 🔔 &nbsp; Smart Notifications
Get notified about what matters. Ignore the rest. Customise notifications per server, per channel, or mute everything when you need focus.

<br/>

### 👤 &nbsp; Profiles & Presence
See who's online. Set your status. Personalise your profile. Know when your friends are around.

<br/>

---

<br/>

## ✦ Built to feel native

Vetra is a **desktop app** — not a browser tab.

It launches instantly, stays in your taskbar, and uses your computer's hardware properly. No memory leaks. No tab juggling. No "is this thing still open?"

Works on **Windows**, **macOS**, and **Linux**.

<br/>

---

<br/>

## ✦ Your data. Not ours.

- 🔒 &nbsp; No ads. No tracking. No selling your conversations.
- 🔐 &nbsp; Voice calls are private — your conversations stay between you.
- 🚫 &nbsp; We don't read your messages.

<br/>

---

<br/>

## ✦ Get Vetra

<div align="center">

<br/>

| Platform | Download |
|----------|----------|
| 🪟 Windows | [**Download .exe**](https://github.com/Blamp26/vetra-client/releases) |
| 🍎 macOS | [**Download .dmg**](https://github.com/Blamp26/vetra-client/releases) |
| 🐧 Linux | [**Download .AppImage**](https://github.com/Blamp26/vetra-client/releases) |

<br/>

> Or clone the repo and [build it yourself](#) — we respect that.

<br/>

</div>

---

<br/>

## ✦ Screenshots

<div align="center">

> *Messaging · Calls · Servers · Profile — all in one window.*

<!-- Add screenshots here -->
```
[ screenshot 1 ]   [ screenshot 2 ]   [ screenshot 3 ]
```

</div>

<br/>

---

<br/>

## ✦ Quick start

```
1. Download Vetra for your platform
2. Create an account — takes 10 seconds
3. Make a server, or message someone directly
4. That's it.
```

<br/>

---

<br/>

<div align="center">

**Vetra** &nbsp;·&nbsp; Fast. Private. Yours.

*Made with care by people who just wanted a better messenger.*

<br/>

[![Star on GitHub](https://img.shields.io/github/stars/Blamp26/vetra-client?style=social)](https://github.com/Blamp26/vetra-client/releases)

</div>

---

## Developer Smoke Checks

Copy `.env.smoke.example` to `.env.smoke`, fill in the LAN backend URLs plus `VETRA_SMOKE_USERNAME` and `VETRA_SMOKE_PASSWORD`, and keep `.env.smoke` out of git. The smoke login uses the same `username` field as the app.

Read-only smoke:

```bash
npm run smoke:lan
```

Write smoke with tagged test messages and reaction toggles:

```bash
npm run smoke:lan:write
```

Release check without Tauri packaging:

```bash
npm run check:release
```

Release check including Tauri packaging:

```bash
npm run check:release:tauri
```

The release wrappers reuse `VETRA_SMOKE_API_URL` and `VETRA_SMOKE_SOCKET_URL` as `VITE_API_URL` and `VITE_SOCKET_URL` when those build variables are not already set.

## Developer Load Checks

Copy `.env.load.example` to `.env.load`, fill in the LAN backend URLs plus `VETRA_LOAD_USERNAME` and `VETRA_LOAD_PASSWORD`, and keep `.env.load` out of git. The load tool reuses the same username/password login flow and socket-ticket flow as the app and smoke tests.

Safe connect-only load test:

```bash
npm run load:lan
```

Channel-message load mode:

```bash
npm run load:lan:messages
```

Call-signaling load mode:

```bash
npm run load:lan:calls
```

Low-rate soak mode:

```bash
npm run load:lan:soak
```

Default behavior is non-destructive. Set `VETRA_LOAD_WRITE=1` only when you intentionally want to send tagged `[load-test]` messages or signaling events. Real media load is peer-to-peer/TURN and is not the same as backend signaling load. JSON summaries are written to `load-results/` by default.
