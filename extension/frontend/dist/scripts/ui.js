/**
 * extractTextFromNode: Recursively extracts text and image alt tags from a YouTube comment node.
 * This is necessary because YouTube comments often contain emojis (img tags) and nested spans.
 * 
 * @param {HTMLElement} parentNode - The root node containing comment text.
 * @returns {string} - The flattened, trimmed text content.
 */
function extractTextFromNode(parentNode) {
    let extractedText = "";
    const performExtraction = (node) => {
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                extractedText += child.textContent;
            } else if (child.tagName === "IMG") {
                // Recover emoji text from alt attributes
                extractedText += child.alt || "";
            } else if (child.childNodes && child.childNodes.length > 0) {
                performExtraction(child);
            }
        });
    };
    performExtraction(parentNode);
    return extractedText.trim();
}

/**
 * injectCleanUI: Statically injects the SpamX styling into the page head.
 * Includes definitions for badges, the Clean Mode button, and hiding logic.
 */
function injectCleanUI() {
    if (document.getElementById("spamx-clean-styles")) return;
    
    const styleElement = document.createElement("style");
    styleElement.id = "spamx-clean-styles";
    styleElement.innerHTML = `
        /* Premium Glassmorphic Toggle Button */
        .spamx-clean-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 16px;
            margin: 10px 0 10px 20px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            color: #cbd5e1;
            font-family: "YouTube Sans", Roboto, sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            z-index: 2000;
        }
        .spamx-clean-btn:hover {
            background: rgba(30, 41, 59, 0.95);
            border-color: rgba(99, 102, 241, 0.6);
            color: #fff;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.2);
        }
        .spamx-clean-btn.active {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(236, 72, 153, 0.35));
            border-color: #a855f7;
            color: #f472b6;
            box-shadow: 0 0 25px rgba(168, 85, 247, 0.3);
        }
        .spamx-clean-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #475569;
            transition: all 0.3s;
        }
        .active .spamx-clean-dot {
            background: #ec4899;
            box-shadow: 0 0 10px #ec4899;
        }

        /* Diagnostic Badges */
        .spamx-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 700;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-left: 5px;
            user-select: none;
            opacity: 0.9;
            transition: opacity 0.2s;
        }
        .spamx-badge:hover { opacity: 1; }
        .spamx-badge-spam { background: #ef4444; }
        .spamx-badge-ham { background: #10b981; }
        .spamx-badge-creator { background: #6366f1 !important; }
        
        /* Visibility Classes used by Clean Mode */
        .spamx-hidden { display: none !important; }
        .spamx-hide-labels .spamx-badge { display: none !important; }

        /* Ensure menu doesn't break when we inject badges */
        ytd-menu-renderer.ytd-comment-renderer, #menu-container {
            display: flex !important;
            flex-direction: row-reverse !important;
            align-items: center !important;
            gap: 8px !important;
        }
    `;
    document.head.appendChild(styleElement);
}

/**
 * injectCleanToggle: Dynamically places the "Clean Mode" button near YouTube's sort menu.
 * @param {boolean} isCleanOn - Initial state of the toggle.
 * @param {Function} toggleCallback - Executed when the user clicks the button.
 */
function injectCleanToggle(isCleanOn, toggleCallback) {
    if (document.getElementById("spamx-clean-toggle")) return;

    // Search for YouTube header components to anchor the button
    const headerAnchor = document.querySelector("#sort-menu") ||
        document.querySelector("ytd-comments-header-renderer #title") ||
        document.querySelector("ytd-comments-header-renderer");

    if (!headerAnchor) return;

    const toggleButton = document.createElement("div");
    toggleButton.id = "spamx-clean-toggle";
    toggleButton.className = "spamx-clean-btn";
    toggleButton.innerHTML = `<div class="spamx-clean-dot"></div> Clean Mode`;

    if (isCleanOn) toggleButton.classList.add("active");

    toggleButton.onclick = (event) => {
        event.stopPropagation();
        toggleCallback();
    };

    if (headerAnchor.id === "sort-menu" || headerAnchor.id === "title") {
        headerAnchor.after(toggleButton);
    } else {
        headerAnchor.prepend(toggleButton);
    }
}

/**
 * applyCleanMode: High-level DOM switch to hide/show spam comments.
 */
