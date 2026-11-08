/**
 * Generates ORIGINAL, owned test audio for NaijaStream (no third-party music,
 * no licensing risk). Each track is synthesised with FFmpeg from tone/chord
 * definitions — it is the platform's own asset, recorded in the registry.
 *
 * Also produces a short MP4 video and a podcast episode.
 *
 * Usage: node scripts/make-test-audio.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "generated", "stream", "audio");
fs.mkdirSync(OUT, { recursive: true });

const TRACKS = [
  { id: "track-lagos-nights", title: "Lagos Nights", seconds: 72, freqs: [220, 277.18, 329.63, 440], tempo: 108, style: "afrobeats" },
  { id: "track-brighter", title: "Brighter", seconds: 64, freqs: [196, 246.94, 293.66, 392], tempo: 96, style: "afrobeats" },
  { id: "track-mainland-flow", title: "Mainland Flow", seconds: 80, freqs: [174.61, 220, 261.63, 349.23], tempo: 120, style: "hiphop" },
  { id: "track-concrete-dreams", title: "Concrete Dreams", seconds: 68, freqs: [164.81, 207.65, 246.94, 329.63], tempo: 88, style: "hiphop" },
  { id: "track-grateful-heart", title: "Grateful Heart", seconds: 76, freqs: [261.63, 329.63, 392, 523.25], tempo: 82, style: "gospel" },
  { id: "track-morning-light", title: "Morning Light", seconds: 70, freqs: [293.66, 369.99, 440, 587.33], tempo: 90, style: "gospel" },
  { id: "track-night-shift", title: "Night Shift", seconds: 66, freqs: [185, 233.08, 277.18, 369.99], tempo: 124, style: "hiphop" },
  { id: "track-amapiano-sunset", title: "Amapiano Sunset", seconds: 84, freqs: [146.83, 185, 220, 293.66], tempo: 112, style: "amapiano" },
  { id: "track-deep-groove", title: "Deep Groove", seconds: 78, freqs: [130.81, 164.81, 196, 261.63], tempo: 116, style: "amapiano" },
  { id: "track-highlife-soul", title: "Highlife Soul", seconds: 74, freqs: [233.08, 293.66, 349.23, 466.16], tempo: 100, style: "highlife" }
];

// Original additive synthesis in one aevalsrc expression (no external audio).
function buildArgs(track) {
  const [f1, f2, f3, f4] = track.freqs;
  const beat = ((track.tempo / 60) * 2).toFixed(4);
  const period = (1 / Number(beat)).toFixed(4);
  // Chord pad + sub bass + decaying pulse on each beat.
  const expr = [
    `0.16*sin(2*PI*${f1}*t)`,
    `0.12*sin(2*PI*${f2}*t)`,
    `0.10*sin(2*PI*${f3}*t)`,
    `0.08*sin(2*PI*${f4}*t)`,
    `0.18*sin(2*PI*${f1 / 2}*t)`,
    `0.22*sin(2*PI*${beat}*t)*exp(-14*mod(t,${period}))`
  ].join("+");
  const fadeOut = Math.max(1, track.seconds - 2);
  return [
    "-y", "-loglevel", "error",
    "-f", "lavfi",
    "-i", `aevalsrc='${expr}':d=${track.seconds}:s=44100`,
    "-af", `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=2,alimiter=limit=0.85`,
    "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "44100"
  ];
}

let created = 0;
for (const track of TRACKS) {
  const file = path.join(OUT, `${track.id}.mp3`);
  if (fs.existsSync(file)) continue;
  execFileSync(
    "ffmpeg",
    [...buildArgs(track), file],
    { stdio: "pipe" }
  );
  created += 1;
  console.log("audio:", track.id);
}

// Podcast episode (spoken-word style tone bed).
const episodeFile = path.join(OUT, "episode-founders-lagos.mp3");
if (!fs.existsSync(episodeFile)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi",
    "-i", "aevalsrc='0.14*sin(2*PI*196*t)+0.09*sin(2*PI*293.66*t)+0.05*sin(2*PI*392*t)':d=95:s=44100",
    "-af", "afade=t=in:st=0:d=2,afade=t=out:st=92:d=3,alimiter=limit=0.85",
    "-codec:a", "libmp3lame", "-b:a", "128k", episodeFile
  ], { stdio: "pipe" });
  created += 1;
  console.log("audio: podcast episode");
}

// Original short MP4 (video module) — generated colour/tone clip.
const videoFile = path.join(OUT, "clip-live-lagos.mp4");
if (!fs.existsSync(videoFile)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x0b3d2a:s=960x540:d=20:r=25",
    "-f", "lavfi", "-i", "sine=frequency=261.63:duration=20:sample_rate=44100",
    "-vf", "drawbox=x=0:y=0:w=960:h=540:color=0x0f7a4a@0.35:t=fill,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest",
    "-movflags", "+faststart", videoFile
  ], { stdio: "pipe" });
  created += 1;
  console.log("video: clip");
}

const bytes = fs.readdirSync(OUT).reduce((sum, f) => sum + fs.statSync(path.join(OUT, f)).size, 0);
console.log(JSON.stringify({ created, files: fs.readdirSync(OUT).length, totalMB: Number((bytes / 1048576).toFixed(1)), licence: "Original synthesised audio/video generated for NaijaStream (owned, no third-party rights)" }));
