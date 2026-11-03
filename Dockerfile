# cuehq-mcp over stdio, built from source (block 492). a directory builds this
# to start the server; without CUEHQ_API_KEY it still answers initialize and
# tools/list (see README), and every tool call says where a key comes from.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]
