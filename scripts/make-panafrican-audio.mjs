/**
 * Original, platform-owned audio for the pan-African demonstration catalogue.
 * Each track is additive synthesis rendered by FFmpeg (chord pad, sub bass and
 * a tempo pulse) tuned per regional style — no third-party recordings, no
 * licensing exposure. Re-runs are no-ops once a file exists.
 *
 * Usage: node scripts/make-panafrican-audio.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "generated", "stream", "audio");
fs.mkdirSync(OUT, { recursive: true });

const TRACKS = [
  { id: "track-accra-nights", seconds: 76, freqs: [196, 246.94, 293.66, 392], tempo: 104, style: "hiplife" },
  { id: "track-dakar-waves", seconds: 82, freqs: [174.61, 220, 261.63, 349.23], tempo: 96, style: "mbalax" },
  { id: "track-nairobi-morning", seconds: 70, freqs: [220, 277.18, 329.63, 440], tempo: 110, style: "bongo" },
  { id: "track-dar-sun", seconds: 74, freqs: [261.63, 329.63, 392, 523.25], tempo: 92, style: "taarab" },
  { id: "track-joburg-log", seconds: 86, freqs: [146.83, 174.61, 220, 293.66], tempo: 114, style: "amapiano" },
  { id: "track-durban-gqom", seconds: 68, freqs: [130.81, 155.56, 196, 261.63], tempo: 126, style: "gqom" },
  { id: "track-kinshasa-rumba", seconds: 90, freqs: [233.08, 293.66, 349.23, 466.16], tempo: 100, style: "soukous" },
  { id: "track-douala-makossa", seconds: 78, freqs: [196, 233.08, 293.66, 392], tempo: 108, style: "makossa" },
  { id: "track-algiers-rai", seconds: 80, freqs: [174.61, 207.65, 261.63, 349.23], tempo: 98, style: "rai" },
  { id: "track-cairo-nights", seconds: 84, freqs: [220, 261.63, 329.63, 440], tempo: 102, style: "arabic-pop" }
];

function buildArgs(track) {
  const [f1, f2, f3, f4] = track.freqs;
  const beat = ((track.tempo / 60) * 2).toFixed(4);
  const period = (1 / Number(beat)).toFixed(4);
  const expr = [
    `0.15*sin(2*PI*${f1}*t)`,
    `0.11*sin(2*PI*${f2}*t)`,
    `0.09*sin(2*PI*${f3}*t)`,
    `0.07*sin(2*PI*${f4}*t)`,
    `0.17*sin(2*PI*${f1 / 2}*t)`,
    `0.20*sin(2*PI*${beat}*t)*exp(-14*mod(t,${period}))`
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
  execFileSync("ffmpeg", [...buildArgs(track), file], { stdio: "pipe" });
  created += 1;
  console.log("audio:", track.id);
}
console.log(JSON.stringify({ created, total: TRACKS.length }));
