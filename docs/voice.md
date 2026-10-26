# 🎙️ Voice input and 🎧 hands-free mode

Talk instead of typing: hold the 🎙️ button (or the space bar) to record voice input. The office transcribes your speech and sends it as a message.

## Hands-free mode

🎧 Hands-free mode (in Settings → Voice) listens after each CEO reply. When the CEO finishes speaking, the office automatically starts recording and waits for you to respond. After you finish talking, it transcribes and sends your message without pressing anything.

### Prerequisites for hands-free

- **Microphone permission granted** — the first time you use hands-free, the browser will ask. Approve it.
- **CEO voice enabled** — the CEO's replies must be spoken aloud so you know when to start talking. Go to Settings → Voice and pick a voice provider.
- **Insecure page or permission blocked** — see "If the 🎙️ does nothing" below.

## If the 🎙️ does nothing

If the 🎙️ button is dimmed or clicking it shows no result, check:

1. **Insecure page (most common)**
   - The microphone only works on `http://localhost:PORT` or over HTTPS.
   - If you're on `http://<IP-address>:PORT` or over LAN/Tailscale without HTTPS, the browser blocks microphone access.
   - **Fix:** Open the office as `http://localhost:PORT` on this Mac, or set up HTTPS. See `docs/pocket.md` for Tailscale Serve.

2. **Microphone permission denied**
   - The first time you press the 🎙️, the browser shows a permission prompt near the address bar.
   - If you click "Don't allow", the microphone is blocked for this site.
   - **Fix:** Click the permission icon (🔒) in the address bar, find "Microphone", and choose "Allow".

3. **Hands-free: CEO voice is off**
   - Hands-free needs to hear the CEO reply so it knows when you should talk.
   - **Fix:** Go to Settings → Voice and pick a voice provider (not "off").

## Mic check

Go to Settings → Voice → "Mic check" to see:
- Whether the page is secure (HTTPS/localhost)
- Whether your browser supports speech recognition
- Whether the microphone permission is granted
- Click "Test mic" to verify your microphone works

## How to test voice features

The e2e tests in `e2e/mic.spec.ts` verify that voice features work correctly in various scenarios:

**Run the tests locally:**
```bash
npm run test:e2e
```

**Test scenarios covered:**
- Insecure context: mic button is dimmed and shows HTTPS/localhost message
- Permission denied: error toast shown, hands-free remains off
- Permission granted: mic button is functional, voice features enabled
- Hands-free lifecycle: recognition starts after CEO reply playback; errors are handled gracefully (fail-closed)
- Unmount safety: closing the phone during voice playback does not trigger late sends or errors
- Multiple viewports: tests run at both desktop (1280×720) and phone (390×844) sizes
- Console safety: no TypeErrors or unhandled exceptions on insecure contexts

**Browser stubs:**
The tests stub SpeechRecognition and speechSynthesis via `addInitScript` to avoid requiring real audio hardware or permissions during test runs. This ensures deterministic, fast test execution.

**CI:**
The e2e tests run on all CI jobs (GitHub Actions) to catch regressions in voice features on both macOS and Windows.

## Hold vs tap

- **Hold for ≥0.3 s:** records a single message. Release to transcribe.
- **Tap for <0.3 s:** toggles "listen mode" — the office listens continuously. Tap again to stop. This is for hands-free use or if you want to speak multiple sentences without releasing.

The status bubble shows what's happening:
- "Starting the mic…" — asking the browser for permission or opening the audio device
- "Listening…" — recording your voice
- "Waiting for the browser's microphone prompt…" — the permission dialog is on screen (usually near the address bar)

If it takes more than 2 seconds to start, the bubble reminds you to check the address bar for a permission prompt.

## Privacy

The office never logs or transmits audio or transcripts — that's up to your transcription service. Check your provider's privacy policy.
