//+------------------------------------------------------------------+
//|                                                  NodeTradeEA.mq5 |
//|                                  Copyright 2026, NodeTrade AI    |
//|                                             https://nodetrade.ai |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, NodeTrade AI"
#property link        "https://nodetrade.ai"
#property version     "2.00"
#property description "NodeTrade AI Hybrid Cloud & Autonomous Quantitative EA"
#property strict

#include <Trade\Trade.mqh>

input group "=== 1. Server & License Configuration ==="
input string InpServerOrigin       = "https://nodetrade-server.ai.studio"; // Cloud Server URL
input string InpExpectedAccountID  = "";                             // Expected MT5 Login (Optional)
input string InpActivationCode     = "NODETRADE-DEMO-KEY-2026";      // License Activation Key
input int    InpTimerSeconds        = 3;                              // Telemetry & Cycle Interval (sec)
input int    InpHTTPTimeoutMs       = 4000;                           // WebRequest Timeout (ms)

input group "=== 2. Execution & Risk Parameters ==="
input bool   InpLiveTrading         = false;                          // Enable Live Execution (OFF = Safe Monitoring)
input double InpVolume              = 0.01;                           // Trade Volume / Lot Size
input double InpMaxVolume           = 0.10;                           // Maximum Allowed Lot Size
input ulong  InpMagic               = 26090401;                       // Magic Number
input bool   InpAllowLong           = true;                           // Allow Buy Trades
input bool   InpAllowShort          = true;                           // Allow Sell Trades
input bool   InpAutoTrailingStop    = true;                           // Enable Dynamic ATR Trailing Stop

input group "=== 3. Autonomous Quant Fallback Engine ==="
input bool   InpEnableLocalQuant    = true;                           // Trade using Built-in Quant Engine if Cloud Offline
input int    InpFastEMA             = 9;                              // Fast EMA Period
input int    InpSlowEMA             = 21;                             // Slow EMA Period
input int    InpTrendEMA            = 50;                             // Baseline Trend EMA Period
input int    InpRSIPeriod           = 14;                             // RSI Period
input int    InpATRPeriod           = 14;                             // ATR Risk Period
input double InpATR_SL_Multiplier   = 1.5;                            // Stop Loss ATR Multiplier
input double InpATR_TP_Multiplier   = 3.0;                            // Take Profit ATR Multiplier

// Internal Global State
CTrade   trade;
datetime g_last_bar          = 0;
datetime g_day_marker        = 0;
datetime g_last_heartbeat    = 0;
datetime g_last_reconcile    = 0;
datetime g_last_activate_try = 0;
bool     g_cloud_connected   = false;
string   g_cloud_status_text = "Menghubungkan ke Cloud Server...";
string   g_session_token     = "";
string   g_last_signal_key   = "";
double   g_day_start_equity  = 0.0;
string   g_last_action_desc  = "Menunggu setup quant...";

// Indicator Handles
int      g_h_fast_ema        = INVALID_HANDLE;
int      g_h_slow_ema        = INVALID_HANDLE;
int      g_h_trend_ema       = INVALID_HANDLE;
int      g_h_rsi             = INVALID_HANDLE;
int      g_h_atr             = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| Helper String & JSON Utilities                                   |
//+------------------------------------------------------------------+
string AccountID()
{
   return IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
}

