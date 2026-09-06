import React, { useState } from "react";
import {
  Activity,
  Check,
  Copy,
  Cpu,
  Globe,
  Lock,
  Shield,
  Terminal,
  TrendingUp,
} from "lucide-react";
import { SystemStatus } from "../types";

interface HeaderProps {
  status: SystemStatus | null;
  activeTab: "monitor" | "performance" | "licenses" | "mt5guide";
  setActiveTab: (tab: "monitor" | "performance" | "licenses" | "mt5guide") => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isAdminLoggedIn: boolean;
  onOpenAdminLogin: () => void;
  userSession: { accountId: string; token: string } | null;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  activeTab,
  setActiveTab,
  onRefresh,
  isRefreshing,
  isAdminLoggedIn,
  onOpenAdminLogin,
  userSession,
}) => {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (!status?.publicUrl) return;
    navigator.clipboard.writeText(status.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur sticky top-0 z-50 w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-2">
          {/* Brand & Status */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-100 tracking-tight text-sm sm:text-base">
                NodeTrade
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                Online
              </span>
            </div>
          </div>

          {/* MT5 WebRequest URL Box, Admin Lock & Refresh Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Responsive URL Pill with overflow protection */}
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 max-w-[140px] xs:max-w-[200px] sm:max-w-xs md:max-w-sm truncate">
              <Globe className="w-3.5 h-3.5 text-emerald-400 mr-1.5 shrink-0 hidden xs:inline" />
              <span className="font-mono text-emerald-300 truncate text-[11px] sm:text-xs">
                {status?.publicUrl || "https://nodetrade-server.ai.studio"}
              </span>
              <button
                onClick={copyUrl}
                title="Copy Server URL"
                className="ml-1.5 pl-1.5 border-l border-slate-800 text-slate-400 hover:text-white transition flex items-center shrink-0"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* Admin Lock Button */}
            <button
              onClick={() => {
                if (isAdminLoggedIn) {
                  setActiveTab("licenses");
                } else {
                  onOpenAdminLogin();
                }
              }}
              className={`p-1.5 rounded-lg border text-xs transition flex items-center gap-1 shrink-0 ${
                isAdminLoggedIn
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
              title={isAdminLoggedIn ? "Admin Panel Aktif" : "Buka Admin Panel"}
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-[11px] font-medium">
                {isAdminLoggedIn ? "Admin" : ""}
              </span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition shrink-0"
              title="Refresh Data"
            >
              <Activity className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex space-x-1 border-t border-slate-800/60 py-1.5 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setActiveTab("monitor")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === "monitor"
                ? "bg-slate-800 text-emerald-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Monitor</span>
          </button>

          <button
            onClick={() => setActiveTab("performance")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === "performance"
                ? "bg-slate-800 text-emerald-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Performance</span>
            {userSession && (
              <span className="text-[10px] px-1.5 bg-emerald-500/20 text-emerald-300 rounded-full font-mono">
                {userSession.accountId}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("mt5guide")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === "mt5guide"
                ? "bg-slate-800 text-emerald-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>EA & Guide</span>
          </button>

          {/* ADMIN ONLY TAB */}
          {isAdminLoggedIn && (
            <button
              onClick={() => setActiveTab("licenses")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
                activeTab === "licenses"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Licenses</span>
              {status && (
                <span className="text-[10px] px-1.5 bg-amber-500/20 text-amber-300 rounded-full font-mono">
                  {status.licensesCount}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
