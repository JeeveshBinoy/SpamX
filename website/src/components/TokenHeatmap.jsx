import React from 'react';

export default function TokenHeatmap({ explanation, prediction }) {
    const maxAbsVal = Math.max(...explanation.values.map(v => Math.abs(v)));
    const isHamVerdict = prediction?.label?.toUpperCase() === 'HAM';

    return (
        <div className="w-full">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-fuchsia-400 rounded-full shadow-[0_0_8px_rgba(232,121,249,0.8)]"></span>
                Token Analysis
                <span className="ml-auto text-[10px] text-slate-500 normal-case tracking-normal font-medium bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-700/50">Green = Ham, Red = Spam</span>
            </p>
            <div className="bg-[#0f172a]/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 flex flex-wrap gap-2.5 shadow-inner">
                {explanation.tokens.map((token, idx) => {
                    const val = explanation.values[idx];
                    const absVal = Math.abs(val);
                    const intensity = Math.min(1, absVal / maxAbsVal);


                    const supportsHam = isHamVerdict ? val > 0 : val < 0;

                    const bgRGB = supportsHam ? '16,185,129' : '244,63,94';
                    const glowRGB = supportsHam ? '5,150,105' : '225,29,72';

                    return (
                        <div key={idx} className="relative group/tok">
                            <span
                                className="inline-block px-3 py-1.5 rounded-xl text-[15px] font-bold cursor-help transition-all duration-300 transform group-hover/tok:scale-110 group-hover/tok:-translate-y-1 group-hover/tok:z-10"
                                style={{
                                    backgroundColor: `rgba(${bgRGB},${0.1 + intensity * 0.3})`,
                                    border: `1px solid rgba(${bgRGB},${0.2 + intensity * 0.6})`,
                                    color: `rgba(255,255,255,${0.85 + intensity * 0.15})`,
                                    boxShadow: `0 4px 12px rgba(${glowRGB}, ${0.05 + intensity * 0.3})`
                                }}
                            >
                                {token}
                            </span>

                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 whitespace-nowrap pointer-events-none z-[100] opacity-0 group-hover/tok:opacity-100 transition-all duration-300 transform group-hover/tok:-translate-y-1">
                                <div className="bg-[#0B0F19]/95 backdrop-blur-xl border border-slate-600 rounded-xl px-4 py-2.5 shadow-2xl flex flex-col items-center min-w-[120px]">
                                    <span className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-1">Score</span>
                                    <span className={`font-black text-xl tracking-tight leading-none drop-shadow-md ${supportsHam ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {val.toFixed(3)}
                                    </span>
                                    <div className={`mt-1.5 h-0.5 w-full rounded-full bg-gradient-to-r ${supportsHam ? 'from-emerald-500/0 via-emerald-500 to-emerald-500/0' : 'from-rose-500/0 via-rose-500 to-rose-500/0'}`}></div>
                                </div>
                                <div className="w-3 h-3 bg-[#0B0F19] border-r border-b border-slate-600 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
