import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import express from "express";
import fileUpload from "express-fileupload";
import { createServer } from "http";
import { Server } from "socket.io";

import { authenticate } from "./middleware/auth.js";
import { transcribeFile } from "./services/whisper.js";
import { buildFinalInsights } from "./services/summarizer.js";

// Optional Redis / queue imports
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { addProcessingJob, getJobState, getJob } from "./services/queue.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json({ limit: "10mb" }));
app.use(fileUpload());

// Simple health endpoint without authentication for container health checks
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Setup Socket.IO Redis adapter if REDIS_URL is provided
(async () => {
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log("Socket.IO Redis adapter enabled");
    } catch (e) {
      console.warn("Failed to enable Redis adapter", e);
    }
  }
})();

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

const sessions = Object.create(null);

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

// Queue-backed finalize as optional flow
app.post("/api/finalize", authenticate, async (req, res) => {
  let tempFilePath = null;
  try {
    const audioId = req.body.audioId || `rest-${Date.now()}`;
    let transcript = req.body.transcript || "";

    if (process.env.USE_QUEUE === "true") {
      // When using queue, persist uploaded file and enqueue
      if (req.files?.audio) {
        const f = req.files.audio;
        const filePath = path.join(tempDir, `${Date.now()}-${f.name}`);
        await f.mv(filePath);
        tempFilePath = filePath;
        const job = await addProcessingJob({ audioPath: filePath, transcript });
        return res.json({ success: true, queued: true, jobId: job.id, audioId });
      } else {
        const job = await addProcessingJob({ transcript });
        return res.json({ success: true, queued: true, jobId: job.id, audioId });
      }
    }

    if (req.files?.audio) {
      const f = req.files.audio;
      const filePath = path.join(tempDir, `${Date.now()}-${f.name}`);
      await f.mv(filePath);
      tempFilePath = filePath;
      const chunkText = await transcribeFile(filePath);
      transcript += (transcript ? "\n" : "") + chunkText;
    }

    const insights = await buildFinalInsights(transcript);
    res.json({
      success: true,
      audioId,
      transcript,
      insights,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "finalize_failed" });
  } finally {
    // If queued path was used, the worker will clean up; else unlink here
    if (process.env.USE_QUEUE !== "true") safeUnlink(tempFilePath);
  }
});

// Job status endpoint
app.get("/jobs/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const state = await getJobState(id);
    const job = await getJob(id);
    if (!job) return res.status(404).json({ error: "not_found" });
    const result = job.returnvalue || null;
    res.json({ id, state, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "job_lookup_failed" });
  }
});

app.post("/upload-audio", authenticate, async (req, res) => {
  let audioPath = null;
  let videoPath = null;
  try {
    const audioUrl = req.body.audioUrl;

    if (!audioUrl && !req.files?.audio) {
      return res.status(400).json({ error: "missing_audioUrl_or_audio" });
    }

    if (process.env.USE_QUEUE === "true") {
      // If queue, stage file or URL extraction in worker
      if (req.files?.audio) {
        const f = req.files.audio;
        const savedPath = path.join(tempDir, `${Date.now()}-${f.name}`);
        await f.mv(savedPath);
        audioPath = savedPath;
      }
      const job = await addProcessingJob({ audioPath, audioUrl });
      return res.json({ success: true, queued: true, jobId: job.id });
    }

    if (req.files?.audio) {
      const f = req.files.audio;
      const savedPath = path.join(tempDir, `${Date.now()}-${f.name}`);
      await f.mv(savedPath);
      audioPath = savedPath;
    } else {
      const { downloadMedia, extractAudio } = await import("./services/media.js");
      videoPath = await downloadMedia(audioUrl, tempDir);
      const outAudio = path.join(tempDir, `${Date.now()}-audio.wav`);
      audioPath = await extractAudio(videoPath, outAudio);
    }

    const transcript = await transcribeFile(audioPath);
    const insights = await buildFinalInsights(transcript);

    res.json({ success: true, transcript, insights });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "process_failed" });
  } finally {
    safeUnlink(audioPath);
    safeUnlink(videoPath);
  }
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (process.env.API_BEARER_TOKEN && token !== process.env.API_BEARER_TOKEN) {
    socket.emit("error", "unauthorized");
    socket.disconnect(true);
    return;
  }

  let audioId = null;

  socket.on("start_audio", ({ audioId: provided, audioName }) => {
    audioId = provided || `ws-${Date.now()}`;
    if (!sessions[audioId])
      sessions[audioId] = { lines: [], audioName };
    console.log(`>>> START audio ${audioId} (${audioName})`);
    socket.join(audioId);
    socket.emit("audio_started", { audioId, audioName });
  });

  socket.on("audio_chunk", async ({ buffer, ext = "webm" }) => {
    if (!audioId || !sessions[audioId]) return;
    let filePath = null;
    try {
      filePath = path.join(tempDir, `${audioId}-${Date.now()}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(buffer));
      const line = await transcribeFile(filePath);
      if (line) {
        sessions[audioId].lines.push(line);
        socket.emit("partial_transcript", { text: line });
      }
    } catch (e) {
      console.error("chunk_error", e);
    } finally {
      safeUnlink(filePath);
    }
  });

  socket.on("end_audio", async () => {
    if (!audioId || !sessions[audioId]) return;
    const { lines, audioName } = sessions[audioId];
    console.log(`<<< END audio ${audioId} (${audioName})`);
    const transcript = lines.join("\n");
    delete sessions[audioId];

    try {
      const insights = await buildFinalInsights(transcript);
      socket.emit("audio_final", { audioId, transcript, insights });
    } catch (err) {
      console.error("finalize_error", err);
      socket.emit("audio_final", { audioId, error: "finalize_failed" });
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`Server on http://localhost:${PORT}`)
);
