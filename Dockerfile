# One service: the Socket.IO game server + Wesley's built frontend (one domain, one QR code).
# Run exactly ONE instance: every gallery lives in this process's memory.
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev

COPY web web
COPY scripts scripts
COPY server server
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.js"]
