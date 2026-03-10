import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import CommentInput from './components/CommentInput.jsx';
import VerdictBanner from './components/VerdictBanner.jsx';
import ExplanationBox from './components/ExplanationBox.jsx';
import TokenHeatmap from './components/TokenHeatmap.jsx';
import TokenWeightGraph from './components/TokenWeightGraph.jsx';

import { callGradio, BACKEND_URL } from './api.js';

function App() {
  const [text, setText] = useState('');
  const [model, setModel] = useState('Ensemble');
  const [prediction, setPrediction] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [featureImage, setFeatureImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState(null);
  const [winningModel, setWinningModel] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const comment = params.get('comment');
    if (comment) {
      setText(comment);
      runScan(comment, model);
    }
  }, []);

  const runScan = async (inputText, currentModel) => {
    const targetText = inputText !== undefined ? inputText : text;
    if (!targetText.trim()) return;

    setLoading(true);
    setLoadingExplanation(true);
    setError(null);
    setPrediction(null);
    setExplanation(null);
    setFeatureImage(null);
    setWinningModel(null);


    try {
      const predictResult = await callGradio('/predict', [targetText, currentModel || model]);
      const labelData = predictResult?.[0];
      const markdownText = predictResult?.[1] || '';

      if (labelData) {
        const confidences = labelData.confidences || [];
        const spamConf = confidences.find(c => c.label?.toLowerCase() === 'spam')?.confidence ?? 0;
        const hamConf = confidences.find(c => c.label?.toLowerCase() === 'ham')?.confidence ?? 0;


        let winMod = currentModel;
        if (currentModel === 'Ensemble') {
          const maxConf = Math.max(...confidences.map(c => c.confidence));
          const winner = confidences.find(c => (c.confidence === maxConf) && !['HAM', 'SPAM', 'LABEL_0', 'LABEL_1'].includes(c.label.toUpperCase()));
          winMod = winner ? winner.label : 'Integrated Ensemble';
        }
        setWinningModel(winMod);

        setPrediction({
          label: labelData.label || 'ham',
          confidence: Math.max(spamConf, hamConf),
          spamProb: spamConf,
          hamProb: hamConf,
          markdownText
        });
      }
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      setLoadingExplanation(false);
      return;
    }


    try {
      const explainResult = await callGradio('/explain', [targetText, currentModel || model]);
      const imgData = explainResult?.[0];
      const htmlStr = explainResult?.[1] || '';
      const dfData = explainResult?.[2];

      if (imgData?.url) setFeatureImage(imgData.url);
      else if (imgData?.path) setFeatureImage(`${BACKEND_URL}/gradio_api/file=${imgData.path}`);


      if (currentModel === 'Ensemble' && htmlStr) {

        const cleanText = htmlStr.replace(/<[^>]*>/g, ' ').replace(/\*\*/g, ' ');


        if (cleanText.includes('MuRIL')) setWinningModel('MuRIL');
        else if (cleanText.includes('XLM-RoBERTa')) setWinningModel('XLM-RoBERTa');
        else {

          const modelMatch = cleanText.match(/provided by\s+([A-Za-z0-9\-\.]+)/i) ||
            cleanText.match(/model:?\s+([A-Za-z0-9\-\.]+)/i) ||
            cleanText.match(/By\s+([A-Za-z0-9\-\.]+)/i) ||
            cleanText.match(/diagnosis was provided by\s+([A-Za-z0-9\-\.]+)/i) ||
            cleanText.match(/chooses\s+([A-Za-z0-9\-\.]+)/i);

          if (modelMatch) {
            const foundModel = modelMatch[1].trim();
            const blackList = ['SPAM', 'HAM', 'RESULT', 'WAS', 'IS', 'THE', 'LABEL', 'A', 'FOR', 'AND', 'BY', 'THIS', 'DIAGNOSIS'];
            if (foundModel && !blackList.includes(foundModel.toUpperCase())) {
              setWinningModel(foundModel);
            }
          }
        }
      }

      if (dfData?.data && dfData.data.length > 0) {
        let tokens = dfData.data.map(row => row[0]);
        const values = dfData.data.map(row => {
          let val = row[1];
          return typeof val === 'number' ? val : parseFloat(val) || 0;
        });


        try {
          let remainingText = targetText;
          const recoveredTokens = tokens.map((t, idx) => {
            const lowerT = t.toLowerCase();
            if (lowerT === '[unk]' || lowerT === '<unk>' || !t.trim()) {

              let lookAheadIdx = idx + 1;
              let nextKnown = null;
              let nextPos = -1;

              while (lookAheadIdx < tokens.length) {
                const lat = tokens[lookAheadIdx];
                const cleanLat = lat.replace(/^##/, '').replace(/^[ _ ]/, '').replace(/ /g, '').trim();
                if (cleanLat && remainingText.includes(cleanLat)) {
                  nextKnown = cleanLat;
                  nextPos = remainingText.indexOf(cleanLat);
                  break;
                }
                lookAheadIdx++;
              }

              if (nextPos !== -1) {

                let sequentialUnks = 1;
                let i = idx + 1;
                while (i < lookAheadIdx) {
                  const sit = tokens[i].toLowerCase();
                  if (sit === '[unk]' || sit === '<unk>' || !tokens[i].trim()) sequentialUnks++;
                  i++;
                }

                const segment = remainingText.substring(0, nextPos);
                remainingText = remainingText.substring(nextPos);

                const chars = Array.from(segment);
                const charsPerUnk = Math.max(1, Math.floor(chars.length / sequentialUnks));
                const recovered = chars.slice(0, charsPerUnk).join('');
                return recovered || t;
              }

              const chars = Array.from(remainingText);
              if (chars.length > 0) {
                const recovered = chars[0];
                remainingText = remainingText.substring(recovered.length);
                return recovered;
              }
              return t;
            } else {
              const cleanT = t.replace(/^##/, '').replace(/^[ _ ]/, '').replace(/ /g, '');
              if (cleanT) {
                const pos = remainingText.indexOf(cleanT);
                if (pos !== -1) {
                  remainingText = remainingText.substring(pos + cleanT.length);
                }
              }
              return t;
            }
          });


          const processed = recoveredTokens.map((t, i) => ({ t, v: values[i] }))
            .filter(item => item.t && item.t.trim().length > 0 && !['[unk]', '<unk>'].includes(item.t.toLowerCase()));

          tokens = processed.map(x => x.t);
          const finalValues = processed.map(x => x.v);

          setExplanation({ tokens, values: finalValues, html: htmlStr });
        } catch (e) {
          console.warn("Token recovery failed", e);
          setExplanation({ tokens, values, html: htmlStr });
        }
      } else {
        setExplanation({ tokens: [], values: [], html: htmlStr });
      }
    } catch (err) {
      console.error("Explanation failed:", err);
    } finally {
      setLoadingExplanation(false);
    }
  };

  const isSpamTheme = prediction?.label?.toLowerCase() === 'spam';

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-700 ${isSpamTheme ? 'bg-[#0f0505] text-rose-50' : 'bg-[#050f0b] text-emerald-50'}`}>
      <div className={`fixed inset-0 pointer-events-none transition-opacity duration-1000 ${prediction ? 'opacity-40' : 'opacity-20'}`}>
        <div className={`absolute top-[-10%] left-[-5%] w-[60%] h-[60%] rounded-full blur-[120px] ${isSpamTheme ? 'bg-rose-900/30' : 'bg-emerald-900/30'}`}></div>
        <div className={`absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] rounded-full blur-[120px] ${isSpamTheme ? 'bg-rose-800/20' : 'bg-emerald-800/20'}`}></div>
      </div>

      <Navbar />

      <main className="flex-1 flex flex-col lg:flex-row w-full h-full relative z-10 overflow-hidden">
        {}
        <div className="w-full lg:w-[400px] border-r border-slate-800/50 bg-black/20 backdrop-blur-3xl p-8 flex flex-col gap-8 overflow-y-auto">
          <CommentInput
            text={text}
            setText={setText}
            model={model}
            setModel={setModel}
            loading={loading}
            error={error}
            onScan={() => runScan(text, model)}
          />
        </div>

        {}
        <div className="flex-1 overflow-y-auto p-10 relative">
          {!prediction && !loading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
              <div className="w-24 h-24 mb-6 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center animate-[spin_20s_linear_infinite]">
                <div className="w-3 h-3 bg-white rounded-full"></div>
              </div>
              <h3 className="text-xl font-bold tracking-tight">Ready for Scan</h3>
            </div>
          )}

          {error && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <h3 className="text-xl font-bold text-rose-400">Analysis Halted</h3>
              <p className="text-slate-400 mt-2">{error}</p>
              <button onClick={() => runScan(text, model)} className="mt-6 px-6 py-2 bg-rose-500 text-white font-bold rounded-lg hover:bg-rose-600 transition-colors">Retry</button>
            </div>
          )}

          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-8">
              <div className="relative w-40 h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
                <div className={`absolute top-0 left-0 h-full bg-gradient-to-r ${isSpamTheme ? 'from-rose-600 to-rose-400' : 'from-emerald-600 to-emerald-400'} animate-[shimmer_1.5s_infinite]`}></div>
              </div>
              <p className="text-lg font-bold animate-pulse text-white/80">Please Wait...</p>
            </div>
          )}

          {prediction && (
            <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <VerdictBanner prediction={prediction} model={winningModel} modelChoice={model} />

              {(explanation || loadingExplanation) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                  <div className="space-y-8">
                    {explanation ? (
                      <ExplanationBox prediction={prediction} explanation={explanation} model={winningModel} />
                    ) : (
                      <div className="p-8 bg-slate-900/40 rounded-3xl border border-slate-800/50 animate-pulse h-48"></div>
                    )}
                    {explanation && <TokenHeatmap explanation={explanation} prediction={prediction} />}
                  </div>
                  <div className="bg-slate-900/20 rounded-3xl p-1">
                    {explanation && <TokenWeightGraph explanation={explanation} model={winningModel} prediction={prediction} />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
