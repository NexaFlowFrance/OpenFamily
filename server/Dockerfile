# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Install dependencies
RUN npm install
RUN cd server && npm install
RUN cd shared && npm install

# Copy source code
COPY shared ./shared
COPY server ./server
COPY tsconfig.json ./

# Build shared and server
RUN cd shared && npm run build
RUN cd server && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Install production dependencies only
RUN npm install --production
RUN cd server && npm install --production
RUN cd shared && npm install --production

# Copy built files from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
