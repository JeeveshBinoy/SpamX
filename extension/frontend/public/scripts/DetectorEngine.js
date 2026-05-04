class SpamXEngine {
    constructor() {
        this.videoId = null;
        this.modelChoice = "Confidence-based Gating";
        this.cache = new Map();
        this.seenIds = new Set();
        this.pendingQueue = [];
        this.processedNodes = new WeakSet();
        this.indexedNodes = new WeakSet();
        this.nodeMap = new Map();
        this.isWorking = this.isCleanModeEnabled = this._isPaused = false;
        this._activeControllers = new Set();
        this._currentSessionId = 0;
        this._pauseTimeout = null;
        this.classificationStats = { spamCount: 0, hamCount: 0, scannedCount: 0, totalComments: 0 };
        this._initializeEngine();
    }

    _initializeEngine() {
        chrome.runtime.onMessage.addListener((msg, _s, send) => {
            if (msg.type === "REQUEST_LOAD") send({ ...this.classificationStats });
            if (msg.type === "SET_MODEL" && msg.model && msg.model !== this.modelChoice) {
                this.modelChoice = msg.model;
                this._resetState();
                if (this.videoId) this._loadComments(this.videoId, "", this._currentSessionId);
                send({ success: true });
            }
            if (msg.type === "PRIORITIZE_EXPLAIN") {
                this._isPaused = true;
                if (this._pauseTimeout) clearTimeout(this._pauseTimeout);
                this._activeControllers.forEach(c => c.abort());
                this._activeControllers.clear();
                this._pauseTimeout = setTimeout(() => {
                    this._isPaused = false;
                    this._pauseTimeout = null;
                    if (this.videoId) this._processQueue(this._currentSessionId);
                }, 8000);
                send({ success: true });
            }
        });

        injectCleanUI();
        setInterval(() => this._broadcast("HEARTBEAT", { isWorking: this.isWorking }), 1500);
        setInterval(() => injectCleanToggle(this.isCleanModeEnabled, () => { this.isCleanModeEnabled = !this.isCleanModeEnabled; applyCleanMode(this.isCleanModeEnabled); }), 2000);
        
        let navTimeout = null;
        const navHandler = () => {
            if (navTimeout) clearTimeout(navTimeout);
            navTimeout = setTimeout(() => this._detectNav(), 200);
        };
        ["yt-navigate-finish", "yt-page-data-updated", "popstate"].forEach(e => window.addEventListener(e, navHandler));
        setInterval(() => this._detectNav(), 2000);
        setInterval(() => this._sweepUntagged(), 2000);

        this._observer = new MutationObserver((mutations) => {
            const added = [];
            for (const m of mutations) {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches?.("#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text")) added.push(node);
                        added.push(...(node.querySelectorAll?.("#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text") || []));
                    }
                });
            }
            if (added.length) this._processNewNodes(added);
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
        this._processNewNodes(document.querySelectorAll("#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text"));
    }

    _detectNav() {
        const id = new URLSearchParams(window.location.search).get("v");
        if (id !== this.videoId) {
            this.videoId = id;
            this._resetState();
            if (id) this._loadComments(id, "", this._currentSessionId);
        }
    }

    _getNodeKeys(node) {
        const keys = new Set();
        const inner = (node.innerText || "").trim();
        const content = (node.textContent || "").trim();
        const extracted = extractTextFromNode(node);
        if (inner) keys.add(inner);
        if (content && content !== inner) keys.add(content);
        if (extracted && extracted !== inner && extracted !== content) keys.add(extracted);
        return keys;
    }

    _processNewNodes(nodes) {
        if (!this.videoId) return;
        for (const n of nodes) {
            if (this.indexedNodes.has(n)) continue;
            this.indexedNodes.add(n);
            const keys = this._getNodeKeys(n);
            for (const k of keys) {
                if (!this.nodeMap.has(k)) this.nodeMap.set(k, new Set());
                this.nodeMap.get(k).add(n);
            }
            for (const k of keys) {
                const res = this.cache.get(k);
                if (res) { this._applyTag(n, res.label, res.conf, res.model); break; }
            }
        }
    }

    _sweepUntagged() {
        if (!this.videoId || !this.cache.size) return;
        const nodes = document.querySelectorAll("#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text");
        for (const n of nodes) {
            if (this.processedNodes.has(n)) continue;
            const keys = this._getNodeKeys(n);
            for (const k of keys) {
                const res = this.cache.get(k);
                if (res) { this._applyTag(n, res.label, res.conf, res.model); break; }
            }
            if (this.processedNodes.has(n)) continue;
            for (const k of keys) {
                const norm = this._norm(k);
                for (const [ck, cv] of this.cache.entries()) {
                    if (this._norm(ck) === norm) { this._applyTag(n, cv.label, cv.conf, cv.model); break; }
                }
                if (this.processedNodes.has(n)) break;
            }
        }
        this._sync();
    }

    async _loadComments(videoId, pageToken = "", sessionId) {
        if (sessionId !== this._currentSessionId || this._isPaused || !videoId) return;
        this.isWorking = true;
        this._broadcast("BATCH_START", { message: "Retrieving Comments..." });
        const ctrl = new AbortController();
        this._activeControllers.add(ctrl);
        try {
            const data = await fetchCommentsFromBackend(videoId, pageToken, ctrl.signal);
            if (sessionId !== this._currentSessionId || !data?.comments) return;
            this.classificationStats.totalComments = data.totalVideoComments || data.totalResults || this.classificationStats.totalComments;
            data.comments.forEach(c => {
                if (!this.seenIds.has(c.id)) {
                    this.seenIds.add(c.id);
                    this.pendingQueue.push({ id: c.id, text: c.text });
                }
            });
            this._processQueue(sessionId);
            if (data.nextPageToken && sessionId === this._currentSessionId)
                setTimeout(() => this._loadComments(videoId, data.nextPageToken, sessionId), 2000);
        } catch (e) { if (e.name !== "AbortError") console.warn("[SpamX] Fetch interrupted"); } finally { this._activeControllers.delete(ctrl); }
    }

    async _processQueue(sessionId) {
        if (sessionId !== this._currentSessionId || this._isPaused || this._processing || !this.videoId) return;
        if (!this.pendingQueue.length) {
            this.isWorking = false;
            this._broadcast("SCAN_COMPLETE");
            this._sync();
            return;
        }

        this.isWorking = this._processing = true;
        const batch = this.pendingQueue.splice(0, 20);
        this._broadcast("BATCH_START", { message: `Analyzing ${batch.length} comments...` });

        const ctrl = new AbortController();
        this._activeControllers.add(ctrl);
        try {
            await callHFGradioStream(batch.map(i => i.text), this.modelChoice, (idx, label, text, conf, model) => {
                if (sessionId !== this._currentSessionId) return;
                if (label === "ERROR") return;
                const apiKey = (text || "").trim();
                if (!apiKey) return;
                this.cache.set(apiKey, { label, conf, model });
                
                const directNodes = this.nodeMap.get(apiKey);
                if (directNodes) {
                    directNodes.forEach(n => this._applyTag(n, label, conf, model));
                } else {
                    const norm = this._norm(apiKey);
                    for (const [k, kNodes] of this.nodeMap.entries()) {
                        if (this._norm(k) === norm) {
                            this.cache.set(k, { label, conf, model });
                            kNodes.forEach(n => this._applyTag(n, label, conf, model));
                            break;
                        }
                    }
                }
                this._sync();
            }, ctrl.signal);
        } catch (e) {
            if (e.name !== "AbortError") console.warn("[SpamX] Stream interrupted");
        } finally {
            this._activeControllers.delete(ctrl);
            this._processing = false;
            if (sessionId === this._currentSessionId && !this._isPaused && this.pendingQueue.length) {
                this._processQueue(sessionId);
            } else if (!this.pendingQueue.length) {
                this.isWorking = false;
                this._broadcast("SCAN_COMPLETE");
                this._sync();
            }
        }
    }

    _applyTag(node, label, conf, model) {
        if (this.processedNodes.has(node)) return;
        if (tagCommentBase(node, label, this.isCleanModeEnabled, this.processedNodes, conf, model || this.modelChoice)) {
            const isCreator = node.closest("ytd-comment-thread-renderer, ytd-comment-renderer, ytd-reel-comment-renderer, yt-live-chat-text-message-renderer")?.querySelector("ytd-author-comment-badge-renderer") !== null;
            (isCreator || label !== "SPAM") ? this.classificationStats.hamCount++ : this.classificationStats.spamCount++;
            this.classificationStats.scannedCount++;
        }
    }

    _resetState() {
        if (this._pauseTimeout) clearTimeout(this._pauseTimeout);
        this._pauseTimeout = null;
        this._isPaused = this._processing = false;
        this._activeControllers.forEach(c => c.abort());
        this._activeControllers.clear();
        this._currentSessionId++;
        this.cache.clear();
        this.seenIds.clear();
        this.nodeMap.clear();
        this.pendingQueue = [];
        this.processedNodes = new WeakSet();
        this.indexedNodes = new WeakSet();
        this.isWorking = false;
        this.classificationStats = { spamCount: 0, hamCount: 0, scannedCount: 0, totalComments: 0 };
        document.querySelectorAll(".spamx-badge, #spamx-clean-toggle, #spamx-banner").forEach(el => el.remove());
        document.querySelectorAll(".spamx-container-spam").forEach(el => el.classList.remove("spamx-container-spam", "spamx-hidden"));
        if (this._observer) { this._observer.disconnect(); this._observer.observe(document.body, { childList: true, subtree: true }); }
        this._sync();
    }

    _norm(t) { return (t || "").toLowerCase().replace(/\s+/g, " ").trim(); }
    _sync() { this._broadcast("SYNC_COUNTS", { data: { ...this.classificationStats } }); }
    _broadcast(type, payload = {}) {
        if (!chrome.runtime?.id) return;
        try { chrome.runtime.sendMessage({ type, ...payload }, () => { if (chrome.runtime.lastError) {} }); } catch (e) {}
    }
}
new SpamXEngine();
