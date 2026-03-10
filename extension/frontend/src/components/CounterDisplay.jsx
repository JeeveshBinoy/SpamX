import React, { useEffect, useState } from "react";

const CounterDisplay = ({ label, val, type }) => {
    const [pulse, setPulse] = useState(false);
    const [prevVal, setPrevVal] = useState(val);

    useEffect(() => {
        if (val !== prevVal) {
            setPulse(true);
            const timer = setTimeout(() => setPulse(false), 300);
            setPrevVal(val);
            return () => clearTimeout(timer);
        }
    }, [val, prevVal]);

    const isSpam = type === "spam";

    return (
        <div className={`relative overflow-hidden bg-[#1A2235]/60 backdrop-blur-sm rounded-xl py-3 px-4 border transition-all duration-300 ${pulse ? (isSpam ? 'border-rose-500/50 scale-[1.02] shadow-[0_0_15px_rgba(244,63,94,0.15)]' : 'border-emerald-500/50 scale-[1.02] shadow-[0_0_15px_rgba(16,185,129,0.15)]') : 'border-white/5 hover:border-white/10'}`}>
            <span className="block text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-1">{label}</span>
            <span className={`block text-2xl font-black tabular-nums tracking-tighter ${isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                {val}
            </span>
            {pulse && (
                <div className={`absolute inset-0 ${isSpam ? 'bg-rose-500/5' : 'bg-emerald-500/5'} pointer-events-none`}></div>
            )}
        </div>
    );
};

export default CounterDisplay;
