# 本镜像仅供 CI / 依赖校验；浏览器搜索请在 PC 宿主机运行 npm run worker。
# 见 docs/mq.md

FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "-e", "console.log('Run on host: npm run worker')"]
