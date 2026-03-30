import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  LayoutGrid,
  Settings,
  Bell,
  Database,
  Activity,
  Monitor,
  Trash2,
  Plus,
  Power,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  X,
  Target,
  Clock,
  Search,
  Zap,
  Box,
  AlignJustify
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import MonitorBlock from './components/MonitorBlock';

const socket = io('http://localhost:4001');

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const App = () => {
  const [candles, setCandles] = useState({});
  const [brokerStatus, setBrokerStatus] = useState('disconnected');
  const [indices, setIndices] = useState([]);
  const [expiries, setExpiries] = useState([]);
  const [strikesAround, setStrikesAround] = useState([]);
  const [activeMonitors, setActiveMonitors] = useState([]);
  const [spotPrices, setSpotPrices] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // High-pitch "Ting" Sound Logic
  const playTing = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) { }
  }, []);

  // Config UI State
  const [config, setConfig] = useState({
    symbol: '',
    ceStrike: '',
    peStrike: '',
    expiry: '',
    interval: '1m'
  });

  const [uiState, setUiState] = useState({
    minimizedMonitors: new Set(),
    showConfig: true,
    showAlerts: true,
    showMonitors: true,
    alertsHeight: 'compact' // 'compact' or 'expanded'
  });

  useEffect(() => {
    socket.on('broker_status', (status) => setBrokerStatus(status));
    socket.on('monitors_updated', (monitors) => setActiveMonitors(monitors));
    socket.on('new_alert', (alert) => {
      setAlerts(prev => [{ ...alert, receivedAt: Date.now() }, ...prev].slice(0, 100));
      playTing();
    });

    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);

    socket.on('candle_update', (updates) => {
      setCandles(prev => {
        const next = { ...prev };
        updates.forEach(c => {
          next[`${c.token}-${c.interval}`] = c;
          if (['NIFTY', 'BANKNIFTY', 'BSX'].includes(c.symbol)) {
            setSpotPrices(prevSpot => ({ ...prevSpot, [c.symbol]: c.close }));
          }
        });
        return next;
      });
    });

    const loadIndices = () => {
      fetch('http://localhost:4001/indices').then(res => res.json()).then(data => {
        if (data.length > 0) setIndices(data);
        else setTimeout(loadIndices, 2000);
      }).catch(() => setTimeout(loadIndices, 2000));
    };
    loadIndices();

    return () => {
      socket.off('broker_status');
      socket.off('monitors_updated');
      socket.off('candle_update');
      socket.off('new_alert');
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!config.symbol) return;
    fetch(`http://localhost:4001/expiries?symbol=${config.symbol}`)
      .then(res => res.json())
      .then(data => {
        setExpiries(data);
        if (data.length > 0) setConfig(prev => ({ ...prev, expiry: data[0] }));
      });
  }, [config.symbol]);

  useEffect(() => {
    if (!config.symbol || !config.expiry) return;
    const spot = spotPrices[config.symbol];
    if (spot) {
      fetch(`http://localhost:4001/atm?symbol=${config.symbol}&expiry=${config.expiry}&spot=${spot}`)
        .then(res => res.json())
        .then(data => {
          if (data.atm) setConfig(prev => ({ ...prev, ceStrike: data.atm, peStrike: data.atm }));
        });
    }
  }, [config.symbol, config.expiry, !!spotPrices[config.symbol]]); // Trigger on first spot arrival

  useEffect(() => {
    // Choose which strike to base the "Selector Area" on
    const anchorStrike = config.ceStrike || config.peStrike;
    if (!config.symbol || !config.expiry || !anchorStrike) return;
    fetch(`http://localhost:4001/strikes_around?symbol=${config.symbol}&expiry=${config.expiry}&center=${anchorStrike}`)
      .then(res => res.json())
      .then(data => setStrikesAround(data));
  }, [config.ceStrike, config.peStrike, config.symbol, config.expiry]);

  const handleToggleBroker = () => socket.emit('toggle_broker', brokerStatus !== 'connected');

  const handleAddMonitors = () => {
    if (!config.symbol || !config.ceStrike || !config.peStrike || !config.expiry) return;
    socket.emit('subscribe', {
      action: 'add',
      monitor: {
        symbol: config.symbol,
        ceStrike: config.ceStrike,
        peStrike: config.peStrike,
        expiry: config.expiry,
        interval: config.interval
      }
    });
  };

  const handleRemoveMonitor = (m) => socket.emit('subscribe', { action: 'remove', monitor: m });

  const toggleVisibility = (id) => {
    setUiState(prev => {
      const next = new Set(prev.minimizedMonitors);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, minimizedMonitors: next };
    });
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0f0f12] border-r border-white/5 flex flex-col pt-6">
        <div className="px-6 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="text-white" size={18} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white italic">FUNNEL</h1>
        </div>

        <div className="px-4 mb-4">
          <button onClick={handleToggleBroker} className={cn("w-full py-2 rounded-xl border flex items-center justify-center gap-2 transition-all duration-300 font-bold text-[10px] uppercase tracking-widest", brokerStatus === 'connected' ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500")}>
            <Power size={12} />
            {brokerStatus === 'connected' ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {/* STRIKES VISIBILITY - Scrollable Section */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 mb-2">
            <p className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 mb-2 flex items-center gap-2 italic">
              <Monitor size={10} className="text-blue-500/50" /> Strikes Visibility
            </p>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin space-y-1 px-1">
              {activeMonitors.map((m) => {
                const id = `${m.symbol}-${m.ceStrike}-${m.peStrike}-${m.expiry}-${m.interval}`;
                const isMinimized = uiState.minimizedMonitors.has(id);
                return (
                  <div key={id} className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                    <button onClick={() => toggleVisibility(id)} className="flex-1 text-left truncate">
                      <p className="text-[9px] font-bold text-white/80">{m.symbol} | C:{m.ceStrike} P:{m.peStrike}</p>
                    </button>
                    <button onClick={() => toggleVisibility(id)} className="text-white/20 hover:text-white transition-all">
                      {isMinimized ? <EyeOff size={10} /> : <Eye size={10} />}
                    </button>
                    <button onClick={() => handleRemoveMonitor(m)} className="text-red-500/20 hover:text-red-500 transition-all">
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ALERTS SECTION - Middle Log */}
          <div className="flex-1 flex flex-col px-4 min-h-0 mt-4">
            <p className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 mb-2 flex items-center gap-2 italic">
              <Bell size={10} className="text-amber-500/50" /> Alerts Feed
            </p>
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 px-1 pb-4">
              {alerts.filter(a => (currentTime - a.receivedAt) < 2500).map((a, idx) => {
                const colors = {
                  'Call gammaBlast': 'from-emerald-500/20 to-transparent border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]',
                  'Put gammaBlast': 'from-red-500/20 to-transparent border-red-500/30 text-red-400 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]',
                  'either side gammaBlast': 'from-amber-500/20 to-transparent border-amber-500/30 text-amber-400 shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]',
                  'Theta decay': 'from-purple-500/20 to-transparent border-purple-500/30 text-purple-400 shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]'
                };
                const style = colors[a.name] || 'from-white/10 to-transparent border-white/5 text-white/60';

                return (
                  <div key={idx} className={cn("bg-gradient-to-br border p-3.5 rounded-xl animate-in slide-in-from-right-2 fade-in duration-300", style)}>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-[11px] font-black uppercase tracking-tighter">{a.name}</span>
                      <span className="text-[9px] opacity-50 font-bold">{a.timestamp}</span>
                    </div>
                    <p className="text-[14px] font-black leading-tight italic tracking-tight">{a.index} {a.strike}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ELEMENTS SECTION - Toggles */}
          <div className="p-4 bg-black/20 border-t border-white/5">
            <p className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 mb-3 italic">
              <Zap size={10} className="inline mr-1" /> Elements Controller
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setUiState(s => ({ ...s, showConfig: !s.showConfig }))}
                className={cn("py-2 rounded-lg border text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-all", uiState.showConfig ? "bg-blue-600/10 border-blue-600/30 text-blue-400" : "bg-white/5 border-white/5 text-white/20 opacity-50")}
              >
                <Settings size={14} />
                Config
              </button>
              <button
                onClick={() => setUiState(s => ({ ...s, showMonitors: !s.showMonitors }))}
                className={cn("py-2 rounded-lg border text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-all", uiState.showMonitors ? "bg-emerald-600/10 border-emerald-600/30 text-emerald-400" : "bg-white/5 border-white/5 text-white/20 opacity-50")}
              >
                <Monitor size={14} />
                Monitors
              </button>
              <button
                onClick={() => setUiState(s => ({ ...s, showAlerts: !s.showAlerts }))}
                className={cn("py-2 rounded-lg border text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-all", uiState.showAlerts ? "bg-amber-600/10 border-amber-600/30 text-amber-400" : "bg-white/5 border-white/5 text-white/20 opacity-50")}
              >
                <AlignJustify size={14} />
                Alerts
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden p-6 gap-6 relative">
        {/* CONFIG BAR - Conditional */}
        {uiState.showConfig && (
          <div className="bg-[#16161a] border border-white/5 p-4 rounded-[2rem] flex items-center gap-6 shadow-2xl animate-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-4 gap-6 flex-1">
              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-white/30 font-black tracking-widest pl-1">Index</label>
                <select
                  className="w-full bg-[#1f1f25] border border-white/5 rounded-xl px-4 py-2 text-[10px] text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  value={config.symbol}
                  onChange={e => setConfig({ ...config, symbol: e.target.value })}
                >
                  <option value="">Select Index</option>
                  {indices.map(idx => <option key={idx} value={idx}>{idx}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-white/30 font-black tracking-widest pl-1">Expiry</label>
                <select
                  className="w-full bg-[#1f1f25] border border-white/5 rounded-xl px-4 py-2 text-[10px] text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  value={config.expiry}
                  onChange={e => setConfig({ ...config, expiry: e.target.value })}
                >
                  {expiries.map(e => <option key={e} value={e}>{e.split('T')[0]}</option>)}
                </select>
              </div>

              <div className="space-y-1.5 col-span-3">
                <label className="text-[8px] uppercase text-white/30 font-black tracking-widest pl-1">Call Strike | Put Strike | Timeframe</label>
                <div className="flex gap-3">
                  <div className="flex gap-2 bg-[#1f1f25]/50 p-1 rounded-xl border border-white/5">
                    <input
                      type="number"
                      placeholder="CE Strike"
                      className="w-24 bg-[#1f1f25] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white focus:ring-1 focus:ring-emerald-500 outline-none font-bold placeholder:text-white/10"
                      value={config.ceStrike}
                      onChange={e => setConfig({ ...config, ceStrike: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="PE Strike"
                      className="w-24 bg-[#1f1f25] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white focus:ring-1 focus:ring-red-500 outline-none font-bold placeholder:text-white/10"
                      value={config.peStrike}
                      onChange={e => setConfig({ ...config, peStrike: e.target.value })}
                    />
                  </div>

                  <select
                    className="bg-[#1f1f25] border border-white/5 rounded-xl px-4 py-2 text-[10px] text-white focus:ring-1 focus:ring-blue-500 outline-none w-20"
                    value={config.interval}
                    onChange={e => setConfig({ ...config, interval: e.target.value })}
                  >
                    {['1m', '5m', '10m', '15m', '30m'].map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddMonitors}
              disabled={!config.symbol || !config.ceStrike || !config.peStrike}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-black px-6 py-3 rounded-xl text-[10px] uppercase shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
            >
              <Plus size={14} /> Add Monitors
            </button>
          </div>
        )}

        {/* STRIKE RANGE SELECTOR */}
        {strikesAround.length > 0 && config.symbol && (
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl animate-in fade-in duration-500 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[7px] uppercase font-black text-white/20 tracking-[0.2em] w-full mb-1 ml-2 italic">Selector Area (+/- 4)</p>
              {strikesAround.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setConfig(prev => ({ ...prev, ceStrike: s, peStrike: s }));
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                    (config.ceStrike === s || config.peStrike === s)
                      ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                      : "bg-[#1f1f25] border-white/5 text-white/40 hover:border-white/10"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MONITOR GRID - Conditional */}
        <div className={cn("flex-1 overflow-y-auto scrollbar-thin pr-2 min-h-0", !uiState.showMonitors && "hidden")}>
          {activeMonitors.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/5 space-y-4 opacity-20">
              <Monitor size={60} strokeWidth={1} />
              <p className="text-[10px] font-black tracking-[0.5em] uppercase">Ready to Monitor</p>
            </div>
          ) : (
            <div className="space-y-12 pb-10">
              {activeMonitors.map((m) => {
                const id = `${m.symbol}-${m.ceStrike}-${m.peStrike}-${m.expiry}-${m.interval}`;
                const isMinimized = uiState.minimizedMonitors.has(id);
                return (
                  <div key={id} className="relative animate-in zoom-in-95 duration-500">
                    <div className="flex items-center justify-between mb-4 px-2">
                      <div className="flex items-center gap-4">
                        <div className="bg-blue-600/10 px-4 py-2 rounded-xl border border-blue-500/30 flex items-center gap-3">
                          <Target size={16} className="text-blue-500" />
                          <span className="text-sm font-black uppercase tracking-widest text-blue-400">{m.symbol} | C:{m.ceStrike} P:{m.peStrike}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
                          <Clock size={14} className="text-white/40" />
                          <span className="text-[12px] font-mono font-black text-white/80 uppercase">
                            {(() => {
                              const durationMap = { '1m': 60000, '5m': 300000, '10m': 600000, '15m': 900000, '30m': 1800000 };
                              const duration = durationMap[m.interval] || 60000;
                              const start = Math.floor(currentTime / duration) * duration;
                              const end = start + duration;
                              const format = (ms) => new Date(ms).toTimeString().split(' ')[0];
                              return `${format(start)} - ${format(currentTime)} / ${format(end)}`;
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleVisibility(id)} className="p-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 text-white/20 hover:text-white transition-all">
                          {isMinimized ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => handleRemoveMonitor(m)} className="p-2 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/20 hover:text-red-500 transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {!isMinimized && (
                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <MonitorBlock title="Spot Action" candle={candles[`${m.tokens?.spot?.token}-${m.interval}`]} interval={m.interval} />
                        <MonitorBlock title={`${m.ceStrike} CALL`} candle={candles[`${m.tokens?.ce?.token}-${m.interval}`]} interval={m.interval} />
                        <MonitorBlock title={`${m.peStrike} PUT`} candle={candles[`${m.tokens?.pe?.token}-${m.interval}`]} interval={m.interval} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CONSOLIDATED ALERTS - Bottom Table */}
        {uiState.showAlerts && (
          <div className={cn(
            "bg-[#101014] border border-white/10 rounded-[1.5rem] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-500 overflow-hidden shrink-0 transition-all",
            !uiState.showMonitors ? "flex-1" : (uiState.alertsHeight === 'expanded' ? "h-[450px]" : "h-[200px]")
          )}>
            <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <span className="text-[13px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-3 italic">
                <AlignJustify size={18} /> Consolidated Alerts Log
              </span>
              <div className="flex items-center gap-4">
                {uiState.showMonitors && (
                  <button
                    onClick={() => setUiState(s => ({ ...s, alertsHeight: s.alertsHeight === 'expanded' ? 'compact' : 'expanded' }))}
                    className="text-[10px] font-black uppercase text-blue-400 hover:text-white transition-all bg-blue-600/10 px-3 py-1 rounded-lg border border-blue-500/20"
                  >
                    {uiState.alertsHeight === 'expanded' ? 'Compress' : 'Expand'}
                  </button>
                )}
                <button onClick={() => setAlerts([])} className="text-[10px] font-black uppercase text-white/20 hover:text-red-500 transition-all">Clear Logs</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0a0a0c] z-10 shadow-xl">
                  <tr className="border-b border-white/20">
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">Timer</th>
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">Index</th>
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">Strike</th>
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">Spot Price</th>
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">CE / PE Price</th>
                    <th className="px-6 py-4 text-[12px] font-black text-white/70 uppercase tracking-wider">Alert Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {alerts.map((a, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-3 text-[12px] font-bold text-white/30">{a.timestamp}</td>
                      <td className="px-6 py-3 text-[14px] font-black text-white/90">{a.index}</td>
                      <td className="px-6 py-3 text-[14px] font-black text-blue-400">{a.strike}</td>
                      <td className="px-6 py-3 text-[14px] font-black text-white/100">{a.prices.spot.toFixed(2)}</td>
                      <td className="px-6 py-3 text-[12px] font-bold text-white/60">
                        {a.prices.ce.toFixed(2)} / {a.prices.pe.toFixed(2)}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                          a.name.includes('gammaBlast') ? "bg-amber-500/20 text-amber-500 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-white/5 text-white/40"
                        )}>
                          {a.name}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
