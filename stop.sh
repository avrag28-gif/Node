#!/bin/bash

# NodeTrade MT5 - Stop All Services Script
# Usage: ./stop.sh

echo ""
echo "🛑 Shutting down NodeTrade MT5..."
echo ""

pkill -f "node.*server" 2>/dev/null || echo "No node processes to kill"
pkill -f "uvicorn.*main:app" 2>/dev/null || echo "No python processes to kill"
pkill -f "nginx" 2>/dev/null || echo "No nginx processes to kill"

echo ""
echo "✅ All services stopped!"
echo ""
