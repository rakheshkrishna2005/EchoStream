import pkg from 'bullmq';
const { Queue, QueueEvents, Job } = pkg;
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let connection = null;
let processingQueue = null;
let processingQueueEvents = null;

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function getQueue() {
  if (!processingQueue) {
    processingQueue = new Queue('processing', { connection: getRedisConnection() });
  }
  return processingQueue;
}

export function getQueueEvents() {
  if (!processingQueueEvents) {
    processingQueueEvents = new QueueEvents('processing', { connection: getRedisConnection() });
  }
  return processingQueueEvents;
}

export async function addProcessingJob(data, opts = /** @type {JobsOptions} */({})) {
  const queue = getQueue();
  const job = await queue.add('process', data, {
    attempts: 1,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
    ...opts,
  });
  return job;
}

export async function getJob(jobId) {
  const queue = getQueue();
  return queue.getJob(jobId);
}

export async function getJobState(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;
  return job.getState();
}
