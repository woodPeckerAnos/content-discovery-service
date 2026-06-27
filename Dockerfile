FROM mcr.microsoft.com/playwright:v1.52.0-noble

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} NO_PROXY=${NO_PROXY}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HEADLESS=true
ENV BROWSER_CHANNEL=""

CMD ["npm", "run", "scheduler"]
