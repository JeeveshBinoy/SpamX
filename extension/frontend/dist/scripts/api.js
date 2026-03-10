// SpamX Extension - Backend API Bridge
const BACKEND_URL = "http://127.0.0.1:8000";

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

/**
 * Streams predictions from backend and calls onResult(index, label, text)
 * for each comment as soon as its prediction is ready.
 * Returns a promise that resolves when all predictions are done.
 */
async function callHFGradioStream(texts, modelChoice = "Ensemble", onResult, signal = null) {
    if (!texts || texts.length === 0) return;
    console.log(`[SpamX] Stream request: ${texts.length} texts, model=${modelChoice}`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/predict_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts, model_choice: modelChoice }),
            signal
        });

        if (!res.ok) {
            console.error("[SpamX] Stream failed:", res.status);
            texts.forEach((_, i) => onResult(i, "error", texts[i]));
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.done) return;
                    console.log(`[SpamX] Streamed: '${data.text?.substring(0, 30)}' -> ${data.label}`);
                    onResult(data.index, (data.label || "error").toUpperCase(), data.text);
                } catch (_) { }
            }
        }
    } catch (e) {
        if (e.name === "AbortError") {
            console.log("[SpamX] Stream aborted (video switched)");
            return;
        }
        console.error("[SpamX] Stream exception:", e.message);
    }
}


async function fetchCommentsFromBackend(videoId, pageToken = "") {
    try {
        let url = `${BACKEND_URL}/api/comments/${videoId}`;
        if (pageToken) url += `?pageToken=${encodeURIComponent(pageToken)}`;
        console.log(`[SpamX] Fetching comments: ${url}`);

        const res = await fetchWithTimeout(url, {}, 25000);
        if (!res.ok) {
            const err = await res.text();
            console.error("[SpamX] Comments fetch failed:", res.status, err);
            return { comments: [], totalVideoComments: 0, nextPageToken: null };
        }

        const json = await res.json();
        console.log(`[SpamX] Got ${json.comments?.length ?? 0} comments`);
        return json;
    } catch (e) {
        if (e.name === "AbortError") {
            // Timeout or video switch — not an error, just stop quietly
            console.log("[SpamX] Comments fetch cancelled (timeout or video switch)");
        } else {
            console.error("[SpamX] Comments fetch exception:", e.message);
        }
        return { comments: [], totalVideoComments: 0, nextPageToken: null };
    }
}

