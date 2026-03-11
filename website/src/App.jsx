import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import CommentInput from './components/CommentInput.jsx';
import VerdictBanner from './components/VerdictBanner.jsx';
import ExplanationBox from './components/ExplanationBox.jsx';
import TokenHeatmap from './components/TokenHeatmap.jsx';
import TokenWeightGraph from './components/TokenWeightGraph.jsx';

import { callAnalyze, BACKEND_URL } from './api.js';

function App() {
  // --- STATE MANAGEMENT ---
  const [text, setText] = useState('');                      // The current comment text in the input box
  const [model, setModel] = useState('Ensemble');            // The user-selected model from the dropdown
  const [prediction, setPrediction] = useState(null);        // The classification result (spam/ham)
  const [explanation, setExplanation] = useState(null);      // Processed SHAP/token data
  const [featureImage, setFeatureImage] = useState(null);    // The SHAP summary plot (base64 or URL)
  const [loading, setLoading] = useState(false);             // Global loading state for classification
  const [loadingExplanation, setLoadingExplanation] = useState(false); // Specific loading for SHAP data
  const [error, setError] = useState(null);                  // Error message from the backend
  const [winningModel, setWinningModel] = useState(null);    // The specific model that led the decision (e.g. MuRIL)

  /**
   * Effect Hook: Handles redirection from the SpamX Extension.
   * If the user clicks "Insights" in the extension, we parse the comment 
   * data and pre-fill the classification results to avoid redundant work.
   */
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const redirectedComment = searchParams.get('comment');
    const redirectedLabel = searchParams.get('label');
    const redirectedConfidence = parseFloat(searchParams.get('conf'));
    const redirectedModel = searchParams.get('model');

    if (redirectedComment) {
      setText(redirectedComment);
      if (redirectedModel) setModel(redirectedModel);

      // If we already have a prediction from the extension, show it immediately
      if (redirectedLabel && !isNaN(redirectedConfidence)) {
        setPrediction({
          label: redirectedLabel.toLowerCase(),
          confidence: redirectedConfidence,
          spamProb: redirectedLabel.toLowerCase() === 'spam' ? redirectedConfidence : 1 - redirectedConfidence,
          hamProb: redirectedLabel.toLowerCase() === 'ham' ? redirectedConfidence : 1 - redirectedConfidence,
          markdownText: `Pre-analyzed by SpamX Extension (${redirectedModel || 'Ensemble'})`
        });
        setWinningModel(redirectedModel || 'Integrated Ensemble');
        
        // Trigger a background scan to fetch the SHAP explanation data
        runScan(redirectedComment, redirectedModel || model, true);
      } else {
        // Otherwise, start a fresh analysis
        runScan(redirectedComment, redirectedModel || model);
      }
    }
  }, []);

  /**
   * runScan: The core analysis orchestrator.
   * Communicates with the Django backend to classify text and get token importance.
   * 
   * @param {string} inputText - Optional text override (from URL params).
   * @param {string} currentModel - Optional model override.
   * @param {boolean} skipPredict - If true, only fetches explanation data (optimizes extension flow).
   */
  const runScan = async (inputText, currentModel, skipPredict = false) => {
    const processedInputText = inputText !== undefined ? inputText : text;
    if (!processedInputText.trim()) return;

    setLoading(!skipPredict);
    setLoadingExplanation(true);
    setError(null);
    
    // Clear previous results if we're doing a full fresh scan
    if (!skipPredict) {
      setPrediction(null);
      setWinningModel(null);
    }
    setExplanation(null);
    setFeatureImage(null);

    try {
      // Unified call: Get both prediction and explanation in ONE network request
      const responseData = await callAnalyze(processedInputText, currentModel || model);
      
      if (responseData.error) throw new Error(responseData.error);

      // 1. Process Classification Result
      const subModelConfidences = responseData.confidences || [];
      const spamProbability = responseData.spamProb || 0;
      const hamProbability = responseData.hamProb || 0;

      let identifiedDecisionModel = currentModel;
      
      // If using Ensemble, look for the specific winning sub-model
      if (currentModel === 'Ensemble') {
        const maxConfidenceValue = Math.max(...subModelConfidences.map(item => item.confidence));
        const dominantModel = subModelConfidences.find(item => 
          (item.confidence === maxConfidenceValue) && 
          !['HAM', 'SPAM', 'LABEL_0', 'LABEL_1'].includes(item.label.toUpperCase())
        );
        identifiedDecisionModel = dominantModel ? dominantModel.label : 'Integrated Ensemble';
      }
      setWinningModel(identifiedDecisionModel || 'Integrated Ensemble');

      setPrediction({
        label: responseData.label || 'ham',
        confidence: responseData.confidence || 0,
        spamProb: spamProbability,
        hamProb: hamProbability,
        markdownText: responseData.markdown_text || ''
      });

      // 2. Process SHAP Visualization Image
      if (responseData.image?.url) setFeatureImage(responseData.image.url);
      else if (responseData.image?.path) setFeatureImage(`${BACKEND_URL}/gradio_api/file=${responseData.image.path}`);

      // Sync winning model name from explanation text if it's an ensemble decision
      const explanationHtml = responseData.html || '';
      if (currentModel === 'Ensemble' && explanationHtml) {
        const cleanExplanationText = explanationHtml.replace(/<[^>]*>/g, ' ').replace(/\*\*/g, ' ');
        if (cleanExplanationText.includes('MuRIL')) setWinningModel('MuRIL');
        else if (cleanExplanationText.includes('XLM-RoBERTa')) setWinningModel('XLM-RoBERTa');
      }

      // 3. TOKEN RECOVERY SYSTEM
      // ML models often break emojis and unknown characters into "[UNK]" tokens.
      // This logic cross-references the tokens with the original text to recover the actual characters.
      const rawShapData = responseData.dataframe;
      if (rawShapData?.data && rawShapData.data.length > 0) {
        let rawTokens = rawShapData.data.map(row => row[0]);
        const importanceValues = rawShapData.data.map(row => {
          let val = row[1];
          return typeof val === 'number' ? val : parseFloat(val) || 0;
        });

        try {
          let slidingTextPointer = processedInputText;
          const recoveredTokens = rawTokens.map((currentToken, idx) => {
            const tokenLower = currentToken.toLowerCase();
            
            // If the token is unknown or just whitespace, attempt recovery
            if (tokenLower === '[unk]' || tokenLower === '<unk>' || !currentToken.trim()) {
              slidingTextPointer = slidingTextPointer.trimStart();
              
              // Look ahead for the next distinguishable token to find the 'UNK' boundary
              let nextKnownToken = null;
              let nextTokenPosition = -1;
              let lookAheadCounter = idx + 1;
              
              while (lookAheadCounter < rawTokens.length) {
                const nextT = rawTokens[lookAheadCounter];
                const cleanNextT = nextT.replace(/^##/, '').replace(/^[ _ ]/, '').replace(/ /g, '').trim();
                if (cleanNextT && slidingTextPointer.includes(cleanNextT)) {
                  nextKnownToken = cleanNextT;
                  nextTokenPosition = slidingTextPointer.indexOf(cleanNextT);
                  break;
                }
                lookAheadCounter++;
              }

              if (nextTokenPosition !== -1) {
                // Determine how many sequential 'UNK' tokens we are currently filling
                let sequentialUnkCount = 1;
                for (let i = idx + 1; i < lookAheadCounter; i++) {
                  const seqT = rawTokens[i].toLowerCase();
                  if (seqT === '[unk]' || seqT === '<unk>' || !rawTokens[i].trim()) sequentialUnkCount++;
                }

                // Slice the original text that corresponds to this 'UNK' group
                const recoveredSegment = slidingTextPointer.substring(0, nextTokenPosition);
                slidingTextPointer = slidingTextPointer.substring(nextTokenPosition);
                
                // Distribute characters among the UNK group (simple heuristic)
                const segmentChars = Array.from(recoveredSegment);
                const charsAllocated = Math.max(1, Math.floor(segmentChars.length / sequentialUnkCount));
                return segmentChars.slice(0, charsAllocated).join('') || currentToken;
              }

              // Fallback: Just grab the next character
              const remainingChars = Array.from(slidingTextPointer);
              if (remainingChars.length > 0) {
                const singleChar = remainingChars[0];
                slidingTextPointer = slidingTextPointer.substring(singleChar.length);
                return singleChar;
              }
              return currentToken;
            } else {
              // Standard token: Move the text pointer past the matched content
              const cleanTokenText = currentToken.replace(/^##/, '').replace(/^[ _ ]/, '').replace(/ /g, '');
              if (cleanTokenText) {
                const pos = slidingTextPointer.indexOf(cleanTokenText);
                if (pos !== -1) {
                  slidingTextPointer = slidingTextPointer.substring(pos + cleanTokenText.length);
                }
              }
              return currentToken;
            }
          });

          // Filter out empty tokens or structural markers for the final display
          const finalProcessedData = recoveredTokens.map((tokenText, i) => ({ t: tokenText, v: importanceValues[i] }))
            .filter(item => item.t && item.t.length > 0 && !['[unk]', '<unk>'].includes(item.t.toLowerCase()));

          setExplanation({ 
            tokens: finalProcessedData.map(x => x.t), 
            values: finalProcessedData.map(x => x.v), 
            html: explanationHtml 
          });
        } catch (recoveryError) {
          console.error("Token recovery failed:", recoveryError);
          setExplanation({ tokens: rawTokens, values: importanceValues, html: explanationHtml });
        }
      } else {
        setExplanation({ tokens: [], values: [], html: explanationHtml });
      }

    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
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
