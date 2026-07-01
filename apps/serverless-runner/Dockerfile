FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production

# Copy source
COPY src/handler.mjs src/handler.mjs

# Create cache directory for temp compiled agents
RUN mkdir -p src/.cache

# The test-local.mjs serves the handler as a standalone HTTP server
COPY src/test-local.mjs src/test-local.mjs

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/test-local.mjs"]
