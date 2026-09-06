import React, { useState, useEffect } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  History,
  Play,
  RefreshCw,
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

export const AiModelStatsCard: React.FC<AiModelStatsCardProps> = ({ trainingSummary, isLoading }) => {
  const [iterationsHistory, setIterationsHistory] = useState<TrainingIterationRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ITERATIONS);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainError, setRetrainError] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<ModelTrainingSummary | null>(trainingSummary);

  useEffect(() => { if (trainingSummary) setLocalSummary(trainingSummary); }, [trainingSummary]);

  useEffect(() => {
    if (!isRetraining) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/market/training-status");
        if (!res.ok) return;
        const data = await res.json();
        if (data.summary) setLocalSummary(data.summary);
        if (!data.isTraining) setIsRetraining(false);
      } catch {}
    }, 1000);
    return () => clearInterval(timer);
  }, [isRetraining]);

  useEffect(() => {
    if (!localSummary) return;
    const acc = localSummary.tensorflowAccuracy ?? localSummary.accuracy;
    const lossVal = localSummary.loss ?? Number((1 - acc / 100).toFixed(4));
    const ts = localSummary.lastTrainedAt ? localSummary.lastTrainedAt * 1000 : Date.now();
    setIterationsHistory((prev) => {
      if (prev.length > 0 && Math.abs(prev[0].timestamp - ts) < 2000 && prev[0].barsCount === localSummary.barsCount) return prev;
      const nextNum = (prev[0]?.iterationNum || 0) + 1;
      const record: TrainingIterationRecord = {
        id: `iter-${nextNum}-${Date.now()}`,
        iterationNum: nextNum,
        timestamp: ts,
        formattedTime: new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        modelVersion: localSummary.modelVersion || `NodeTrade-LSTM v3.${nextNum}`,
        timeframe: localSummary.timeframe || "15m",
        barsCount: localSummary.barsCount,
        loss: Number(lossVal), accuracy: Number(acc), winRate: Number(localSummary.winRate), profitFactor: Number(localSummary.profitFactor),
      };
      const updated = [record, ...prev].slice(0, 5);
      try { localStorage.setItem(STORAGE_KEY_ITERATIONS, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [localSummary]);

  const handleQuickRetrain = async () => {
    if (isRetraining) return;
    setIsRetraining(true);
    setRetrainError(null);
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
    try {
      const res = await fetch("/api/market/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeframe: "15m",
          startDate: dateOnly(start),
          endDate: dateOnly(end),
          limit: 3000,
          epochs: 20,
          strategyMode: "balanced",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Training gagal (HTTP ${res.status})`);
      if (data.trainingSummary) setLocalSummary(data.trainingSummary);
      else if (data.status !== "training_started" && data.status !== "completed") throw new Error("Server tidak mengembalikan status training yang valid.");
    } catch (e: any) {
      setRetrainError(e?.message || "Training gagal.");
      setIsRetraining(false);
    }
  };

  const summary = localSummary;
  if (isLoading && !summary) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm"><div className="flex items-center space-x-2 text-xs text-slate-400"><Cpu className="w-4 h-4 animate-spin text-emerald-400" /><span>Menganalisis & Mengkalibrasi data pasar real...</span></div></div>;
  if (!summary) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm text-xs text-slate-400">Belum ada data kalibrasi pasar. Jalankan training untuk memperbarui model.</div>;

  const { winRate, accuracy, profitFactor, sharpeRatio, maxDrawdown, modelVersion, winningTrades, losingTrades, barsCount, lastTrainedDate, lastTrainedAt } = summary;
  const formattedDate = lastTrainedDate || (lastTrainedAt ? new Date(lastTrainedAt * 1000).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Terbaru");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center space-x-2.5"><div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0"><Cpu className="w-4 h-4" /></div><div><h3 className="text-xs font-bold text-slate-100">{modelVersion}</h3><div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5 font-mono"><Calendar className="w-3 h-3 text-slate-500" /><span>{formattedDate}</span><span className="text-slate-600">•</span><span>Dataset: {barsCount} Bars ({summary.timeframe.toUpperCase()})</span></div></div></div>
        <button type="button" onClick={handleQuickRetrain} disabled={isRetraining} className="w-full sm:w-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition">{isRetraining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}{isRetraining ? "Training 15M..." : "Retrain AI 15M"}</button>
      </div>
      {retrainError && <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{retrainError}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><div className="flex items-center text-slate-400 text-[11px] gap-1"><Target className="w-3 h-3 text-emerald-400" />Win Rate</div><div className="text-lg font-bold font-mono text-emerald-400">{Number(winRate).toFixed(1)}%</div></div>
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><div className="flex items-center text-slate-400 text-[11px] gap-1"><Sparkles className="w-3 h-3 text-cyan-400" />Akurasi Model</div><div className="text-lg font-bold font-mono text-cyan-300">{Number(summary.tensorflowAccuracy ?? accuracy).toFixed(1)}%</div><div className="text-[10px] text-slate-500 font-mono">{summary.loss !== undefined ? `Loss: ${summary.loss}` : `${winningTrades}W / ${losingTrades}L`}</div></div>
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><div className="flex items-center text-slate-400 text-[11px] gap-1"><TrendingUp className="w-3 h-3 text-amber-400" />Profit Factor</div><div className="text-lg font-bold font-mono text-amber-300">{Number(profitFactor).toFixed(2)}</div><div className="text-[10px] text-slate-500 font-mono">Sharpe: {Number(sharpeRatio).toFixed(2)}</div></div>
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><div className="flex items-center text-slate-400 text-[11px] gap-1"><Activity className="w-3 h-3 text-rose-400" />Max Drawdown</div><div className="text-lg font-bold font-mono text-slate-200">{Number(maxDrawdown).toFixed(1)}%</div></div>
      </div>

      <div className="pt-2 border-t border-slate-800/80 space-y-2"><div className="flex items-center justify-between"><div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200"><History className="w-3.5 h-3.5 text-emerald-400" /><span>Riwayat 5 Iterasi Training Terakhir</span></div><span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">{iterationsHistory.length} Iterasi Tersimpan</span></div><div className="space-y-1.5">{iterationsHistory.map((iter, idx) => <div key={iter.id} className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition text-xs"><div className="flex items-center space-x-2.5"><span className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold font-mono flex items-center justify-center shrink-0">#{iter.iterationNum}</span><div><div className="flex items-center space-x-2"><span className="font-semibold text-slate-200">{iter.modelVersion}</span><span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">{iter.timeframe.toUpperCase()} ({iter.barsCount} Bars)</span>{idx === 0 && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">Aktif</span>}</div><div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5 font-mono"><Clock className="w-3 h-3 text-slate-500" /><span>{iter.formattedTime}</span></div></div></div><div className="flex items-center gap-3 sm:gap-4 font-mono text-[11px] shrink-0 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-800/60"><div className="text-right"><div className="text-[10px] text-slate-400">Loss</div><div className="text-slate-200 font-semibold">{iter.loss.toFixed(4)}</div></div><div className="text-right"><div className="text-[10px] text-slate-400">Akurasi</div><div className="text-cyan-400 font-bold">{iter.accuracy.toFixed(1)}%</div></div><div className="text-right"><div className="text-[10px] text-slate-400">Win Rate</div><div className="text-emerald-400 font-bold">{iter.winRate.toFixed(1)}%</div></div><div className="text-right"><div className="text-[10px] text-slate-400">PF</div><div className="text-amber-300 font-semibold">{iter.profitFactor.toFixed(2)}</div></div></div></div>)}</div></div>
    </div>
  );
};
