import React from "react";

const StatusMonitor = ({ status, progress, counts, detail, isWorking, hasError }) => {
    const validTotal = typeof counts.totalComments === 'number' && !isNaN(counts.totalComments) ? counts.totalComments : 0;
    const percentage = validTotal > 0 ? Math.round(progress * 100) : 0;
    const showIndeterminate = isWorking && validTotal === 0;

    return (
        <div className="w-full bg-[#1A2235]/60 backdrop-blur-sm rounded-xl p-4 border border-white/5 shadow-inner relative overflow-hidden">

            {isWorking && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                    background: 'linear-gradient(to right, transparent, #a855f7, transparent)',
                    animation: 'spamx-slide 2s linear infinite'
                }} />
            )}

            <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                        {isWorking ? 'Scanning' : 'Ready'}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">{detail}</span>
                </div>
                <span className={`text-xl font-black ${hasError ? 'text-rose-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400'}`}>
                    {showIndeterminate ? '...' : `${percentage}%`}
                </span>
            </div>

            <div className="w-full mt-1">
                <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
                    <span>Scan Progress</span>
                    <span>{counts.scannedCount} / {Math.max(counts.scannedCount, counts.totalComments || 0)}</span>
                </div>

                <div style={{ width: '100%', height: '6px', background: '#0B0F19', borderRadius: '9999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {hasError ? (
                        <div style={{ width: '100%', height: '100%', background: '#ef4444', borderRadius: '9999px' }} />
                    ) : showIndeterminate ? (
                        <div style={{
                            height: '100%', width: '40%', borderRadius: '9999px',
                            background: 'linear-gradient(to right, #3b82f6, #a855f7)',
                            animation: 'spamx-bounce 1.4s ease-in-out infinite'
                        }} />
                    ) : (
                        <div style={{
                            height: '100%',
                            width: `${percentage}%`,
                            borderRadius: '9999px',
                            background: 'linear-gradient(to right, #3b82f6, #a855f7)',
                            transition: 'width 0.5s ease-out',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {isWorking && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(255,255,255,0.15)',
                                    animation: 'spamx-pulse 1.5s ease-in-out infinite'
                                }} />
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spamx-slide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes spamx-bounce {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(160%); }
                    100% { transform: translateX(-100%); }
                }
                @keyframes spamx-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default StatusMonitor;
