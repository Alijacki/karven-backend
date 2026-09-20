FROM node:22-bookworm-slim
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=3000
USER node
CMD ["node","server.js"]
