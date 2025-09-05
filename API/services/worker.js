import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { transcribeFile } from './whisper.js';
import { buildFinalInsights } from './summarizer.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export function startWorker() {
  console.log('Creating worker with Redis URL:', redisUrl);
  const worker = new Worker('processing', async (job) => {
    console.log('Processing job:', job.id);
    const { audioPath, audioUrl, transcript: providedTranscript } = job.data || {};

    let transcript = providedTranscript || '';
    let tempAudioPath = null;
    let tempVideoPath = null;

    try {
      if (audioPath) {
        // Direct file path processing
        const chunkText = await transcribeFile(audioPath);
        transcript += (transcript ? '\n' : '') + (chunkText || '');
      } else if (audioUrl) {
        // URL processing - download and extract audio
        const { downloadMedia, extractAudio } = await import('./media.js');
        const tempDir = '/app/temp';
        
        console.log('Downloading media from URL:', audioUrl);
        tempVideoPath = await downloadMedia(audioUrl, tempDir);
        
        console.log('Extracting audio from:', tempVideoPath);
        const outAudio = `${tempDir}/${Date.now()}-audio.wav`;
        tempAudioPath = await extractAudio(tempVideoPath, outAudio);
        
        console.log('Transcribing audio:', tempAudioPath);
        const chunkText = await transcribeFile(tempAudioPath);
        transcript += (transcript ? '\n' : '') + (chunkText || '');
      }

      const insights = await buildFinalInsights(transcript);
      return { transcript, insights };
    } finally {
      // Cleanup temp files
      if (tempAudioPath) {
        try { await import('fs').then(fs => fs.promises.unlink(tempAudioPath)); } catch {}
      }
      if (tempVideoPath) {
        try { await import('fs').then(fs => fs.promises.unlink(tempVideoPath)); } catch {}
      }
    }
  }, {
    connection: new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    }),
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  });

  worker.on('failed', (job, err) => {
    console.error('worker_failed', job?.id, err);
  });
  worker.on('completed', (job) => {
    console.log('worker_completed', job.id);
  });
  return worker;
}

if (process.env.RUN_WORKER === 'true') {
  console.log('Starting worker with RUN_WORKER=true');
  console.log('Redis URL:', process.env.REDIS_URL);
  console.log('Worker Concurrency:', process.env.WORKER_CONCURRENCY);
  const worker = startWorker();
  console.log('Worker started successfully');
} else {
  console.log('Worker not started. RUN_WORKER=', process.env.RUN_WORKER);
  process.exit(0);
}