string JsonEscape(const string value)
{
   string s = value;
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

string JsonNumber(const double value, const int digits = 8)
{
   return DoubleToString(value, digits);
}

string ExtractJsonString(const string json, const string key)
{
   string search = "\"" + key + "\"";
   int p = StringFind(json, search);
   if(p < 0) return "";
   p += StringLen(search);
   int len = StringLen(json);
   while(p < len && (StringGetCharacter(json, p) == ' ' || StringGetCharacter(json, p) == ':'))
      p++;
   if(p >= len || StringGetCharacter(json, p) != '"') return "";
   p++;
   int e = StringFind(json, "\"", p);
   if(e < 0) return "";
   return StringSubstr(json, p, e - p);
}

double ExtractJsonNumber(const string json, const string key, const double fallback = 0.0)
{
   string search = "\"" + key + "\"";
   int p = StringFind(json, search);
   if(p < 0) return fallback;
   p += StringLen(search);
   int len = StringLen(json);
   while(p < len && (StringGetCharacter(json, p) == ' ' || StringGetCharacter(json, p) == ':'))
      p++;
   if(p >= len) return fallback;
   int e = p;
   while(e < len)
   {
      ushort c = StringGetCharacter(json, e);
      if((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E')
         e++;
      else
         break;
   }
   if(e <= p) return fallback;
   return StringToDouble(StringSubstr(json, p, e - p));
}

string CleanServerOrigin()
{
   string u = InpServerOrigin;
   StringTrimLeft(u);
   StringTrimRight(u);
   while(StringLen(u) > 0 && StringSubstr(u, StringLen(u) - 1, 1) == "/")
   {
      u = StringSubstr(u, 0, StringLen(u) - 1);
   }
   return u;
}

//+------------------------------------------------------------------+
//| HTTP WebRequest Client with Safe Type Handling                   |
//+------------------------------------------------------------------+
bool HttpPost(const string path, const string payload, const bool authenticated, string &response)
{
   // Strategy Tester does not support WebRequest in MT5
   if(MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION))
   {
      response = "";
      return false;
   }

   string base_url = CleanServerOrigin();
   if(base_url == "") return false;

   string full_url = base_url + path;
   string headers = "Content-Type: application/json\r\nAccept: application/json\r\nUser-Agent: NodeTradeEA/2.0\r\nngrok-skip-browser-warning: 69420\r\n";
   if(authenticated && g_session_token != "")
      headers += "Authorization: Bearer " + g_session_token + "\r\n";

   char data[];
   if(StringLen(payload) > 0)
   {
      StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8);
      // Remove null terminator so express JSON parser receives pure JSON
      if(ArraySize(data) > 0 && data[ArraySize(data) - 1] == 0)
      {
         ArrayResize(data, ArraySize(data) - 1);
      }
   }

   char result[];
   string result_headers = "";
   ResetLastError();

   int status = WebRequest("POST", full_url, headers, InpHTTPTimeoutMs, data, result, result_headers);
   if(status == -1)
   {
      int err = GetLastError();
      g_cloud_connected = false;
      PrintFormat("[NodeTrade] WebRequest gagal terkirim (Error MT5 #%d). URL: %s", err, full_url);
      
      if(err == 4014)
      {
         Print("[NodeTrade] -> PENYEBAB Error 4014: URL belum terdaftar persis di daftar WebRequest MT5.");
         PrintFormat("[NodeTrade] -> SOLUSI: Buka Tools > Options > Expert Advisors > Centang 'Allow WebRequest for listed URL' dan tambahkan URL persis: %s", base_url);
         g_cloud_status_text = "WebRequest Dibatasi (Error 4014)";
      }
      else if(err == 5203)
      {
         Print("[NodeTrade] -> PENYEBAB Error 5203: Koneksi Timeout / Tidak dapat terhubung ke server.");
         g_cloud_status_text = "Koneksi Timeout (Error 5203)";
      }
      else
      {
         PrintFormat("[NodeTrade] -> Error code: %d", err);
         g_cloud_status_text = StringFormat("Error %d (Mode Lokal)", err);
      }
      return false;
   }

   int res_size = ArraySize(result);
   if(res_size > 0)
      response = CharArrayToString(result, 0, res_size, CP_UTF8);
   else
      response = "";

   if(status < 200 || status >= 300)
   {
      g_cloud_connected = false;
      PrintFormat("[NodeTrade] Server mengembalikan HTTP %d: %s", status, response);
      g_cloud_status_text = StringFormat("Server HTTP %d", status);
      return false;
   }

   g_cloud_connected = true;
   g_cloud_status_text = "ONLINE (NodeTrade Cloud AI)";
   return true;
}

//+------------------------------------------------------------------+
//| Authentication & Session Handling                                |
//+------------------------------------------------------------------+
bool TryActivate()
{
   string acc = AccountID();
   string key = InpActivationCode;
   if(key == "") key = "NODETRADE-DEMO-KEY-2026";

   string body = "{\"account_id\":\"" + JsonEscape(acc) + "\",\"activation_key\":\"" + JsonEscape(key) + "\"}";
   string response = "";
   
   if(!HttpPost("/v1/activate", body, false, response))
      return false;

   string token = ExtractJsonString(response, "token");
   if(token == "")
      token = ExtractJsonString(response, "session_token");

   if(token == "")
      return false;

   g_session_token = token;
   g_cloud_connected = true;
   g_cloud_status_text = "ONLINE (NodeTrade Cloud AI)";
   PrintFormat("[NodeTrade] Aktivasi Cloud BERHASIL untuk Akun %s. Sesi Token: %s...", acc, StringSubstr(token, 0, 10));
   return true;
}

bool Heartbeat()
{
   if(g_session_token == "") return false;
   string body = "{\"account_id\":\"" + JsonEscape(AccountID()) + "\",\"timestamp\":" + IntegerToString((long)TimeCurrent()) + "}";
   string response;
   if(HttpPost("/v1/heartbeat", body, true, response))
   {
      g_last_heartbeat = TimeCurrent();
      return true;
   }
   return false;
}

void RefreshDayStart()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime marker = StructToTime(dt) - (dt.hour * 3600) - (dt.min * 60) - dt.sec;
   if(marker != g_day_marker)
   {
      g_day_marker = marker;
      g_day_start_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   }
   if(g_day_start_equity <= 0.0)
      g_day_start_equity = AccountInfoDouble(ACCOUNT_EQUITY);
}

