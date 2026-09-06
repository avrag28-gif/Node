import React, { useState, useEffect } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  History,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { ModelTrainingSummary } from "../types";

export interface TrainingIterationRecord {
  id: string;
  iterationNum: number;
  timestamp: number;
  formattedTime: string;
  modelVersion: string;
  timeframe: string;
  barsCount: number;
  loss: number;
  accuracy: number;
  winRate: number;
  profitFactor: number;
}

interface AiModelStatsCardProps {
  trainingSummary: ModelTrainingSummary | null;
  isLoading?: boolean;
}

const STORAGE_KEY_ITERATIONS = "nodetrade_tf_iterations_history";

export const AiModelStatsCard: React.FC<AiModelStatsCardProps> = ({
  trainingSummary,
  isLoading,
}) => {
  const [iterationsHistory, setIterationsHistory] = useState<TrainingIterationRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ITERATIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to read iteration history from localStorage", e);
    }
    return [];
  });

  // Track & update iteration list dynamically when a real training summary is produced
  useEffect(() => {
    if (!trainingSummary) return;

    const acc = trainingSummary.tensorflowAccuracy ?? trainingSummary.accuracy;
    const lossVal = trainingSummary.loss ?? Number((1 - (acc / 100)).toFixed(4));
    const ts = trainingSummary.lastTrainedAt ? trainingSummary.lastTrainedAt * 1000 : Date.now();

    setIterationsHistory((prev) => {
      // Check if top iteration matches current training session
      if (
        prev.length > 0 &&
        Math.abs(prev[0].timestamp - ts) < 2000 &&
        prev[0].barsCount === trainingSummary.barsCount
      ) {
        return prev;
      }

      const nextNum = (prev[0]?.iterationNum || 0) + 1;
      const newRecord: TrainingIterationRecord = {
        id: `iter-${nextNum}-${Date.now()}`,
        iterationNum: nextNum,
        timestamp: ts,
        formattedTime: new Date(ts).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        modelVersion: trainingSummary.modelVersion || `NodeTrade-LSTM v3.${nextNum}`,
        timeframe: trainingSummary.timeframe || "15m",
        barsCount: trainingSummary.barsCount,
        loss: Number(lossVal),
        accuracy: Number(acc),
        winRate: Number(trainingSummary.winRate),
        profitFactor: Number(trainingSummary.profitFactor),
      };

      const updated = [newRecord, ...prev].slice(0, 5);
      try {
        localStorage.setItem(STORAGE_KEY_ITERATIONS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save iteration history to localStorage", e);
      }
      return updated;
    });
  }, [trainingSummary]);

  if (isLoading && !trainingSummary) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Cpu className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Menganalisis & Mengkalibrasi data pasar real...</span>
        </div>
      </div>
    );
  }

  if (!trainingSummary) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm text-xs text-slate-400">
        Belum ada data kalibrasi pasar. Jalankan analisis atau training untuk memperbarui model.
      </div>
    );
  }

  const {
    winRate,
    accuracy,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    modelVersion,
    winningTrades,
    losingTrades,
    barsCount,
    lastTrainedDate,
    lastTrainedAt,
  } = trainingSummary;

  const formattedDate =
    lastTrainedDate ||
    (lastTrainedAt
      ? new Date(lastTrainedAt * 1000).toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Terbaru");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3.5">
      {/* Top Header: Model Identity & Auto-Calibrated Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-slate-100">{modelVersion}</h3>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5 font-mono">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>{formattedDate}</span>
              <span className="text-slate-600">•</span>
              <span>Dataset: {barsCount} Bars ({trainingSummary.timeframe.toUpperCase()})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main AI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Metric 1: Win Rate */}
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center space-x-1">
              <Target className="w-3 h-3 text-emerald-400" />
              <span>Win Rate</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {winRate.toFixed(1)}%
          </div>
        </div>

        {/* Metric 2: Directional Accuracy */}
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Akurasi Model</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-cyan-300">
            {trainingSummary.tensorflowAccuracy ?? accuracy.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {trainingSummary.loss !== undefined ? `Loss: ${trainingSummary.loss}` : `${winningTrades}W / ${losingTrades}L`}
          </div>
        </div>

        {/* Metric 3: Profit Factor */}
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center space-x-1">
              <TrendingUp className="w-3 h-3 text-amber-400" />
              <span>Profit Factor</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-amber-300">
            {profitFactor.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Sharpe: {sharpeRatio.toFixed(2)}
          </div>
        </div>

        {/* Metric 4: Max Drawdown */}
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center space-x-1">
              <Activity className="w-3 h-3 text-rose-400" />
              <span>Max Drawdown</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-200">
            {maxDrawdown.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* List View: Last 5 Successful Training Iterations */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span>Riwayat 5 Iterasi Training Terakhir</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">
            {iterationsHistory.length} Iterasi Tersimpan
          </span>
        </div>

        <div className="space-y-1.5">
          {iterationsHistory.map((iter, idx) => (
            <div
              key={iter.id}
              className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold font-mono flex items-center justify-center shrink-0">
                  #{iter.iterationNum}
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-200">{iter.modelVersion}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {iter.timeframe.toUpperCase()} ({iter.barsCount} Bars)
                    </span>
                    {idx === 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{iter.formattedTime}</span>
                  </div>
                </div>
              </div>

              {/* Loss, Accuracy, Win Rate Metrics */}
              <div className="flex items-center gap-3 sm:gap-4 font-mono text-[11px] shrink-0 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-800/60">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-sans">Loss</div>
                  <div className="text-slate-200 font-semibold">{iter.loss.toFixed(4)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-sans">Akurasi</div>
                  <div className="text-cyan-400 font-bold">{iter.accuracy.toFixed(1)}%</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-sans">Win Rate</div>
                  <div className="text-emerald-400 font-bold">{iter.winRate.toFixed(1)}%</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-sans">PF</div>
                  <div className="text-amber-300 font-semibold">{iter.profitFactor.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


