/**
 * BACKEND_URL: The base address for the Django server.
 * In a production environment, this would be an environment variable.
 */
export const BACKEND_URL = "http://127.0.0.1:8000";


/**
 * callPredict: Performs only the classification step.
 */
export async function callPredict(text, modelChoice) {
    const backendResponse = await fetch(`${BACKEND_URL}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_choice: modelChoice })
    });

    if (!backendResponse.ok) {
        throw new Error(`SpamX Backend prediction failed (Status: ${backendResponse.status})`);
    }

    return await backendResponse.json();
}

/**
 * callExplain: Performs only the explanation step using the designated specific model.
 */
export async function callExplain(text, modelChoice) {
    const backendResponse = await fetch(`${BACKEND_URL}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_choice: modelChoice })
    });

    if (!backendResponse.ok) {
        throw new Error(`SpamX Backend explanation failed (Status: ${backendResponse.status})`);
    }

    return await backendResponse.json();
}
