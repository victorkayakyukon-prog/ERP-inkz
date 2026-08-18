FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY web/package.json web/package.json
RUN npm install --workspace=@signshop/web --include-workspace-root

COPY web ./web
RUN npm run build --workspace=@signshop/web

FROM nginx:alpine AS runtime
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
