#!/bin/bash
set -e

cd ~/offrly

echo "[1/5] git fetch origin main"
git fetch origin main

echo "[2/5] git checkout -B main origin/main"
git checkout -f -B main origin/main

echo "[3/5] git pull --ff-only origin main"
git pull --ff-only origin main

# Installe exactement les dépendances du package-lock.json (sans devDependencies).
# Indispensable depuis le passage à Express 5 / Helmet 8 : sans cette étape, l'ancien
# node_modules (Express 4) resterait en place et le serveur ne fonctionnerait pas correctement.
echo "[4/5] npm ci --omit=dev"
npm ci --omit=dev

echo "[5/5] pm2 restart offrly"
pm2 restart offrly

echo "Deploy terminé."
curl -s http://localhost:3000/api/health
echo
