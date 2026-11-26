#!/usr/bin/env bash
# Nandha Music — pre-deploy check (S10, 27 Nov 2026).
# Runs lint + tests + build. Any step failing stops the deploy.
# Usage: npm run predeploy   (or: bash scripts/pre-deploy-check.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== lint (oxlint, max 40 warnings — see docs/lint-baseline.md) =="
npx oxlint --max-warnings 40

echo "== tests (vitest) =="
npm test

echo "== build (vite) =="
npm run build

echo "pre-deploy check: OK"
