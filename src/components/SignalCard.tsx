import React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  PauseCircle,
} from "lucide-react";
import { Signal } from "../types";

interface SignalCardProps {
  signal: Signal | null;
  loading?: boolean;
  livePrice?: number;
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, loading, livePrice }) => {
  if (loading) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 text-center animate-pulse">
        <div className="h-6 w-32 bg-slate-800 rounded mx-auto mb-2" />
        <div className="h-4 w-48 bg-slate-800 rounded mx-auto" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 text-center text-slate-400 text-xs">
        Loading feed...
      </div>
    );
  }

  const isLong = signal.action === "long";
  const isShort = signal.action === "short";
  const isWait = signal.action === "wait";

  const upScenario = signal.scenarios?.find((s) => s.name === "up");
  const flatScenario = signal.scenarios?.find((s) => s.name === "flat");
  const downScenario = signal.scenarios?.find((s) => s.name === "down");

  const upProb = Math.round((upScenario?.probability || 0) * 100);
  const flatProb = Math.round((flatScenario?.probability || 0) * 100);
  const downProb = Math.round((downScenario?.probability || 0) * 100);

  const refPrice = livePrice || (upScenario?.target && downScenario?.target ? (upScenario.target + downScenario.target) / 2 : 4429.82);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
      {/* Top row: Symbol, Time, Decision */}
      <div className="flex items-center justify-between gap-3 mb-3.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2.5">
          <span className="font-bold text-slate-100 text-base">{signal.symbol || "XAUUSD"}</span>
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700 capitalize">
            {signal.regime.replace("_", " ")}
          </span>
          <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(signal.server_time * 1000).toLocaleTimeString()}
          </span>
        </div>

        {/* Action Decision */}
        <div
          className={`px-3 py-1 rounded-md font-bold text-xs flex items-center space-x-1.5 border ${
            isLong
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              : isShort
              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
              : "bg-amber-500/20 text-amber-300 border-amber-500/40"
          }`}
        >
          {isLong && <ArrowUpRight className="w-4 h-4" />}
          {isShort && <ArrowDownRight className="w-4 h-4" />}
          {isWait && <PauseCircle className="w-4 h-4" />}
          <span>{signal.action.toUpperCase()}</span>
        </div>
      </div>

      {/* 4 Metric Columns */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3.5">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Entry</span>
          <span className="text-sm font-mono font-semibold text-slate-200">
            ${(signal.entry || refPrice).toFixed(2)}
          </span>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-rose-400 block">Stop Loss</span>
          <span className="text-sm font-mono font-semibold text-rose-300">
            ${(signal.stop || (downScenario?.target || refPrice - 5.5)).toFixed(2)}
          </span>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-emerald-400 block">Take Profit</span>
          <span className="text-sm font-mono font-semibold text-emerald-300">
            ${(signal.target || (upScenario?.target || refPrice + 5.5)).toFixed(2)}
          </span>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-cyan-400 block">Volume</span>
          <span className="text-sm font-mono font-semibold text-cyan-300">
            {signal.volume > 0 ? `${signal.volume.toFixed(2)} Lot` : "0.00 (Wait)"}
          </span>
        </div>
      </div>

      {/* Probabilities Bar */}
      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
          <span>Scenarios</span>
          <span>
            Conf: {(signal.confidence * 100).toFixed(0)}% • Edge: {(signal.edge * 100).toFixed(0)}%
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-800 flex overflow-hidden">
          <div style={{ width: `${upProb}%` }} className="bg-emerald-500 h-full" />
          <div style={{ width: `${flatProb}%` }} className="bg-slate-600 h-full" />
          <div style={{ width: `${downProb}%` }} className="bg-rose-500 h-full" />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono mt-1.5 text-slate-400">
          <span className="text-emerald-400">Up {upProb}%</span>
          <span className="text-slate-400">Flat {flatProb}%</span>
          <span className="text-rose-400">Down {downProb}%</span>
        </div>
      </div>
    </div>
  );
};
