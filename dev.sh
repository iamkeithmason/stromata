#!/bin/bash
# Restart the Stromata dev server cleanly.
# Run this any time you get a 500 error or stale bundle warning.

echo "→ Stopping any running dev server…"
pkill -f "next dev" 2>/dev/null
sleep 1

echo "→ Clearing build cache…"
rm -rf .next

echo "→ Starting fresh…"
npm run dev
