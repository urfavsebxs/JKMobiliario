FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY dist ./dist

EXPOSE 4000

CMD ["node", "dist/index.js"]
