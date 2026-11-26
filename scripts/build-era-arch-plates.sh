#!/usr/bin/env bash
# Rebuild the small era plates drawn behind the initial of a portrait-less
# author (lib/eras/plates.ts → eraArchPlate). Run after changing a default era
# plate in public/plates/eras/. Needs ImageMagick (`convert`).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/plates/eras/arch
for f in public/plates/eras/*.jpg; do
  s=$(basename "$f" .jpg)
  convert "$f" -resize 960x480 -strip -interlace Plane -sampling-factor 4:2:0 -quality 55 "public/plates/eras/arch/$s.jpg"
done
ls -l public/plates/eras/arch
