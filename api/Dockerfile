# STTPS ERP API production image, run by Cloudflare Containers.
# The API is compiled before the image (npm run build in CI), so this image
# only installs production dependencies and copies the build output.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY dist ./dist

USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
