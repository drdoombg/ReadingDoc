# Reading Doc — project context

## Vision
A personal Speechify alternative: no character limits, no paywall, uses the
best available browser TTS voice. Two core capabilities combined into one
single-file PWA:
1. A **document library** — import docs (HTML now, PDF later) and keep them
   for repeated reading.
2. A **reader + TTS player** — open a doc (or pasted text) and have it read
   aloud, with speed control and voice selection.

## Files
- `index.html` — the entire app (UI + logic), single file, no build step.
  Originally named `Index.html`, renamed to `ReadingDoc.html` for clarity,
  then renamed back to `index.html` on 2026-09-21 so GitHub Pages serves it
  automatically at the repo root without needing a filename in the URL.
- `manifest.json`, `sw.js`, `icons/icon-128.png`, `icons/icon-192.png` — PWA
  support files added 2026-09-18. These didn't exist before, which is why the
  header showed a broken image icon and "install/offline" never worked.
- `Script V1.html` — a sample document the user actually reads (long-form
  essay, heavily custom-styled: `.hero`, `.essay p`, `.inline-callout`,
  `.smoking-gun`, `.limitation`, `.close-block`, Google Fonts, CSS variables
  for a warm paper-like theme). Used as a reference for "what real docs look
  like" — not part of the app itself.
  - **Note:** `handleFile()` in index.html strips `<style>` tags on
    import and keeps only `body.innerHTML`, so a doc like this loses all its
    custom visual design and gets re-styled with the app's own generic
    prose CSS when added to the library. This is currently a deliberate
    simplification, not necessarily a bug — flag to the user if it matters.

## Storage / persistence
- Library docs are stored in `localStorage` under key `rd-lib` as JSON
  (id, name, content HTML, date). No backend, no uploads — everything is
  local to the browser profile.

## Key architectural fact: voice quality is platform-locked (system TTS)
The single biggest limitation of relying on the browser's built-in TTS:
**the great voices (e.g. Edge's "William") are only available through
`speechSynthesis` on Windows + Edge desktop**, because Edge exposes
Microsoft's OS-level neural voices to the Web Speech API on Windows.

On **Android**, `speechSynthesis` in both Chrome and Edge mobile is backed by
the Android system TTS engine — not Microsoft's neural voices — so you get
the same flat/robotic voice regardless of which mobile browser is used. This
is a platform ceiling, not a bug in the app's code.

The user explicitly does **not** want to go the cloud-API route (Azure
Speech, ElevenLabs, etc.) — no API keys, no per-request network calls, no
recurring cost. Decision made 2026-09-18: use an **on-device neural TTS
model that runs fully client-side**, sidestepping the platform ceiling
entirely since it doesn't depend on the OS's TTS engine.

## Piper offline neural voice (implemented 2026-09-18)
Added a second TTS engine alongside the existing browser `speechSynthesis`
path, using **Piper** (VITS-based neural TTS) via the
**`@diffusionstudio/vits-web`** npm package, loaded at runtime from jsDelivr's
ESM CDN (`https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web/+esm`) via
dynamic `import()` — same pattern already used for `pdfjs-dist`, no bundler
needed.

- Default/selected voice: **`en_US-lessac-high`** (the voice the user asked
  for after comparing options) — appears in the voice dropdown under a
  "Neural (offline, downloads once)" group, value prefixed `piper:`.
- **First use downloads the model** (~2 files, one is fairly large — took
  roughly 60-90s over the test connection) and caches it in the browser's
  Origin Private File System via the library itself — no custom caching code
  needed. Subsequent reads on the same origin skip straight to synthesis,
  confirmed by testing (first run: "Downloading neural voice… N%" progress
  shown in the player label; second run: straight to "Synthesizing…").
- Playback goes through `<audio>` + `URL.createObjectURL(wav)` per text
  chunk (reusing the existing ~250-char sentence-boundary chunker, now
  factored out as `chunkText()`), not `SpeechSynthesisUtterance`. Speed
  control uses `audio.playbackRate` + `preservesPitch = true` (keeps pitch
  natural when sped up) instead of the utterance's `rate`.
- Selected voice persists across reloads via `localStorage` key `rd-voice`.
- Engine selection is implicit: whichever option is selected in the voice
  dropdown (`currentEngine()` checks for a `piper:` prefix). Piper is
  currently the **default** voice (it was the sole dropdown entry until
  system voices populate on some browsers/timings, so it wins the initial
  auto-select) — revisit if that default surprises the user by triggering
  an unexpected ~100MB download on first use.
- Bug fixed during this work: the `<select id="voice-sel">` had a leftover
  `<option value="">Loading voices…</option>` from the original markup that
  was never cleared before the Piper option was appended, so the empty
  placeholder silently won the default selection instead of Piper. Fixed by
  clearing `voiceSel.innerHTML` before the first `addPiperGroup()` call.
- Also fixed (pre-existing bug, not introduced by this change): completing
  a read (both engines) set the progress bar to 100% and word display to
  "✓ Done", then immediately called `setStatus('ready')`, which
  unconditionally reset both back to 0%/empty in the same tick — so the
  "done" state was never visible. `setStatus()` now takes an optional
  `keepProgress` flag; the natural-completion paths pass `true`, so the
  100%/"✓ Done" indicator now actually shows.
- **Not yet tested**: real Android device behavior for Piper (should
  reasonably work the same way since it's WASM/OPFS-based and not tied to
  Android's system TTS, but WASM performance on lower-end Android CPUs and
  OPFS support are unconfirmed — verify next session before assuming this
  also fixes/avoids the Android voice-quality problem).

## Known open bugs (Android, unconfirmed root cause — needs real-device debugging)
1. **Read button doesn't produce audio on Android** (page loads, button is
   tappable, but no sound). Hypotheses to check next session:
   - `synth.getVoices()` may return empty for longer than the app's
     300ms/1000ms retry window on some Android devices, leaving `canPlay()`
     false when the user taps.
   - Android TTS may require the engine/voice data to be installed
     (Settings → System → Languages & input → Text-to-speech).
