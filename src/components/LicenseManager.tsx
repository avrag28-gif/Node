import React, { useState } from "react";
import { Check, Copy, Key, LogOut, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
import { LicenseRecord } from "../types";

interface LicenseManagerProps {
  licenses: LicenseRecord[];
  onProvision: (accountId: string, label: string) => Promise<void>;
  onToggle: (accountId: string) => Promise<void>;
  onDelete: (accountId: string) => Promise<void>;
  isLoading: boolean;
  adminPassword: string;
  onAdminLogout: () => void;
}

export const LicenseManager: React.FC<LicenseManagerProps> = ({
  licenses,
  onProvision,
  onToggle,
  onDelete,
  isLoading,
  onAdminLogout,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccountId, setNewAccountId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setActionError("Gagal menyalin activation key.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountId.trim()) return;
    setActionError(null);
    try {
      await onProvision(newAccountId.trim(), newLabel.trim() || "MT5 Account");
      setNewAccountId("");
      setNewLabel("");
      setShowAddModal(false);
    } catch (e: any) {
      setActionError(e?.message || "Gagal membuat license.");
    }
  };

  const handleToggle = async (accountId: string) => {
    if (pendingAccount) return;
    setActionError(null);
    setPendingAccount(accountId);
    try {
      await onToggle(accountId);
    } catch (e: any) {
      setActionError(e?.message || `Gagal mengubah status akun ${accountId}.`);
    } finally {
      setPendingAccount(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (pendingAccount) return;
    setActionError(null);
    setPendingAccount(accountId);
    try {
      await onDelete(accountId);
    } catch (e: any) {
      setActionError(e?.message || `Gagal menghapus akun ${accountId}.`);
    } finally {
      setPendingAccount(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm text-slate-100">MT5 Account Licenses (Admin)</span>
          <span className="text-[11px] font-mono text-slate-500">({licenses.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setActionError(null); setShowAddModal(true); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition">
            <Plus className="w-3.5 h-3.5" /><span>New License</span>
          </button>
          <button onClick={onAdminLogout} title="Keluar dari Admin" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{actionError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {licenses.length === 0 ? (
          <div className="col-span-2 py-8 text-center text-slate-500 text-xs italic">Belum ada lisensi MT5 yang dibuat. Klik "New License" untuk menambahkan akun.</div>
        ) : (
          licenses.map((lic) => {
            const isCopied = copiedKey === lic.account_id;
            const isPending = pendingAccount === lic.account_id;
            return (
              <div key={lic.account_id} className={`p-3 rounded-lg border transition ${lic.enabled ? "bg-slate-950 border-slate-800" : "bg-slate-950/40 border-slate-800/50 opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <ShieldCheck className={`w-4 h-4 shrink-0 ${lic.enabled ? "text-emerald-400" : "text-slate-500"}`} />
                    <span className="text-xs font-bold text-slate-200 truncate">{lic.label || "Account"}</span>
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 shrink-0">ID: {lic.account_id}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggle(lic.account_id)} disabled={isLoading || isPending} title={lic.enabled ? "Disable" : "Enable"} className={`p-1 rounded text-xs transition disabled:opacity-40 ${lic.enabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-slate-500 hover:text-slate-300"}`}>
                      <Power className={`w-3.5 h-3.5 ${isPending ? "animate-pulse" : ""}`} />
                    </button>
                    <button onClick={() => handleDelete(lic.account_id)} disabled={isLoading || isPending} title="Delete" className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-semibold ${lic.enabled ? "text-emerald-400" : "text-rose-400"}`}>{lic.enabled ? "ACTIVE / ON" : "DISABLED / OFF"}</span>
                  {isPending && <span className="text-[10px] text-slate-400">Menyimpan...</span>}
                </div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 truncate max-w-[200px] text-[11px]">{lic.activation_key}</span>
                  <button onClick={() => handleCopy(lic.activation_key, lic.account_id)} className="text-slate-400 hover:text-emerald-400 ml-2 transition flex items-center shrink-0" title="Copy Key">
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-4 shadow-xl">
            <h4 className="text-sm font-bold text-slate-100 mb-3">Add MT5 License</h4>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">MT5 Account Number</label>
                <input type="text" required placeholder="e.g. 5291823" value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Account Label</label>
                <input type="text" placeholder="e.g. VPS / Client Account" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 outline-none" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                <button type="submit" disabled={isLoading || !!pendingAccount} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">Generate Key</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
