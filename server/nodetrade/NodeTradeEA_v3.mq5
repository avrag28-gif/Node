//+------------------------------------------------------------------+
//| NodeTradeEA v3 - MT5 bridge for NodeTrade Python Ensemble       |
//+------------------------------------------------------------------+
#property strict
#property version "3.10"
#include <Trade/Trade.mqh>

input group "Server"
input string InpServerOrigin = "http://127.0.0.1:3001";
input string InpActivationCode = "NODETRADE-DEMO-KEY-2026";
// Leave empty to use InpServerOrigin for all AI requests.
input string InpAiServiceOrigin = "";
input int InpTimerSeconds = 3;
input int InpHTTPTimeoutMs = 5000;
input int InpBars = 300;
input bool InpLiveTrading = false;
input double InpMaxVolume = 0.10;
input ulong InpMagic = 26090401;

CTrade trade;
string token="";
bool connected=false;
datetime lastActivate=0;
datetime lastHeartbeat=0;
datetime lastTrainingPoll=0;

string AccountID(){ return IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)); }
string TrimUrl(string u){ StringTrimLeft(u); StringTrimRight(u); while(StringLen(u)>0 && StringSubstr(u,StringLen(u)-1,1)=="/") u=StringSubstr(u,0,StringLen(u)-1); return u; }
string ServerBase(){ return TrimUrl(InpServerOrigin); }
string AiBase(){ string u=TrimUrl(InpAiServiceOrigin); return u=="" ? ServerBase() : u; }
string Esc(string s){ StringReplace(s,"\\","\\\\"); StringReplace(s,"\"","\\\""); return s; }
string TfName(ENUM_TIMEFRAMES tf){ if(tf==PERIOD_M5)return "5m"; if(tf==PERIOD_M15)return "15m"; if(tf==PERIOD_H1)return "1h"; if(tf==PERIOD_H4)return "4h"; if(tf==PERIOD_D1)return "1d"; return "15m"; }
ENUM_TIMEFRAMES TfFromString(string tf){ if(tf=="5m")return PERIOD_M5; if(tf=="15m")return PERIOD_M15; if(tf=="1h")return PERIOD_H1; if(tf=="4h")return PERIOD_H4; if(tf=="1d")return PERIOD_D1; return PERIOD_M15; }
string JStr(string j,string key){ int p=StringFind(j,"\""+key+"\""); if(p<0)return ""; p+=StringLen(key)+2; while(p<StringLen(j)&&(StringGetCharacter(j,p)==' '||StringGetCharacter(j,p)==':'))p++; if(p>=StringLen(j)||StringGetCharacter(j,p)!='\"')return ""; p++; int e=StringFind(j,"\"",p); if(e<0)return ""; return StringSubstr(j,p,e-p); }
bool JBool(string j,string key){ int p=StringFind(j,"\""+key+"\""); if(p<0)return false; int t=StringFind(j,"true",p); int f=StringFind(j,"false",p); return t>=0 && (f<0 || t<f); }

bool Post(string base,string path,string body,bool auth,string &out){
   string url=TrimUrl(base)+path;
   string headers="Content-Type: application/json\r\nAccept: application/json\r\nUser-Agent: NodeTradeEA/3.1\r\n";
   if(auth && token!="") headers += "Authorization: Bearer "+token+"\r\n";
   char data[]; StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); if(ArraySize(data)>0)ArrayResize(data,ArraySize(data)-1);
   char result[]; string rh=""; ResetLastError();
   int code=WebRequest("POST",url,headers,InpHTTPTimeoutMs,data,result,rh);
   if(code<200||code>=300){ PrintFormat("[NodeTrade] HTTP %d err=%d url=%s",code,GetLastError(),url); return false; }
   out=CharArrayToString(result,0,ArraySize(result),CP_UTF8); return true;
}
bool Get(string base,string path,string &out){
   string url=TrimUrl(base)+path; string headers="Accept: application/json\r\nUser-Agent: NodeTradeEA/3.1\r\n";
   char data[]; char result[]; string rh=""; ResetLastError(); int code=WebRequest("GET",url,headers,InpHTTPTimeoutMs,data,result,rh);
   if(code<200||code>=300){ PrintFormat("[NodeTrade] HTTP %d err=%d url=%s",code,GetLastError(),url); return false; } out=CharArrayToString(result,0,ArraySize(result),CP_UTF8); return true;
}

bool Activate(){ string body=StringFormat("{\"account_id\":\"%s\",\"activation_key\":\"%s\"}",Esc(AccountID()),Esc(InpActivationCode)); string r=""; if(!Post(ServerBase(),"/v1/activate",body,false,r))return false; token=JStr(r,"token"); connected=(token!=""); return connected; }
void Heartbeat(){ if(token=="")return; string r=""; string body=StringFormat("{\"account_id\":\"%s\",\"symbol\":\"%s\",\"terminal_time\":%d}",Esc(AccountID()),Esc(_Symbol),(long)TimeCurrent()); if(Post(ServerBase(),"/v1/heartbeat",body,true,r))lastHeartbeat=TimeCurrent(); }

