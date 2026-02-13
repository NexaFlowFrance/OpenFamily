# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/

# Install dependencies
RUN npm install --legacy-peer-deps
RUN cd client && npm install --legacy-peer-deps
RUN cd shared && npm install --legacy-peer-deps

# Copy source code
COPY shared ./shared
COPY client ./client
COPY tsconfig.json ./

# Build shared and client
RUN cd shared && npm run build
RUN cd client && npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
