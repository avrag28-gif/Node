import React, { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react";
import { ServerLogEntry } from "../types";

interface LiveLogsTableProps {
  logs: ServerLogEntry[];
  onRefresh: () => void;
  isLoading: boolean;
}

export const LiveLogsTable: React.FC<LiveLogsTableProps> = ({
  logs,
  onRefresh,
  isLoading,
}) => {
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredLogs = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "analyze") return l.endpoint.includes("analyze");
    if (filter === "trades") return l.endpoint.includes("trade-events");
    if (filter === "errors") return l.status >= 400;
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm text-slate-100">Live Logs</span>
          <span className="text-[11px] font-mono text-slate-500">({filteredLogs.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 text-[11px] font-mono">
            {(["all", "analyze", "trades", "errors"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded capitalize transition ${
                  filter === f
                    ? "bg-slate-800 text-emerald-400 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800/80 text-[11px]">
            <tr>
              <th className="py-2 px-2.5">Time</th>
              <th className="py-2 px-2.5">Status</th>
              <th className="py-2 px-2.5">Endpoint</th>
              <th className="py-2 px-2.5">Account</th>
              <th className="py-2 px-2.5">Details</th>
              <th className="py-2 px-2.5 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500 text-xs italic">
                  No logs found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isSuccess = log.status < 400;
                const isExpanded = expandedId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-800/30 transition text-[11px]">
                      <td className="py-2 px-2.5 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>

                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            isSuccess
                              ? "text-emerald-400 bg-emerald-500/10"
                              : "text-rose-400 bg-rose-500/10"
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5 mr-1" />
                          )}
                          {log.status}
                        </span>
                      </td>

                      <td className="py-2 px-2.5 font-semibold text-slate-300 whitespace-nowrap">
                        {log.endpoint}
                      </td>

                      <td className="py-2 px-2.5 text-slate-400 whitespace-nowrap">
                        {log.account_id || "-"}
                      </td>

                      <td className="py-2 px-2.5 text-slate-300 max-w-xs truncate">
                        {log.detail}
                      </td>

                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        {log.data ? (
                          <button
                            onClick={() => toggleExpand(log.id)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    </tr>

                    {isExpanded && log.data && (
                      <tr className="bg-slate-950">
                        <td colSpan={6} className="p-2.5">
                          <pre className="text-[10px] text-slate-300 overflow-x-auto bg-slate-900 p-2 rounded border border-slate-800">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
