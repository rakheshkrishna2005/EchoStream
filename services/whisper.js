import { pipeline } from "@xenova/transformers";
import fs from "fs";
import path from "path";
import { decode } from "wav-decoder";

let transcriber = null;

async function getTranscriber() {
  if (!transcriber) {
    console.log("⏳ Loading Whisper model...");
    transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
    console.log("✅ Whisper model loaded");
  }
  return transcriber;
}

export async function transcribeFile(filePath) {
  const transcriber = await getTranscriber();
  const isWav = filePath.toLowerCase().endsWith(".wav");
  let wavPath = filePath;
  let cleanupPath = null;
  try {
    if (!isWav) {
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const outPath = path.join(tempDir, `${Date.now()}-converted.wav`);
      const { extractAudio } = await import("./media.js");
      wavPath = await extractAudio(filePath, outPath);
      cleanupPath = wavPath;
    }

    const wavBuffer = await fs.promises.readFile(wavPath);
    const { channelData } = await decode(wavBuffer);
    const mono = toMono(channelData);
    const result = await transcriber(mono, { sampling_rate: 16000 });
    return result.text;
  } catch (e) {
    try {
      const result = await transcriber(filePath);
      return result.text;
    } catch (inner) {
      throw e;
    }
  } finally {
    if (cleanupPath) {
      try { if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath); } catch {}
    }
  }
}

export async function transcribeBuffer(audioBuffer) {
  const transcriber = await getTranscriber();
  const result = await transcriber(audioBuffer);
  return result.text;
}

function toMono(channelData) {
  if (!channelData || channelData.length === 0) return new Float32Array();
  if (channelData.length === 1) return channelData[0];
  const length = channelData[0].length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channelData.length; c++) {
    const ch = channelData[c];
    for (let i = 0; i < length; i++) mono[i] += ch[i];
  }
  for (let i = 0; i < length; i++) mono[i] /= channelData.length;
  return mono;
}
