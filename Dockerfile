# syntax=docker/dockerfile:1.7
# PRM Core — obraz produkcyjny.
#
# Bun w obu etapach, bo tak samo uruchamiany jest serwer lokalnie i tutaj: jedno
# środowisko mniej, w którym coś może się różnić. Natywne moduły @libsql/client
# kompilują się w etapie budowania i jadą do runtime razem z node_modules, więc
# oba etapy stoją na tym samym obrazie bazowym.

FROM oven/bun:1 AS build
WORKDIR /app

# Konfiguracja open-source zamiast dostawcy: nie ciągnie zamkniętej zależności
# budującej, a przy okazji włącza ochronę importów, która pilnuje, żeby kod
# serwerowy nie wyciekł do bundla przeglądarki.
COPY package.json bun.lock* bunfig.toml* ./
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/* \
 && jq 'del(.devDependencies["@lovable.dev/vite-tanstack-config"])' package.json > package.tmp.json \
 && mv package.tmp.json package.json
RUN bun install --no-frozen-lockfile

COPY . .
RUN cp vite.config.oss.ts vite.config.ts

# Wersja i commit wstrzykiwane do bundla — to one pokazują się w Ustawieniach
# i w /health, więc muszą pochodzić z tego, co realnie zbudowano.
ARG APP_VERSION=dev
ARG APP_COMMIT=
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_APP_COMMIT=$APP_COMMIT

RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src/lib/db/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
# Źródła są potrzebne w runtime dla `bun run db:seed` — zakłada pierwszego
# administratora i jest uruchamiany ręcznie po wdrożeniu. Bun wykonuje TypeScript
# wprost, więc nie ma czego budować; kilka megabajtów w obrazie kosztuje mniej
# niż osobna ścieżka budowania dla jednego skryptu.
COPY --from=build /app/src ./src

# Baza NIE mieszka w obrazie ani w katalogu aplikacji — to wolumen hosta.
# Dzięki temu ani rebuild, ani rollback nie mają jak jej dotknąć.
ENV DATABASE_URL=file:/data/prm-core.db
VOLUME /data

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

# Migracje przed startem serwera. Nieudana migracja zatrzymuje kontener, zamiast
# wpuścić ruch na schemat, którego kod się nie spodziewa.
CMD ["sh", "-c", "bun ./scripts/migrate.mjs && bun ./dist/server/server.js"]
