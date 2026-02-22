# Build stage for client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install --package-lock-only
RUN npm ci
COPY client/ ./
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Create non-root runtime user
RUN addgroup -S bytestash && adduser -S bytestash -G bytestash

# Copy server source and dependencies
COPY --chown=bytestash:bytestash server/package.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ gcc && \
      npm install --omit=dev && \
      apk del .build-deps

COPY --chown=bytestash:bytestash server/src ./src
COPY --chown=bytestash:bytestash server/docs ./docs

# Copy client build
COPY --from=client-build /app/client/build /client/build

# Create output directory
RUN mkdir -p /home/bytestash && chown -R bytestash:bytestash /home/bytestash

ENV BYTESTASH_DATA_PATH=/home/bytestash

EXPOSE 5000

USER bytestash

CMD ["node", "src/app.js"]
