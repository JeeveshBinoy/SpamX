// SpamX Extension - Detector Engine
class SpamXEngine {
    constructor() {
        this.videoId = null;
        this.modelChoice = "Ensemble";
        this.cache = new Map();
        this.seenIds = new Set();
        this.pending = [];
        this.processed = new WeakSet();
        this.isWorking = false;
        this.isCleanOn = false;
        this._streamAbort = null;
        this._session = 0;   // increments on every video change — stale calls bail out
        this.stats = { spamCount: 0, hamCount: 0, scannedCount: 0, totalComments: 0 };
        console.log("[SpamX] Engine starting...");
        this._init();
    }

    _init() {
        chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
            if (msg.type === "REQUEST_LOAD") reply({ ...this.stats });
            if (msg.type === "SET_MODEL" && msg.model && msg.model !== this.modelChoice) {
                this.modelChoice = msg.model;
                console.log("[SpamX] Model set to:", this.modelChoice);
                this._reset();
                if (this.videoId) this._loadComments(this.videoId, "", this._session);
            }
            return true;
        });

        injectCleanUI();

        setInterval(() => this._send("HEARTBEAT", { isWorking: this.isWorking, hasError: false }), 1500);

        setInterval(() => {
            injectCleanToggle(this.isCleanOn, () => {
                this.isCleanOn = !this.isCleanOn;
                applyClean(this.isCleanOn);
            });
        }, 2000);

        // YouTube SPA: fires immediately on video navigation
        window.addEventListener("yt-navigate-finish", () => {
            setTimeout(() => this._checkVideo(), 300);
        });

        // Fallback polling
        setInterval(() => this._checkVideo(), 2000);

        // DOM tagging sweep
        setInterval(() => this._scanDOM(), 1500);
    }

    _checkVideo() {
        const id = new URLSearchParams(window.location.search).get("v");
        if (id && id !== this.videoId) {
            console.log("[SpamX] New video:", id);
            this.videoId = id;
            this._reset();
            this._loadComments(id, "", this._session);
        }
    }

    async _loadComments(videoId, pageToken = "", session) {
        if (session !== this._session) return; // stale — video switched
        this.isWorking = true;
        this._send("BATCH_START", { message: "Fetching comments..." });

        const data = await fetchCommentsFromBackend(videoId, pageToken);

        if (session !== this._session) return; // video switched while fetching
        if (!data || !data.comments) {
            this.isWorking = false;
            return;
        }

        this.stats.totalComments = data.totalVideoComments || data.totalResults || this.stats.totalComments;
        this._sync();

        for (const c of data.comments) {
            if (!this.seenIds.has(c.id)) {
                this.seenIds.add(c.id);
                this.pending.push({ id: c.id, text: c.text });
            }
        }

        this._processBatch(session);

        if (data.nextPageToken) {
            setTimeout(() => this._loadComments(videoId, data.nextPageToken, session), 3000);
        }
    }

    async _processBatch(session) {
        if (session !== this._session) return; // stale

        if (this.pending.length === 0) {
            this.isWorking = false;
            this._send("SCAN_COMPLETE");
            this._sync();
            return;
        }

        this.isWorking = true;
        const batch = this.pending.splice(0, 20);
        const texts = batch.map(c => c.text);

        this._send("BATCH_START", { message: `Analyzing ${texts.length} comments...` });

        this._streamAbort = new AbortController();
        const { signal } = this._streamAbort;

        await callHFGradioStream(texts, this.modelChoice, (index, label, text) => {
            if (session !== this._session) return; // video switched mid-stream
            const norm = this._norm(text);
            if (label !== "ERROR" && norm) {
                this.cache.set(norm, label);
                // Tag the DOM node and check if it's a creator
                const isCreator = this._tagByText(norm, label);
                // Creators always count as HAM regardless of prediction
                if (isCreator) {
                    this.stats.hamCount++;
                } else if (label === "SPAM") {
                    this.stats.spamCount++;
                } else {
                    this.stats.hamCount++;
                }
                this.stats.scannedCount++;
            }
            this._sync();
        }, signal);

        if (session !== this._session) return; // video switched after stream

        if (this.pending.length > 0) {
            this._processBatch(session);
        } else {
            this.isWorking = false;
            this._send("SCAN_COMPLETE");
            this._sync();
        }
    }

    // Returns true if the tagged comment belonged to a creator
    _tagByText(norm, label) {
        const sel = "#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text";
        const nodes = document.querySelectorAll(sel);
        for (const node of nodes) {
            if (this.processed.has(node)) continue;
            const raw = extractTextFromNode(node);
            if (!raw) continue;
            const nodeNorm = this._norm(raw);
            if (nodeNorm === norm || nodeNorm.includes(norm) || norm.includes(nodeNorm)) {
                const container = node.closest("ytd-comment-thread-renderer, ytd-comment-renderer, ytd-reel-comment-renderer, yt-live-chat-text-message-renderer");
                const isCreator = container?.querySelector("ytd-author-comment-badge-renderer") !== null;
                tagCommentBase(node, label, this.isCleanOn, this.processed);
                return isCreator;
            }
        }
        return false;
    }

    _scanDOM() {
        const nodes = document.querySelectorAll(
            "#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text"
        );
        for (const node of nodes) {
            if (this.processed.has(node)) continue;
            const raw = extractTextFromNode(node);
            if (!raw) continue;
            const norm = this._norm(raw);
            let label = this.cache.get(norm);
            if (!label) {
                for (const [k, v] of this.cache.entries()) {
                    if (norm === k || norm.includes(k) || k.includes(norm)) {
                        label = v;
                        break;
                    }
                }
            }
            if (label) {
                tagCommentBase(node, label, this.isCleanOn, this.processed);
            }
        }
    }

    _reset() {
        // Abort any in-flight stream instantly
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        // Increment session — invalidates all pending _loadComments and _processBatch calls
        this._session++;
        console.log(`[SpamX] Video switched — session #${this._session}`);

        this.cache.clear();
        this.seenIds.clear();
        this.pending = [];
        this.processed = new WeakSet();
        this.isWorking = false;
        this.stats = { spamCount: 0, hamCount: 0, scannedCount: 0, totalComments: 0 };

        document.querySelectorAll(".spamx-badge").forEach(el => el.remove());
        document.querySelectorAll(".spamx-container-spam").forEach(el =>
            el.classList.remove("spamx-container-spam", "spamx-hidden")
        );
        const toggle = document.getElementById("spamx-clean-toggle");
        if (toggle) toggle.remove();

        this._sync();
    }

    _norm(text) {
        return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    _sync() {
        this._send("SYNC_COUNTS", { data: { ...this.stats } });
    }

    _send(type, extra = {}) {
        if (!chrome.runtime?.id) return;
        try { chrome.runtime.sendMessage({ type, ...extra }, () => { }); } catch (_) { }
    }
}

new SpamXEngine();
