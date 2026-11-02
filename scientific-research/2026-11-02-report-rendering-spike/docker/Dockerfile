# linux/amd64 Node 22 image to measure the @sparticuz/chromium path under a 2 GiB limit.
FROM --platform=linux/amd64 node:22-bookworm-slim
WORKDIR /spike
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
