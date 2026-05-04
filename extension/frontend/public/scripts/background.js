chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "OPEN_TAB" && msg.url) {
        chrome.tabs.create({ url: msg.url });
        sendResponse();
        return true;
    }

    if (sender.tab) {
        chrome.runtime.sendMessage(msg).catch(() => { });
    }
    sendResponse();
    return true;
});
