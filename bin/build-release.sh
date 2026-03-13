#!/bin/bash
set -e

export MIX_ENV=prod

cd "$(dirname "$0")/../server"

echo "==> Installing dependencies"
mix deps.get --only prod

echo "==> Compiling"
mix compile

echo "==> Building assets"
cd assets && npm ci && cd ..
mix assets.deploy

echo "==> Building release"
mix release

echo "==> Release built at server/_build/prod/rel/termigate/"
