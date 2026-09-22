# Self-hosted Oceans Symphony relay.
#
# Only api/ and server/ are copied — the React app is not part of the
# relay. The server's own package.json pulls just the four packages the
# handlers need, rather than the app's full dependency tree.
#
# @vercel/kv is among them even though a self-hosted relay never calls
# Upstash: api/_kv.js imports it at module scope, and keeping that import
# is what lets self-hosted and hosted deployments run the SAME handler
# files instead of a fork. It is inert when REDIS_URL is set.
FROM node:22-alpine

WORKDIR /app

# node_modules must sit at /app so that /app/api/*.js resolves its imports.
COPY server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY api ./api
COPY server ./server

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Fails the container when Redis is unreachable, not merely when the
# process is alive — a relay that answers while its store is down is worse
# than one that is plainly restarting.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

# Run unprivileged.
USER node

CMD ["node", "server/index.mjs"]