2. **Page doesn't scroll on Android** (paste area / doc reader / library all
   seem stuck). Hypothesis: the layout relies on `100dvh` + nested
   `display:flex; overflow:hidden` containers (`body` → `.panel` →
   `#doc-frame` etc.) to make only the inner content area scroll. On some
   Android Chrome versions this chain doesn't resolve to a bounded height
   correctly, so the inner `overflow-y:auto` areas end up with zero
   effective scroll space while `body`'s `overflow:hidden` blocks the outer
   page from scrolling too — net result: nothing scrolls.
   - Next step: test with `html,body{height:100%}` instead of relying on
     `min-height:100dvh`, or measure with `window.visualViewport` on a real
     Android device before guessing further.

These were reported by the user from real desktop (works) vs real Android
(broken) testing, not yet reproduced/fixed by Claude — this session only
diagnosed and fixed the missing-PWA-assets issue (broken icon, manifest,
service worker scope). The Android issues need a real device or emulator
session to actually debug rather than further guessing.

## Testing notes
- The app must be served over `http://` (or `https://`) for
  `mcp__claude-in-chrome` browser automation to work — `file://` URLs are
  blocked by the extension. A quick local server for manual testing:
  `python -m http.server 8642` from this folder, then open
  `http://localhost:8642/index.html`.

## Critical constraint: the app itself requires http(s), not just Claude's testing (found 2026-09-21)
The user's actual real-world workflow was double-clicking `index.html`
directly (`file://...`). This is not just a testing-tool limitation — it
silently breaks the app for real users too:
- **OPFS (`navigator.storage.getDirectory()`) does not reliably work under
  `file://`** in Chrome — it requires a real http(s) secure-context origin.
  Piper depends on OPFS entirely (model storage, the manual-upload feature
  added this session, and predict()'s internal caching). Under `file://`,
  every Piper code path fails silently or throws deep inside library code,
  which is why "click Play" / "click Add model files manually" looked like
  literally nothing happened, with no error surfaced — a multi-session
  debugging dead end until the user confirmed they open the file by
  double-click, not via a server URL.
  - Service workers also can't register under `file://`, so the PWA
    install/offline features never worked there either — separate from,
    but compounding, the earlier stale-service-worker-cache bug (see below).
- **Fix shipped**: the app now detects `location.protocol === 'file:'` on
  load, shows a dismissible warning bar, and disables the Piper option in
  the voice dropdown (so it can't silently be picked into a broken state).
  Browser (`speechSynthesis`) voices are unaffected and still work fine
  under `file://`.
- **`Start ReadingDoc.bat`** (new, sits next to `index.html`) is the
  recommended way for the user to open the app now: it starts
  `python -m http.server 8642` in a minimized window and opens
  `http://localhost:8642/index.html`. The minimized server window must
  stay open while using the app. Tell the user about this file if they
  report Piper not working — first question is always "did you open
  index.html directly, or via the .bat / a localhost URL?"
- **GitHub Pages migration (2026-09-21)**: the user renamed `ReadingDoc.html`
  back to `index.html` and started uploading the project folder to GitHub
  (excluding `voices/` — the ~114MB Lessac model would exceed GitHub's
  100MB file limit anyway; now covered by `.gitignore`). This is a better
  permanent fix than the `.bat` launcher: GitHub Pages serves over `https`,
  which satisfies the OPFS secure-context requirement without the user
  needing to run a local server at all. If they mention deploying/publishing
  or ask about Pages, that's why — help them enable it in repo Settings →
  Pages (source: root of default branch) rather than re-suggesting the
  `.bat` file, which remains only as a fallback for fully-offline local use.

## Earlier bug (fixed 2026-09-21, keep in mind when debugging "nothing happens"): stale service worker cache
`sw.js` used to be cache-first with a version key that never bumped, so
edits to `index.html` never reached the browser — it kept silently
serving an old/incomplete snapshot (missing entire functions). This is now
network-first for the HTML shell (`sw.js` `NETWORK_FIRST` list), so this
specific failure mode shouldn't recur, but if a "the code clearly does X but
the browser acts like it doesn't" symptom shows up again, check the header's
version pill (`V0.x`, bumped each session) against what's actually in the
file before assuming the code is wrong — it has been the actual root cause
twice in this project's history (once via stale SW cache, once via file://
silently breaking OPFS).
