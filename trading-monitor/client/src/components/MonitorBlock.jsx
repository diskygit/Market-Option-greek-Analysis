import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const MonitorBlock = ({ title, candle, interval, isMinimized: initialMinimized = false }) => {
    const [minimized, setMinimized] = useState(initialMinimized);

    const isGreen = candle?.status === 'GREEN';
    const isRed = candle?.status === 'RED';

    const bgClass = isGreen
        ? "bg-emerald-500/10 border-emerald-500/20"
        : isRed
            ? "bg-red-500/10 border-red-500/20"
            : "bg-[#16161a] border-white/5";

    const shadowClass = isGreen
        ? "shadow-[0_0_20px_rgba(16,185,129,0.1)]"
        : isRed
            ? "shadow-[0_0_20px_rgba(239,68,68,0.1)]"
            : "shadow-2xl";

    return (
        <div className={twMerge(clsx(
            "relative rounded-2xl border transition-all duration-500 transform overflow-hidden",
            bgClass, shadowClass,
            minimized ? "p-3" : "p-6"
        ))}>
            <div className="flex justify-between items-start">
                <div onClick={() => setMinimized(!minimized)} className="cursor-pointer flex-1">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">{title || '---'}</h3>
                    <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-white/20" />
                        <span className="text-[10px] font-bold text-white/40">{interval || '1m'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={cn(
                        "p-2 rounded-xl transition-colors duration-500",
                        isGreen ? "bg-emerald-500/20" : isRed ? "bg-red-500/20" : "bg-white/5"
                    )}>
                        {isGreen ? <TrendingUp size={18} className="text-emerald-400" /> :
                            isRed ? <TrendingDown size={18} className="text-red-400" /> :
                                <Minus size={18} className="text-slate-500" />}
                    </div>
                    <button
                        onClick={() => setMinimized(!minimized)}
                        className="p-1 px-2 border border-white/10 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all"
                    >
                        {minimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                </div>
            </div>

            {!minimized && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1">
                        <p className="text-6xl font-black text-white font-mono tracking-tighter">
                            {candle?.close?.toFixed(2) || '0.00'}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-black px-3 py-1 rounded-full uppercase tracking-widest", isGreen ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" : isRed ? "bg-red-500/20 text-red-400 border border-red-500/20" : "bg-white/5 text-slate-500")}>
                                {candle?.status || 'NEUTRAL'}
                            </span>
                        </div>
                    </div>

                    {/* OHLC Bar - Scaled Up */}
                    <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-4 gap-4">
                        <div className="text-center">
                            <p className="text-[11px] uppercase font-black text-white/20 mb-2">Open</p>
                            <p className="text-[16px] font-bold font-mono text-white/80">{candle?.open?.toFixed(1) || '-'}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[11px] uppercase font-black text-white/20 mb-2">High</p>
                            <p className="text-[16px] font-bold font-mono text-emerald-400">{candle?.high?.toFixed(1) || '-'}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[11px] uppercase font-black text-white/20 mb-2">Low</p>
                            <p className="text-[16px] font-bold font-mono text-red-400">{candle?.low?.toFixed(1) || '-'}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[11px] uppercase font-black text-white/20 mb-2">Close</p>
                            <p className="text-[16px] font-bold font-mono text-white/80">{candle?.close?.toFixed(1) || '-'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Decorative accent */}
            <div className={cn(
                "absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl opacity-50",
                isGreen ? "bg-emerald-500" : isRed ? "bg-red-500" : "bg-transparent"
            )} />
        </div>
    );
};

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export default MonitorBlock;
