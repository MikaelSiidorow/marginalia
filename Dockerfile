FROM node:22-slim AS base
WORKDIR /app
RUN npm i -g bun

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build
RUN bun install --production

FROM base
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "build"]
