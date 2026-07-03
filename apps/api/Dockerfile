FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install

COPY . .

EXPOSE 9099

CMD ["npm", "run", "dev:api"]
