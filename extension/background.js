// Moodle Course Hub Extension - Background Service Worker (Single Source of Truth)

// Import the Supabase UMD client locally bundle in the extension package
importScripts('supabase.js');

// 1. Centralized message coordinator
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_SESSION") {
    getOrRefreshSession()
      .then(result => {
        if (result) {
          sendResponse({ success: true, session: result.session, url: result.url, anonKey: result.anonKey });
        } else {
          sendResponse({ success: false, error: "Extension not connected. Please connect from Course Hub Settings." });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async handler
  }

  if (request.action === "SET_SESSION") {
    validateAndSaveSession(request.data)
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.action === "CLEAR_SESSION") {
    clearSession()
      .then(() => {
        sendResponse({ success: true });
      });
    return true;
  }

  if (request.action === "GET_AUTH_STATUS") {
    getAuthStatus().then(status => sendResponse(status));
    return true;
  }
});

// 2. Fetch and refresh session if close to expiration (Phase 9)
async function getOrRefreshSession() {
  const data = await chrome.storage.local.get(["supabase_session", "supabase_url", "supabase_anon_key"]);
  const session = data.supabase_session;
  const url = data.supabase_url;
  const anonKey = data.supabase_anon_key;

  if (!session || !url || !anonKey) {
    return null;
  }

  // Calculate if the JWT access token is expired or within 2 minutes of expiring
  const expiresAt = session.expires_at || (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : 0);
  const isCloseToExpiry = expiresAt && (expiresAt - Math.floor(Date.now() / 1000) < 120);

  if (isCloseToExpiry) {
    console.log("[Moodle Hub BG] Access token expiring soon. Triggering silent refresh...");
    try {
      const client = supabase.createClient(url, anonKey);
      const { data: refreshRes, error: refreshErr } = await client.auth.refreshSession({
        refresh_token: session.refresh_token
      });

      if (refreshErr) throw refreshErr;

      if (refreshRes && refreshRes.session) {
        const newSession = refreshRes.session;
        // Save refreshed credentials back to storage
        await chrome.storage.local.set({ "supabase_session": newSession });
        console.log("[Moodle Hub BG] Session successfully refreshed.");
        return { session: newSession, url, anonKey };
      }
    } catch (err) {
      console.warn("[Moodle Hub BG] Failed to refresh session:", err.message);
      // Purge revoked/invalid sessions
      await clearSession();
      return null;
    }
  }

  return { session, url, anonKey };
}

// 3. Validate credentials and save on handshake
async function validateAndSaveSession(payload) {
  const { session, url, anonKey, webAppUrl } = payload;

  if (!session || !url || !anonKey) {
    return { success: false, error: "Malformed connection payload: missing variables." };
  }

  try {
    // Instantiate temporary client to validate credentials with Supabase Auth
    const client = supabase.createClient(url, anonKey);
    const { data: authUser, error: authError } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });

    if (authError) {
      return { success: false, error: `Authentication validation failed: ${authError.message}` };
    }

    // Double check session is currently active
    if (!authUser || !authUser.user) {
      return { success: false, error: "No active user associated with this session." };
    }

    // Save validated configuration coordinates to chrome local storage
    await chrome.storage.local.set({
      "supabase_session": session,
      "supabase_url": url,
      "supabase_anon_key": anonKey,
      "supabase_web_app_url": webAppUrl || "https://course-sync-eight.vercel.app",
      "sync_status": "connected"
    });

    console.log("[Moodle Hub BG] Handshake completed successfully. Saved credentials for user:", authUser.user.email);
    return { success: true, email: authUser.user.email };

  } catch (err) {
    console.error("[Moodle Hub BG] Error validating handshake session:", err.message);
    return { success: false, error: `Handshake failed: ${err.message}` };
  }
}

// 4. Purge storage credentials
async function clearSession() {
  console.log("[Moodle Hub BG] Purging stored auth credentials. User logged out.");
  await chrome.storage.local.remove([
    "supabase_session",
    "supabase_url",
    "supabase_anon_key",
    "supabase_web_app_url",
    "sync_status"
  ]);
}

// 5. Query status metadata
async function getAuthStatus() {
  const data = await chrome.storage.local.get(["supabase_session"]);
  const session = data.supabase_session;
  return {
    authenticated: !!session,
    email: session ? session.user.email : null
  };
}
