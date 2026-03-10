import React from 'react';

export default function Navbar() {
    return (
        <nav className="w-full flex items-center justify-between px-8 py-4 border-b border-slate-800/60 backdrop-blur-xl bg-[#020617]/80 sticky top-0 z-30 shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-md shadow-violet-500/40 overflow-hidden flex items-center justify-center shrink-0">
                    <img
                        src="/logo.png" alt="SpamX"
                        className="w-full h-full object-contain"
                        onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="color:white;font-weight:900;font-size:13px">S</span>'; }}
                    />
                </div>
                <span className="text-base font-black tracking-tight" style={{ background: 'none', WebkitTextFillColor: 'unset', color: 'white' }}>
                    Spam<span style={{ color: '#ef4444' }}>X</span> <span style={{ background: 'linear-gradient(to right, #a78bfa, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Explainability</span>
                </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                Active
            </div>
        </nav>
    );
}
