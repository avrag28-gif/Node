export type Action = "long" | "short" | "wait";

export type Regime =
  | "unknown"
  | "trend_up"
  | "trend_down"
  | "breakout"
  | "high_vol"
  | "range";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Scenario {
  name: "up" | "flat" | "down";
  probability: number;
  expected_return: number;
  target: number;
  invalidation?: number;
  path: number[];
}

export interface Signal {
  action: Action;
  confidence: number;
  regime: Regime;
  entry: number | null;
  stop: number | null;
  target: number | null;
  edge: number;
  volume: number;
  scenarios: Scenario[];
  reasons: string[];
  request_id: string;
  server_time: number;
  symbol: string;
}

export interface TradeEvent {
  account_id: string;
  event_id: string;
  symbol: string;
  event_type: string;
  ticket: number;
  deal: number;
  order: number;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: number;
  payload?: Record<string, unknown>;
}

export interface LicenseRecord {
  account_id: string;
  activation_key: string;
  key_hash: string;
  enabled: boolean;
  created_at: number;
  expires_at: number | null;
  label?: string;
  last_used?: number;
}

export interface SessionRecord {
  token: string;
  token_hash?: string;
  account_id: string;
  created_at: number;
  last_seen: number;
}

export interface ServerLogEntry {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  account_id?: string;
  symbol?: string;
  status: number;
  detail: string;
  data?: unknown;
}

export interface PerformanceStats {
  equity_curve: Array<{ time: number; equity: number }>;
  net_pnl: number;
  win_rate: number;
  max_drawdown: number;
  profit_factor: number;
  trade_count: number;
  average_win: number;
  average_loss: number;
  consecutive_wins: number;
  consecutive_losses: number;
  system_status: string;
  model_version: string;
}

export interface EngineAdminConfig {
  timeframe: "5m" | "15m" | "1h" | "4h";
  riskPerTrade: number;
  maxSpread: number;
  minConfidence: number;
  tpAtrMultiplier: number;
  slAtrMultiplier: number;
  maxDailyDrawdown: number;
  strategyMode: "conservative" | "balanced" | "aggressive";
  lotMultiplier: number;
  lookback: number;
  horizon: number;
  trendWeight: number;
  meanReversionWeight: number;
}
