#!/bin/bash

# NodeTrade MT5 - Single Command Startup Script
# Usage: ./run.sh

echo "🚀 Starting NodeTrade MT5 Backend Server..."

# Kill any existing processes on ports 3000, 3001, 8010
echo "📋 Cleaning up existing processes..."
pkill -f "node.*server" 2>/dev/null || true
pkill -f "uvicorn.*main:app" 2>/dev/null || true
pkill -f "nginx" 2>/dev/null || true
sleep 1

# Check if Python venv exists
if [ ! -d ".venv" ]; then
    echo "❌ Python virtual environment not found. Creating..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install uvicorn fastapi pandas numpy scikit-learn tensorflow torch
else
    source .venv/bin/activate
fi

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    npm install
fi

# Start Python AI Service in background
echo "🤖 Starting Python AI Service on port 8010..."
cd ai_service
python -m uvicorn main:app --host 0.0.0.0 --port 8010 &
AI_PID=$!
cd ..

# Wait for AI service to start
sleep 3

# Start Node.js Server in background
echo "🟢 Starting Node.js Server on port 3000..."
npx ts-node server.ts &
NODE_PID=$!

# Wait for Node server to start
sleep 3

# Start Nginx (if available and configured)
if command -v nginx &> /dev/null && [ -f "nginx.conf" ]; then
    echo "🌐 Starting Nginx reverse proxy on port 80..."
    nginx -c "$(pwd)/nginx.conf" 2>/dev/null || echo "⚠️  Nginx config issue, skipping..."
fi

echo ""
echo "✅ NodeTrade MT5 Backend Server is running!"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "🌍 Public Access: http://0.0.0.0:3000"
echo "🤖 AI Service: http://localhost:8010"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Handle shutdown
cleanup() {
    echo ""
    echo "🛑 Shutting down NodeTrade MT5..."
    kill $NODE_PID 2>/dev/null || true
    kill $AI_PID 2>/dev/null || true
    pkill -f "nginx" 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
