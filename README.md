## 🎧 EchoStream API + Client (Audio Transcription & AI Insights)

🚀 Production-ready Node.js service for audio processing with local Whisper transcription and AI insights via Google Gemini. Features queue-based processing, Redis caching, Docker support, and Streamlit frontend.

## 📋 Table of Contents

- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture](#️-architecture--workflow)
- [⚙️ Environment Variables](#️-environment-variables)
- [🔐 Authentication](#-authentication)
- [📡 REST API](#-rest-api)
- [🔌 WebSocket API](#-websocket-api-socketio)
- [🖥️ Streamlit Frontend](#️-streamlit-frontend)
- [🐳 Docker Deployment](#-docker-deployment)
- [📊 Monitoring & Scaling](#-monitoring--scaling)

### ✨ Features
- 📁 **Audio ingestion**: Upload files or provide remote URLs
- 🎵 **Audio extraction**: ffmpeg-powered mono 16 kHz WAV extraction
- 🎤 **Local transcription**: Whisper via `@xenova/transformers` (no external ASR)
- 🧠 **AI insights**: Summaries, topics, actions, sentiment via Gemini
- ⚡ **Real-time WebSocket**: Live streaming with partial transcripts
- 🔄 **Queue processing**: Scalable background jobs with Redis/BullMQ
- 📈 **Horizontal scaling**: Cluster mode with Redis adapter
- 🐳 **Docker ready**: Full containerization support
- 🖥️ **Web frontend**: Streamlit UI for media management
- 💾 **Client storage**: Supabase integration for request/response data

## 🛠️ Tech Stack

### Backend API
| Area | Technology | Notes |
| --- | --- | --- |
| Runtime | Node.js 20+ | Requires native `fetch`, `Web Streams` |
| HTTP server | Express | REST endpoints for uploads and processing |
| WebSocket | Socket.IO | Realtime streaming with Redis adapter for clustering |
| File upload | express-fileupload | Multipart form-data handling |
| Transcription | @xenova/transformers (Whisper) | Local ASR; configurable model |
| Audio tools | ffmpeg / ffmpeg-static | Audio extraction and processing |
| AI/LLM | @google/generative-ai (Gemini) | Content analysis and insights |
| Queue system | BullMQ | Background job processing and task management |
| Cache/Message broker | Redis | Caching, pub/sub, and queue storage |
| Clustering | Node.js Cluster | Horizontal scaling with worker processes |
| Containerization | Docker | Production deployment with Docker Compose |

### Frontend & Client Storage
| Area | Technology | Notes |
| --- | --- | --- |
| Frontend UI | Streamlit | Interactive web interface for media management |
| Client Database | Supabase | Client-side storage for API request/response details |
| Python Runtime | Python 3.8+ | Required for Streamlit frontend |

## 🏗️ Architecture & Workflow

### 🎯 System Components
1. 🌐 **API Server**: Express.js with HTTP/WebSocket support
2. ⚙️ **Worker Processes**: Background transcription and AI processing
3. 🔴 **Redis**: Message broker for queues and clustering
4. 🖥️ **Streamlit Frontend**: Web UI for media management
5. 💾 **Supabase**: Client-side data storage

### 🔄 Processing Modes

#### ⚡ Synchronous (Direct)
Upload → Extract → Transcribe → Analyze → Return results immediately

#### 🔄 Asynchronous (Queue-based)
Submit job → Queue in Redis → Worker processes → Store results → Notify completion

### 📈 Scaling Options
- 🔄 **Horizontal scaling**: Multiple API instances with Redis clustering
- ⚙️ **Worker scaling**: Independent background processes
- 🐳 **Container orchestration**: Docker Compose support
- ☁️ **Production deployment**: Render.com with Redis Cloud

## ⚙️ Environment Variables

### 🔑 API Configuration
- `API_BEARER_TOKEN`: Authentication token (recommended)
- `GEMINI_API_KEY`: Google AI API key (required)
- `GEMINI_MODEL`: Model name (default: `gemini-1.5-flash`)
- `PORT`: Server port (default: 3000)

### 🔄 Queue & Redis
- `USE_QUEUE`: Enable background processing (`true`/`false`)
- `REDIS_URL`: Redis connection (default: `redis://localhost:6379`)
- `WORKER_CONCURRENCY`: Concurrent jobs (default: 2)
- `WEB_CONCURRENCY`: Cluster workers (default: CPU count)
- `RUN_WORKER`: Start worker process (`true`/`false`)

### 🖥️ Frontend (Streamlit)
- `API_BASE_URL`: EchoStream API URL
- `API_BEARER_TOKEN`: API auth token
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

## 🔐 Authentication

🔑 **REST**: Use `Authorization: Bearer <API_BEARER_TOKEN>` header when token is configured.

🔌 **WebSocket**: Pass token in auth object during connection.

## 📡 REST API

### POST /upload-audio
Process an uploaded audio file or a remote URL. Supports both synchronous and asynchronous processing.

**Synchronous Processing** (immediate response):
- Accepts either:
  - `multipart/form-data` with field `audio` (file)
  - `application/json` with `{ "audioUrl": "https://..." }`

Request (file upload):

```bash
curl -X POST http://localhost:3000/upload-audio \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -F "audio=@/path/to/audio.webm"
```

Request (remote media URL):

```bash
curl -X POST http://localhost:3000/upload-audio \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"audioUrl":"https://example.com/media.mp4"}'
```

**Asynchronous Processing** (queue-based):
Add `"useQueue": true` to request body for background processing.

```bash
curl -X POST http://localhost:3000/upload-audio \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"audioUrl":"https://example.com/media.mp4", "useQueue": true}'
```

**Synchronous Success Response:**

```json
{
  "success": true,
  "transcript": "Meeting transcript content...",
  "insights": {
    "summary": "Brief summary of the audio content",
    "topics": ["project planning", "budget discussion", "timeline"],
    "action_items": ["Review budget proposal", "Schedule follow-up meeting"],
    "sentiment": { "label": "positive", "score": 0.75 }
  }
}
```

**Asynchronous Success Response:**

```json
{
  "success": true,
  "jobId": "job_12345",
  "message": "Job queued for processing"
}
```

### GET /job/:jobId
Check the status of a queued processing job.

```bash
curl -X GET http://localhost:3000/job/job_12345 \
  -H "Authorization: Bearer $API_BEARER_TOKEN"
```

**Response (Processing):**

```json
{
  "jobId": "job_12345",
  "state": "active",
  "progress": 50
}
```

**Response (Completed):**

```json
{
  "jobId": "job_12345",
  "state": "completed",
  "result": {
    "transcript": "...",
    "insights": {
    "summary": "Brief summary of the audio content",
    "topics": ["project planning", "budget discussion", "timeline"],
    "action_items": ["Review budget proposal", "Schedule follow-up meeting"],
    "sentiment": { "label": "positive", "score": 0.75 }
  }
  }
}
```

**Error Responses:**

```json
{ "error": "missing_audioUrl_or_audio" }
{ "error": "process_failed" }
{ "error": "job_not_found" }
{ "error": "queue_unavailable" }
```

### POST /api/finalize
Finalize processing by combining an existing transcript with an uploaded audio file chunk. Returns `audioId`, combined transcript, and insights.

**Request Body** (`multipart/form-data`):
- `audio` (optional file): Additional audio chunk to process
- `audioId` (optional string): Session identifier
- `transcript` (optional string): Existing transcript to append to

```bash
curl -X POST http://localhost:3000/api/finalize \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -F "audio=@/path/to/clip.wav" \
  -F "audioId=session-123" \
  -F "transcript=Previous meeting notes..."
```

**Success Response:**

```json
{
  "success": true,
  "audioId": "rest-1712345678901",
  "transcript": "Previous meeting notes... Additional transcribed content...",
  "insights": {
    "summary": "Combined summary of all audio content",
    "topics": ["meeting recap", "action planning"],
    "action_items": ["Complete project deliverables", "Send meeting summary"],
    "sentiment": { "label": "neutral", "score": 0.6 }
  }
}
```

### GET /health
Health check endpoint for container orchestration and monitoring.

```bash
curl -X GET http://localhost:3000/health
```

**Response:**

```json
{ "status": "ok" }
```

## 🔌 WebSocket API (Socket.IO)

⚡ Real-time audio streaming with live transcription and job monitoring. Supports Redis clustering.

### 📡 Events
**Client → Server:**
- `start_audio` - Begin audio session
- `audio_chunk` - Stream audio data
- `end_audio` - Finish session
- `join_job` - Monitor job progress

**Server → Client:**
- `audio_started` - Session confirmed
- `partial_transcript` - Live transcription
- `audio_final` - Complete results
- `job_progress` - Processing updates
- `job_completed` - Job finished
- `job_failed` - Job error

## 🖥️ Streamlit Frontend

🎨 Beautiful web interface for media management and processing.

### ✨ Features
- 📚 **Media Library**: Organize audio/video files
- 🌐 **URL Processing**: Handle remote media URLs
- ⚡ **Real-time Results**: Live transcription and insights
- 📊 **Analysis Dashboard**: Browse saved results
- 💾 **Client Storage**: Supabase integration

### 🏗️ Architecture
- `app.py`: Main Streamlit application
- `supabase_client.py`: Database connection
- **Tables**: `media` (metadata), `analysis` (results)

## 🐳 Docker Deployment

### 🚀 Quick Start with Docker Compose

#### 📋 Prerequisites
1. Create `.env` file in API directory
2. Set your API keys and configuration

#### ⚡ Without Queue (Simple Setup)
**`.env` Configuration:**
```bash
# Simple setup - no background processing
USE_QUEUE=false
RUN_WORKER=false
WORKER_CONCURRENCY=2
WEB_CONCURRENCY=2
API_BEARER_TOKEN=your-secure-token
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-1.5-flash
```

**Run:**
```bash
cd API
docker-compose up -d api
```

#### 🔄 With Queue (Scalable Setup)
**`.env` Configuration:**
```bash
# Scalable setup with background processing
USE_QUEUE=true
RUN_WORKER=false  # API server doesn't run worker
WORKER_CONCURRENCY=3
WEB_CONCURRENCY=2
REDIS_URL=redis://redis:6379
API_BEARER_TOKEN=your-secure-token
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-1.5-flash
```

**Run:**
```bash
cd API
# Start Redis, API server, and workers
docker-compose up -d

# Scale workers as needed
docker-compose up -d --scale worker=3
```

### 🐳 Monitor Services
```bash
# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop services
docker-compose down
```

## 📊 Monitoring & Scaling

### 🏥 Health Checks
- 🌐 **API**: `GET /health`
- 🐳 **Docker**: Built-in healthcheck
- ☁️ **Render**: Automatic monitoring

### 📈 Scaling Strategies
1. 🔄 **Horizontal API**: Multiple instances with Redis clustering
2. ⚙️ **Worker Scaling**: Independent background processes
3. 💾 **Client Storage**: Supabase auto-scaling
4. 🔴 **Redis Scaling**: Cluster mode for high availability

### ⚡ Performance Tips
- 📁 Use queues for large files (>10MB)
- 🔄 Enable Redis clustering for multiple instances
- 📊 Monitor worker concurrency vs CPU/memory
- 🌐 Use CDN for static assets in production
