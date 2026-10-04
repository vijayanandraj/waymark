# Stage 1: build the web app
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build          # writes ../server/webdist/dist

# Stage 2: build the Go binary with the web app embedded
FROM golang:1.24-alpine AS go
WORKDIR /src/server
COPY server/ ./
COPY --from=web /src/server/webdist/dist ./webdist/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/openroadmap ./cmd/server

# Stage 3: tiny runtime image
FROM alpine:3.20
RUN adduser -D -u 10001 app && mkdir -p /data && chown app /data
USER app
COPY --from=go /out/openroadmap /usr/local/bin/openroadmap
ENV ADDR=:8080 DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["openroadmap"]
