FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9.6.0

# Copy workspace root files needed for monorepo resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/agent/package.json apps/agent/
COPY libs/sap-ai-token/package.json libs/sap-ai-token/

# Install all dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY libs/sap-ai-token/ libs/sap-ai-token/
COPY apps/agent/ apps/agent/

# Build the sap-ai-token lib
WORKDIR /app/libs/sap-ai-token
RUN pnpm build || npx tsc || true

WORKDIR /app

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@9.6.0

# Install Playwright and its dependencies for test execution
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont && \
    mkdir -p /tmp/pw-tests && cd /tmp/pw-tests && \
    npm init -y && npm install @playwright/test && \
    echo 'export default { use: { launchOptions: { executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] } } };' > playwright.config.mjs

# Copy entire workspace (with node_modules from builder)
COPY --from=builder /app /app

WORKDIR /app/apps/agent

ENV PORT=5002
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 5002

CMD ["npx", "tsx", "./fastify.ts"]
