import { Action, Candle, Regime, Scenario, Signal } from "./types.js";

export interface EngineRiskConfig {
  riskPerTrade: number; // e.g. 0.005 (0.5%)
  maxDailyDrawdown: number; // e.g. 0.02 (2.0%)
  maxOpenRisk: number; // e.g. 0.01 (1.0%)
  maxSpread: number; // e.g. 2.5 points
  minRewardRisk: number; // e.g. 1.5
  maxPositionFraction: number; // e.g. 0.25 (25%)
}

export interface EngineModelConfig {
  lookback: number;
  horizon: number;
  minHistory: number;
  minConfidence: number;
  flatThreshold: number;
}

export interface EngineExecutionConfig {
  slippagePerUnit: number;
  extraCost: number;
}

const DEFAULT_RISK_CONFIG: EngineRiskConfig = {
  riskPerTrade: 0.005,
  maxDailyDrawdown: 0.02,
  maxOpenRisk: 0.01,
  maxSpread: 2.5,
  minRewardRisk: 1.5,
  maxPositionFraction: 0.25,
};

const DEFAULT_MODEL_CONFIG: EngineModelConfig = {
  lookback: 64,
  horizon: 10,
  minHistory: 100,
  minConfidence: 0.55,
  flatThreshold: 0.001,
};

const DEFAULT_EXECUTION_CONFIG: EngineExecutionConfig = {
  slippagePerUnit: 0.05,
  extraCost: 0.05,
};

// Helper: Moving average
function movingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - window + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / window);
    }
  }
  return result;
}

// Helper: Standard deviation
function rollingStd(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const variance =
        slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (window - 1);
      result.push(Math.sqrt(variance));
    }
  }
  return result;
}

