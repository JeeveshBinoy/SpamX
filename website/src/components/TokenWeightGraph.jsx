import React, { useState } from 'react';

export default function TokenWeightGraph({ explanation, model = "System", prediction }) {
    const [hoverIdx, setHoverIdx] = useState(null);

    const vals = explanation.values || [];
    const tokens = explanation.tokens || [];
    const maxAbs = Math.max(...vals.map(v => Math.abs(v)), 0.01);

    const isSpamVerdict = prediction?.label?.toUpperCase() === 'SPAM';

    const data = tokens.map((t, idx) => {
        return { t, v: vals[idx], raw: vals[idx], id: idx };
    });

    return (
        <div className="w-full">
            <div className="flex flex-col gap-2 mb-6 px-2">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.6)]"></span>
                        Influence Distribution
                        <span className="text-slate-600 font-bold ml-1">({model})</span>
                    </p>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div> HAM</span>
                        <div className="w-px h-3 bg-white/5"></div>
                        <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"></div> SPAM</span>
                    </div>
                </div>
                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-800/40 to-transparent"></div>
            </div>

            <div className="bg-[#0B0F19] border border-white/10 rounded-2xl p-4 shadow-lg relative overflow-hidden group/graph">
                {/* Vertical Center Line */}
                <div className="absolute top-0 bottom-0 left-[calc(110px+((100%-165px)/2))] w-[2px] bg-white/[0.05] z-0 pointer-events-none"></div>

                <div className="space-y-3 relative z-10">
                    {data.map((item, idx) => {
                        const isPositive = item.v > 0;
                        const isSpamVerdict = prediction?.label?.toUpperCase() === 'SPAM';
                        
                        // Adaptive Side/Color:
                        // If Spam: Positive is Red-Side (Right), Negative is Green-Side (Left)
                        // If Ham: Positive is Green-Side (Right?), wait - usually Positive is Right.
                        // User said: "emerald green for positvie and rose for negative values ... if idtentified as ham"
                        // So Positive is ALWAYS Right side in this UI.
                        const useRose = isSpamVerdict ? isPositive : !isPositive;
                        const isPositiveSide = isPositive; 
                        const widthPct = (Math.abs(item.v) / maxAbs) * 50;
                        const isActive = hoverIdx === idx;

                        return (
                            <div
                                key={idx}
                                className={`group/row flex items-center gap-4 w-full h-8 transition-all duration-300 ${isActive ? 'z-20 transform scale-[1.02]' : 'opacity-70'}`}
                                onMouseEnter={() => setHoverIdx(idx)}
                                onMouseLeave={() => setHoverIdx(null)}
                            >
                                {/* Token Label */}
                                <div className="w-[100px] shrink-0 flex items-center justify-end px-2">
                                    <span className={`text-[13px] font-black truncate transition-all duration-300 ${isActive ? (useRose ? 'text-rose-400' : 'text-emerald-400') : 'text-slate-300'}`}>
                                        {item.t}
                                    </span>
                                </div>

                                {/* Bar Container */}
                                <div className="flex-1 h-4 relative bg-slate-900/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 z-0"></div>

                                    {/* The Bar */}
                                    <div
                                        className={`absolute h-full transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1) ${isPositiveSide ? 'left-1/2 bg-gradient-to-r' : 'right-1/2 bg-gradient-to-l'} ${useRose ? 'from-rose-500/40 to-rose-500' : 'from-emerald-500/40 to-emerald-500'}`}
                                        style={{
                                            width: `${Math.max(2, widthPct)}%`,
                                            borderRadius: isPositiveSide ? '0 9999px 9999px 0' : '9999px 0 0 9999px',
                                            boxShadow: isActive ? (useRose ? '0 0 20px rgba(244,63,94,0.4)' : '0 0 20px rgba(16,185,129,0.4)') : 'none'
                                        }}
                                    >
                                        <div className={`absolute inset-0 bg-white/20 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}></div>
                                    </div>
                                </div>

                                {/* Score Value */}
                                <div className="w-[45px] shrink-0 flex items-center px-1">
                                    <span className={`text-[10px] font-mono font-black transition-all duration-300 ${isActive ? 'opacity-100 scale-110' : 'opacity-40'}`}>
                                        {item.raw.toFixed(4)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-6 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.5em] text-slate-500/40 pl-[120px] pr-[60px] select-none">
                <span className={`transition-colors ${isSpamVerdict ? 'text-emerald-500/60 hover:text-emerald-500' : 'text-rose-500/60 hover:text-rose-500'}`}>
                    {isSpamVerdict ? 'HAM INFLUENCE' : 'SPAM INFLUENCE'}
                </span>
                <span className="opacity-10">NEUTRAL</span>
                <span className={`transition-colors ${isSpamVerdict ? 'text-rose-500/60 hover:text-rose-500' : 'text-emerald-500/60 hover:text-emerald-500'}`}>
                    {isSpamVerdict ? 'SPAM INFLUENCE' : 'HAM INFLUENCE'}
                </span>
            </div>
        </div>
    );
}
