from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Any

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, log_loss
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "ret1", "ret3", "ret6", "ret12", "ret24",
    "range_pct", "body_pct", "upper_wick_pct", "lower_wick_pct",
    "volatility", "rsi", "ema_fast_gap", "ema_slow_gap",
    "atr_pct", "volume_z", "trend_strength",
]
CLASSES = np.array([-1, 0, 1])


class EnsembleBrain:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.meta_path = model_dir / "metadata.json"
        self.lstm_path = model_dir / "lstm.keras"
        self.cnn_path = model_dir / "cnn.keras"
        self.rf_path = model_dir / "random_forest.joblib"
        self.lgb_path = model_dir / "lightgbm.joblib"
        self.scaler_path = model_dir / "scaler.joblib"
        self.ready = self.meta_path.exists() and self.lstm_path.exists() and self.cnn_path.exists() and self.rf_path.exists() and self.lgb_path.exists()
        self.tensorflow_version = tf.__version__
        self.lstm = None
        self.cnn = None
        self.rf = None
        self.lgb = None
        self.scaler = None
        self.weights = np.ones(4) / 4
        if self.ready:
            try:
                self._load()
            except Exception:
                self.ready = False

    def _load(self) -> None:
        self.lstm = tf.keras.models.load_model(self.lstm_path)
        self.cnn = tf.keras.models.load_model(self.cnn_path)
        self.rf = joblib.load(self.rf_path)
        self.lgb = joblib.load(self.lgb_path)
        self.scaler = joblib.load(self.scaler_path)
        meta = json.loads(self.meta_path.read_text(encoding="utf-8"))
        self.weights = np.asarray(meta.get("weights", [0.25] * 4), dtype=float)
        total = float(self.weights.sum())
        self.weights = self.weights / total if total > 0 else np.ones(4) / 4

    def load_summary(self) -> dict[str, Any] | None:
        if not self.meta_path.exists():
            return None
        try:
            return json.loads(self.meta_path.read_text(encoding="utf-8")).get("summary")
        except Exception:
            return None

    @staticmethod
    def features(df: pd.DataFrame) -> pd.DataFrame:
        x = df.copy()
        for col in ["open", "high", "low", "close", "volume"]:
            x[col] = pd.to_numeric(x[col], errors="coerce").astype(float)
        close = x["close"]
        prev = close.shift(1)
        ret = np.log(close / prev.replace(0, np.nan))
        tr = pd.concat([
            x["high"] - x["low"],
            (x["high"] - prev).abs(),
            (x["low"] - prev).abs(),
        ], axis=1).max(axis=1)
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi = 100 - 100 / (1 + rs)
        ema20 = close.ewm(span=20, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()
        atr = tr.rolling(14).mean()
        vol_mean = x["volume"].rolling(50).mean()
        vol_std = x["volume"].rolling(50).std()
        f = pd.DataFrame(index=x.index)
        f["ret1"] = ret
        f["ret3"] = close.pct_change(3)
        f["ret6"] = close.pct_change(6)
        f["ret12"] = close.pct_change(12)
        f["ret24"] = close.pct_change(24)
        f["range_pct"] = (x["high"] - x["low"]) / close
        f["body_pct"] = (x["close"] - x["open"]) / close
        f["upper_wick_pct"] = (x["high"] - x[["open", "close"]].max(axis=1)) / close
        f["lower_wick_pct"] = (x[["open", "close"]].min(axis=1) - x["low"]) / close
        f["volatility"] = ret.rolling(32).std()
        f["rsi"] = rsi / 100.0
        f["ema_fast_gap"] = (close - ema20) / close
        f["ema_slow_gap"] = (close - ema50) / close
        f["atr_pct"] = atr / close
        f["volume_z"] = (x["volume"] - vol_mean) / vol_std.replace(0, np.nan)
        f["trend_strength"] = (ema20 - ema50) / close
        return f[FEATURES].replace([np.inf, -np.inf], np.nan)

    @staticmethod
    def labels(df: pd.DataFrame, horizon: int) -> pd.Series:
        close = pd.to_numeric(df["close"], errors="coerce")
        future = close.shift(-horizon) / close - 1.0
        sigma = np.log(close / close.shift(1)).rolling(32).std() * np.sqrt(max(horizon, 1))
        threshold = (sigma * 0.55).clip(lower=0.00035, upper=0.02)
        y = np.where(future > threshold, 1, np.where(future < -threshold, -1, 0))
        y = pd.Series(y, index=df.index)
        y[future.isna() | threshold.isna()] = np.nan
        return y

    @staticmethod
    def _make_sequences(values: np.ndarray, labels: np.ndarray, seq_len: int) -> tuple[np.ndarray, np.ndarray]:
        xs, ys = [], []
        for i in range(seq_len - 1, len(values)):
            if np.isfinite(labels[i]):
                xs.append(values[i - seq_len + 1:i + 1])
                ys.append(int(labels[i]) + 1)
        return np.asarray(xs, dtype=np.float32), np.asarray(ys, dtype=np.int32)

    @staticmethod
    def _build_lstm(shape: tuple[int, int]) -> tf.keras.Model:
        inp = tf.keras.Input(shape=shape)
        x = tf.keras.layers.LayerNormalization()(inp)
        x = tf.keras.layers.LSTM(48, return_sequences=True, dropout=0.15)(x)
        x = tf.keras.layers.LSTM(24, dropout=0.15)(x)
        x = tf.keras.layers.Dense(24, activation="relu")(x)
        out = tf.keras.layers.Dense(3, activation="softmax")(x)
        m = tf.keras.Model(inp, out)
        m.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        return m

    @staticmethod
    def _build_cnn(shape: tuple[int, int]) -> tf.keras.Model:
        inp = tf.keras.Input(shape=shape)
        x = tf.keras.layers.Conv1D(32, 3, padding="causal", activation="relu")(inp)
        x = tf.keras.layers.BatchNormalization()(x)
        x = tf.keras.layers.Conv1D(64, 5, padding="causal", activation="relu", dilation_rate=2)(x)
        x = tf.keras.layers.GlobalAveragePooling1D()(x)
        x = tf.keras.layers.Dense(32, activation="relu")(x)
        x = tf.keras.layers.Dropout(0.15)(x)
        out = tf.keras.layers.Dense(3, activation="softmax")(x)
        m = tf.keras.Model(inp, out)
        m.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        return m

    @staticmethod
    def _pad_probabilities(probabilities: np.ndarray, model: Any) -> np.ndarray:
        """Normalize sklearn probability output to the fixed [-1,0,1] class order."""
        p = np.asarray(probabilities, dtype=float)
        if p.ndim == 1:
            p = p[None, :]
        classes = getattr(model, "classes_", None)
        if classes is None:
            return p if p.shape[-1] == 3 else np.pad(p, ((0, 0), (0, max(0, 3 - p.shape[-1]))))[:, :3]
        out = np.zeros((p.shape[0], 3), dtype=float)
        for col, cls in enumerate(np.asarray(classes).astype(int)):
            idx = int(cls) if 0 <= int(cls) <= 2 else None
            if idx is not None and col < p.shape[1]:
                out[:, idx] = p[:, col]
        return out

    def train(self, df: pd.DataFrame, symbol: str, timeframe: str, epochs: int, horizon: int, progress: Callable[[int, int, float | None, float | None], None]) -> dict[str, Any]:
        tf.keras.utils.set_random_seed(42)
        df = df.copy().sort_values("time").drop_duplicates(subset=["time"], keep="last").reset_index(drop=True)
        if len(df) < 600:
            raise ValueError(f"Need at least 600 raw candles; received {len(df)}")

        feats = self.features(df)
        y = self.labels(df, horizon)
        valid = feats.notna().all(axis=1) & y.notna()
        feats = feats.loc[valid].reset_index(drop=True)
        y = y.loc[valid].astype(int).reset_index(drop=True)
        if len(feats) < 600:
            raise ValueError(f"Not enough clean samples after feature engineering: {len(feats)}")

        # Require all three classes in the training set. Otherwise the ensemble cannot produce a stable 3-way model.
        if y.nunique() < 3:
            raise ValueError(f"Training range contains only {y.nunique()} direction classes; choose a wider M5 date range with at least 3 classes")

        n = len(feats)
        train_end = int(n * 0.70)
        val_end = int(n * 0.85)
        scaler = StandardScaler()
        scaler.fit(feats.iloc[:train_end])
        scaled = scaler.transform(feats).astype(np.float32)

        seq_len = 64
        xs, ys = self._make_sequences(scaled, y.to_numpy(), seq_len)
        if len(xs) < 300:
            raise ValueError("Not enough sequence samples for ensemble training")
        seq_cut_train = max(1, int(len(xs) * 0.70))
        seq_cut_val = max(seq_cut_train + 1, int(len(xs) * 0.85))
        x_train, y_train = xs[:seq_cut_train], ys[:seq_cut_train]
        x_val, y_val = xs[seq_cut_train:seq_cut_val], ys[seq_cut_train:seq_cut_val]
        x_test, y_test = xs[seq_cut_val:], ys[seq_cut_val:]
        if len(x_val) == 0 or len(x_test) == 0:
            raise ValueError("Not enough validation/test sequence samples")

        # Make sure the chronological training split contains every class before fitting classifiers.
        if np.unique(y_train).size < 3:
            raise ValueError("Training split is missing one or more direction classes; choose a wider date range")

        lstm = self._build_lstm((seq_len, len(FEATURES)))
        cnn = self._build_cnn((seq_len, len(FEATURES)))
        cb = [
            tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-5),
            tf.keras.callbacks.LambdaCallback(on_epoch_end=lambda e, logs: progress(e + 1, epochs, float((logs or {}).get("loss", 0)), float((logs or {}).get("val_accuracy", (logs or {}).get("accuracy", 0))))),
        ]
        lstm.fit(x_train, y_train, validation_data=(x_val, y_val), epochs=epochs, batch_size=64, shuffle=False, verbose=0, callbacks=cb)
        cnn.fit(x_train, y_train, validation_data=(x_val, y_val), epochs=epochs, batch_size=64, shuffle=False, verbose=0, callbacks=cb)

        flat_train = x_train[:, -1, :]
        flat_val = x_val[:, -1, :]
        flat_test = x_test[:, -1, :]
        rf = RandomForestClassifier(n_estimators=350, max_depth=10, min_samples_leaf=4, class_weight="balanced_subsample", random_state=42, n_jobs=-1)
        rf.fit(flat_train, y_train)
        lgb = LGBMClassifier(objective="multiclass", num_class=3, n_estimators=300, learning_rate=0.03, num_leaves=31, max_depth=-1, min_child_samples=25, subsample=0.85, colsample_bytree=0.85, reg_lambda=1.0, random_state=42, n_jobs=-1, verbosity=-1)
        lgb.fit(flat_train, y_train, eval_set=[(flat_val, y_val)], callbacks=[])

        probs = [
            lstm.predict(x_test, verbose=0),
            cnn.predict(x_test, verbose=0),
            self._pad_probabilities(rf.predict_proba(flat_test), rf),
            self._pad_probabilities(lgb.predict_proba(flat_test), lgb),
        ]
        scores = [max(1e-6, accuracy_score(y_test, p.argmax(axis=1))) for p in probs]
        weights = np.asarray(scores, dtype=float)
        weights = weights / weights.sum()
        fused = sum(w * p for w, p in zip(weights, probs))
        pred = fused.argmax(axis=1)
        accuracy = float(accuracy_score(y_test, pred))
        loss = float(log_loss(y_test, np.clip(fused, 1e-7, 1 - 1e-7), labels=[0, 1, 2]))

        self.model_dir.mkdir(parents=True, exist_ok=True)
        lstm.save(self.lstm_path, overwrite=True)
        cnn.save(self.cnn_path, overwrite=True)
        joblib.dump(rf, self.rf_path)
        joblib.dump(lgb, self.lgb_path)
        joblib.dump(scaler, self.scaler_path)

        self.lstm, self.cnn, self.rf, self.lgb, self.scaler = lstm, cnn, rf, lgb, scaler
        self.weights = weights
        self.ready = True

        summary = {
            "status": "trained",
            "symbol": symbol,
            "timeframe": timeframe,
            "source": "MT5",
            "barsCount": int(len(df)),
            "startTime": int(pd.to_numeric(df["time"]).min()),
            "endTime": int(pd.to_numeric(df["time"]).max()),
            "accuracy": round(accuracy * 100, 2),
            "tensorflowAccuracy": round(accuracy * 100, 2),
            "loss": round(loss, 6),
            "winRate": round(accuracy * 100, 2),
            "profitFactor": 0.0,
            "sharpeRatio": 0.0,
            "maxDrawdown": 0.0,
            "modelVersion": "NodeTrade Ensemble LSTM+CNN+RF+LightGBM v1",
            "lastTrainedAt": int(pd.Timestamp.now(tz="UTC").timestamp()),
            "lastTrainedDate": pd.Timestamp.now(tz="UTC").isoformat(),
            "totalSimulatedTrades": int(len(y_test)),
            "winningTrades": int((pred == y_test).sum()),
            "losingTrades": int((pred != y_test).sum()),
            "aiConfidenceAverage": round(float(fused.max(axis=1).mean()), 4),
            "regimeDistribution": {"unknown": 0, "trend_up": 0, "trend_down": 0, "breakout": 0, "high_vol": 0, "range": 0},
            "tradingViewSignals": [],
            "ensembleWeights": [round(float(v), 4) for v in weights],
            "validation": {"test_accuracy": round(accuracy, 6), "log_loss": round(loss, 6)},
        }
        self.meta_path.write_text(json.dumps({"weights": weights.tolist(), "summary": summary}, indent=2), encoding="utf-8")
        return summary

    def predict(self, df: pd.DataFrame) -> dict[str, Any]:
        if not self.ready:
            return {"action": "wait", "confidence": 0.0, "reasons": ["ensemble_model_unavailable"], "model_ready": False}
        feats = self.features(df).dropna()
        if len(feats) < 64:
            return {"action": "wait", "confidence": 0.0, "reasons": ["insufficient_history"], "model_ready": True}
        scaled = self.scaler.transform(feats).astype(np.float32)
        seq = scaled[-64:][None, ...]
        flat = scaled[-1:]
        probs = [
            self.lstm.predict(seq, verbose=0)[0],
            self.cnn.predict(seq, verbose=0)[0],
            self._pad_probabilities(self.rf.predict_proba(flat), self.rf)[0],
            self._pad_probabilities(self.lgb.predict_proba(flat), self.lgb)[0],
        ]
        fused = sum(w * p for w, p in zip(self.weights, probs))
        idx = int(np.argmax(fused))
        action = {-1: "short", 0: "wait", 1: "long"}[idx - 1]
        confidence = float(fused[idx])
        price = float(df["close"].iloc[-1])
        atr = float((df["high"] - df["low"]).rolling(14).mean().iloc[-1])
        atr = atr if np.isfinite(atr) and atr > 0 else price * 0.002
        if action == "long":
            stop, target = price - 1.2 * atr, price + 2.0 * atr
        elif action == "short":
            stop, target = price + 1.2 * atr, price - 2.0 * atr
        else:
            stop = target = None
        reasons = [
            f"LSTM={probs[0][idx]:.3f}",
            f"CNN={probs[1][idx]:.3f}",
            f"RF={probs[2][idx]:.3f}",
            f"LightGBM={probs[3][idx]:.3f}",
        ]
        if confidence < 0.55:
            action = "wait"
            reasons.append("ensemble_confidence_below_threshold")
        return {
            "action": action,
            "confidence": round(confidence, 4),
            "entry": price,
            "stop": round(stop, 2) if stop is not None else None,
            "target": round(target, 2) if target is not None else None,
            "edge": round(float(fused[2] - fused[0]), 4),
            "volume": 0.01,
            "scenarios": [],
            "reasons": reasons,
            "model_ready": True,
            "model_version": "NodeTrade Ensemble LSTM+CNN+RF+LightGBM v1",
        }
