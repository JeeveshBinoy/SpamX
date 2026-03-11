/**
 * BACKEND_URL: The base address for the Django server.
 * In a production environment, this would be an environment variable.
 */
export const BACKEND_URL = "https://backend-delta-roan-60.vercel.app";

/**
 * callAnalyze: Performs a high-performance unified analysis (classification + explanation).
 * 
 * @param {string} text - The comment or message text to analyze.
 * @param {string} modelChoice - The model to use (e.g., "Ensemble", "MuRIL", "XLM-RoBERTa").
 * @returns {Promise<Object>} - The JSON response containing label, confidence, and SHAP data.
 */
export async function callAnalyze(text, modelChoice) {
    const backendResponse = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_choice: modelChoice })
    });
    
    if (!backendResponse.ok) {
        throw new Error(`SpamX Backend analysis failed (Status: ${backendResponse.status})`);
    }
    
    return await backendResponse.json();
}
