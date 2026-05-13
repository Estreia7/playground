#!/bin/bash
# Deploy playground to VPS
# Usage: bash deploy.sh

set -e

VPS="root@49.13.150.6"
REMOTE_DIR="/var/www/playground"

echo "=> Building locally..."
npm run build

echo "=> Pushing to GitHub..."
git push origin master

echo "=> Pulling on VPS..."
ssh $VPS "cd $REMOTE_DIR && git pull origin master"

echo "=> Installing dependencies on VPS..."
ssh $VPS "cd $REMOTE_DIR && npm install"

echo "=> Installing backend dependencies on VPS..."
ssh $VPS "cd $REMOTE_DIR/backend && npm install"

echo "=> Building on VPS..."
ssh $VPS "cd $REMOTE_DIR && npm run build"

echo "=> Restarting PM2..."
ssh $VPS "pm2 startOrReload $REMOTE_DIR/ecosystem.config.js"

echo "=> Done! Live at https://playground.bruno-dev.xyz"
