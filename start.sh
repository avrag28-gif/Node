#!/bin/bash

# NodeTrade MT5 - One Command Startup Script
# Cara pakai: ./start.sh atau bash start.sh

echo "🚀 NodeTrade MT5 - Starting Server..."

# Cleanup proses lama
pkill -f "node.*server" 2>/dev/null || true
pkill -f "python.*ai_service" 2>/dev/null || true
sudo systemctl stop nginx 2>/dev/null || true

# Install dependencies kalau belum ada
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Install Python dependencies
if ! python3 -c "import flask" 2>/dev/null; then
    echo "🐍 Installing Python dependencies..."
    pip3 install flask flask-cors numpy scikit-learn requests
fi

# Setup Nginx
echo "⚙️ Setting up Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/nodetrade || echo "Nginx config skipped (may need sudo)"
sudo ln -sf /etc/nginx/sites-available/nodetrade /etc/nginx/sites-enabled/ || true
sudo nginx -t && sudo systemctl restart nginx || echo "Nginx setup skipped (run manually if needed)"

# Start AI Service in background
echo "🤖 Starting AI Service..."
cd ai_service && python3 app.py &
cd ..

# Wait for AI service
sleep 2

# Start Node.js Server
echo "🌐 Starting NodeTrade Server on http://0.0.0.0:3000..."
node server.ts

# Handle shutdown
trap "echo 'Stopping...'; pkill -f 'node.*server'; pkill -f 'python.*ai_service'; exit" INT TERM EXIT
