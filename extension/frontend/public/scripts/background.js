// Background service worker — relays content script messages to popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only relay messages that come FROM content scripts (they have a sender.tab)
    // This prevents looping — relayed messages from background have no sender.tab
    if (sender.tab) {
        chrome.runtime.sendMessage(msg).catch(() => { });
    }
    sendResponse();
    return true;
});
