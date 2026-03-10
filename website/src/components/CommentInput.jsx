import React from 'react';

export default function CommentInput({ text, setText, model, setModel, loading, error, onScan }) {
    return (
        <div className="bg-[#0B0F19]/80 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-xl shadow-xl flex flex-col gap-5 h-full">
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Comment</label>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={8}
                    className="w-full bg-[#020617] border border-slate-800 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all resize-none leading-relaxed"
                    placeholder="Paste or type a YouTube comment here..."
                />
            </div>

            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">SELECT MODEL</label>
                <div className="relative">
                    <select
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="w-full bg-[#020617] border border-slate-800 p-3 rounded-xl text-sm text-slate-300 outline-none appearance-none cursor-pointer hover:border-violet-500/30 focus:border-violet-500/50 transition-colors"
                    >
                        <option value="MuRIL">MuRIL</option>
                        <option value="XLM-RoBERTa">XLM-RoBERTa</option>
                        <option value="Ensemble">Ensemble</option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▾</div>
                </div>
            </div>

            <button
                onClick={onScan}
                disabled={loading || !text.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl font-black uppercase tracking-widest text-xs hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30"
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Analyzing...
                    </span>
                ) : 'Scan'}
            </button>

            {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-medium text-center leading-relaxed">
                    {error}
                </div>
            )}
        </div>
    );
}
