#!/bin/sh
# Usage: docker/run.sh <command...>   (run from the spike folder). One cold container, 2 GiB limit, linux/amd64.
cd "$(dirname "$0")/.." || exit 1
mkdir -p out/docker
exec docker run --rm --platform linux/amd64 --memory 2g --memory-swap 2g --cpus "${CPUS:-2}" \
  -e AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x \
  -v "$PWD/fixtures:/spike/fixtures:ro" -v "$PWD/fonts:/spike/fonts:ro" \
  -v "$PWD/out/docker:/spike/out" -v "$PWD/docker/measure.sh:/measure.sh:ro" \
  spike-render /measure.sh "$@"
