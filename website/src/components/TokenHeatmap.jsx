import React from 'react';

export default function TokenHeatmap({ explanation, prediction }) {
    const maxAbsVal = Math.max(...explanation.values.map(v => Math.abs(v)), 0.001);
    const isHamVerdict = prediction?.label?.toUpperCase() === 'HAM';

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-fuchsia-500 rounded-full shadow-[0_0_10px_rgba(217,70,239,0.6)]"></span>
                    Token Impact Analysis
                </p>
                <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> Spam</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Ham</span>
                </div>
            </div>

            <div className="bg-[#0f172a]/60 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 flex flex-wrap gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                {explanation.tokens.map((token, idx) => {
                    const val = explanation.values[idx];
                    const absVal = Math.abs(val);
                    const alpha = Math.min(0.9, 0.1 + (absVal / maxAbsVal) * 0.8);

                    // Python logic: Red if v > 0 (Spam trigger), Blue if v < 0 (Legitimate)
                    // We align with the prediction to show supporting tokens in the correct color:
                    const supportsHam = isHamVerdict ? val > 0 : val < 0;

                    const bgRGB = supportsHam ? '16, 185, 129' : '244, 63, 94';
                    const glowRGB = supportsHam ? '5, 150, 105' : '225, 29, 72';

                    const bgClass = `rgba(${bgRGB}, ${alpha})`;

                    const textColor = alpha > 0.4 ? 'text-white' : 'text-slate-200';

                    return (
                        <div key={idx} className="relative group/tok">
                            <div
                                className={`flex flex-col items-center px-4 py-2 rounded-2xl border border-white/10 transition-all duration-500 transform group-hover/tok:scale-110 group-hover/tok:-translate-y-1 group-hover/tok:z-20 cursor-default shadow-lg`}
                                style={{ backgroundColor: bgClass }}
                            >
                                <span className={`text-[14px] font-black tracking-tight ${textColor}`}>
                                    {token}
                                </span>
                                <span className={`text-[9px] font-mono font-bold mt-0.5 opacity-80 ${textColor}`}>
                                    {val > 0 ? '+' : ''}{val.toFixed(2)}
                                </span>
                            </div>

                            {/* Tooltip on hover for exact value and details */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 whitespace-nowrap pointer-events-none z-[100] opacity-0 group-hover/tok:opacity-100 transition-all duration-300 transform group-hover/tok:-translate-y-1">
                                <div className="bg-[#0B0F19]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 shadow-2xl flex flex-col items-center">
                                    <span className="text-slate-400 font-black uppercase text-[8px] tracking-[0.2em] mb-1">SHAP Attribution</span>
                                    <span className={`font-mono font-black text-lg ${supportsHam ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {val.toFixed(4)}
                                    </span>
                                </div>
                                <div className="w-2 h-2 bg-[#0B0F19] border-r border-b border-white/10 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-4 text-[10px] text-slate-500 font-medium italic text-center">
                * Color intensity reflects the strength of association with {isHamVerdict ? 'Legitimate' : 'Spam'} patterns.
            </p>
        </div>
    );
}