//+------------------------------------------------------------------+
//| Trade Volume Normalization & Position Queries                    |
//+------------------------------------------------------------------+
double NormalizeVolume(const double requested)
{
   double minv = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxv = MathMin(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), InpMaxVolume);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0.0 || maxv < minv) return 0.0;

   double v = MathMax(minv, MathMin(maxv, requested));
   v = MathFloor((v / step) + 1e-9) * step;

   int digits = 2;
   if(step < 0.01) digits = 3;
   if(step < 0.001) digits = 4;
   return (v >= minv) ? NormalizeDouble(v, digits) : 0.0;
}

bool HasOurPosition(const ENUM_POSITION_TYPE type)
{
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == type) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| On-Chart HUD Display                                             |
//+------------------------------------------------------------------+
void UpdateChartHUD(const string current_signal, const double sl, const double tp)
{
   double cur_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double cur_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double pnl = cur_equity - g_day_start_equity;
   double pnl_pct = (g_day_start_equity > 0) ? (pnl / g_day_start_equity) * 100.0 : 0.0;
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);

   string hud = "";
   hud += "═══════════════════════════════════════════════════════\n";
   hud += "         ✦ NODETRADE QUANT TRADING SYSTEM ✦\n";
   hud += "═══════════════════════════════════════════════════════\n";
   hud += StringFormat(" Engine Mode   : %s\n", g_cloud_connected ? "● [ CLOUD AI SYNCED ]" : "▲ [ AUTONOMOUS LOCAL QUANT ]");
   hud += StringFormat(" Cloud Status  : %s\n", g_cloud_status_text);
   hud += StringFormat(" Akun MT5      : #%s (%s)\n", AccountID(), AccountInfoString(ACCOUNT_COMPANY));
   hud += StringFormat(" Pair / TF     : %s, %s (Spread: %d pts)\n", _Symbol, EnumToString(Period()), spread);
   hud += StringFormat(" Eksekusi Riil : %s (Lot: %.2f | Magic: %d)\n", InpLiveTrading ? "AKTIF (Live Orders)" : "MONITOR ONLY (Simulasi)", InpVolume, InpMagic);
   hud += "───────────────────────────────────────────────────────\n";
   hud += StringFormat(" Sinyal Terkini: %s\n", current_signal);
   if(sl > 0 || tp > 0)
   {
      hud += StringFormat(" Target/Risk   : SL: %.5f | TP: %.5f\n", sl, tp);
   }
   hud += StringFormat(" Status Log    : %s\n", g_last_action_desc);
   hud += "───────────────────────────────────────────────────────\n";
   hud += StringFormat(" Saldo / Equity: $%.2f / $%.2f\n", cur_balance, cur_equity);
   hud += StringFormat(" Profit Harian : %s$%.2f (%.2f%%)\n", (pnl >= 0 ? "+" : ""), pnl, pnl_pct);
   hud += "═══════════════════════════════════════════════════════\n";

   Comment(hud);
}

