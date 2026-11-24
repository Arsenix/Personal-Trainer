FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# El build necesita que existan las variables; estos valores solo sirven para compilar.
RUN DATABASE_URL=postgres://x:x@localhost/x AUTH_DATABASE_URL=postgres://x:x@localhost/x \
    ADMIN_DATABASE_URL=postgres://x:x@localhost/x BETTER_AUTH_SECRET=solo-build APP_URL=http://localhost \
    pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
