import React from "react";
import { Calendar as CalendarIcon, Filter, X, Clock } from "lucide-react";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  preset: "all" | "today" | "7d" | "30d" | "month" | "custom";
}

interface DateRangePickerProps {
  range: DateRange;
  onChange: (newRange: DateRange) => void;
  totalItemsCount: number;
  filteredItemsCount: number;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  range,
  onChange,
  totalItemsCount,
  filteredItemsCount,
}) => {
  const handlePresetChange = (preset: DateRange["preset"]) => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    if (preset === "all") {
      onChange({ startDate: "", endDate: "", preset: "all" });
      return;
    }

    if (preset === "today") {
      const todayStr = formatDate(today);
      onChange({ startDate: todayStr, endDate: todayStr, preset: "today" });
      return;
    }

    if (preset === "7d") {
      const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      onChange({
        startDate: formatDate(start),
        endDate: formatDate(today),
        preset: "7d",
      });
      return;
    }

    if (preset === "30d") {
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      onChange({
        startDate: formatDate(start),
        endDate: formatDate(today),
        preset: "30d",
      });
      return;
    }

    if (preset === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      onChange({
        startDate: formatDate(firstDay),
        endDate: formatDate(today),
        preset: "month",
      });
      return;
    }

    if (preset === "custom") {
      onChange({ ...range, preset: "custom" });
    }
  };

  const isFiltered = range.preset !== "all" || Boolean(range.startDate) || Boolean(range.endDate);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3">
      {/* Header & Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
          <CalendarIcon className="w-4 h-4 text-emerald-400" />
          <span>Filter Rentang Waktu Performa</span>
          {isFiltered && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
              Filter Aktif ({filteredItemsCount}/{totalItemsCount} Deals)
            </span>
          )}
        </div>

        {/* Quick Presets Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => handlePresetChange("all")}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              range.preset === "all"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("today")}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              range.preset === "today"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("7d")}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              range.preset === "7d"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            7 Hari
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("30d")}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              range.preset === "30d"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            30 Hari
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("month")}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              range.preset === "month"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Inputs for Custom Start & End Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 border-t border-slate-800/80 items-center">
        <div className="flex items-center space-x-2">
          <label className="text-[11px] font-medium text-slate-400 shrink-0">
            Dari:
          </label>
          <input
            type="date"
            value={range.startDate}
            onChange={(e) =>
              onChange({
                ...range,
                startDate: e.target.value,
                preset: "custom",
              })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-[11px] font-medium text-slate-400 shrink-0">
            Sampai:
          </label>
          <input
            type="date"
            value={range.endDate}
            onChange={(e) =>
              onChange({
                ...range,
                endDate: e.target.value,
                preset: "custom",
              })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Action / Reset */}
        <div className="flex items-center justify-end space-x-2 sm:col-span-2 lg:col-span-1">
          {isFiltered && (
            <button
              type="button"
              onClick={() => handlePresetChange("all")}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium flex items-center space-x-1 transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