//+------------------------------------------------------------------+
//| Trade Execution Logic                                            |
//+------------------------------------------------------------------+
bool ExecuteOrder(const string action, const double lot, const double stop, const double target, const string note)
{
   if(!InpLiveTrading)
   {
      g_last_action_desc = StringFormat("[Simulasi] Sinyal %s %.2f lot (LiveTrading=OFF)", action, lot);
      return true;
   }

   double v = NormalizeVolume(lot > 0 ? lot : InpVolume);
   if(v <= 0.0) return false;

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetAsyncMode(false);

   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0)
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if((filling & SYMBOL_FILLING_IOC) != 0)
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      trade.SetTypeFilling(ORDER_FILLING_RETURN);

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double sl_norm = (stop > 0) ? NormalizeDouble(stop, digits) : 0.0;
   double tp_norm = (target > 0) ? NormalizeDouble(target, digits) : 0.0;

   bool sent = false;
   if(action == "BUY" || action == "long")
   {
      if(!InpAllowLong || HasOurPosition(POSITION_TYPE_BUY)) return true;
      sent = trade.Buy(v, _Symbol, 0.0, sl_norm, tp_norm, "NodeTrade AI");
   }
   else if(action == "SELL" || action == "short")
   {
      if(!InpAllowShort || HasOurPosition(POSITION_TYPE_SELL)) return true;
      sent = trade.Sell(v, _Symbol, 0.0, sl_norm, tp_norm, "NodeTrade AI");
   }

   uint rc = trade.ResultRetcode();
   if(sent && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED))
   {
      g_last_action_desc = StringFormat("Order %s %.2f lot BERHASIL dieksekusi", action, v);
      PrintFormat("[NodeTrade] Order Berhasil: %s %.2f lot at Market, SL=%.5f, TP=%.5f (%s)", action, v, sl_norm, tp_norm, note);
      return true;
   }
   else
   {
      g_last_action_desc = StringFormat("Order %s ditolak broker (retcode=%u: %s)", action, rc, trade.ResultRetcodeDescription());
      PrintFormat("[NodeTrade] Order Error %u: %s", rc, trade.ResultRetcodeDescription());
      return false;
   }
}

