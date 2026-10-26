FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY crm/src crm/src
RUN mkdir -p crm/public && npm run crm:build
FROM node:24-alpine
ENV NODE_ENV=production PORT=3100
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.html *.css *.js posts.json reviews.json ./
COPY assets ./assets
COPY crm/server.js crm/worker.js crm/notification-runner.js ./crm/
COPY crm/src/resources.js crm/src/validation.js crm/src/configuration.js crm/src/email-settings.js ./crm/src/
COPY crm/public/index.html crm/public/crm.css ./crm/public/
COPY --from=build /app/crm/public/app.js ./crm/public/app.js
USER node
EXPOSE 3100
CMD ["node", "crm/server.js"]