// Market Regime Detection (exact algorithm from src/nodetrade/market_state.py)
export function detectRegime(candles: Candle[]): Regime {
  if (candles.length < 60) {
    return "unknown";
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const returns: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  const vol20 = rollingStd(returns, 20);
  const baseline100 = rollingStd(returns, Math.min(100, returns.length));

  const fastMa = movingAverage(closes, 10);
  const slowMa = movingAverage(closes, 40);

  const lastIdx = closes.length - 1;
  const currentClose = closes[lastIdx];

  // Prior 20-bar high and low (excluding current bar)
  const prior20Highs = highs.slice(Math.max(0, lastIdx - 20), lastIdx);
  const prior20Lows = lows.slice(Math.max(0, lastIdx - 20), lastIdx);
  const priorHigh = Math.max(...prior20Highs);
  const priorLow = Math.min(...prior20Lows);

  const lastVol = vol20[lastIdx];
  const lastBase = baseline100[lastIdx] || 0.001;
  const lastFast = fastMa[lastIdx];
  const lastSlow = slowMa[lastIdx];

  if (
    !Number.isFinite(lastVol) ||
    !Number.isFinite(lastBase) ||
    !Number.isFinite(lastFast) ||
    !Number.isFinite(lastSlow)
  ) {
    return "unknown";
  }

  if (currentClose > priorHigh || currentClose < priorLow) {
    return "breakout";
  }

  if (lastBase > 0 && lastVol > lastBase * 1.8) {
    return "high_vol";
  }

  if (lastFast > lastSlow * 1.001) {
    return "trend_up";
  }

  if (lastFast < lastSlow * 0.999) {
    return "trend_down";
  }

  return "range";
}

// Pseudo random number generator with deterministic seed
function createSeededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Box-Muller Gaussian transform
function randomNormal(rng: () => number, mean: number, std: number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * std;
}

// Scenario Engine (probabilistic forward paths from causal statistics)
export function generateScenarios(
  candles: Candle[],
  horizon: number = 10,
  simulations: number = 300,
): Scenario[] {
  if (candles.length < 30 || horizon <= 0) {
    return [];
  }

  const closes = candles.map((c) => c.close);
  const current = closes[closes.length - 1];

  // Log returns of last 30 bars
  const recentCloses = closes.slice(-31);
  const logReturns: number[] = [];
  for (let i = 1; i < recentCloses.length; i++) {
    logReturns.push(Math.log(recentCloses[i] / recentCloses[i - 1]));
  }

  const meanDrift = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((a, b) => a + Math.pow(b - meanDrift, 2), 0) /
    (logReturns.length - 1);
  const sigma = Math.sqrt(variance);

  if (!Number.isFinite(sigma) || sigma <= 0) {
    return [];
  }

  const seed = 7 + candles.length * 1009 + horizon * 9176;
  const rng = createSeededRng(seed);

  const paths: number[][] = [];
  const terminalValues: number[] = [];

  for (let s = 0; s < simulations; s++) {
    const path: number[] = [current];
    let price = current;
    for (let step = 0; step < horizon; step++) {
      const shock = randomNormal(rng, meanDrift, sigma);
      price = price * Math.exp(shock);
      path.push(price);
    }
    paths.push(path);
    terminalValues.push(price);
  }

  // Segment terminal into down (< -0.2%), flat (-0.2% to +0.2%), up (> +0.2%)
  const upIndices: number[] = [];
  const flatIndices: number[] = [];
  const downIndices: number[] = [];

  for (let i = 0; i < simulations; i++) {
    const t = terminalValues[i];
    if (t > current * 1.002) {
      upIndices.push(i);
    } else if (t < current * 0.998) {
      downIndices.push(i);
    } else {
      flatIndices.push(i);
    }
  }

  const scenarios: Scenario[] = [];

  const processCategory = (name: "up" | "flat" | "down", indices: number[]) => {
    if (indices.length === 0) {
      const fallbackTarget =
        name === "down"
          ? current * (1 - Math.max(0.003, 1.5 * sigma))
          : name === "up"
          ? current * (1 + Math.max(0.003, 1.5 * sigma))
          : current;
      scenarios.push({
        name,
        probability: 0.05,
        expected_return: fallbackTarget / current - 1,
        target: Number(fallbackTarget.toFixed(3)),
        path: [current, Number(fallbackTarget.toFixed(3))],
      });
      return;
    }
    const catPaths = indices.map((idx) => paths[idx]);
    const termVals = indices.map((idx) => terminalValues[idx]).sort((a, b) => a - b);
    const medianTarget = termVals[Math.floor(termVals.length / 2)];

    // Median path
    const medianPath: number[] = [];
    for (let step = 0; step <= horizon; step++) {
      const stepVals = catPaths.map((p) => p[step]).sort((a, b) => a - b);
      medianPath.push(stepVals[Math.floor(stepVals.length / 2)]);
    }

    scenarios.push({
      name,
      probability: indices.length / simulations,
      expected_return: medianTarget / current - 1,
      target: Number(medianTarget.toFixed(3)),
      path: medianPath.map((v) => Number(v.toFixed(3))),
    });
  };

  processCategory("down", downIndices);
  processCategory("flat", flatIndices);
  processCategory("up", upIndices);

  return scenarios;
}

// Directional probability model fusing causal technical scoring with forward paths
export function predictDirectionModel(
  candles: Candle[],
  regime: Regime,
): { up: number; flat: number; down: number } {
  if (candles.length < 20) {
    return { up: 0.33, flat: 0.34, down: 0.33 };
  }

  const closes = candles.map((c) => c.close);
  const n = closes.length;

  // Short-term momentum (5 bars & 20 bars)
  const mom5 = (closes[n - 1] - closes[n - 6]) / closes[n - 6];
  const mom20 = (closes[n - 1] - closes[n - 21]) / closes[n - 21];

  // Relative RSI-like momentum
  let gains = 0;
  let losses = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? 100 : gains / (losses + 1e-9);
  const rsi = 100 - 100 / (1 + rs);

  let upScore = 0.33;
  let downScore = 0.33;
  let flatScore = 0.34;

  if (regime === "trend_up") {
    upScore += 0.2;
    downScore -= 0.15;
  } else if (regime === "trend_down") {
    downScore += 0.2;
    upScore -= 0.15;
  } else if (regime === "breakout") {
    if (mom5 > 0) upScore += 0.18;
    else downScore += 0.18;
  } else if (regime === "range") {
    flatScore += 0.2;
    if (rsi > 70) downScore += 0.1;
    if (rsi < 30) upScore += 0.1;
  }

  if (mom5 > 0.001) upScore += 0.08;
  if (mom5 < -0.001) downScore += 0.08;
  if (mom20 > 0.003) upScore += 0.06;
  if (mom20 < -0.003) downScore += 0.06;

  upScore = Math.max(0.05, upScore);
  downScore = Math.max(0.05, downScore);
  flatScore = Math.max(0.05, flatScore);

  const total = upScore + downScore + flatScore;
  return {
    up: upScore / total,
    flat: flatScore / total,
    down: downScore / total,
  };
}

// Fuse simulation scenarios with model probabilities (60% model, 40% simulation)
export function fuseScenarios(
  scenarios: Scenario[],
  modelProbs: { up: number; flat: number; down: number },
): Scenario[] {
  const simProbs: Record<string, number> = {
    up: scenarios.find((s) => s.name === "up")?.probability || 0.33,
    flat: scenarios.find((s) => s.name === "flat")?.probability || 0.34,
    down: scenarios.find((s) => s.name === "down")?.probability || 0.33,
  };

  const fusedRaw = {
    up: 0.6 * modelProbs.up + 0.4 * simProbs.up,
    flat: 0.6 * modelProbs.flat + 0.4 * simProbs.flat,
    down: 0.6 * modelProbs.down + 0.4 * simProbs.down,
  };

  const total = fusedRaw.up + fusedRaw.flat + fusedRaw.down;
  const fusedProbs = {
    up: fusedRaw.up / total,
    flat: fusedRaw.flat / total,
    down: fusedRaw.down / total,
  };

  return scenarios.map((s) => ({
    ...s,
    probability: Number((fusedProbs[s.name] || s.probability).toFixed(4)),
  }));
}

// Opportunity Selection & Risk Gate (src/nodetrade/opportunity.py)
export function chooseOpportunity(
  price: number,
  spread: number,
  regime: Regime,
  scenarios: Scenario[],
  minConfidence: number = 0.55,
  minRR: number = 1.5,
  extraCost: number = 0.05,
): {
  action: Action;
  confidence: number;
  stop: number | null;
  target: number | null;
  edge: number;
  reasons: string[];
} {
  if (!scenarios || scenarios.length === 0 || spread < 0) {
    return {
      action: "wait",
      confidence: 0,
      stop: null,
      target: null,
      edge: 0,
      reasons: ["insufficient_scenarios"],
    };
  }

  const up = scenarios.find((s) => s.name === "up");
  const down = scenarios.find((s) => s.name === "down");

  if (!up || !down) {
    return {
      action: "wait",
      confidence: 0,
      stop: null,
      target: null,
      edge: 0,
      reasons: ["missing_directional_scenarios"],
    };
  }

  const edge = up.probability - down.probability;
  const confidence = Math.max(up.probability, down.probability);

  if (confidence < minConfidence) {
    return {
      action: "wait",
      confidence: Number(confidence.toFixed(4)),
      stop: null,
      target: null,
      edge: Number(edge.toFixed(4)),
      reasons: [
        `confidence_below_gate (${(confidence * 100).toFixed(1)}% < ${(minConfidence * 100).toFixed(1)}%)`,
      ],
    };
  }

  const cost = Math.max(0, spread) + Math.max(0, extraCost);

  // LONG condition
  if (edge > 0 && regime !== "trend_down") {
    const target = up.target;
    const stop = price - Math.max(Math.abs(price - (down.target || price)), spread * 2);
    const reward = Math.abs(target - price);
    const risk = Math.abs(price - stop);
    const rr = reward / Math.max(risk, 1e-9);
    const ev = up.probability * reward - (1 - up.probability) * risk - cost;

    if (rr >= minRR && ev > 0) {
      return {
        action: "long",
        confidence: Number(confidence.toFixed(4)),
        stop: Number(stop.toFixed(3)),
        target: Number(target.toFixed(3)),
        edge: Number(edge.toFixed(4)),
        reasons: [
          "upside_probability_dominates",
          `rr=${rr.toFixed(2)} (>= ${minRR})`,
          `net_ev=${ev.toFixed(4)}`,
          `regime=${regime}`,
        ],
      };
    }
  }

  // SHORT condition
  if (edge < 0 && regime !== "trend_up") {
    const target = down.target;
    const stop = price + Math.max(Math.abs((up.target || price) - price), spread * 2);
    const reward = Math.abs(target - price);
    const risk = Math.abs(stop - price);
    const rr = reward / Math.max(risk, 1e-9);
    const ev = down.probability * reward - (1 - down.probability) * risk - cost;

    if (rr >= minRR && ev > 0) {
      return {
        action: "short",
        confidence: Number(confidence.toFixed(4)),
        stop: Number(stop.toFixed(3)),
        target: Number(target.toFixed(3)),
        edge: Number(edge.toFixed(4)),
        reasons: [
          "downside_probability_dominates",
          `rr=${rr.toFixed(2)} (>= ${minRR})`,
          `net_ev=${ev.toFixed(4)}`,
          `regime=${regime}`,
        ],
      };
    }
  }

  return {
    action: "wait",
    confidence: Number(confidence.toFixed(4)),
    stop: null,
    target: null,
    edge: Number(edge.toFixed(4)),
    reasons: [
      "risk_reward_or_ev_or_regime_gate",
      `edge=${(edge * 100).toFixed(1)}%`,
      `regime=${regime}`,
    ],
  };
}

// Volume & Sizing Calculation
export function calculateLotSize(params: {
  equity: number;
  riskPerTrade: number;
  entry: number;
  stop: number;
  tickSize: number;
  tickValue: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
}): number {
  const {
    equity,
    riskPerTrade,
    entry,
    stop,
    tickSize,
    tickValue,
    volumeMin,
    volumeMax,
    volumeStep,
  } = params;

  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0 || tickSize <= 0 || tickValue <= 0 || equity <= 0) {
    return 0.0;
  }

  const lossPerLot = (stopDistance / tickSize) * tickValue;
  if (lossPerLot <= 0) return 0.0;

  const riskCash = equity * riskPerTrade;
  let rawVolume = riskCash / lossPerLot;

  // Bound within limits
  rawVolume = Math.min(volumeMax, rawVolume);
  const steps = Math.floor(rawVolume / volumeStep);
  let normalized = steps * volumeStep;
  normalized = Math.max(volumeMin, normalized);

  if (normalized > volumeMax) normalized = volumeMax;

  return normalized >= volumeMin ? Number(normalized.toFixed(2)) : 0.0;
}