//+------------------------------------------------------------------+
//| Dynamic ATR Trailing Stop Handler                                |
//+------------------------------------------------------------------+
void ApplyTrailingStop()
{
   if(!InpAutoTrailingStop || g_h_atr == INVALID_HANDLE) return;

   double atr_val[1];
   if(CopyBuffer(g_h_atr, 0, 0, 1, atr_val) <= 0) return;
   double atr = atr_val[0];
   if(atr <= 0) return;

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return;

   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;

      ENUM_POSITION_TYPE ptype = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double open_price = PositionGetDouble(POSITION_PRICE_OPEN);
      double cur_sl = PositionGetDouble(POSITION_SL);
      double cur_tp = PositionGetDouble(POSITION_TP);

      if(ptype == POSITION_TYPE_BUY)
      {
         // Trail if price moved in profit by at least 1 ATR
         if(tick.bid - open_price > atr)
         {
            double new_sl = NormalizeDouble(tick.bid - (atr * InpATR_SL_Multiplier), digits);
            if(new_sl > cur_sl + (atr * 0.2))
            {
               trade.PositionModify(ticket, new_sl, cur_tp);
            }
         }
      }
      else if(ptype == POSITION_TYPE_SELL)
      {
         if(open_price - tick.ask > atr)
         {
            double new_sl = NormalizeDouble(tick.ask + (atr * InpATR_SL_Multiplier), digits);
            if(cur_sl == 0.0 || new_sl < cur_sl - (atr * 0.2))
            {
               trade.PositionModify(ticket, new_sl, cur_tp);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Autonomous Local Quant Engine (Evaluated on new bar / tick)      |
//+------------------------------------------------------------------+
void RunAutonomousQuantEngine()
{
   if(!InpEnableLocalQuant) return;

   double fast_ema[2], slow_ema[2], trend_ema[2], rsi[2], atr[1];
   if(CopyBuffer(g_h_fast_ema, 0, 0, 2, fast_ema) < 2) return;
   if(CopyBuffer(g_h_slow_ema, 0, 0, 2, slow_ema) < 2) return;
   if(CopyBuffer(g_h_trend_ema, 0, 0, 2, trend_ema) < 2) return;
   if(CopyBuffer(g_h_rsi, 0, 0, 2, rsi) < 2) return;
   if(CopyBuffer(g_h_atr, 0, 0, 1, atr) < 1) return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick) || tick.bid <= 0.0 || tick.ask <= 0.0) return;

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double atr_val = atr[0];
   string signal = "HOLD (Menunggu Konfirmasi Trend)";
   double sl = 0.0, tp = 0.0;

   // Bullish Trend & Momentum Crossover
   bool fast_crossed_above = (fast_ema[1] <= slow_ema[1] && fast_ema[0] > slow_ema[0]);
   bool bullish_trend = (tick.ask > trend_ema[0] && fast_ema[0] > slow_ema[0]);
   bool rsi_long_ok = (rsi[0] >= 48.0 && rsi[0] <= 70.0);

   // Bearish Trend & Momentum Crossover
   bool fast_crossed_below = (fast_ema[1] >= slow_ema[1] && fast_ema[0] < slow_ema[0]);
   bool bearish_trend = (tick.bid < trend_ema[0] && fast_ema[0] < slow_ema[0]);
   bool rsi_short_ok = (rsi[0] <= 52.0 && rsi[0] >= 30.0);

   if((fast_crossed_above || bullish_trend) && rsi_long_ok && !HasOurPosition(POSITION_TYPE_BUY))
   {
      signal = "BUY (Bullish Trend + RSI Momentum)";
      sl = NormalizeDouble(tick.bid - (atr_val * InpATR_SL_Multiplier), digits);
      tp = NormalizeDouble(tick.ask + (atr_val * InpATR_TP_Multiplier), digits);

      if(fast_crossed_above)
      {
         ExecuteOrder("BUY", InpVolume, sl, tp, "Autonomous Quant Engine Crossover");
      }
   }
   else if((fast_crossed_below || bearish_trend) && rsi_short_ok && !HasOurPosition(POSITION_TYPE_SELL))
   {
      signal = "SELL (Bearish Trend + RSI Momentum)";
      sl = NormalizeDouble(tick.ask + (atr_val * InpATR_SL_Multiplier), digits);
      tp = NormalizeDouble(tick.bid - (atr_val * InpATR_TP_Multiplier), digits);

      if(fast_crossed_below)
      {
         ExecuteOrder("SELL", InpVolume, sl, tp, "Autonomous Quant Engine Crossover");
      }
   }

   UpdateChartHUD(signal, sl, tp);
}

//+------------------------------------------------------------------+
//| Cloud Quant Strategy Sync                                        |
//+------------------------------------------------------------------+
void RunCloudQuantSync()
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_CURRENT, 0, 60, rates);
   if(copied < 30) return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick) || tick.bid <= 0.0 || tick.ask <= 0.0) return;

   string body = StringFormat(
      "{\"account_id\":\"%s\",\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"equity\":%.2f,\"day_start_equity\":%.2f}",
      JsonEscape(AccountID()), JsonEscape(_Symbol), tick.bid, tick.ask,
      AccountInfoDouble(ACCOUNT_EQUITY), g_day_start_equity
   );

   string response = "";
   if(!HttpPost("/v1/analyze", body, true, response))
   {
      // Fallback seamlessly to local engine if cloud request failed
      RunAutonomousQuantEngine();
      return;
   }

   string action = ExtractJsonString(response, "action");
   double sl = ExtractJsonNumber(response, "stop");
   double tp = ExtractJsonNumber(response, "target");
   double vol = ExtractJsonNumber(response, "volume", InpVolume);

   string signal_text = StringFormat("Cloud AI Signal: %s", action);
   if(action == "long" || action == "BUY")
   {
      signal_text = "BUY (NodeTrade AI Cloud Model)";
      ExecuteOrder("BUY", vol, sl, tp, "Cloud AI Inference");
   }
   else if(action == "short" || action == "SELL")
   {
      signal_text = "SELL (NodeTrade AI Cloud Model)";
      ExecuteOrder("SELL", vol, sl, tp, "Cloud AI Inference");
   }

   UpdateChartHUD(signal_text, sl, tp);
}

