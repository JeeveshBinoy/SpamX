import React, { useState, useEffect } from "react";
import PopupHeader from "./components/PopupHeader.jsx";
import StatusMonitor from "./components/StatusMonitor.jsx";
import CounterDisplay from "./components/CounterDisplay.jsx";

function PopupLayout() {
  const [counts, setCounts] = useState({ spamCount: 0, hamCount: 0, totalComments: 0, scannedCount: 0 });
  const [status, setStatus] = useState("Active");
  const [detail, setDetail] = useState("Awaiting scan initiation...");
  const [isWorking, setIsWorking] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [modelChoice, setModelChoice] = useState(() => {
    return localStorage.getItem("spamx_model_choice") || "Ensemble";
  });

  useEffect(() => {
    const init = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const resp = await chrome.tabs.sendMessage(tab.id, { type: "REQUEST_LOAD" });
          if (resp) setCounts(resp);
          chrome.tabs.sendMessage(tab.id, { type: "SET_MODEL", model: modelChoice });
        }
      } catch (e) { }
    };
    init();

    const listener = (msg) => {
      if (!msg) return;
      if (msg.type === "SYNC_COUNTS" && msg.data) {
        setCounts({ ...msg.data });
      } else if (msg.type === "BATCH_START") {
        setStatus("Analyzing");
        if (msg.message) setDetail(msg.message);
      } else if (msg.type === "SCAN_COMPLETE") {
        setStatus("Active");
        setDetail("Scan Completed");
      } else if (msg.type === "HEARTBEAT") {
        setIsWorking(msg.isWorking);
      } else if (msg.type === "ENGINE_ERROR") {
        setIsWorking(false);
        setHasError(true);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setModelChoice(newModel);
    localStorage.setItem("spamx_model_choice", newModel);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "SET_MODEL", model: newModel });
      }
    } catch (e) { }
  };

  const progress = (counts.totalComments > 0) ? Math.min(1, Math.max(0, counts.scannedCount / counts.totalComments)) : 0;

  return (
    <div className="w-full bg-[#0B0F19] text-white p-5 font-sans relative overflow-hidden select-none">
      {}
      <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none transition-all duration-700"></div>
      <div className={`absolute bottom-[-50px] left-[-50px] w-48 h-48 rounded-full blur-[80px] pointer-events-none transition-all duration-700 ${isWorking ? 'bg-blue-600/30' : 'bg-emerald-600/20'}`}></div>

      <PopupHeader isWorking={isWorking} hasError={hasError} />

      <div className="mt-6 flex flex-col gap-4 relative z-10">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 ml-1">MODEL</label>
          <div className="relative group">
            <select
              value={modelChoice}
              onChange={handleModelChange}
              className="w-full bg-[#1A2235]/80 backdrop-blur-md border border-white/5 text-slate-200 text-sm rounded-xl py-2.5 px-4 outline-none appearance-none cursor-pointer transition-all hover:border-purple-500/30 hover:bg-[#1A2235] focus:border-purple-500/50 shadow-lg"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'rgba(148, 163, 184, 0.8)\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
            >
              <option value="MuRIL">MuRIL</option>
              <option value="XLM-RoBERTa">XLM-RoBERTa</option>
              <option value="Ensemble">Ensemble</option>
            </select>
            <div className={`absolute inset-0 rounded-xl pointer-events-none border border-transparent transition-all duration-500 ${isWorking ? 'shadow-[0_0_15px_rgba(139,92,246,0.15)] mix-blend-screen' : ''}`}></div>
          </div>
        </div>

        <StatusMonitor status={status} progress={progress} counts={counts} detail={detail} isWorking={isWorking} hasError={hasError} />

        <div className="grid grid-cols-2 gap-3 mt-1">
          <CounterDisplay label="HAM" val={counts.hamCount} type="ham" />
          <CounterDisplay label="SPAM" val={counts.spamCount} type="spam" />
        </div>
      </div>
    </div>
  );
}

export default PopupLayout;
