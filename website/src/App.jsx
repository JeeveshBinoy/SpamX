import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import CommentInput from './components/CommentInput.jsx';
import VerdictBanner from './components/VerdictBanner.jsx';
import ShapHtml from './components/ShapHtml.jsx';
import { callPredict, callExplain } from './api.js';

const App = () => {
  const [text, setText] = useState('');
  const [model, setModel] = useState('Confidence-based Gating');
  const [prediction, setPrediction] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState(null);
  const [winningModel, setWinningModel] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const comment = params.get('comment'), label = params.get('label'), conf = parseFloat(params.get('conf')), m = params.get('model');
    if (comment) {
      setText(comment);
      if (m) setModel(m);
      if (label && !isNaN(conf)) {
        setPrediction({ label: label.toLowerCase(), confidence: conf, spamProb: label.toLowerCase() === 'spam' ? conf : 1 - conf, hamProb: label.toLowerCase() === 'ham' ? conf : 1 - conf, markdownText: `Pre-analyzed by Extension (${m || 'Gating'})` });
        setWinningModel(m || 'Confidence-based Gating');
        runScan(comment, m || model, true);
      } else runScan(comment, m || model);
    }
  }, []);

  const runScan = async (inputText, currentModel, skipPredict = false) => {
    const input = inputText !== undefined ? inputText : text;
    if (!input.trim()) return;
    if (!skipPredict) setLoading(true);
    setLoadingExplanation(true);
    setError(null);
    if (!skipPredict) { setPrediction(null); setWinningModel(null); }
    setExplanation(null);
    const specModel = currentModel || model;

    try {
      if (!skipPredict) {
        const data = await callPredict(input, specModel);
        if (data.error) throw new Error(data.error);
        setWinningModel(data.model || specModel);
        setPrediction({ label: data.label || 'ham', confidence: data.confidence || 0, spamProb: data.spamProb || 0, hamProb: data.hamProb || 0, markdownText: data.markdown_text || '' });
        setLoading(false);
      }
      const exp = await callExplain(input, specModel);
      if (exp.error && !exp.html) throw new Error(exp.error);
      const rawHtml = exp.html || '', clean = rawHtml.replace(/<[^>]*>/g, ' ');
      if (specModel === 'Confidence-based Gating') {
          if (clean.includes('MuRIL')) setWinningModel('MuRIL');
          else if (clean.includes('XLM-RoBERTa')) setWinningModel('XLM-RoBERTa');
      }
      const tableMatch = rawHtml.match(/<table[\s\S]*?<\/table>/i);
      const table = tableMatch ? tableMatch[0] : '';
      setExplanation({ narrativeHtml: rawHtml.replace(/<table[\s\S]*?<\/table>/i, '').replace(/<h3[^>]*>SHAP ATTRIBUTION DATA<\/h3>/gi, ''), tableHtml: table, image: exp.image });
    } catch (e) { setError(e.message); } finally { setLoading(false); setLoadingExplanation(false); }
  };

  const isSpam = prediction?.label?.toLowerCase() === 'spam';

  return (
    <div className="min-h-screen w-full flex flex-col font-sans bg-[#0B0F19] text-slate-50">
      <Navbar />
      <main className="flex-1 flex flex-col lg:flex-row w-full relative z-10 overflow-hidden">
        <div className="w-full lg:w-[25rem] border-r border-slate-800/50 p-8 flex flex-col gap-8 overflow-y-auto">
          <CommentInput text={text} setText={setText} model={model} setModel={setModel} loading={loading} error={error} onScan={() => runScan(text, model)} />
        </div>
        <div className="flex-1 flex flex-col p-6 md:p-8 overflow-y-auto custom-scrollbar">
          {!prediction && !loading && !error && (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none">
              <div className="w-24 h-24 mb-6 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center animate-spin-slow flex-shrink-0 aspect-square"><div className="w-3 h-3 bg-white rounded-full"></div></div>
              <h3 className="text-xl font-bold">Ready for Scan</h3>
            </div>
          )}
          {error && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <h3 className="text-xl font-bold text-rose-400">Analysis Halted</h3>
              <p className="text-slate-400 mt-2">{error}</p>
              <button onClick={() => runScan(text, model)} className="mt-6 px-6 py-2 bg-rose-500 text-white font-bold rounded-lg">Retry</button>
            </div>
          )}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-8">
              <div className="w-40 h-1 bg-slate-800 rounded-full overflow-hidden relative"><div className={`absolute h-full bg-gradient-to-r ${isSpam ? 'from-rose-600 to-rose-400' : 'from-emerald-600 to-emerald-400'} animate-shimmer`}></div></div>
              <p className="text-lg font-bold animate-pulse">Please Wait...</p>
            </div>
          )}
          {prediction && (
            <div className="flex-1 flex flex-col gap-6 animate-in fade-in duration-700">
              <VerdictBanner prediction={prediction} model={winningModel} modelChoice={model} />
              {(explanation || loadingExplanation) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-8 max-w-[112.5rem] mx-auto pb-10">
                  <div className="flex flex-col bg-[#0B0F19]/60 border border-slate-800/60 rounded-2xl p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800"><div className="w-2 h-2 rounded-full bg-violet-500"></div><h3 className="text-xs font-bold uppercase text-slate-400">Analysis Narrative</h3></div>
                    {explanation?.narrativeHtml ? <ShapHtml htmlString={explanation.narrativeHtml} /> : <div className="animate-pulse space-y-3"><div className="h-4 bg-slate-800/40 rounded w-full"></div><div className="h-4 bg-slate-800/40 rounded w-5/6"></div></div>}
                  </div>
                  <div className="flex flex-col bg-[#0B0F19]/60 border border-slate-800/60 rounded-2xl p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800"><div className="w-2 h-2 rounded-full bg-blue-500"></div><h3 className="text-xs font-bold uppercase text-slate-400">Shapley Data Table</h3></div>
                    <div className="overflow-x-auto">{explanation?.tableHtml ? <ShapHtml htmlString={explanation.tableHtml} /> : <div className="animate-pulse space-y-4"><div className="h-10 bg-slate-800/20 rounded-lg"></div><div className="h-10 bg-slate-800/20 rounded-lg"></div></div>}</div>
                  </div>
                  <div className="col-span-1 xl:col-span-2 2xl:col-span-2 flex flex-col bg-[#0B0F19]/40 border border-slate-800/60 rounded-2xl p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800"><div className="w-2 h-2 rounded-full bg-orange-500"></div><h3 className="text-xs font-bold uppercase text-slate-400">Visual Attribution Map</h3></div>
                    <div className="flex justify-center bg-black/20 rounded-xl p-4">
                        {explanation?.image ? <img src={explanation.image} className="max-w-full rounded-lg" /> : <div className="aspect-video flex flex-col items-center justify-center gap-4 text-slate-600"><div className="w-10 h-10 border-2 border-dashed border-slate-700 rounded-full animate-spin flex-shrink-0 aspect-square"></div><span className="text-xs uppercase font-bold">Generating Graph...</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
