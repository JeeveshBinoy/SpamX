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

    const topNeutralizers = tokenImpacts
        .filter(t => (t.value > 0) !== isSpam)
        .sort((a, b) => b.absVal - a.absVal)
        .slice(0, 2);

    return (
        <div className="w-full mt-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                SpamX Report
            </p>
            <div className="bg-[#0BOF19]/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-50"></div>

                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    Result: <span className={`px-2.5 py-1 rounded bg-slate-800 border ${isSpam ? 'border-rose-500/50 text-rose-400' : 'border-emerald-500/50 text-emerald-400'} uppercase tracking-wider text-sm`}>{prediction.label}</span>
                </h3>

                <p className="text-[15px] text-slate-300 leading-relaxed mb-6 font-medium">
                    This message is likely <span className={`font-bold ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>{prediction.label.toUpperCase()}</span>.
                    The model is <span className="text-white font-bold px-1.5 py-0.5 bg-slate-800 rounded mx-1">{(Math.max(prediction.spamProb, prediction.hamProb) * 100).toFixed(0)}%</span> sure.
                </p>

                <div className="space-y-4">
                    {topContributors.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 shadow-sm transition-all hover:bg-slate-800/60">
                            <p className="text-[14px] text-slate-300 leading-relaxed">
                                <span className={`font-bold text-xs uppercase tracking-widest mr-2 flex items-center gap-2 mb-2 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                    Why it was marked {isSpam ? 'Spam' : 'Ham'}:
                                </span>
                                The model looked at words like{' '}
                                {topContributors.map((t, i) => (
                                    <span key={i} className={`inline-flex items-center gap-1 font-mono mx-1 px-2 py-0.5 rounded text-xs font-bold ${isSpam ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}`}>
                                        "{t.token}"
                                        <span className="opacity-60 text-[10px]">{t.value > 0 ? '+' : ''}{t.value.toFixed(2)}</span>
                                    </span>
                                ))}. These specific terms were the main reason for this result.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
