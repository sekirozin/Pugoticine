FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache python3 make g++ ffmpeg

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3012
ENV MEDIA_ROOT=/media/movies
ENV DATA_DIR=/app/data
ENV DB_FILE=/app/data/pugoticine.db
EXPOSE 3012

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3012/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
