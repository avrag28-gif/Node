from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ensemble import EnsembleBrain

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "mt5"
MODEL_DIR = ROOT / "models" / "ensemble"
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="NodeTrade Python Quant Brain", version="1.0.0")
brain = EnsembleBrain(MODEL_DIR)
lock = threading.Lock()
training_state: dict[str, Any] = {
    "isTraining": False,
    "status": "idle",
    "currentEpoch": 0,
    "totalEpochs": 0,
    "currentLoss": None,
    "currentAccuracy": None,
    "summary": brain.load_summary(),
    "error": None,
}


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class IngestRequest(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "15m"
    candles: list[Candle] = Field(default_factory=list)


class TrainRequest(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "15m"
    startDate: str | None = None
    endDate: str | None = None
    epochs: int = 20
    horizon: int = 10


class PredictRequest(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "15m"
    candles: list[Candle]


def csv_path(symbol: str, timeframe: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in symbol)
    tf = "".join(c if c.isalnum() else "_" for c in timeframe)
    return DATA_DIR / f"{safe}_{tf}.csv"


def append_candles(req: IngestRequest) -> int:
    if not req.candles:
        return 0
    path = csv_path(req.symbol, req.timeframe)
    rows = [c.model_dump() for c in req.candles]
    incoming = pd.DataFrame(rows)
    incoming["symbol"] = req.symbol
    incoming["timeframe"] = req.timeframe
    incoming = incoming.drop_duplicates(subset=["time"], keep="last").sort_values("time")

    with lock:
        if path.exists():
            old = pd.read_csv(path)
            combined = pd.concat([old, incoming], ignore_index=True)
            combined = combined.drop_duplicates(subset=["time"], keep="last").sort_values("time")
        else:
            combined = incoming
        combined.to_csv(path, index=False)
    return len(incoming)


def load_range(symbol: str, timeframe: str, start: str | None, end: str | None) -> pd.DataFrame:
    path = csv_path(symbol, timeframe)
    if not path.exists():
        raise HTTPException(409, "No MT5 dataset yet. Attach the EA and let it stream data first.")
    df = pd.read_csv(path)
    if df.empty:
        raise HTTPException(409, "MT5 dataset is empty")
    df["time"] = pd.to_numeric(df["time"], errors="coerce")
    df = df.dropna(subset=["time"]).sort_values("time")
    if start:
        ts = int(pd.Timestamp(start, tz="UTC").timestamp()) if "T" in start else int(pd.Timestamp(start, tz="UTC").timestamp())
        df = df[df["time"] >= ts]
    if end:
        ts = int(pd.Timestamp(end, tz="UTC").timestamp()) + 86399
        df = df[df["time"] <= ts]
    return df.reset_index(drop=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "nodetrade-python-ai",
        "tensorflow": brain.tensorflow_version,
        "model_ready": brain.ready,
        "data_dir": str(DATA_DIR),
    }


@app.get("/training/status")
def training_status() -> dict[str, Any]:
    return training_state.copy()


@app.post("/ingest")
def ingest(req: IngestRequest) -> dict[str, Any]:
    return {"ok": True, "stored": append_candles(req)}


@app.post("/train")
def train(req: TrainRequest) -> dict[str, Any]:
    global training_state
    if training_state["isTraining"]:
        return {"ok": True, "status": "training", "summary": training_state.get("summary")}

    df = load_range(req.symbol, req.timeframe, req.startDate, req.endDate)
    if len(df) < 600:
        raise HTTPException(422, f"Need at least 600 MT5 candles; received {len(df)}")

    training_state.update({
        "isTraining": True,
        "status": "training",
        "currentEpoch": 0,
        "totalEpochs": max(1, req.epochs),
        "currentLoss": None,
        "currentAccuracy": None,
        "error": None,
    })

    def run() -> None:
        try:
            def progress(epoch: int, total: int, loss: float | None, acc: float | None) -> None:
                training_state.update({
                    "currentEpoch": epoch,
                    "totalEpochs": total,
                    "currentLoss": loss,
                    "currentAccuracy": acc,
                })

            summary = brain.train(df, req.symbol, req.timeframe, max(1, req.epochs), req.horizon, progress)
            training_state.update({
                "isTraining": False,
                "status": "completed",
                "summary": summary,
                "error": None,
            })
        except Exception as exc:
            training_state.update({
                "isTraining": False,
                "status": "error",
                "error": str(exc),
            })

    threading.Thread(target=run, daemon=True, name="nodetrade-ai-training").start()
    return {"ok": True, "status": "training_started", "rows": len(df)}


@app.post("/predict")
def predict(req: PredictRequest) -> dict[str, Any]:
    if len(req.candles) < 80:
        return {"action": "wait", "confidence": 0.0, "reasons": ["insufficient_history"], "model_ready": brain.ready}
    df = pd.DataFrame([c.model_dump() for c in req.candles])
    result = brain.predict(df)
    return result
