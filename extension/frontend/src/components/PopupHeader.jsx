import React from "react";

const PopupHeader = ({ isWorking, hasError }) => {
    return (
        <div className="flex items-center gap-3 relative z-10">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-white/10 shadow-lg">
                <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain z-10 drop-shadow-lg" />
                {isWorking && !hasError && (
                    <div className="absolute inset-0 rounded-xl border border-purple-500/50 animate-[ping_2s_ease-in-out_infinite]"></div>
                )}
            </div>
            <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tight text-white m-0 leading-tight">Spam<span style={{ color: '#ef4444' }}>X</span></h1>
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.8)]' : (hasError ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]')}`}></span>
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
                        {isWorking ? 'Scanning...' : (hasError ? 'Offline' : 'Active')}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default PopupHeader;
