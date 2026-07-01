FROM node:22-slim

WORKDIR /app

# Install tsx for TypeScript execution
RUN npm install -g tsx

# Copy package.json and install deps
COPY package.json ./
RUN npm install --omit=dev || npm install

# Copy source and public
COPY src/ src/
COPY public/ public/

ENV NODE_ENV=production
ENV PORT=3000
ENV YJS_URL=ws://hocuspocus.agents.svc.cluster.local:1234

EXPOSE 3000

CMD ["node", "--import=tsx", "--experimental-vm-modules", "src/dev.ts"]
