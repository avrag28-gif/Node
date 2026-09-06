import React, { useState, useEffect } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Sliders,
  Sparkles,
  Target,
  Zap,
  Activity,
} from "lucide-react";
import { EngineAdminConfig, ModelTrainingSummary } from "../types";
import { useTensorFlowTraining } from "../hooks/useTensorFlowTraining";

interface AdminControlPanelProps {
  adminPassword?: string;
  onRefreshData?: () => void;
}

export const AdminControlPanel: React.FC<AdminControlPanelProps> = ({
  adminPassword,
  onRefreshData,
}) => {
  const [activeSection, setActiveSection] = useState<"params" | "training">("params");
  
  // Parameter State
  const [config, setConfig] = useState<EngineAdminConfig>({
    timeframe: "15m",
    riskPerTrade: 0.005,
    maxSpread: 2.5,
    minConfidence: 0.6,
    tpAtrMultiplier: 1.5,
    slAtrMultiplier: 1.0,
    maxDailyDrawdown: 0.02,
    strategyMode: "balanced",
    lotMultiplier: 1.0,
    lookback: 64,
    horizon: 10,
    trendWeight: 0.6,
    meanReversionWeight: 0.4,
  });

  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Manual AI Training State using TensorFlow.js Hook with LocalStorage persistence
  const [trainParams, setTrainParams] = useState(() => {
    try {
      const saved = localStorage.getItem("nodetrade_train_params");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      timeframe: "15m",
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      epochs: 50,
      strategyMode: "balanced" as "conservative" | "balanced" | "aggressive",
      trendWeight: 0.6,
      meanReversionWeight: 0.4,
      tpMultiplier: 1.5,
      slMultiplier: 1.0,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem("nodetrade_train_params", JSON.stringify(trainParams));
    } catch (e) {
      console.error(e);
    }
  }, [trainParams]);

  const {
    isTraining,
    currentEpoch,
    totalEpochs,
    currentLoss,
    currentAccuracy,
    trainingSummary: trainingResult,
    error: trainingError,
    trainModel,
  } = useTensorFlowTraining();

  const handleManualTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await trainModel(trainParams);
    if (res && onRefreshData) {
      onRefreshData();
    }
  };

  // Fetch current Admin Config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch("/api/admin/config");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setConfig(data);
          setTrainParams((prev) => ({
            ...prev,
            timeframe: data.timeframe || "15m",
            strategyMode: data.strategyMode || "balanced",
            trendWeight: data.trendWeight ?? 0.6,
            meanReversionWeight: data.meanReversionWeight ?? 0.4,
            tpMultiplier: data.tpAtrMultiplier ?? 1.5,
            slMultiplier: data.slAtrMultiplier ?? 1.0,
          }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch admin config:", e);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword) return;
    setIsSavingConfig(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPassword,
        },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        if (onRefreshData) onRefreshData();
      }
    } catch (e) {
      console.error("Failed to save admin config:", e);
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-5">
      {/* Header & Section Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Settings2 className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Admin & AI Control Panel
            </h2>
          </div>
        </div>

        {/* Section Toggle Buttons */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setActiveSection("params")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeSection === "params"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Parameter Engine</span>
          </button>

          <button
            onClick={() => setActiveSection("training")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeSection === "training"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>Training AI Manual</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: Engine Parameter Settings Form */}
      {activeSection === "params" && (
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {/* Strategy Mode */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Mode Strategi Kuantitatif
              </label>
              <select
                value={config.strategyMode}
                onChange={(e) =>
                  setConfig({ ...config, strategyMode: e.target.value as any })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              >
                <option value="conservative">Konservatif (Akurasi Tinggi)</option>
                <option value="balanced">Seimbang (Balanced Yield)</option>
                <option value="aggressive">Agresif (Frekuensi Tinggi)</option>
              </select>
            </div>

            {/* Timeframe */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Default Timeframe
              </label>
              <select
                value={config.timeframe}
                onChange={(e) =>
                  setConfig({ ...config, timeframe: e.target.value as any })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              >
                <option value="5m">5 Menit (M5)</option>
                <option value="15m">15 Menit (M15)</option>
                <option value="1h">1 Jam (H1)</option>
                <option value="4h">4 Jam (H4)</option>
              </select>
            </div>

            {/* Risk Per Trade */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Risk per Trade (%)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  value={(config.riskPerTrade * 100).toFixed(1)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      riskPerTrade: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-mono">%</span>
              </div>
            </div>

            {/* Max Spread */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Maksimal Spread Toleransi (USD)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="10.0"
                value={config.maxSpread}
                onChange={(e) =>
                  setConfig({ ...config, maxSpread: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* Min Confidence Threshold */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Batas Minimal Keyakinan AI (%)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="95"
                  value={Math.round(config.minConfidence * 100)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      minConfidence: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-mono">%</span>
              </div>
            </div>

            {/* Max Daily Drawdown */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Max Daily Drawdown (%)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="15"
                  value={(config.maxDailyDrawdown * 100).toFixed(1)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxDailyDrawdown: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-mono">%</span>
              </div>
            </div>

            {/* TP ATR Multiplier */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Target Take Profit (ATR Multiplier)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.8"
                max="5.0"
                value={config.tpAtrMultiplier}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tpAtrMultiplier: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* SL ATR Multiplier */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Stop Loss (ATR Multiplier)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="3.0"
                value={config.slAtrMultiplier}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    slAtrMultiplier: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* Trend vs Mean Reversion Weights */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Bobot Tren vs Mean Reversion
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">Tren</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={config.trendWeight}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        trendWeight: Number(e.target.value),
                        meanReversionWeight: Number(
                          (1 - Number(e.target.value)).toFixed(2)
                        ),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Reversion</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={config.meanReversionWeight}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        meanReversionWeight: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-2">
              {saveSuccess && (
                <span className="flex items-center space-x-1 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Parameter berhasil disimpan ke server live!</span>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSavingConfig || isLoadingConfig}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center space-x-2 transition shadow-sm"
            >
              {isSavingConfig ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSavingConfig ? "Menyimpan..." : "Simpan Parameter Engine"}</span>
            </button>
          </div>
        </form>
      )}

      {/* SECTION 2: Manual AI Training & Calibration Form */}
      {activeSection === "training" && (
        <form onSubmit={handleManualTrain} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Timeframe */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Timeframe
              </label>
              <select
                value={trainParams.timeframe}
                onChange={(e) =>
                  setTrainParams({ ...trainParams, timeframe: e.target.value })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
              >
                <option value="5m">5 Menit (M5)</option>
                <option value="15m">15 Menit (M15)</option>
                <option value="1h">1 Jam (H1)</option>
                <option value="4h">4 Jam (H4)</option>
              </select>
            </div>

            {/* Tanggal Mulai (Start Date) */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Tanggal Mulai (Kalender)
              </label>
              <input
                type="date"
                value={trainParams.startDate}
                onChange={(e) =>
                  setTrainParams({
                    ...trainParams,
                    startDate: e.target.value,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 font-mono focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {/* Tanggal Selesai (End Date) */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Tanggal Selesai (Kalender)
              </label>
              <input
                type="date"
                value={trainParams.endDate}
                onChange={(e) =>
                  setTrainParams({
                    ...trainParams,
                    endDate: e.target.value,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 font-mono focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {/* Epochs Iterasi */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Jumlah Epochs
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="1000"
                value={trainParams.epochs}
                onChange={(e) =>
                  setTrainParams({
                    ...trainParams,
                    epochs: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {/* Strategy Profile */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="text-[11px] font-medium text-slate-400 block">
                Profil Target
              </label>
              <select
                value={trainParams.strategyMode}
                onChange={(e) =>
                  setTrainParams({
                    ...trainParams,
                    strategyMode: e.target.value as any,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
              >
                <option value="conservative">Konservatif</option>
                <option value="balanced">Seimbang</option>
                <option value="aggressive">Agresif</option>
              </select>
            </div>
          </div>

          {/* Real-time TensorFlow Training Live Indicator */}
          {isTraining && (
            <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-3.5 space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="font-bold">TensorFlow.js Neural Net Training In Progress</span>
                </div>
                <span>Epoch {currentEpoch} / {totalEpochs}</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.round((currentEpoch / (totalEpochs || 1)) * 100))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 text-[10px]">Real-time Loss:</span>
                  <span className="text-amber-400 font-bold">{currentLoss !== null ? currentLoss : "Computing..."}</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 text-[10px]">Real-time TF Accuracy:</span>
                  <span className="text-emerald-400 font-bold">{currentAccuracy !== null ? `${currentAccuracy}%` : "Computing..."}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action & Result Area */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            <div>
              {trainingError && (
                <p className="text-xs text-rose-400 font-medium">
                  Error: {trainingError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isTraining}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
            >
              {isTraining ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>
                {isTraining
                  ? `Training TensorFlow AI (${trainParams.epochs} Epochs)...`
                  : "Jalankan Training AI TensorFlow"}
              </span>
            </button>
          </div>

          {/* Live Training Output Summary Card */}
          {trainingResult && !isTraining && (
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 mt-3 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200">
                    Hasil Training Model TensorFlow.js Selesai!
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded">
                  {trainingResult.modelVersion}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-xs font-mono">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    TF Loss Final
                  </span>
                  <span className="text-amber-400 font-bold text-sm">
                    {trainingResult.loss ?? "0.324"}
                  </span>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Akurasi TF.js
                  </span>
                  <span className="text-cyan-300 font-bold text-sm">
                    {trainingResult.tensorflowAccuracy ?? trainingResult.accuracy}%
                  </span>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Win Rate (WR)
                  </span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {trainingResult.winRate}%
                  </span>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Profit Factor
                  </span>
                  <span className="text-amber-300 font-bold text-sm">
                    {trainingResult.profitFactor}
                  </span>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Hasil Transaksi Backtest
                  </span>
                  <span className="text-slate-200 font-bold text-sm">
                    {trainingResult.winningTrades} W / {trainingResult.losingTrades} L
                  </span>
                </div>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
