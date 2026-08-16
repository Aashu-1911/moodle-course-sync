// Moodle Course Hub Extension - Web App Connector Script
// Runs only on http://localhost:8000/* to facilitate secure connection handshake

console.log("[Moodle Hub Connector] Injected on dashboard domain. Listening for handshake events...");

// 1. Listen for window messages from the dashboard web application context
window.addEventListener("message", (event) => {
  // Security Check: Verify origin is local development or vercel domains
  const isAllowedOrigin = event.origin === "http://localhost:8000" || 
    (event.origin.startsWith("https://") && event.origin.endsWith(".vercel.app"));
  
  if (!isAllowedOrigin) {
    return;
  }

  const message = event.data;
  if (!message || typeof message !== "object") return;

  // Handler A: Web App checks if extension is installed and connected
  if (message.type === "CHECK_EXTENSION_PRESENT_REQUEST") {
    chrome.runtime.sendMessage({ action: "GET_SESSION" }, (response) => {
      const isConnected = !!(response && response.success && response.session);
      const email = isConnected ? response.session.user.email : null;
      
      window.postMessage({
        type: "CHECK_EXTENSION_PRESENT_RESPONSE",
        installed: true,
        connected: isConnected,
        email: email
      }, "*");
    });
  }

  // Handler B: Web App initiates connection handshake
  if (message.type === "CONNECT_EXTENSION_REQUEST") {
    const payload = {
      session: message.session,
      url: message.url,
      anonKey: message.anonKey,
      webAppUrl: message.webAppUrl || event.origin
    };

    chrome.runtime.sendMessage({ action: "SET_SESSION", data: payload }, (response) => {
      if (response && response.success) {
        window.postMessage({
          type: "CONNECT_EXTENSION_RESPONSE",
          success: true,
          email: response.email
        }, "*");
      } else {
        window.postMessage({
          type: "CONNECT_EXTENSION_RESPONSE",
          success: false,
          error: response?.error || "Session verification failed."
        }, "*");
      }
    });
  }

  // Handler C: Web App commands disconnect
  if (message.type === "DISCONNECT_EXTENSION_REQUEST") {
    chrome.runtime.sendMessage({ action: "CLEAR_SESSION" }, (response) => {
      window.postMessage({
        type: "DISCONNECT_EXTENSION_RESPONSE",
        success: true
      }, "*");
    });
  }
});
