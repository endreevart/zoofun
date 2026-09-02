#!/usr/bin/env sh
set -eu

required_files="
README.md
AGENTS.md
docs/PRODUCT.md
docs/MVP.md
docs/ARCHITECTURE.md
docs/CREATURE_PIPELINE.md
docs/SECURITY_AND_PRIVACY.md
docs/TECHNICAL_SPIKE.md
.gitignore
.env.example
.cursor/mcp.json
.cursor/rules/00-project-core.mdc
.cursor/skills/plan-vertical-slice/SKILL.md
.cursor/skills/build-unity-slice/SKILL.md
.cursor/skills/build-backend-feature/SKILL.md
.cursor/skills/evaluate-creature-pipeline/SKILL.md
.cursor/skills/review-child-safety/SKILL.md
.cursor/skills/package-review-zip/SKILL.md
compose.yaml
backend/pyproject.toml
backend/app/main.py
backend/app/settings.py
backend/app/worker.py
backend/tests/test_health.py
"

for path in $required_files; do
  if [ ! -f "$path" ]; then
    echo "Missing required bootstrap file: $path" >&2
    exit 1
  fi
done

if ! python3 -c 'import json,sys; json.load(open(".cursor/mcp.json", encoding="utf-8"))' 2>/dev/null; then
  echo "Invalid JSON: .cursor/mcp.json" >&2
  exit 1
fi

if grep -E -q '(STOREKIT|APPLE_IAP|ACQUIRING|PAYMENT_SECRET|STRIPE|YOOKASSA)' .env.example; then
  echo ".env.example must not contain payment or StoreKit variables." >&2
  exit 1
fi

if grep -R -n -E '(sk-(proj|or-v1)-[A-Za-z0-9_-]{20,}|xi-api-key[=:][[:space:]]*[^[:space:]]+)' \
  --binary-files=without-match \
  --exclude='.env' \
  --exclude='*.zip' \
  --exclude-dir='.git' \
  --exclude-dir='.venv' \
  --exclude-dir='outputs' \
  --exclude-dir='Library' \
  .; then
  echo "Possible committed provider secret detected." >&2
  exit 1
fi

echo "Bootstrap structure looks valid."
