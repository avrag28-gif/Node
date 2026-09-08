# 🚀 NodeTrade MT5 - One Command Setup

## Cara Pakai

### Linux/Mac (Terminal)
```bash
./start.sh
```

### Windows (PowerShell/CMD)
```cmd
start.bat
```

## Fitur
✅ Auto cleanup proses lama
✅ Auto install dependencies (Node.js + Python)
✅ Start AI Service + Node.js Server + Nginx
✅ Konfigurasi otomatis untuk akses internet (0.0.0.0)
✅ Graceful shutdown dengan Ctrl+C

## Akses Server
- **Direct**: http://0.0.0.0:3000
- **Via Nginx**: http://localhost:80

## Stop Server
- **Linux/Mac**: `./stop.sh` atau Ctrl+C
- **Windows**: `stop.bat` atau Ctrl+C

## Requirements
- Node.js 18+
- Python 3.8+
- Nginx (optional, untuk production)