//+------------------------------------------------------------------+
//| Expert Initialization Function (Rock-Solid & Non-Blocking)       |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("─────────────────────────────────────────────────────────");
   Print("[NodeTrade] Inisialisasi EA NodeTrade v2.0...");
   PrintFormat("[NodeTrade] Akun: %s | Server: %s", AccountID(), CleanServerOrigin());

   RefreshDayStart();
   trade.SetExpertMagicNumber(InpMagic);

   // Initialize built-in indicators for local quant engine
   g_h_fast_ema  = iMA(_Symbol, PERIOD_CURRENT, InpFastEMA, 0, MODE_EMA, PRICE_CLOSE);
   g_h_slow_ema  = iMA(_Symbol, PERIOD_CURRENT, InpSlowEMA, 0, MODE_EMA, PRICE_CLOSE);
   g_h_trend_ema = iMA(_Symbol, PERIOD_CURRENT, InpTrendEMA, 0, MODE_EMA, PRICE_CLOSE);
   g_h_rsi       = iRSI(_Symbol, PERIOD_CURRENT, InpRSIPeriod, PRICE_CLOSE);
   g_h_atr       = iATR(_Symbol, PERIOD_CURRENT, InpATRPeriod);

   // Attempt background cloud connection
   g_last_activate_try = TimeCurrent();
   if(TryActivate())
   {
      Print("[NodeTrade] Terhubung ke Cloud Server AI.");
   }
   else
   {
      Print("[NodeTrade] Info: Cloud belum terhubung langsung. Engine Quant Lokal Otomatis diaktifkan agar EA tetap jalan normal!");
   }

   EventSetTimer(MathMax(1, InpTimerSeconds));
   UpdateChartHUD("Inisialisasi Siap. Memulai scanning...", 0, 0);

   PrintFormat("[NodeTrade] EA AKTIF! Live Trading: %s | Fallback Quant: AKTIF", InpLiveTrading ? "ON" : "OFF (Monitoring)");
   Print("─────────────────────────────────────────────────────────");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert Deinitialization Function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");

   if(g_h_fast_ema != INVALID_HANDLE)  IndicatorRelease(g_h_fast_ema);
   if(g_h_slow_ema != INVALID_HANDLE)  IndicatorRelease(g_h_slow_ema);
   if(g_h_trend_ema != INVALID_HANDLE) IndicatorRelease(g_h_trend_ema);
   if(g_h_rsi != INVALID_HANDLE)       IndicatorRelease(g_h_rsi);
   if(g_h_atr != INVALID_HANDLE)       IndicatorRelease(g_h_atr);

   PrintFormat("[NodeTrade] EA dilepas dari chart (reason=%d).", reason);
}

//+------------------------------------------------------------------+
//| Expert Timer Function (Core Loop)                                |
//+------------------------------------------------------------------+
void OnTimer()
{
   RefreshDayStart();

   // Periodic auto-reconnect to cloud if offline
   if(!g_cloud_connected && (TimeCurrent() - g_last_activate_try >= 15))
   {
      g_last_activate_try = TimeCurrent();
      TryActivate();
   }

   // Maintain active cloud heartbeat
   if(g_cloud_connected && (TimeCurrent() - g_last_heartbeat >= 20))
   {
      Heartbeat();
   }

   // Execute either Cloud AI or Autonomous Quant Engine
   if(g_cloud_connected && g_session_token != "")
   {
      RunCloudQuantSync();
   }
   else
   {
      RunAutonomousQuantEngine();
   }

   // Apply dynamic trailing stop
   ApplyTrailingStop();
}

//+------------------------------------------------------------------+
//| Expert Tick Function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   ApplyTrailingStop();
}
