FROM node:24-bookworm-slim

ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV CHECKPOINT_DISABLE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation openssl libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --include=dev --legacy-peer-deps --no-audit --no-fund
RUN ./node_modules/.bin/prisma generate

COPY . .
RUN npm run build && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
