/**
 * SpamXEngine: The central controller for the browser extension.
 * Orchestrates comment extraction, background classification via SSE,
 * and real-time DOM manipulation on YouTube.
 */
class SpamXEngine {
    constructor() {
        this.videoId = null;                    // Current YouTube video ID
        this.modelChoice = "Ensemble";          // Selected ML model
        this.cache = new Map();                 // Normalized text -> {label, confidence, model}
        this.seenIds = new Set();               // Set of comment IDs already queued
        this.pendingQueue = [];                 // Queue of comments waiting for classification
        this.processedNodes = new WeakSet();    // DOM nodes already tagged with a verdict
        this.isWorking = false;                 // Engine processing state
        this.isCleanModeEnabled = false;        // Toggle state for hiding spam
        this._streamAbortController = null;     // Handle for cancelling active SSE streams
        this._currentSessionId = 0;             // Increments on video swap; ignores stale responses
        
        // Cumulative counters for the popup UI
        this.classificationStats = { 
            spamCount: 0, 
            hamCount: 0, 
            scannedCount: 0, 
            totalComments: 0 
        };
        
        console.log("[SpamX] Detector Engine Initializing...");
        this._initializeEngine();
    }

    _initializeEngine() {
        // Listen for messages from the Popup (Model selection, Statistics requests)
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type === "REQUEST_LOAD") {
                sendResponse({ ...this.classificationStats });
            }
            if (message.type === "SET_MODEL" && message.model && message.model !== this.modelChoice) {
                this.modelChoice = message.model;
                console.log("[SpamX] Analysis Model selection changed to:", this.modelChoice);
                this._resetState();
                if (this.videoId) this._loadCommentsFromYouTube(this.videoId, "", this._currentSessionId);
                // sendResponse to acknowledge receipt even though we don't strictly wait for it.
                sendResponse({ success: true });
            }
            // By returning true, we MUST call sendResponse. If there's any other message,
            // we should also call sendResponse or simply don't return true.
            // Since we handle stuff synchronously, we can just return false or don't return.
        });

        // Initialize background UI components (Banner, Toggle)
        injectCleanUI();

        // Standard heartbeat to keep the popup informed of progress
        setInterval(() => {
            this._broadcastToPopup("HEARTBEAT", { isWorking: this.isWorking, hasError: false });
        }, 1500);

        // Periodically verify the presence of the 'Clean Mode' toggle in the DOM
        setInterval(() => {
            injectCleanToggle(this.isCleanModeEnabled, () => {
                this.isCleanModeEnabled = !this.isCleanModeEnabled;
                applyCleanMode(this.isCleanModeEnabled);
            });
        }, 2000);

        // YouTube SPA Hook: Detect video navigation without page reload
        window.addEventListener("yt-navigate-finish", () => {
            setTimeout(() => this._detectVideoNavigation(), 300);
        });

        // Fallback Polling (Handles edge cases where yt-navigate might not fire)
        setInterval(() => this._detectVideoNavigation(), 2000);

        // Continuous DOM sweep to find and tag comments that appear after page load
        setInterval(() => this._performDOMTaggingSweep(), 1500);
    }

    /**
     * _detectVideoNavigation: Parses the URL to see if the user is watching a new video.
     */
    _detectVideoNavigation() {
        const activeVideoId = new URLSearchParams(window.location.search).get("v");
        if (activeVideoId && activeVideoId !== this.videoId) {
            console.log("[SpamX] Navigated to Video:", activeVideoId);
            this.videoId = activeVideoId;
            this._resetState();
            this._loadCommentsFromYouTube(activeVideoId, "", this._currentSessionId);
        }
    }

    /**
     * _loadCommentsFromYouTube: Fetches comments via the backend proxy.
     * Implements recursion for pagination.
     */
    async _loadCommentsFromYouTube(videoId, pageToken = "", sessionId) {
        // Guard: If the user switched videos while we were waiting, ignore this response
        if (sessionId !== this._currentSessionId) return; 
        
        this.isWorking = true;
        this._broadcastToPopup("BATCH_START", { message: "Retrieving Comment Threads..." });

        const commentPayload = await fetchCommentsFromBackend(videoId, pageToken);

        if (sessionId !== this._currentSessionId) return; 
        
        if (!commentPayload || !commentPayload.comments) {
            this.isWorking = false;
            return;
        }

        // Update total comment estimate for the progress bar
        this.classificationStats.totalComments = commentPayload.totalVideoComments || commentPayload.totalResults || this.classificationStats.totalComments;
        this._synchronizePopupCounts();

        // deduplicate and add to classification queue
        for (const commentItem of commentPayload.comments) {
            if (!this.seenIds.has(commentItem.id)) {
                this.seenIds.add(commentItem.id);
                this.pendingQueue.push({ id: commentItem.id, text: commentItem.text });
            }
        }

        // Start processing the current queue
        this._processClassificationQueue(sessionId);

        // Follow pagination if more comments exist
        if (commentPayload.nextPageToken) {
            setTimeout(() => this._loadCommentsFromYouTube(videoId, commentPayload.nextPageToken, sessionId), 3000);
        }
    }

    /**
     * _processClassificationQueue: Batches comments and sends them to the ML backend via SSE.
     */
    async _processClassificationQueue(sessionId) {
        if (sessionId !== this._currentSessionId) return; 

        if (this.pendingQueue.length === 0) {
            this.isWorking = false;
            this._broadcastToPopup("SCAN_COMPLETE");
            this._synchronizePopupCounts();
            return;
        }

        this.isWorking = true;
        // Batch size (25) balances latency vs throughput with parallel backend support
        const batchToAnalyze = this.pendingQueue.splice(0, 25);
        const textBatch = batchToAnalyze.map(item => item.text);

        this._broadcastToPopup("BATCH_START", { message: `Analyzing ${textBatch.length} comments...` });

        this._streamAbortController = new AbortController();
        const { signal } = this._streamAbortController;

        // Initiate SSE stream for real-time results
        await callHFGradioStream(textBatch, this.modelChoice, (index, label, text, confidence, modelUsed) => {
            if (sessionId !== this._currentSessionId) return; 
            
            const normalizedContent = this._normalizeText(text);
            if (label !== "ERROR" && normalizedContent) {
                // Persistent cache for DOM re-scans (faster than API calls)
                this.cache.set(normalizedContent, { label, confidence, model: modelUsed });
                
                // Immediate DOM tagging
                const belongsToCreator = this._findAndTagInDOM(normalizedContent, label, confidence, modelUsed);
                
                // Metrics update: Creators are protected (exempt from spam hiding)
                if (belongsToCreator) {
                    this.classificationStats.hamCount++;
                } else if (label === "SPAM") {
                    this.classificationStats.spamCount++;
                } else {
                    this.classificationStats.hamCount++;
                }
                this.classificationStats.scannedCount++;
            }
            this._synchronizePopupCounts();
        }, signal);

        // Continue processing if the queue isn't empty
        if (sessionId !== this._currentSessionId) return;

        if (this.pendingQueue.length > 0) {
            this._processClassificationQueue(sessionId);
        } else {
            this.isWorking = false;
            this._broadcastToPopup("SCAN_COMPLETE");
            this._synchronizePopupCounts();
        }
    }

    /**
     * _findAndTagInDOM: Locates the specific DOM node corresponding to classified text.
     * Returns true if the node is part of a Creator comment thread.
     */
    _findAndTagInDOM(normalizedText, label, confidence, modelUsed) {
        const commentContentSelectors = "#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text";
        const matchedNodes = document.querySelectorAll(commentContentSelectors);
        
        for (const candidateNode of matchedNodes) {
            if (this.processedNodes.has(candidateNode)) continue;
            
            const rawNodeText = extractTextFromNode(candidateNode);
            if (!rawNodeText) continue;
            
            const normalizedNodeText = this._normalizeText(rawNodeText);
            
            // Fuzzy match (handles truncations or slight formatting diffs between API and DOM)
            const lengthDiff = Math.abs(normalizedNodeText.length - normalizedText.length);
            const isFuzzyMatch = (normalizedNodeText === normalizedText) || 
                                 (lengthDiff < 5 && (normalizedNodeText.includes(normalizedText) || normalizedText.includes(normalizedNodeText)));
            
            if (isFuzzyMatch) {
                const threadContainer = candidateNode.closest("ytd-comment-thread-renderer, ytd-comment-renderer, ytd-reel-comment-renderer, yt-live-chat-text-message-renderer");
                const hasCreatorBadge = threadContainer?.querySelector("ytd-author-comment-badge-renderer") !== null;
                
                // Apply visual markers (Badges, Overlays)
                tagCommentBase(candidateNode, label, this.isCleanModeEnabled, this.processedNodes, confidence, modelUsed || this.modelChoice);
                return hasCreatorBadge;
            }
        }
        return false;
    }

    /**
     * _performDOMTaggingSweep: Re-scans the DOM using the local cache.
     * Crucial for comments that load via scroll but were already classified via API proxy.
     */
    _performDOMTaggingSweep() {
        const targetCommentNodes = document.querySelectorAll(
            "#content-text, yt-formatted-string#message, ytd-reel-comment-renderer #content-text"
        );
        
        for (const activeNode of targetCommentNodes) {
            if (this.processedNodes.has(activeNode)) continue;
            
            const rawContent = extractTextFromNode(activeNode);
            if (!rawContent) continue;
            
            const normalizedContent = this._normalizeText(rawContent);
            
            // Check cache for existing classification
            let cachedResult = this.cache.get(normalizedContent);
            if (!cachedResult) {
                // Secondary fallback: Partial cache match with strict length limits
                for (const [cachedKey, resultValue] of this.cache.entries()) {
                    const lengthDiff = Math.abs(normalizedContent.length - cachedKey.length);
                    const isFuzzyMatch = (normalizedContent === cachedKey) || 
                                         (lengthDiff < 5 && (normalizedContent.includes(cachedKey) || cachedKey.includes(normalizedContent)));
                    if (isFuzzyMatch) {
                        cachedResult = resultValue;
                        break;
                    }
                }
            }
            
            if (cachedResult) {
                tagCommentBase(activeNode, cachedResult.label, this.isCleanModeEnabled, this.processedNodes, cachedResult.confidence, cachedResult.model || this.modelChoice);
            }
        }
    }

    /**
     * _resetState: Clears the engine state for a new video context.
     */
    _resetState() {
        // Abort any in-flight stream and increment session counter
        if (this._streamAbortController) {
            this._streamAbortController.abort();
            this._streamAbortController = null;
        }
        this._currentSessionId++;
        console.log(`[SpamX] State Reset for session #${this._currentSessionId}`);

        this.cache.clear();
        this.seenIds.clear();
        this.pendingQueue = [];
        this.processedNodes = new WeakSet();
        this.isWorking = false;
        this.classificationStats = { spamCount: 0, hamCount: 0, scannedCount: 0, totalComments: 0 };

        // DOM Sanitization: Remove old badges and markers
        document.querySelectorAll(".spamx-badge").forEach(element => element.remove());
        document.querySelectorAll(".spamx-container-spam").forEach(element =>
            element.classList.remove("spamx-container-spam", "spamx-hidden")
        );
        
        const cleanToggleElement = document.getElementById("spamx-clean-toggle");
        if (cleanToggleElement) cleanToggleElement.remove();

        this._synchronizePopupCounts();
    }

    /**
     * _normalizeText: Standardizes text for consistent matching across API/DOM.
     */
    _normalizeText(inputText) {
        return (inputText || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    /**
     * _synchronizePopupCounts: Pushes current statistics to the popup's listener.
     */
    _synchronizePopupCounts() {
        this._broadcastToPopup("SYNC_COUNTS", { data: { ...this.classificationStats } });
    }

    /**
     * _broadcastToPopup: Safe messaging wrapper.
     */
    _broadcastToPopup(type, payload = {}) {
        if (!chrome.runtime?.id) return;
        try { 
            chrome.runtime.sendMessage({ type, ...payload }, () => { 
                // Ignore empty callback error
                if (chrome.runtime.lastError) { /* No-op */ }
            }); 
        } catch (messagingError) {
            // Likely background script disconnected
        }
    }
}

// Global Engine Instance
new SpamXEngine();
