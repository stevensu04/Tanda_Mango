# Jailbreak the Bouncer — single container: Vite build + Node game server on one port.
# `npm start` runs server/main.ts through tsx, so dev dependencies stay installed.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Render injects PORT; the server falls back to 8080 locally.
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
