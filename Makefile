.PHONY: bootstrap up down logs test lint format check

bootstrap:
	cp -n .env.example .env || true
	docker compose build

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f api worker

test:
	docker compose run --rm api python -m pytest

lint:
	docker compose run --rm api ruff check app tests

format:
	docker compose run --rm api ruff format app tests

check: lint test
	./scripts/check-bootstrap.sh
