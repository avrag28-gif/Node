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

export interface SystemStatus {
  status: string;
  port: number;
  publicUrl: string;
  licensesCount: number;
  activeSessions: number;
  tradeCount: number;
  secretConfigured: boolean;
  serverTime: number;
  systemName: string;
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

export interface ServerLogEntry {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  account_id?: string;
  symbol?: string;
  status: number;
  detail: string;
  data?: any;
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

export interface TradingViewQuote {
  ticker: string;
  name: string;
  isPrimary?: boolean;
  price: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  recommendation: number;
  recommendationLabel: string;
  rsi: number;
  macd: number;
  macdSignal: number;
  stochK: number;
  stochD: number;
  ema20: number;
  ema50: number;
  sma50: number;
  sma200: number;
  atr: number;
  adx: number;
  updatedAt: number;
}

export interface ModelTrainingSummary {
  status: "trained" | "in_progress" | "idle";
  symbol: string;
  timeframe: string;
  source: string;
  barsCount: number;
  startTime: number;
  endTime: number;
  calibratedDrift: number;
  calibratedVol: number;
  averageAtr: number;
  regimeDistribution: Record<Regime, number>;
  tradingViewSignals: TradingViewQuote[];
  lastTrainedAt: number;
  lastTrainedDate?: string;
  winRate: number; // e.g. 78.6%
  accuracy: number; // e.g. 82.4%
  profitFactor: number; // e.g. 2.45
  sharpeRatio: number; // e.g. 1.95
  maxDrawdown: number; // e.g. 3.2%
  modelVersion: string; // e.g. "NodeTrade-AI Quantum-GBM v3.4"
  totalSimulatedTrades: number;
  winningTrades: number;
  losingTrades: number;
  aiConfidenceAverage: number;
  loss?: number;
  tensorflowAccuracy?: number;
}

export interface EngineAdminConfig {
  timeframe: "5m" | "15m" | "1h" | "4h";
  riskPerTrade: number; // e.g. 0.5% -> 0.005
  maxSpread: number; // e.g. 2.5
  minConfidence: number; // e.g. 0.60
  tpAtrMultiplier: number; // e.g. 1.5
  slAtrMultiplier: number; // e.g. 1.0
  maxDailyDrawdown: number; // e.g. 0.02 (2%)
  strategyMode: "conservative" | "balanced" | "aggressive";
  lotMultiplier: number; // e.g. 1.0
  lookback: number; // e.g. 64
  horizon: number; // e.g. 10
  trendWeight: number; // e.g. 0.6
  meanReversionWeight: number; // e.g. 0.4
}
