FROM node:18-alpine

WORKDIR /usr/src/app

# install only prod dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
