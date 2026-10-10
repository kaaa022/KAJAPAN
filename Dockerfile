FROM node:22-bookworm

RUN apt-get update && apt-get install -y python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=prod \
    && npm ls kuroshiro \
    && test -f node_modules/kuroshiro/package.json

COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

COPY . .

CMD ["node", "server.js"]