// Complete Analysis Workflow
export function runNodeTradeAnalysis(params: {
  symbol: string;
  candles: Candle[];
  bid: number;
  ask: number;
  equity: number;
  dayStartEquity?: number;
  tickSize: number;
  tickValue: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  requestId?: string;
  adminConfig?: any;
  riskConfig?: Partial<EngineRiskConfig>;
  modelConfig?: Partial<EngineModelConfig>;
}): Signal {
  const adminCfg = params.adminConfig;
  const riskCfg: EngineRiskConfig = {
    ...DEFAULT_RISK_CONFIG,
    ...(adminCfg ? {
      riskPerTrade: adminCfg.riskPerTrade ?? DEFAULT_RISK_CONFIG.riskPerTrade,
      maxDailyDrawdown: adminCfg.maxDailyDrawdown ?? DEFAULT_RISK_CONFIG.maxDailyDrawdown,
      maxSpread: adminCfg.maxSpread ?? DEFAULT_RISK_CONFIG.maxSpread,
    } : {}),
    ...params.riskConfig,
  };
  const modelCfg: EngineModelConfig = {
    ...DEFAULT_MODEL_CONFIG,
    ...(adminCfg ? {
      lookback: adminCfg.lookback ?? DEFAULT_MODEL_CONFIG.lookback,
      horizon: adminCfg.horizon ?? DEFAULT_MODEL_CONFIG.horizon,
      minConfidence: adminCfg.minConfidence ?? DEFAULT_MODEL_CONFIG.minConfidence,
    } : {}),
    ...params.modelConfig,
  };
  const executionCfg = DEFAULT_EXECUTION_CONFIG;

  const requestId = params.requestId || Math.random().toString(36).substring(2, 10);
  const serverTime = Math.floor(Date.now() / 1000);

  // 1. History check
  if (params.candles.length < modelCfg.minHistory) {
    return {
      action: "wait",
      confidence: 0,
      regime: "unknown",
      entry: null,
      stop: null,
      target: null,
      edge: 0,
      volume: 0,
      scenarios: [],
      reasons: [`insufficient_history (${params.candles.length} < ${modelCfg.minHistory})`],
      request_id: requestId,
      server_time: serverTime,
      symbol: params.symbol,
    };
  }

  const lastClose = params.candles[params.candles.length - 1].close;
  const bid = params.bid > 0 ? params.bid : lastClose;
  const ask = params.ask > 0 ? params.ask : lastClose;
  const spread = Math.max(0, ask - bid);
  const midPrice = (bid + ask) / 2;

  // 2. Risk check
  const dayStartEquity = params.dayStartEquity || params.equity;
  const dailyDrawdown = Math.max(0, 1 - params.equity / dayStartEquity);

  if (params.equity <= 0) {
    return {
      action: "wait",
      confidence: 0,
      regime: "unknown",
      entry: null,
      stop: null,
      target: null,
      edge: 0,
      volume: 0,
      scenarios: [],
      reasons: ["invalid_equity"],
      request_id: requestId,
      server_time: serverTime,
      symbol: params.symbol,
    };
  }

  if (dailyDrawdown >= riskCfg.maxDailyDrawdown) {
    return {
      action: "wait",
      confidence: 0,
      regime: "unknown",
      entry: null,
      stop: null,
      target: null,
      edge: 0,
      volume: 0,
      scenarios: [],
      reasons: [
        `daily_drawdown_limit (${(dailyDrawdown * 100).toFixed(2)}% >= ${(riskCfg.maxDailyDrawdown * 100).toFixed(2)}%)`,
      ],
      request_id: requestId,
      server_time: serverTime,
      symbol: params.symbol,
    };
  }

  if (spread > riskCfg.maxSpread) {
    return {
      action: "wait",
      confidence: 0,
      regime: "unknown",
      entry: null,
      stop: null,
      target: null,
      edge: 0,
      volume: 0,
      scenarios: [],
      reasons: [`spread_limit (${spread.toFixed(3)} > ${riskCfg.maxSpread})`],
      request_id: requestId,
      server_time: serverTime,
      symbol: params.symbol,
    };
  }

  // 3. Regime detection
  const regime = detectRegime(params.candles);

  // 4. Scenarios & Forward Simulation
  const rawScenarios = generateScenarios(params.candles, modelCfg.horizon, 300);
  const modelProbs = predictDirectionModel(params.candles, regime);
  const scenarios = fuseScenarios(rawScenarios, modelProbs);

  // 5. Opportunity Gating
  const opp = chooseOpportunity(
    midPrice,
    spread,
    regime,
    scenarios,
    modelCfg.minConfidence,
    riskCfg.minRewardRisk,
    executionCfg.extraCost,
  );

  let volume = 0.0;
  if ((opp.action === "long" || opp.action === "short") && opp.stop && opp.target) {
    volume = calculateLotSize({
      equity: params.equity,
      riskPerTrade: riskCfg.riskPerTrade,
      entry: midPrice,
      stop: opp.stop,
      tickSize: params.tickSize,
      tickValue: params.tickValue,
      volumeMin: params.volumeMin,
      volumeMax: params.volumeMax,
      volumeStep: params.volumeStep,
    });
  }

  const allReasons = [
    `model_p_up=${modelProbs.up.toFixed(3)}`,
    `model_p_down=${modelProbs.down.toFixed(3)}`,
    ...opp.reasons,
  ];

  return {
    action: opp.action,
    confidence: opp.confidence,
    regime,
    entry: opp.action !== "wait" ? Number(midPrice.toFixed(3)) : null,
    stop: opp.stop,
    target: opp.target,
    edge: opp.edge,
    volume,
    scenarios,
    reasons: allReasons,
    request_id: requestId,
    server_time: serverTime,
    symbol: params.symbol,
  };
}
