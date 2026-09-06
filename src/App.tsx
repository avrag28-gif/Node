import React, { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { AiModelStatsCard } from "./components/AiModelStatsCard";
import { SignalCard } from "./components/SignalCard";
import { LiveMarketTelemetry } from "./components/LiveMarketTelemetry";
import { LiveLogsTable } from "./components/LiveLogsTable";
import { PerformanceDashboard } from "./components/PerformanceDashboard";
import { LicenseManager } from "./components/LicenseManager";
import { AdminControlPanel } from "./components/AdminControlPanel";
import { Mt5SetupGuide } from "./components/Mt5SetupGuide";
import { Lock, Shield } from "lucide-react";
import {
  Candle,
  LicenseRecord,
  ModelTrainingSummary,
  PerformanceStats,
  ServerLogEntry,
  Signal,
  SystemStatus,
  TradeEvent,
  TradingViewQuote,
} from "./types";

const LOCAL_STORAGE_USER_KEY = "nodetrade_user_auth_session";
const LOCAL_STORAGE_ADMIN_KEY = "nodetrade_admin_auth_session";

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "monitor" | "performance" | "licenses" | "mt5guide"
  >("monitor");

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [logs, setLogs] = useState<ServerLogEntry[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [trades, setTrades] = useState<TradeEvent[]>([]);

  // Trader Account Session (Stored in localStorage)
  const [userSession, setUserSession] = useState<{
    accountId: string;
    token: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Admin Session (Stored in localStorage)
  const [adminPassword, setAdminPassword] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_ADMIN_KEY) || null;
    } catch {
      return null;
    }
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminInputPassword, setAdminInputPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // TradingView & Model Training state
  const [tvQuotes, setTvQuotes] = useState<TradingViewQuote[]>([]);
  const [trainingSummary, setTrainingSummary] =
    useState<ModelTrainingSummary | null>(null);
  const [livePrice, setLivePrice] = useState<number | undefined>(undefined);

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Load initial data
  useEffect(() => {
    fetchAllData();
    handleRunLiveAnalysis("15m", 10000);

    const interval = setInterval(() => {
      fetchLogsAndStatusOnly();
    }, 4000);

    return () => clearInterval(interval);
  }, [userSession?.accountId, adminPassword]);

  const fetchAllData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchStatus(),
        adminPassword ? fetchLicenses(adminPassword) : Promise.resolve(),
        fetchLogs(),
        fetchPerformance(userSession?.accountId),
        fetchTrades(userSession?.accountId),
        fetchTradingView(),
        fetchTrainingStatus(),
      ]);
    } catch (e) {
      console.error("Error refreshing dashboard:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchLogsAndStatusOnly = async () => {
    try {
      const [resLogs, resStatus, resTv] = await Promise.all([
        fetch("/api/logs"),
        fetch("/api/status"),
        fetch("/api/market/tradingview"),
      ]);
      if (resLogs.ok) {
        const logsData = await resLogs.json();
        setLogs(logsData);
      }
      if (resStatus.ok) {
        const statusData = await resStatus.json();
        setStatus(statusData);
      }
      if (resTv.ok) {
        const tvData = await resTv.json();
        setTvQuotes(tvData);
        if (tvData.length > 0) {
          const oanda = tvData.find((q: any) => q.ticker.includes("OANDA") || q.isPrimary);
          if (oanda && oanda.price) {
            setLivePrice(oanda.price);
          }
        }
      }
    } catch {
      // ignore transient poll error
    }
  };

  const fetchStatus = async () => {
    const res = await fetch("/api/status");
    if (res.ok) setStatus(await res.json());
  };

  const fetchLicenses = async (pass?: string) => {
    const key = pass || adminPassword;
    if (!key) return;
    try {
      const res = await fetch("/api/licenses", {
        headers: { "x-admin-key": key },
      });
      if (res.ok) {
        setLicenses(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch licenses:", e);
    }
  };

  const fetchLogs = async () => {
    const res = await fetch("/api/logs");
    if (res.ok) setLogs(await res.json());
  };

  const fetchPerformance = async (accountId?: string) => {
    const url = accountId
      ? `/api/performance?account_id=${encodeURIComponent(accountId)}`
      : "/api/performance";
    const res = await fetch(url);
    if (res.ok) setStats(await res.json());
  };

  const fetchTrades = async (accountId?: string) => {
    const url = accountId
      ? `/api/trade-events?account_id=${encodeURIComponent(accountId)}`
      : "/api/trade-events";
    const res = await fetch(url);
    if (res.ok) setTrades(await res.json());
  };

  const fetchTradingView = async () => {
    try {
      const res = await fetch("/api/market/tradingview");
      if (res.ok) {
        const data = await res.json();
        setTvQuotes(data);
        if (data.length > 0) {
          const oanda = data.find((q: any) => q.ticker.includes("OANDA") || q.isPrimary);
          setLivePrice(oanda ? oanda.price : data[0].price);
        }
      }
    } catch (e) {
      console.error("Failed to fetch TradingView quotes:", e);
    }
  };

  const fetchTrainingStatus = async () => {
    try {
      const res = await fetch("/api/market/training-status");
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setTrainingSummary(data.summary);
        }
      }
    } catch (e) {
      console.error("Failed to fetch training status:", e);
    }
  };

  const handleRetrainAi = async () => {
    try {
      const res = await fetch("/api/market/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeframe: "15m", limit: 300 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.trainingSummary) {
          setTrainingSummary(data.trainingSummary);
        }
        await fetchAllData();
      }
    } catch (e) {
      console.error("Retrain error:", e);
    }
  };

  // Trader Login handler
  const handleUserLogin = async (
    accountId: string,
    activationKey: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, activation_key: activationKey }),
      });
      if (res.ok) {
        const data = await res.json();
        const session = { accountId: data.account_id, token: data.token };
        setUserSession(session);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(session));
        await fetchPerformance(accountId);
        await fetchTrades(accountId);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleUserLogout = () => {
    setUserSession(null);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    setStats(null);
    setTrades([]);
  };

  // Admin Login Handler
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminInputPassword) return;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminInputPassword }),
      });
      if (res.ok) {
        setAdminPassword(adminInputPassword);
        localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, adminInputPassword);
        setShowAdminLoginModal(false);
        setAdminInputPassword("");
        setAdminLoginError(null);
        setActiveTab("licenses");
        await fetchLicenses(adminInputPassword);
      } else {
        setAdminLoginError("Password Admin salah!");
      }
    } catch {
      setAdminLoginError("Gagal menghubungi server.");
    }
  };

  const handleAdminLogout = () => {
    setAdminPassword(null);
    localStorage.removeItem(LOCAL_STORAGE_ADMIN_KEY);
    if (activeTab === "licenses") {
      setActiveTab("monitor");
    }
  };

  // Run live analysis on real Gold market data
  const handleRunLiveAnalysis = async (timeframe: string, equity: number) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/market/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeframe, equity }),
      });
      if (res.ok) {
        const data = await res.json();
        setCandles(data.candles || []);
        setSignal(data.signal || null);
        if (data.livePrice) {
          setLivePrice(data.livePrice);
        }
      }
    } catch (e) {
      console.error("Live analysis error:", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleProvisionLicense = async (accountId: string, label: string) => {
    if (!adminPassword) return;
    try {
      const res = await fetch("/api/licenses/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPassword,
        },
        body: JSON.stringify({ account_id: accountId, label }),
      });
      if (res.ok) {
        await fetchLicenses(adminPassword);
        await fetchStatus();
      }
    } catch (e) {
      console.error("Failed to provision license:", e);
    }
  };

  const handleToggleLicense = async (accountId: string) => {
    if (!adminPassword) return;
    try {
      const res = await fetch("/api/licenses/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPassword,
        },
        body: JSON.stringify({ account_id: accountId }),
      });
      if (res.ok) {
        await fetchLicenses(adminPassword);
      }
    } catch (e) {
      console.error("Failed to toggle license:", e);
    }
  };

  const handleDeleteLicense = async (accountId: string) => {
    if (!adminPassword) return;
    try {
      const res = await fetch(`/api/licenses/${accountId}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminPassword },
      });
      if (res.ok) {
        await fetchLicenses(adminPassword);
        await fetchStatus();
      }
    } catch (e) {
      console.error("Failed to delete license:", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navbar */}
      <Header
        status={status}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={fetchAllData}
        isRefreshing={isRefreshing}
        isAdminLoggedIn={Boolean(adminPassword)}
        onOpenAdminLogin={() => setShowAdminLoginModal(true)}
        userSession={userSession}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* TAB 1: Live Quant Monitor */}
        {activeTab === "monitor" && (
          <div className="space-y-4">
            {/* AI Model Performance & Telemetry Header */}
            <AiModelStatsCard
              trainingSummary={trainingSummary}
              isLoading={isRefreshing || isAnalyzing}
            />

            {/* Real-time Decision & Risk Signal */}
            <SignalCard signal={signal} loading={isAnalyzing} livePrice={livePrice} />

            {/* TradingView Real Market Ingestion & Calibration Engine */}
            <LiveMarketTelemetry
              onRefreshData={fetchAllData}
              currentCandles={candles}
              tvQuotes={tvQuotes}
              trainingSummary={trainingSummary}
              isLoading={isRefreshing || isAnalyzing}
              livePrice={livePrice}
            />

            {/* Live Incoming MT5 Request Stream */}
            <LiveLogsTable
              logs={logs}
              onRefresh={fetchLogs}
              isLoading={isRefreshing}
            />
          </div>
        )}

        {/* TAB 2: Performance Analytics & Closed Deals (Protected with Trader Account Login) */}
        {activeTab === "performance" && (
          <PerformanceDashboard
            stats={stats}
            trades={trades}
            onRefresh={() => fetchPerformance(userSession?.accountId)}
            isLoading={isRefreshing}
            userSession={userSession}
            onLogin={handleUserLogin}
            onLogout={handleUserLogout}
          />
        )}

        {/* TAB 3: MT5 Account Licenses & Engine Parameter Controls (ADMIN ONLY) */}
        {activeTab === "licenses" && adminPassword && (
          <div className="space-y-6">
            <AdminControlPanel
              adminPassword={adminPassword}
              onRefreshData={fetchAllData}
            />
            <LicenseManager
              licenses={licenses}
              onProvision={handleProvisionLicense}
              onToggle={handleToggleLicense}
              onDelete={handleDeleteLicense}
              isLoading={isRefreshing}
              adminPassword={adminPassword}
              onAdminLogout={handleAdminLogout}
            />
          </div>
        )}

        {/* TAB 4: MT5 Setup Guide & MQL5 EA Code */}
        {activeTab === "mt5guide" && (
          <Mt5SetupGuide
            serverUrl={status?.publicUrl || "https://nodetrade-server.ai.studio"}
          />
        )}
      </main>

      {/* Admin Login Modal */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xs w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-sm font-semibold text-slate-100">Admin Login</h4>
            </div>

            {adminLoginError && (
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
                {adminLoginError}
              </div>
            )}

            <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-medium">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Password..."
                  value={adminInputPassword}
                  onChange={(e) => setAdminInputPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900/80 bg-slate-950 py-3 text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>NodeTrade • MT5 Cloud Quant Engine</span>
          <span className="font-mono text-slate-400">v1.2.0 • Active</span>
        </div>
      </footer>
    </div>
  );
}