string CandleJson(MqlRates &rates[],int n){ string s="["; for(int i=n-1;i>=0;i--){ if(i<n-1)s+=","; s+=StringFormat("{\"time\":%d,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%.0f}",(long)rates[i].time,rates[i].open,rates[i].high,rates[i].low,rates[i].close,(double)rates[i].tick_volume); } return s+"]"; }

void IngestLive(){
   MqlRates rates[]; ArraySetAsSeries(rates,true); int n=CopyRates(_Symbol,Period(),0,MathMax(100,MathMin(InpBars,1000)),rates); if(n<80)return;
   string body=StringFormat("{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"candles\":%s}",Esc(_Symbol),TfName((ENUM_TIMEFRAMES)Period()),CandleJson(rates,n)); string r=""; Post(AiBase(),"/ingest",body,false,r);
}

void PollTrainingRequest(){
   string r=""; if(!Get(AiBase(),"/training/request",r))return; if(!JBool(r,"pending"))return;
   string tf=JStr(r,"timeframe"); string start=JStr(r,"startDate"); string finish=JStr(r,"endDate"); ENUM_TIMEFRAMES period=TfFromString(tf);
   datetime from=StringToTime(start+" 00:00"); datetime to=StringToTime(finish+" 23:59"); if(from<=0||to<=0||to<=from)return;
   MqlRates rates[]; int n=CopyRates(_Symbol,period,from,to,rates); if(n<600){ PrintFormat("[NodeTrade] Training range returned only %d bars",n); return; }
   ArraySetAsSeries(rates,false);
   int chunk=1800;
   for(int pos=0;pos<n;pos+=chunk){
      int count=MathMin(chunk,n-pos); string candles="[";
      for(int i=0;i<count;i++){ if(i>0)candles+=","; MqlRates c=rates[pos+i]; candles+=StringFormat("{\"time\":%d,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%.0f}",(long)c.time,c.open,c.high,c.low,c.close,(double)c.tick_volume); }
      candles+="]"; string body=StringFormat("{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"candles\":%s}",Esc(_Symbol),Esc(tf),candles); string out="";
      if(!Post(AiBase(),"/ingest",body,false,out)){ Print("[NodeTrade] Upload training chunk gagal"); return; }
   }
   string clear=""; Post(AiBase(),"/training/request/clear","{}",false,clear);
   PrintFormat("[NodeTrade] MT5 historical range uploaded: %s %s -> %s (%d bars)",tf,start,finish,n);
}

void Analyze(){
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick))return; MqlRates rates[]; ArraySetAsSeries(rates,true); int n=CopyRates(_Symbol,Period(),0,MathMax(100,MathMin(InpBars,1000)),rates); if(n<80)return;
   string body=StringFormat("{\"account_id\":\"%s\",\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"equity\":%.2f,\"candles\":%s}",Esc(AccountID()),Esc(_Symbol),tick.bid,tick.ask,AccountInfoDouble(ACCOUNT_EQUITY),CandleJson(rates,n));
   string r=""; if(!Post(ServerBase(),"/v1/analyze",body,true,r))return;
   string action=JStr(r,"action"); double vol=0.01; double stop=0,target=0;
   int p=StringFind(r,"\"stop\""); if(p>=0){p=StringFind(r,":",p)+1;stop=StringToDouble(StringSubstr(r,p));}
   p=StringFind(r,"\"target\""); if(p>=0){p=StringFind(r,":",p)+1;target=StringToDouble(StringSubstr(r,p));}
   if(action=="long"||action=="BUY")Execute("BUY",vol,stop,target); else if(action=="short"||action=="SELL")Execute("SELL",vol,stop,target);
}

void Execute(string side,double volume,double sl,double tp){
   if(!InpLiveTrading)return; double minv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN), maxv=MathMin(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),InpMaxVolume), step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP); if(step<=0)return;
   volume=MathMax(minv,MathMin(maxv,volume)); volume=MathFloor(volume/step)*step; trade.SetExpertMagicNumber(InpMagic); trade.SetAsyncMode(false);
   if(side=="BUY")trade.Buy(volume,_Symbol,0,sl,tp,"NodeTrade Python Ensemble"); else if(side=="SELL")trade.Sell(volume,_Symbol,0,sl,tp,"NodeTrade Python Ensemble");
}

int OnInit(){ EventSetTimer(MathMax(1,InpTimerSeconds)); PrintFormat("[NodeTrade] Server=%s AI=%s",ServerBase(),AiBase()); Activate(); return INIT_SUCCEEDED; }
void OnDeinit(const int reason){ EventKillTimer(); }
void OnTimer(){ if(token==""&&TimeCurrent()-lastActivate>=10){lastActivate=TimeCurrent();Activate();} if(token!=""&&TimeCurrent()-lastHeartbeat>=20)Heartbeat(); IngestLive(); if(TimeCurrent()-lastTrainingPoll>=5){lastTrainingPoll=TimeCurrent();PollTrainingRequest();} Analyze(); }
