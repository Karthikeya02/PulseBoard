FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY configs ./configs
RUN mkdir -p logs

CMD ["node", "src/agent.js"]
