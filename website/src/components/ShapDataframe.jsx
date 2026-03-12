import React from 'react';

export default function ShapDataframe({ dataframe }) {
    if (!dataframe || !dataframe.headers || !dataframe.data) {
        return null;
    }

    return (
        <div className="w-full bg-[#0b0f19] border border-white/10 rounded-xl overflow-hidden shadow-lg mt-4">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-[#1f2937]/50 text-xs uppercase font-mono text-slate-400 border-b border-white/10">
                        <tr>
                            {dataframe.headers.map((header, i) => (
                                <th key={i} className="px-6 py-4 font-bold tracking-wider">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {dataframe.data.map((row, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors duration-150">
                                {row.map((cell, j) => (
                                    <td key={j} className="px-6 py-3 font-mono">
                                        {typeof cell === 'number' ? cell.toFixed(4) : cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
