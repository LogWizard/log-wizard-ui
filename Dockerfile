FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY . .

# Build frontend if exists
RUN if [ -d "frontend" ]; then cd frontend && npm install && npm run build; fi

# HTTPS port and HTTP dev port
EXPOSE 2053 3333

CMD ["node", "index.js"]
