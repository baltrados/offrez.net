#!/bin/bash
set -e

cd ~/offrly

echo "[1/4] git fetch origin main"
git fetch origin main

echo "[2/4] git checkout -B main origin/main"
git checkout -f -B main origin/main

echo "[3/4] git pull --ff-only origin main"
git pull --ff-only origin main

echo "[4/4] pm2 restart offrly"
pm2 restart offrly

echo "Deploy terminé."
curl -s http://localhost:3000/api/health
echo
