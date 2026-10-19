.PHONY: all web server run dev-api dev-web test clean docker

all: web server

web:
	cd web && npm install && npm run build

server:
	cd server && go build -o bin/server ./cmd/server

run: all
	cd server && ./bin/server -data ../data

# Two terminals: `make dev-api` and `make dev-web`; Vite proxies /api to Go.
dev-api:
	cd server && go run ./cmd/server -data ../data

dev-web:
	cd web && npm run dev

test: server
	cd server && go vet ./... && go test ./...
	scripts/smoke.sh server/bin/server

docker:
	docker build -t openroadmap .

clean:
	rm -rf server/bin server/webdist/dist/* web/node_modules
	echo "placeholder" > server/webdist/dist/.keep
