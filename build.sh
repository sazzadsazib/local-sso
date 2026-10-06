#!/bin/bash
set -e

echo "1. Building frontend (TypeScript + Tailwind CSS)..."
cd web
npm install
npm run build
cd ..

echo "2. Building single standalone Go binary with embedded web..."
go build -o sso-local .

echo "Done! Produced standalone binary: ./sso-local"
