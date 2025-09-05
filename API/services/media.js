import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

let resolvedFfmpegPath = null;
async function resolveFfmpegPath() {
  if (resolvedFfmpegPath) return resolvedFfmpegPath;
  try {
    const mod = await import("ffmpeg-static");
    resolvedFfmpegPath = mod.default || mod;
  } catch {
    resolvedFfmpegPath = "ffmpeg";
  }
  return resolvedFfmpegPath;
}

export async function downloadMedia(url, outDir) {
  ensureDir(outDir);
  const extFromUrl = (() => {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\.([a-zA-Z0-9]+)$/);
      return m ? `.${m[1]}` : "";
    } catch {
      return "";
    }
  })();
  const outputPath = path.join(outDir, `${Date.now()}-download${extFromUrl || ""}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download_failed_${response.status}`);
  }

  const arrayBuf = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  await fs.promises.writeFile(outputPath, buffer);

  return outputPath;
}

export async function extractAudio(inputPath, outPath) {
  const ffmpegPath = await resolveFfmpegPath();
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outPath,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg_exit_${code}`));
    });
  });
  return outPath;
}


