const BACKEND_URL = "http://127.0.0.1:8000";

const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) options.signal.addEventListener('abort', () => controller.abort());
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
};

const callHFGradioStream = async (texts, modelChoice = "Confidence-based Gating", onResult, signal = null) => {
    if (!texts?.length) return;
    try {
        const res = await fetch(`${BACKEND_URL}/api/predict_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts, model_choice: modelChoice }),
            signal
        });
        if (!res.ok) return texts.forEach((_, i) => onResult(i, "ERROR", texts[i]));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop();

            for (const block of blocks) {
                for (const line of block.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.done) return;
                        onResult(data.index, (data.label || "ERROR").toUpperCase(), data.text, data.confidence || 0, data.model || modelChoice);
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        if (e.name !== "AbortError") console.error("[SpamX] Stream error:", e.message);
    }
};

const fetchCommentsFromBackend = async (videoId, pageToken = "", signal = null) => {
    try {
        let url = `${BACKEND_URL}/api/comments/${videoId}${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`;
        const res = await fetchWithTimeout(url, { signal }, 25000);
        return res.ok ? await res.json() : { comments: [], totalVideoComments: 0, nextPageToken: null };
    } catch (e) {
        return { comments: [], totalVideoComments: 0, nextPageToken: null };
    }
};
