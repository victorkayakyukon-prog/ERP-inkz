FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
RUN npm install --workspace=@signshop/server --include-workspace-root

COPY server ./server
RUN npx prisma generate --schema server/prisma/schema.prisma \
 && npm run build --workspace=@signshop/server

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/package.json ./package.json

RUN mkdir -p /data/uploads
EXPOSE 4000
CMD ["node", "dist/index.js"]
