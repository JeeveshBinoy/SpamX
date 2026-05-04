import React from 'react';

export default function VerdictBanner({ prediction, model, modelChoice }) {
    const isSpam = prediction.label.toUpperCase() === 'SPAM';
    const confPct = Math.round((prediction.confidence ?? 0) * 100);

    return (
        <div className="space-y-6">
            <div className={`p-6 rounded-2xl border transition-all duration-500 overflow-hidden relative ${isSpam ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {}
                <div className={`absolute top-0 right-0 w-32 h-32 blur-[3.75rem] rounded-full -mr-10 -mt-10 ${isSpam ? 'bg-rose-500/40' : 'bg-emerald-500/40'}`}></div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-2 opacity-80 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>Classification</p>
                        <h2 className={`text-4xl font-extrabold uppercase tracking-tight leading-none mb-3`}>
                            {prediction.label}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full animate-pulse ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            <span className="text-xs font-bold text-slate-400">Classified by <span className="text-slate-200">{model}{modelChoice === 'Confidence-based Gating' && model !== 'Confidence-based Gating' ? ' (Confidence-based Gating)' : ''}</span></span>
                        </div>
                    </div>

                    <div className="flex flex-col items-start md:items-end">
                        <div className="flex items-baseline gap-1">
                            <span className={`text-4xl font-extrabold tabular-nums transition-all ${isSpam ? 'text-rose-100' : 'text-emerald-100'}`}>{confPct}</span>
                            <span className={`text-xl font-bold opacity-60`}>%</span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-2">Accuracy Score</p>
                    </div>
                </div>
            </div>
        </div>
    );
}


