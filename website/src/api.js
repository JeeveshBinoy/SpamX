const HF_SPACE = "https://spamx-spamx.hf.space";
export const BACKEND_URL = HF_SPACE;

/**
 * Calls HuggingFace Gradio 4 API using the two-step queue pattern:
 * 1. POST /gradio_api/call/{fn} with { data: [...] } → { event_id }
 * 2. GET  /gradio_api/call/{fn}/{event_id} → SSE stream → parse result
 */
export async function callGradio(apiName, data) {
    // Step 1: Submit job
    const submitResp = await fetch(`${HF_SPACE}/gradio_api/call${apiName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data })
    });

    if (!submitResp.ok) {
        throw new Error(`HuggingFace submit failed (${submitResp.status})`);
    }

    const { event_id } = await submitResp.json();
    if (!event_id) throw new Error("No event_id returned from HuggingFace");

    // Step 2: Stream the result
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("HuggingFace timed out after 60s"));
        }, 60000);

        const source = new EventSource(`${HF_SPACE}/gradio_api/call${apiName}/${event_id}`);

        source.addEventListener("complete", (e) => {
            clearTimeout(timeout);
            source.close();
            try {
                const result = JSON.parse(e.data);
                resolve(result); // result is the data array
            } catch {
                reject(new Error("Failed to parse HuggingFace response"));
            }
        });

        source.onerror = () => {
            clearTimeout(timeout);
            source.close();
            reject(new Error("HuggingFace SSE connection error"));
        };
    });
}
