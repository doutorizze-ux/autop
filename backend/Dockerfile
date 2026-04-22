FROM mcr.microsoft.com/playwright:v1.43.0-jammy AS builder

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma/
RUN cd backend && npm install && npx prisma generate

# Install scraping dependencies
COPY scraping/package*.json ./scraping/
RUN cd scraping && npm install && npx playwright install chromium

# Copy all source
COPY . .

# Build backend
RUN cd backend && npm run build

# Final stage
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

WORKDIR /app

# Copy built backend
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/backend/prisma ./backend/prisma

# Copy scraping engine (already has node_modules)
COPY --from=builder /app/scraping ./scraping

# Ensure playwright is ready in the final image
RUN npx playwright install-deps chromium

EXPOSE 5000

ENV NODE_ENV=production

CMD ["sh", "-c", "cd backend && npx prisma migrate deploy && node dist/index.js"]