function applyCleanMode(isCleanOn) {
    const pageBody = document.body;
    const toggleButton = document.getElementById("spamx-clean-toggle");
    if (toggleButton) toggleButton.classList.toggle("active", isCleanOn);

    if (isCleanOn) {
        pageBody.classList.add("spamx-hide-labels");
        document.querySelectorAll(".spamx-container-spam").forEach(element => element.classList.add("spamx-hidden"));
    } else {
        pageBody.classList.remove("spamx-hide-labels");
        document.querySelectorAll(".spamx-container-spam").forEach(element => element.classList.remove("spamx-hidden"));
    }
}

/**
 * tagCommentBase: The core visual tagging logic.
 * Attaches stickers (SPAM/HAM/CREATOR) and sets up the redirection to the diagnostic website.
 * 
 * @param {HTMLElement} commentTextNode - The actual text node to tag.
 * @param {string} label - 'SPAM' or 'HAM'.
 * @param {boolean} isCleanOn - Whether spam should be hidden immediately.
 * @param {WeakSet} processedSet - Engine's tracker to avoid double-tagging.
 */
function tagCommentBase(commentTextNode, label, isCleanOn, processedSet, confidence = 0, modelUsed = "Ensemble") {
    if (processedSet.has(commentTextNode)) return false;
    
    const commentThreadContainer = commentTextNode.closest("ytd-comment-thread-renderer, ytd-comment-renderer, ytd-reel-comment-renderer, yt-live-chat-text-message-renderer");
    if (!commentThreadContainer) return false;

    // CREATOR PROTECTION: We check if the comment author is the video creator.
    // Creators are automatically assigned the "CREATOR" label and cannot be hidden as spam.
    const isVideoCreator = commentThreadContainer.querySelector("ytd-author-comment-badge-renderer") !== null;

    // Locate the comment's menu area to inject our badge
    const messageMenu = commentThreadContainer.querySelector("#menu-container") ||
        commentThreadContainer.querySelector("#menu") ||
        commentThreadContainer.querySelector("ytd-menu-renderer") ||
        commentThreadContainer.querySelector(".ytd-comment-action-buttons-renderer") ||
        commentThreadContainer.querySelector("#content.yt-live-chat-text-message-renderer");

    if (!messageMenu || messageMenu.querySelector(".spamx-badge")) return false;

    processedSet.add(commentTextNode);

    const finalVisualLabel = isVideoCreator ? "CREATOR" : label;

    // If it's spam and Clean Mode is on, hide it immediately
    if (finalVisualLabel === "SPAM") {
        commentThreadContainer.classList.add("spamx-container-spam");
        if (isCleanOn) commentThreadContainer.classList.add("spamx-hidden");
    }

    // Create the visual badge sticker
    const verdictBadge = document.createElement("div");
    verdictBadge.className = `spamx-badge spamx-badge-${finalVisualLabel.toLowerCase()}`;
    verdictBadge.innerText = isVideoCreator ? "CREATOR" : finalVisualLabel;
    verdictBadge.style.cursor = "pointer";
    verdictBadge.title = isVideoCreator ? "Video Author - Verified" : "Click for Diagnostic Analysis & SHAP Explainability";

    // INSIGHTS REDIRECTION:
    // Clicking the badge opens the SpamX Website with the comment context pre-loaded.
    verdictBadge.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        if (isVideoCreator) return; // Don't analyze creators
        
        const fullCommentText = extractTextFromNode(commentTextNode);
        
        // Production Website URL (Vercel)
        const diagnosticUrl = new URL("https://spamx-diagnostic-website-jeeveshbinoys-projects.vercel.app/");
        diagnosticUrl.searchParams.set("comment", fullCommentText || commentTextNode.innerText.trim());
        diagnosticUrl.searchParams.set("label", label.toLowerCase());
        diagnosticUrl.searchParams.set("conf", confidence);
        diagnosticUrl.searchParams.set("model", modelUsed);
        
        window.open(diagnosticUrl.toString(), '_blank');
    };

    // Responsive injection (Live Chat vs standard comments)
    if (commentThreadContainer.tagName.toLowerCase().includes("live-chat")) {
        verdictBadge.style.fontSize = "9px";
        verdictBadge.style.padding = "2px 5px";
        messageMenu.appendChild(verdictBadge);
    } else {
        messageMenu.prepend(verdictBadge);
    }
    return true;
}
