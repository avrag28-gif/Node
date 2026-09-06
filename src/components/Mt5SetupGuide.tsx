import React, { useState } from "react";
import { Check, Copy, Download, FolderArchive, ShieldCheck } from "lucide-react";

interface Mt5SetupGuideProps {
  serverUrl: string;
}

export const Mt5SetupGuide: React.FC<Mt5SetupGuideProps> = ({ serverUrl }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(serverUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner with Download Options */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-100">MetaTrader 5 Expert Advisor Package</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            File ZIP berisi file <strong>NodeTradeEA.ex5</strong> siap pakai dan panduan konfigurasi.
          </p>
        </div>

        {/* Download Buttons Group */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/download/ea-zip"
            download="NodeTradeEA.zip"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
          >
            <FolderArchive className="w-4 h-4" />
            <span>Download NodeTradeEA.zip</span>
          </a>

          <a
            href="/api/download/ea-ex5"
            download="NodeTradeEA.ex5"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
            title="Download file .ex5 langsung"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>.ex5</span>
          </a>
        </div>
      </div>

      {/* Copy URL Row */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 rounded-xl border border-slate-800 text-xs font-mono">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-slate-400 font-sans font-medium shrink-0">MT5 WebRequest URL:</span>
          <span className="text-emerald-300 truncate font-mono">{serverUrl}</span>
        </div>
        <button
          onClick={handleCopyUrl}
          className="text-slate-400 hover:text-white transition ml-2 shrink-0 flex items-center bg-slate-950 px-2.5 py-1 rounded border border-slate-800"
        >
          {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
          <span className="text-[11px] font-sans">{copiedUrl ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {/* 4 Setup Steps in Compact Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              1
            </span>
            <h4 className="text-xs font-bold text-slate-200">Allow WebRequest di MT5</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Buka MT5 → <strong>Tools → Options (Ctrl+O) → Expert Advisors</strong>. Centang <em>"Allow WebRequest for listed URL"</em> dan tambahkan URL di atas.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              2
            </span>
            <h4 className="text-xs font-bold text-slate-200">Extract & Pasang File .EX5</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Extract <strong>NodeTradeEA.zip</strong>, lalu salin file <code>NodeTradeEA.ex5</code> langsung ke folder <strong>MQL5\Experts</strong> di MT5.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              3
            </span>
            <h4 className="text-xs font-bold text-slate-200">Pasang ke Chart XAUUSD</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Buka chart XAUUSD (M15). Drag EA ke chart. Masukkan License Key pada <code>InpActivationCode</code> dan sesuaikan <code>InpServerOrigin</code>.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              4
            </span>
            <h4 className="text-xs font-bold text-slate-200">Aktifkan Algo Trading</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Klik tombol <strong>Algo Trading</strong> di toolbar MT5. EA akan otomatis mengirim heartbeat dan menerima keputusan quant langsung dari cloud server.
          </p>
        </div>
      </div>
    </div>
  );
};
