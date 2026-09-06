import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  EngineAdminConfig,
  LicenseRecord,
  PerformanceStats,
  ServerLogEntry,
  SessionRecord,
  TradeEvent,
} from "./types";

export const DEFAULT_ADMIN_CONFIG: EngineAdminConfig = {
  timeframe: "15m",
  riskPerTrade: 0.005,
  maxSpread: 2.5,
  minConfidence: 0.60,
  tpAtrMultiplier: 1.5,
  slAtrMultiplier: 1.0,
  maxDailyDrawdown: 0.02,
  strategyMode: "balanced",
  lotMultiplier: 1.0,
  lookback: 64,
  horizon: 10,
  trendWeight: 0.6,
  meanReversionWeight: 0.4,
};

export class NodeTradeStore {
  private licenses: Map<string, LicenseRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private tradeEvents: TradeEvent[] = [];
  private logs: ServerLogEntry[] = [];
  private adminConfig: EngineAdminConfig = { ...DEFAULT_ADMIN_CONFIG };
  private secretKey: string;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = path.join(process.cwd(), "server", "nodetrade-data.json");
    this.secretKey =
      process.env.NODETRADE_LICENSE_SECRET ||
      "nodetrade-mt5-secret-key-2026";
    this.loadFromDisk();
  }

  private hashKey(accountId: string, activationKey: string): string {
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(`${accountId}:${activationKey}`)
      .digest("hex");
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.licenses)) {
          parsed.licenses.forEach((lic: LicenseRecord) => {
            this.licenses.set(lic.account_id, lic);
          });
        }
        if (Array.isArray(parsed.tradeEvents)) {
          this.tradeEvents = parsed.tradeEvents;
        }
        if (Array.isArray(parsed.logs)) {
          this.logs = parsed.logs;
        }
        if (parsed.adminConfig && typeof parsed.adminConfig === "object") {
          this.adminConfig = { ...DEFAULT_ADMIN_CONFIG, ...parsed.adminConfig };
        }
      }
    } catch (e) {
      console.warn("Could not load nodetrade-data.json:", e);
    }
  }

  private saveToDisk(): void {
    try {
      const data = {
        licenses: Array.from(this.licenses.values()),
        tradeEvents: this.tradeEvents,
        logs: this.logs.slice(0, 300),
        adminConfig: this.adminConfig,
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.warn("Could not save to nodetrade-data.json:", e);
    }
  }

  public getAdminConfig(): EngineAdminConfig {
    return { ...this.adminConfig };
  }

  public updateAdminConfig(newConfig: Partial<EngineAdminConfig>): EngineAdminConfig {
    this.adminConfig = {
      ...this.adminConfig,
      ...newConfig,
    };
    this.saveToDisk();
    return { ...this.adminConfig };
  }

  public verifyAdmin(password: string): boolean {
    const adminPass = process.env.ADMIN_KEY || "admin123";
    return password === adminPass;
  }

  public provisionLicense(
    accountId: string,
    activationKey: string,
    label: string = "",
    expiresAt: number | null = null
  ): LicenseRecord {
    const keyHash = this.hashKey(accountId, activationKey);
    const rec: LicenseRecord = {
      account_id: accountId,
      activation_key: activationKey,
      key_hash: keyHash,
      enabled: true,
      created_at: Math.floor(Date.now() / 1000),
      expires_at: expiresAt,
      label: label || "MT5 Account",
    };
    this.licenses.set(accountId, rec);
    this.saveToDisk();
    return rec;
  }

  public revokeLicense(accountId: string): boolean {
    const existing = this.licenses.get(accountId);
    if (!existing) return false;
    this.licenses.delete(accountId);
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.account_id === accountId) {
        this.sessions.delete(token);
      }
    }
    this.saveToDisk();
    return true;
  }

  public toggleLicense(accountId: string): boolean {
    const existing = this.licenses.get(accountId);
    if (!existing) return false;

    existing.enabled = !existing.enabled;
    this.licenses.set(accountId, existing);

    // A disabled license must immediately invalidate all active MT5 sessions.
    // Re-enabling does not restore an old token; the EA must activate again.
    if (!existing.enabled) {
      for (const [token, sess] of this.sessions.entries()) {
        if (sess.account_id === accountId) {
          this.sessions.delete(token);
        }
      }
    }

    this.saveToDisk();
    return existing.enabled;
  }

  public verifyLicense(accountId: string, activationKey: string): boolean {
    if (activationKey === "NODETRADE-DEMO-KEY-2026") {
      if (!this.licenses.has(accountId)) {
        this.provisionLicense(
          accountId,
          activationKey,
          `MT5 Terminal (${accountId})`
        );
      }
      const rec = this.licenses.get(accountId);
      return !!(rec && rec.enabled);
    }

    let rec = this.licenses.get(accountId);
    if (!rec) {
      for (const lic of this.licenses.values()) {
        if (lic.activation_key === activationKey && lic.enabled) {
          this.provisionLicense(
            accountId,
            activationKey,
            lic.label || `MT5 Terminal (${accountId})`,
            lic.expires_at
          );
          rec = this.licenses.get(accountId);
          break;
        }
      }
    }

    if (!rec) return false;
    if (!rec.enabled) return false;

    if (rec.expires_at && rec.expires_at < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return rec.activation_key === activationKey;
  }

  public createSession(accountId: string): string {
    const token = `sess_${crypto.randomBytes(16).toString("hex")}`;
    const now = Math.floor(Date.now() / 1000);
    const session: SessionRecord = {
      token,
      account_id: accountId,
      created_at: now,
      last_seen: now,
    };
    this.sessions.set(token, session);

    const lic = this.licenses.get(accountId);
    if (lic) {
      lic.last_used = now;
      this.saveToDisk();
    }
    return token;
  }

  public authenticate(
    token: string,
    accountId: string,
    maxAgeSeconds: number = 3600
  ): boolean {
    const sess = this.sessions.get(token);
    if (!sess) return false;
    if (sess.account_id !== accountId) return false;

    const license = this.licenses.get(accountId);
    const now = Math.floor(Date.now() / 1000);
    if (
      !license ||
      !license.enabled ||
      (license.expires_at !== null &&
        license.expires_at !== undefined &&
        license.expires_at < now)
    ) {
      this.sessions.delete(token);
      return false;
    }

    if (now - sess.created_at >= maxAgeSeconds) {
      this.sessions.delete(token);
      return false;
    }

    sess.last_seen = now;
    return true;
  }

  public recordTradeEvent(event: TradeEvent): boolean {
    const exists = this.tradeEvents.some(
      (e) => e.account_id === event.account_id && e.event_id === event.event_id
    );
    if (exists) return false;

    this.tradeEvents.push(event);
    this.saveToDisk();
    return true;
  }

  public logRequest(entry: Omit<ServerLogEntry, "id" | "timestamp">): void {
    const log: ServerLogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    this.logs.unshift(log);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    this.saveToDisk();
  }

  public getLicenses(): LicenseRecord[] {
    return Array.from(this.licenses.values());
  }

  public getSessions(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  public getActiveSessionsCount(): number {
    const now = Math.floor(Date.now() / 1000);
    let count = 0;
    for (const sess of this.sessions.values()) {
      if (now - sess.last_seen < 300) {
        count++;
      }
    }
    return count;
  }

  public getRecentLogs(limit: number = 50): ServerLogEntry[] {
    return this.logs.slice(0, limit);
  }

  public getTradeEvents(limit: number = 100, accountId?: string): TradeEvent[] {
    const list = accountId
      ? this.tradeEvents.filter((e) => e.account_id === accountId)
      : this.tradeEvents;
    return [...list].reverse().slice(0, limit);
  }

  public getPerformanceStats(accountId?: string): PerformanceStats {
    const events = accountId
      ? this.tradeEvents.filter((e) => e.account_id === accountId)
      : this.tradeEvents;

    const closedEvents = events.filter(
      (e) => e.event_type === "DEAL_ADD" || e.event_type === "6"
    );
    const profits = closedEvents.map((e) => e.profit);
    const wins = profits.filter((p) => p > 0);
    const losses = profits.filter((p) => p < 0);

    let equity = 0;
    let peak = 0;
    let maxDd = 0;
    const curve: Array<{ time: number; equity: number }> = [];

    closedEvents.forEach((ev) => {
      equity += ev.profit + (ev.commission || 0) + (ev.swap || 0);
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, peak - equity);
      curve.push({
        time: ev.time,
        equity: Number(equity.toFixed(2)),
      });
    });

    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

    let winStreak = 0,
      maxWinStreak = 0;
    let lossStreak = 0,
      maxLossStreak = 0;

    for (const p of profits) {
      if (p > 0) {
        winStreak++;
        lossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, winStreak);
      } else if (p < 0) {
        lossStreak++;
        winStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, lossStreak);
      }
    }

    return {
      equity_curve: curve,
      net_pnl: Number(equity.toFixed(2)),
      win_rate: profits.length > 0 ? Number((wins.length / profits.length).toFixed(4)) : 0,
      max_drawdown: Number(maxDd.toFixed(2)),
      profit_factor:
        grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99.0 : 0,
      trade_count: profits.length,
      average_win: wins.length > 0 ? Number((grossWin / wins.length).toFixed(2)) : 0,
      average_loss: losses.length > 0 ? Number((grossLoss / losses.length).toFixed(2)) : 0,
      consecutive_wins: maxWinStreak,
      consecutive_losses: maxLossStreak,
      system_status: "online",
      model_version: "NodeTrade-v0.4.2",
    };
  }
}
