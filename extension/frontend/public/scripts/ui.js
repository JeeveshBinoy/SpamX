const extractTextFromNode = (node) => {
    let text = "";
    node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
        else if (child.tagName === "BR") text += " ";
        else if (child.tagName === "IMG") text += child.alt || "";
        else text += extractTextFromNode(child);
    });
    return text.trim();
};

const injectCleanUI = () => {
    if (document.getElementById("spamx-clean-styles")) return;
    const style = document.createElement("style");
    style.id = "spamx-clean-styles";
    style.innerHTML = `
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
        .spamx-hidden { display: none !important; }
        .spamx-hide-labels .spamx-badge { display: none !important; }
        ytd-menu-renderer.ytd-comment-renderer, #menu-container {
            display: flex !important;
            flex-direction: row-reverse !important;
            align-items: center !important;
            gap: 8px !important;
        }
    `;
    document.head.appendChild(style);
};

const injectCleanToggle = (isCleanOn, callback) => {
    if (document.getElementById("spamx-clean-toggle")) return;
    const anchor = document.querySelector("#sort-menu") || document.querySelector("ytd-comments-header-renderer #title") || document.querySelector("ytd-comments-header-renderer");
    if (!anchor) return;

    const btn = document.createElement("div");
    btn.id = "spamx-clean-toggle";
    btn.className = "spamx-clean-btn";
    btn.innerHTML = `<div class="spamx-clean-dot"></div> Clean Mode`;
    if (isCleanOn) btn.classList.add("active");
    btn.onclick = (e) => { e.stopPropagation(); callback(); };
    
    (anchor.id === "sort-menu" || anchor.id === "title") ? anchor.after(btn) : anchor.prepend(btn);
    if (isCleanOn) applyCleanMode(true);
};

const applyCleanMode = (isCleanOn) => {
    const body = document.body;
    const btn = document.getElementById("spamx-clean-toggle");
    if (btn) btn.classList.toggle("active", isCleanOn);
    if (isCleanOn) {
        body.classList.add("spamx-hide-labels");
        document.querySelectorAll(".spamx-container-spam").forEach(el => el.classList.add("spamx-hidden"));
    } else {
        body.classList.remove("spamx-hide-labels");
        document.querySelectorAll(".spamx-container-spam").forEach(el => el.classList.remove("spamx-hidden"));
    }
};

const tagCommentBase = (node, label, isCleanOn, processedSet, confidence = 0, modelUsed = "Confidence-based Gating") => {
    if (processedSet.has(node)) return false;
    const container = node.closest("ytd-comment-thread-renderer, ytd-comment-renderer, ytd-reel-comment-renderer, yt-live-chat-text-message-renderer");
    if (!container) return false;

    const isCreator = container.querySelector("ytd-author-comment-badge-renderer") !== null;
    const menu = container.querySelector("#menu-container") || container.querySelector("#menu") || container.querySelector("ytd-menu-renderer") || container.querySelector(".ytd-comment-action-buttons-renderer") || container.querySelector("#content.yt-live-chat-text-message-renderer");
    if (!menu || menu.querySelector(".spamx-badge")) return false;

    processedSet.add(node);
    const finalVisualLabel = isCreator ? "CREATOR" : label;
    if (finalVisualLabel === "SPAM") {
        container.classList.add("spamx-container-spam");
        if (isCleanOn) container.classList.add("spamx-hidden");
    }

    const badge = document.createElement("div");
    badge.className = `spamx-badge spamx-badge-${finalVisualLabel.toLowerCase()}`;
    badge.innerText = isCreator ? "CREATOR" : finalVisualLabel;
    badge.style.cursor = "pointer";
    badge.title = isCreator ? "Video Author - Verified" : "Click for Diagnostic Analysis & SHAP Explainability";
    
    badge.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isCreator) return;
        const text = extractTextFromNode(node);
        const url = new URL("http://localhost:5173/");
        url.searchParams.set("comment", text || node.innerText.trim());
        url.searchParams.set("label", label.toLowerCase());
        url.searchParams.set("conf", confidence);
        url.searchParams.set("model", modelUsed);
        chrome.runtime.sendMessage({ type: "PRIORITIZE_EXPLAIN" });
        chrome.runtime.sendMessage({ type: "OPEN_TAB", url: url.toString() });
    };

    container.tagName.toLowerCase().includes("live-chat") ? (badge.style.fontSize = "9px", badge.style.padding = "2px 5px", menu.appendChild(badge)) : menu.prepend(badge);
    return true;
};
