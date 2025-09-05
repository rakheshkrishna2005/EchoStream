# syntax=docker/dockerfile:1

FROM node:20-slim AS base

WORKDIR /app

# Install system dependencies required for onnxruntime-node
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install production deps
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose port (Render uses PORT env var, defaults to 10000)
EXPOSE 10000

ENV NODE_ENV=production

# Healthcheck uses Node's global fetch in Node 20+
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||10000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Use clustered server for production
CMD ["node", "server.cluster.js"]
