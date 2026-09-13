.PHONY: setup-env migrate-runtime setup-db build run clean cleanup build-backend migrate start stop restart status check-scripts check-go check-frontend container-build container-up container-restart container-stop container-status

setup-env:
	node scripts/dev.mjs setup-env

migrate-runtime:
	node scripts/dev.mjs migrate-runtime

setup-db:
	node scripts/dev.mjs setup-db

build:
	node scripts/dev.mjs build

run:
	node scripts/dev.mjs run

clean:
	node scripts/dev.mjs clean

cleanup:
	node scripts/dev.mjs cleanup

build-backend:
	node scripts/dev.mjs build-backend

migrate:
	node scripts/dev.mjs migrate

start:
	node scripts/dev.mjs start

stop:
	node scripts/dev.mjs stop

restart:
	node scripts/dev.mjs restart

status:
	node scripts/dev.mjs status

check-go:
	SOCIOH_COMMAND_CWD=backend node scripts/dev.mjs exec --stack=acceptance -- go test -count=1 -race -p 1 -tags=integration ./...
	SOCIOH_COMMAND_CWD=backend node scripts/dev.mjs exec --stack=acceptance -- go vet -tags=integration ./...

check-scripts:
	node --test scripts/*.test.mjs

check-frontend:
	SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm run typecheck
	SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm test
	SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm run build

container-build:
	node scripts/compose.mjs build

container-up:
	node scripts/compose.mjs up

container-restart:
	node scripts/compose.mjs restart

container-stop:
	node scripts/compose.mjs stop

container-status:
	node scripts/compose.mjs status
