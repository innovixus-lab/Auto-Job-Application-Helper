# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY migrations ./migrations

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
