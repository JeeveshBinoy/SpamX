import React from 'react';

export default function ExplanationBox({ prediction, explanation, model }) {
    const isSpam = prediction.label && prediction.label.toUpperCase() === 'SPAM';

    const tokenImpacts = explanation.tokens.map((t, i) => ({
        token: t,
        value: explanation.values[i],
        absVal: Math.abs(explanation.values[i])
    }));

    const topContributors = tokenImpacts
        .filter(t => (t.value > 0) === isSpam)
        .sort((a, b) => b.absVal - a.absVal)
        .slice(0, 3);

    return (
        <div className="w-full mt-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                SpamX Report
            </p>
            <div className="bg-[#0B0F19]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-7 shadow-2xl relative overflow-hidden group/card">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-30 group-hover/card:opacity-60 transition-opacity duration-500"></div>

                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        Verdict:
                        <span className={`px-4 py-1.5 rounded-2xl bg-slate-900 border ${isSpam ? 'border-rose-500/50 text-rose-400' : 'border-emerald-500/50 text-emerald-400'} uppercase tracking-widest text-xs font-black shadow-lg`}>
                            {prediction.label}
                        </span>
                    </h3>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        {model}
                    </div>
                </div>

                <p className="text-[16px] text-slate-300 leading-relaxed mb-8 font-medium">
                    This message has been identified as <span className={`font-black tracking-tight ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>{prediction.label.toUpperCase()}</span>.
                    The model is <span className="text-white font-black px-2 py-0.5 bg-slate-800 rounded-lg border border-white/10 mx-1">{(Math.max(prediction.spamProb, prediction.hamProb) * 100).toFixed(1)}%</span> confident in this assessment.
                </p>

                <div className="space-y-4">
                    {topContributors.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 shadow-sm transition-all hover:bg-slate-800/60">
                            <p className="text-[14px] text-slate-300 leading-relaxed">
                                <span className={`font-bold text-xs uppercase tracking-widest mr-2 flex items-center gap-2 mb-2 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                    Why it was marked {isSpam ? 'Spam' : 'Ham'}:
                                </span>
                                The detection was primarily driven by: {' '}
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {topContributors.map((t, i) => (
                                        <span key={i} className={`inline-flex items-center gap-2 font-black mx-1 px-3 py-1.5 rounded-xl text-xs ${isSpam ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                                            "{t.token}"
                                            <span className="opacity-60 font-mono">{t.value > 0 ? '+' : ''}{t.value.toFixed(2)}</span>
                                        </span>
                                    ))}.
                                </div>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

