import React, { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart2,
  RefreshCw,
} from "lucide-react";
import { Candle, ModelTrainingSummary, TradingViewQuote } from "../types";

interface LiveMarketTelemetryProps {
  onRefreshData?: () => Promise<void>;
  currentCandles: Candle[];
  tvQuotes: TradingViewQuote[];
  trainingSummary: ModelTrainingSummary | null;
  isLoading: boolean;
  livePrice?: number;
}

export const LiveMarketTelemetry: React.FC<LiveMarketTelemetryProps> = ({
  onRefreshData,
  currentCandles,
  tvQuotes,
  trainingSummary,
  isLoading,
  livePrice,
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("15m");

  const chartData = currentCandles.map((c) => ({
    time: new Date(c.time * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    close: c.close,
    high: c.high,
    low: c.low,
    open: c.open,
    volume: c.volume,
  }));

  const primaryTv =
    tvQuotes.find((q) => q.ticker.includes("OANDA") || q.isPrimary) ||
    tvQuotes[0];

  const currentDisplayPrice =
    primaryTv?.price ||
    livePrice ||
    (currentCandles.length > 0
      ? currentCandles[currentCandles.length - 1].close
      : 4429.82);

  const minPrice =
    currentCandles.length > 0
      ? Math.floor(Math.min(...currentCandles.map((c) => c.low)) - 1)
      : Math.floor(currentDisplayPrice - 20);
  const maxPrice =
    currentCandles.length > 0
      ? Math.ceil(Math.max(...currentCandles.map((c) => c.high)) + 1)
      : Math.ceil(currentDisplayPrice + 20);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Header with price & quick metrics */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2.5">
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm text-slate-100">XAUUSD Live Feed</span>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            ${currentDisplayPrice.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 text-[11px] font-mono">
            {(["15m", "1h", "4h"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2 py-0.5 rounded transition ${
                  selectedTimeframe === tf
                    ? "bg-slate-800 text-emerald-400 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {onRefreshData && (
            <button
              onClick={() => onRefreshData()}
              disabled={isLoading}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
              title="Refresh Feed"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* 3 Simple Indicators */}
      {primaryTv && (
        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
          <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
            <span className="text-slate-500 text-[10px] block">RSI (14)</span>
            <span className="text-slate-200 font-semibold">{primaryTv.rsi}</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
            <span className="text-slate-500 text-[10px] block">EMA 20</span>
            <span className="text-slate-200 font-semibold">${primaryTv.ema20.toFixed(1)}</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
            <span className="text-slate-500 text-[10px] block">ATR</span>
            <span className="text-slate-200 font-semibold">{primaryTv.atr}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-48 w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
            Loading chart...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis domain={[minPrice, maxPrice]} stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#10b981"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#goldGradient)"
                name="Gold Spot ($)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
