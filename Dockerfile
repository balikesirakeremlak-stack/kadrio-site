FROM node:20-alpine

WORKDIR /usr/src/app

# Install exactly the locked production dependency tree.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', response => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
