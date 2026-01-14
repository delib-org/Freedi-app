# Freedi Development Environment
# This Dockerfile creates a consistent development environment with all prerequisites

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Firebase CLI globally
RUN npm install -g firebase-tools

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY functions/package*.json ./functions/
COPY packages/shared-types/package*.json ./packages/shared-types/

# Install dependencies
RUN npm install
RUN cd functions && npm install
RUN cd packages/shared-types && npm install

# Copy the rest of the application
COPY . .

# Build shared packages
RUN cd packages/shared-types && npm run build || true

# Expose ports
# Vite dev server
EXPOSE 5173
# Firebase Emulator UI
EXPOSE 4000
# Firebase Auth Emulator
EXPOSE 9099
# Firebase Functions Emulator
EXPOSE 5001
# Firebase Firestore Emulator
EXPOSE 8080
# Firebase Storage Emulator
EXPOSE 9199
# Firebase Hosting Emulator
EXPOSE 5000

# Default command
CMD ["npm", "run", "dev"]
