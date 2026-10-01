// Installability only. The app is a live view of a running agent and every response is no-store, so nothing is
// cached and offline use makes no sense; browsers just require a fetch handler to offer "install".
self.addEventListener("fetch", () => {});
