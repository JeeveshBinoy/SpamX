// SpamX Extension - Backend Communication Layer
/**
 * The root URL for internal Django API services.
 * Must match the port defined in the backend manage.py runserver.
 */
const BACKEND_URL = "https://backend-delta-roan-60.vercel.app";

/**
 * Enhanced fetch with timeout support to prevent hanging requests.
 * @param {string} url - Destination URL.
 * @param {Object} options - Standard fetch options.
 * @param {number} timeoutMs - Timeout limit in milliseconds.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const abortController = new AbortController();
    const timeoutIdentifier = setTimeout(() => abortController.abort(), timeoutMs);
    try {
        const fetchResponse = await fetch(url, { ...options, signal: abortController.signal });
        clearTimeout(timeoutIdentifier);
        return fetchResponse;
    } catch (error) {
        clearTimeout(timeoutIdentifier);
        throw error;
    }
}

/**
 * Initiates an SSE (Server-Sent Events) stream for batch prediction.
 * As results arrive from the ML backend, they are piped back to the caller via the onResult callback.
 * 
 * @param {string[]} texts - List of comment texts to classify.
 * @param {string} modelChoice - The model/ensemble to use.
 * @param {Function} onResult - Callback function executed for each individual prediction.
 * @param {AbortSignal} signal - Signal to cancel the stream (e.g., if user navigates to a new video).
 */
async function callHFGradioStream(texts, modelChoice = "Ensemble", onResult, signal = null) {
    if (!texts || texts.length === 0) return;
    
    console.log(`[SpamX] Initializing Stream: ${texts.length} comments via ${modelChoice}`);
    
    try {
        const streamResponse = await fetch(`${BACKEND_URL}/api/predict_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts, model_choice: modelChoice }),
            signal
        });

        if (!streamResponse.ok) {
            console.error("[SpamX] SSE Connection Failed:", streamResponse.status);
            // Notify caller that these specific items failed
            texts.forEach((_, i) => onResult(i, "error", texts[i]));
            return;
        }

        // Initialize SSE stream reader
        const streamReader = streamResponse.body.getReader();
        const textDecoder = new TextDecoder();
        let partialChunkBuffer = "";

        while (true) {
            const { done, value } = await streamReader.read();
            if (done) break;

            // Decode the new bytes and append to the buffer
            partialChunkBuffer += textDecoder.decode(value, { stream: true });
            
            // Process individual data blocks (SSE format: 'data: {...}\n\n')
            // Split by the double newline that separates SSE events
            const blocks = partialChunkBuffer.split("\n\n");
            partialChunkBuffer = blocks.pop(); // Keep the trailing incomplete block in the buffer

            for (const block of blocks) {
                // An SSE block might have multiple lines, we only care about the lines starting with 'data: '
                const lines = block.split("\n");
                for (const dataLine of lines) {
                    if (!dataLine.startsWith("data: ")) continue;
                    try {
                        const parsedPayload = JSON.parse(dataLine.slice(6));
                        // Check if the backend signaled completion
                        if (parsedPayload.done) return;
                        
                        console.log(`[SpamX] Received Stream Result: ${parsedPayload.label} (${parsedPayload.model})`);
                        
                        // Trigger the UI/Engine callback for this specific comment
                        onResult(
                            parsedPayload.index, 
                            (parsedPayload.label || "error").toUpperCase(), 
                            parsedPayload.text, 
                            parsedPayload.confidence || 0.0, 
                            parsedPayload.model || modelChoice
                        );
                    } catch (parseError) {
                        console.warn("[SpamX] SSE Parse Error:", parseError, "Raw Data:", dataLine);
                    }
                }
            }
        }
    } catch (streamException) {
        if (streamException.name === "AbortError") {
            console.log("[SpamX] Stream cancelled gracefully (Video Switched)");
            return;
        }
        console.error("[SpamX] Stream network error:", streamException.message);
    }
}

/**
 * Fetches comment threads through the backend's YouTube proxy.
 * Proxying through the backend hides API keys and provides a consistent interface.
 * 
 * @param {string} videoId - The target YouTube video ID.
 * @param {string} pageToken - Token for fetching next set of comments.
 */
async function fetchCommentsFromBackend(videoId, pageToken = "") {
    try {
        let endpointUrl = `${BACKEND_URL}/api/comments/${videoId}`;
        if (pageToken) endpointUrl += `?pageToken=${encodeURIComponent(pageToken)}`;
        
        console.log(`[SpamX] Requesting Comments: ${videoId}`);

        const serverResponse = await fetchWithTimeout(endpointUrl, {}, 25000);
        if (!serverResponse.ok) {
            const errorDetails = await serverResponse.text();
            console.error("[SpamX] Comment service unavailable:", serverResponse.status, errorDetails);
            return { comments: [], totalVideoComments: 0, nextPageToken: null };
        }

        const commentData = await serverResponse.json();
        console.log(`[SpamX] Received ${commentData.comments?.length ?? 0} comments`);
        return commentData;
        
    } catch (requestError) {
        if (requestError.name === "AbortError") {
            console.log("[SpamX] Comment fetch timed out or was cancelled");
        } else {
            console.error("[SpamX] Connection lost during comment fetch:", requestError.message);
        }
        return { comments: [], totalVideoComments: 0, nextPageToken: null };
    }
}

