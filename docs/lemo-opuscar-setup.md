# Lemo Opuscar — installed and verified (2026-11-10)

## What it is

`github.com/lemomo-ai/lemo-opuscar` — a library of 68 film styles for coding
agents. Each style is a prompt plus a demo film rendered entirely in code with
Three.js, canvas and ffmpeg. No video model and no image generation is involved,
so it produces motion graphics rather than photographic footage.

- **Licence:** MIT (verified via the GitHub API).
- **Repository:** active, not archived, ~14k stars, JavaScript.
- **Not a car or vehicle project** despite the name.

## How it was installed

1. Skill placed at `~/.agents/skills/lemo-opuscar/` — `SKILL.md` plus
   `scripts/setup.sh`, the layout the skill's own instructions expect.
2. `sh ~/.agents/skills/lemo-opuscar/scripts/setup.sh` cloned the library to
   `~/lemo-opuscar` (shallow, sparse, blobless).
3. `setup.sh deps` created a local `.venv` and installed the core tier:
   numpy, scipy, soundfile, soxr, pillow, fonttools. It also downloaded the
   Playwright ffmpeg build.
4. Nothing was installed inside the NaijaDeals repository. The library lives at
   `~/lemo-opuscar` (254 MB) and the skill at `~/.agents/skills/`.

## Prerequisites — all already present

| Tool | Found | Required |
|---|---|---|
| Node | v26.13.0 | 20+ |
| Python | 3.12.10 | 3.11+ |
| ffmpeg | 9.0.2 | 7+ |
| git | 2.54.0 | any |

## Verification

Rendered stills from the library's own `blueprint` demo:

```
cd ~/lemo-opuscar && node core/render/still.mjs styles/blueprint/demo 15.0 --out still-out --size 1280x720
still-out\t_15.0.jpg 198ms
```

Both frames rendered: a blueprint grid at t=2.0 and a populated technical drawing
at t=15.0 with numbered callouts, dimension lines and a note panel. That exercises
Node, Three.js, Playwright, ffmpeg and the Python venv together.

Fonts are not kept in git; each demo's `tools/fonts.sh` fetches them from the
pinned `google/fonts` commit (SIL OFL 1.1). Run it before the first render of a
style.

## Optional tiers not installed

- **voice** — `kokoro-onnx` (offline TTS), `edge-tts`, `faster-whisper`, `av`.
  Free; install with `sh setup.sh deps voice`.
- **music** — `requirements-music.txt`. Free.

No paid service, API key or subscription is required by any tier.

## Using it

The skill is discoverable by ZCode after a client restart. Until then its
instructions can be followed directly: the library's own `AGENTS.md` and
`DIRECTOR.md` describe style selection, the treatment, and delivery.

## Cost note

Rendering is local CPU/GPU work. There is no per-frame charge. A 3D or
shader-heavy style wants a GPU.

## Standing project rules that still apply

Projects built with it belong outside the NaijaDeals repository unless a film is
commissioned for a specific vertical. Any footage used as real material must be
licensed, and generated films must not be presented as documentary recordings of
real people or places.
