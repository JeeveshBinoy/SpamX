import React from 'react';

export default function VerdictBanner({ prediction, model, modelChoice }) {
    const isSpam = prediction.label.toUpperCase() === 'SPAM';
    const confPct = Math.round((prediction.confidence ?? 0) * 100);

    return (
        <div className="space-y-6">
            <div className={`p-8 rounded-[32px] border-2 transition-all duration-500 overflow-hidden relative ${isSpam ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                {}
                <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full -mr-10 -mt-10 ${isSpam ? 'bg-rose-500/40' : 'bg-emerald-500/40'}`}></div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div>
                        <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 opacity-60 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>SPAMX CLASSIFICATION</p>
                        <h2 className={`text-6xl font-black uppercase tracking-tighter leading-none mb-2 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {prediction.label}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full animate-pulse ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            <span className="text-xs font-bold text-slate-400">Classified by <span className="text-slate-200">{model}{modelChoice === 'Ensemble' ? ' (Ensemble)' : ''}</span></span>
                        </div>
                    </div>

                    <div className="flex flex-col items-start md:items-end">
                        <div className="flex items-baseline gap-1">
                            <span className={`text-5xl font-black tabular-nums transition-all ${isSpam ? 'text-rose-200' : 'text-emerald-200'}`}>{confPct}</span>
                            <span className={`text-xl font-bold opacity-40 ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>%</span>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Classification Accuracy</p>
                    </div>
                </div>
            </div>
        </div>
    );
}


