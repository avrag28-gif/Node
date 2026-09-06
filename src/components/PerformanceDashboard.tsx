import React, { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRightLeft,
  Award,
  BarChart2,
  CheckCircle2,
  DollarSign,
  Key,
  Lock,
  LogOut,
  Percent,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { PerformanceStats, TradeEvent } from "../types";
import { DateRangePicker, DateRange } from "./DateRangePicker";

interface PerformanceDashboardProps {
  stats: PerformanceStats | null;
  trades: TradeEvent[];
  onRefresh: () => void;
  isLoading: boolean;
  userSession: { accountId: string; token: string } | null;
  onLogin: (accountId: string, activationKey: string) => Promise<boolean>;
  onLogout: () => void;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  stats,
  trades,
  onRefresh,
  isLoading,
  userSession,
  onLogin,
  onLogout,
}) => {
  // Login Form States
  const [inputAccountId, setInputAccountId] = useState("");
  const [inputActivationKey, setInputActivationKey] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Date Range Filter State
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: "",
    endDate: "",
    preset: "all",
  });

  // Chart View Mode State (Equity Curve vs Cumulative PnL vs Per-Trade PnL Bar)
  const [chartViewMode, setChartViewMode] = useState<"equity" | "cumulative" | "pnl">("equity");

  // Filter Trades by Date Range
  const filteredTrades = useMemo(() => {
    if (!trades) return [];
    return trades.filter((t) => {
      const tradeDateMs = t.timestamp * 1000;
      if (dateRange.startDate) {
        const startMs = new Date(dateRange.startDate + "T00:00:00").getTime();
        if (!isNaN(startMs) && tradeDateMs < startMs) return false;
      }
      if (dateRange.endDate) {
        const endMs = new Date(dateRange.endDate + "T23:59:59").getTime();
        if (!isNaN(endMs) && tradeDateMs > endMs) return false;
      }
      return true;
    });
  }, [trades, dateRange]);

  // Transform Actual Trades into Recharts Data Points for PnL Progression
  const rechartsData = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => a.timestamp - b.timestamp);
    let cumulativePnl = 0;
    let runningEquity = 10000;

    return sorted.map((t, idx) => {
      cumulativePnl += t.profit;
      runningEquity += t.profit;
      const dateObj = new Date(t.timestamp * 1000);
      const formattedTime = dateObj.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        id: t.deal_id,
        tradeNum: idx + 1,
        time: formattedTime,
        timestamp: t.timestamp,
        symbol: t.symbol,
        type: t.type,
        volume: t.volume,
        price: t.price,
        profit: Number(t.profit.toFixed(2)),
        cumulativePnl: Number(cumulativePnl.toFixed(2)),
        equity: Number(runningEquity.toFixed(2)),
      };
    });
  }, [filteredTrades]);

  // Compute Filtered Performance Analytics Stats
  const effectiveStats = useMemo(() => {
    if (!stats) return null;
    if (dateRange.preset === "all" && !dateRange.startDate && !dateRange.endDate) {
      return stats;
    }
    if (!filteredTrades || filteredTrades.length === 0) {
      return {
        net_pnl: 0,
        win_rate: 0,
        profit_factor: 0,
        max_drawdown: 0,
        trade_count: 0,
        winning_trades: 0,
        losing_trades: 0,
        average_win: 0,
        average_loss: 0,
        consecutive_wins: 0,
        equity_curve: [],
      };
    }

    const tradeCount = filteredTrades.length;
    let netPnl = 0;
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    const sorted = [...filteredTrades].sort((a, b) => a.timestamp - b.timestamp);

    let runningEquity = 10000;
    let peakEquity = 10000;
    let maxDD = 0;
    const equityCurve = [];

    for (const t of sorted) {
      netPnl += t.profit;
      if (t.profit >= 0) {
        wins++;
        grossProfit += t.profit;
      } else {
        losses++;
        grossLoss += Math.abs(t.profit);
      }

      runningEquity += t.profit;
      if (runningEquity > peakEquity) peakEquity = runningEquity;
      const dd = peakEquity - runningEquity;
      if (dd > maxDD) maxDD = dd;

      equityCurve.push({
        time: t.timestamp,
        equity: Number(runningEquity.toFixed(2)),
      });
    }

    const winRate = tradeCount > 0 ? wins / tradeCount : 0;
    const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    return {
      net_pnl: Number(netPnl.toFixed(2)),
      win_rate: winRate,
      profit_factor: Number(pf.toFixed(2)),
      max_drawdown: Number(maxDD.toFixed(2)),
      trade_count: tradeCount,
      winning_trades: wins,
      losing_trades: losses,
      average_win: wins > 0 ? Number((grossProfit / wins).toFixed(2)) : 0,
      average_loss: losses > 0 ? Number((grossLoss / losses).toFixed(2)) : 0,
      consecutive_wins: 0,
      equity_curve: equityCurve,
    };
  }, [stats, filteredTrades, dateRange]);

  // Ping Diagnostic States for Logged-In User
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{
    ok: boolean;
    connected: boolean;
    latency: number;
    serverProcessingMs?: number;
    sessionsCount: number;
    lastSeenSecondsAgo?: number | null;
  } | null>(null);

  const handleLoginFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAccountId.trim() || !inputActivationKey.trim()) return;

    setLoginLoading(true);
    setLoginError(null);
    try {
      const success = await onLogin(inputAccountId.trim(), inputActivationKey.trim());
      if (!success) {
        setLoginError("ID Akun atau Kode Autentikasi salah / belum terdaftar.");
      }
    } catch (err: any) {
      setLoginError("Gagal menghubungi server. Silakan coba lagi.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRunUserPing = async () => {
    if (!userSession) return;
    setPingLoading(true);
    const startPing = performance.now();
    try {
      const res = await fetch(`/api/diagnostics/ping?account_id=${encodeURIComponent(userSession.accountId)}&t=${Date.now()}`, {
        cache: "no-store",
      });
      const endPing = performance.now();
      const actualRttMs = Math.round(endPing - startPing);

      if (res.ok) {
        const data = await res.json();
        setPingResult({
          ok: true,
          connected: data.terminal_connected,
          latency: actualRttMs,
          serverProcessingMs: data.server_processing_ms,
          sessionsCount: data.active_sessions_count || 0,
          lastSeenSecondsAgo: data.last_seen_seconds_ago,
        });
      }
    } catch {
      const endPing = performance.now();
      setPingResult({
        ok: false,
        connected: false,
        latency: Math.round(endPing - startPing),
        sessionsCount: 0,
      });
    } finally {
      setPingLoading(false);
    }
  };

  // IF USER IS NOT LOGGED IN -> SHOW AUTHENTICATION CARD
  if (!userSession) {
    return (
      <div className="max-w-sm mx-auto py-10">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Login Akun MT5</h3>
            </div>
          </div>

          {loginError && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginFormSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Account ID
              </label>
              <input
                type="text"
                required
                placeholder="ID Akun..."
                value={inputAccountId}
                onChange={(e) => setInputAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                License Key
              </label>
              <input
                type="password"
                required
                placeholder="Key Lisensi..."
                value={inputActivationKey}
                onChange={(e) => setInputActivationKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition shadow-sm mt-2"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Masuk</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // USER IS LOGGED IN -> RENDER PERFORMANCE + PRIVATE PING
  if (!stats) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
        Loading analytics...
      </div>
    );
  }

  const activeStats = effectiveStats || stats;

  const chartData = activeStats.equity_curve.map((point, index) => ({
    index: index + 1,
    time: new Date(point.time * 1000).toLocaleTimeString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    equity: point.equity,
  }));

  const isProfitable = activeStats.net_pnl >= 0;

  return (
    <div className="space-y-4">
      {/* User Session Bar & Test Ping */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <User className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-200">
                Akun MT5: <span className="font-mono text-emerald-400">{userSession.accountId}</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                Terautentikasi
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Menampilkan metrik performa khusus untuk akun ini
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunUserPing}
            disabled={pingLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition border border-slate-700"
            title="Uji konektivitas WebRequest antara server dan MT5 akun ini"
          >
            <ArrowRightLeft className={`w-3.5 h-3.5 text-cyan-400 ${pingLoading ? "animate-spin" : ""}`} />
            <span>{pingLoading ? "Pinging..." : "Test Ping MT5"}</span>
          </button>

          <button
            onClick={onLogout}
            className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition"
            title="Keluar / Ganti Akun"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Ping Result Box (If tested) */}
      {pingResult && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-300">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                pingResult.connected
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-amber-400"
              }`}
            />
            <span className="truncate">
              {pingResult.connected
                ? `Terminal Akun ${userSession.accountId} Aktif & Terhubung`
                : `Server Online. Menunggu koneksi WebRequest dari MT5 Akun ${userSession.accountId}`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              RTT Ping: <strong className="text-emerald-400">{pingResult.latency} ms</strong>
            </span>
            {pingResult.serverProcessingMs !== undefined && (
              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hidden sm:inline">
                Server Proc: <strong className="text-cyan-400">{pingResult.serverProcessingMs} ms</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Date Range Picker Component */}
      <DateRangePicker
        range={dateRange}
        onChange={setDateRange}
        totalItemsCount={trades.length}
        filteredItemsCount={filteredTrades.length}
      />

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Net PnL</span>
            {isProfitable ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              isProfitable ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isProfitable ? `+$${activeStats.net_pnl.toFixed(2)}` : `-$${Math.abs(activeStats.net_pnl).toFixed(2)}`}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
            {activeStats.trade_count} trades
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Win Rate</span>
            <Percent className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-400">
            {(activeStats.win_rate * 100).toFixed(1)}%
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
            {activeStats.trade_count > 0 ? `Win: ${activeStats.winning_trades} | Loss: ${activeStats.losing_trades}` : "Belum ada trade"}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Profit Factor</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {activeStats.profit_factor > 0 ? activeStats.profit_factor.toFixed(2) : "0.00"}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
            {activeStats.trade_count > 0
              ? `Win: $${activeStats.average_win.toFixed(1)} | Loss: $${activeStats.average_loss.toFixed(1)}`
              : "Menunggu eksekusi MT5"}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Max Drawdown</span>
            <Shield className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-300">
            ${activeStats.max_drawdown.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
            Peak-to-Trough
          </span>
        </div>
      </div>

      {/* Recharts Profit/Loss Progression & Equity Visualization */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800/80 gap-2">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-100">
              Visualisasi Grafik Performa ({userSession.accountId})
            </span>
          </div>

          {/* Chart View Mode Controls */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setChartViewMode("equity")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center space-x-1 ${
                chartViewMode === "equity"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Equity ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode("cumulative")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center space-x-1 ${
                chartViewMode === "cumulative"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Net PnL ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode("pnl")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center space-x-1 ${
                chartViewMode === "pnl"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <DollarSign className="w-3 h-3" />
              <span>Per-Trade PnL</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1 text-slate-400 hover:text-emerald-400 transition ml-1"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Chart Render Area */}
        <div className="h-56 w-full">
          {rechartsData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
              Tidak ada data transaksi pada rentang waktu ini untuk ditampilkan di grafik.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartViewMode === "pnl" ? (
                /* Per-Trade PnL Bar Chart */
                <BarChart data={rechartsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isWin = data.profit >= 0;
                        return (
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs space-y-1 font-mono">
                            <div className="text-slate-400 font-sans text-[11px]">{data.time}</div>
                            <div className="text-slate-200 font-semibold">
                              Deal #{data.id} ({data.symbol} - {data.type})
                            </div>
                            <div className={isWin ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              PnL: {isWin ? `+$${data.profit}` : `-$${Math.abs(data.profit)}`}
                            </div>
                            <div className="text-slate-400 text-[10px]">
                              Vol: {data.volume} Lot | Price: ${data.price}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="profit" name="Trade PnL ($)">
                    {rechartsData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.profit >= 0 ? "#10b981" : "#f43f5e"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : chartViewMode === "cumulative" ? (
                /* Cumulative PnL Area Chart */
                <AreaChart data={rechartsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isPos = data.cumulativePnl >= 0;
                        return (
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs space-y-1 font-mono">
                            <div className="text-slate-400 font-sans text-[11px]">{data.time}</div>
                            <div className="text-slate-200 font-semibold">Trade #{data.tradeNum} (Deal #{data.id})</div>
                            <div className={isPos ? "text-cyan-400 font-bold" : "text-rose-400 font-bold"}>
                              Kumulatif PnL: {isPos ? `+$${data.cumulativePnl}` : `-$${Math.abs(data.cumulativePnl)}`}
                            </div>
                            <div className="text-slate-400 text-[10px]">Trade PnL: ${data.profit}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePnl"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#pnlGrad)"
                    name="Kumulatif PnL ($)"
                  />
                </AreaChart>
              ) : (
                /* Account Equity Area Chart */
                <AreaChart data={rechartsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <ReferenceLine y={10000} stroke="#475569" strokeDasharray="3 3" label={{ value: "Saldo Awal ($10,000)", fill: "#64748b", fontSize: 9 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs space-y-1 font-mono">
                            <div className="text-slate-400 font-sans text-[11px]">{data.time}</div>
                            <div className="text-emerald-400 font-bold">
                              Equity: ${data.equity.toLocaleString()}
                            </div>
                            <div className="text-slate-300 text-[10px]">
                              Deal #{data.id} PnL: <span className={data.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>${data.profit}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#equityGrad)"
                    name="Equity ($)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Closed Trades Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-100 mb-2.5 pb-2 border-b border-slate-800/80 flex items-center justify-between">
          <span>Closed Deals - Akun {userSession.accountId} ({filteredTrades.length})</span>
          {filteredTrades.length < trades.length && (
            <span className="text-xs font-mono text-emerald-400 font-normal">
              Filter: {filteredTrades.length} dari {trades.length}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800/80 text-[11px]">
              <tr>
                <th className="py-2 px-2.5">Time</th>
                <th className="py-2 px-2.5">Deal #</th>
                <th className="py-2 px-2.5">Symbol</th>
                <th className="py-2 px-2.5">Type</th>
                <th className="py-2 px-2.5">Volume</th>
                <th className="py-2 px-2.5">Price</th>
                <th className="py-2 px-2.5 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs italic">
                    Belum ada riwayat transaksi pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade) => {
                  const isProfit = trade.profit >= 0;
                  return (
                    <tr key={trade.deal_id} className="hover:bg-slate-800/30 transition text-[11px]">
                      <td className="py-2 px-2.5 text-slate-400">
                        {new Date(trade.timestamp * 1000).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 px-2.5 text-slate-300">#{trade.deal_id}</td>
                      <td className="py-2 px-2.5 text-amber-300 font-semibold">{trade.symbol}</td>
                      <td className="py-2 px-2.5 capitalize text-slate-300">{trade.action}</td>
                      <td className="py-2 px-2.5 text-slate-300">{trade.volume.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-slate-300">${trade.price.toFixed(2)}</td>
                      <td
                        className={`py-2 px-2.5 text-right font-bold ${
                          isProfit ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isProfit ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
