// Moodle Course Hub Extension - Popup Script

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const statusCard = document.getElementById("connection-status-card");
  const statusTitle = document.getElementById("status-title");
  const statusDesc = document.getElementById("status-desc");
  
  const targetSemesterVal = document.getElementById("target-semester-val");
  const lastSyncVal = document.getElementById("last-sync-val");
  
  const metricDetected = document.getElementById("metric-detected");
  const metricAdded = document.getElementById("metric-added");
  
  const notificationBlock = document.getElementById("notification-block");
  
  const syncBtn = document.getElementById("btn-sync");
  const dashboardBtn = document.getElementById("btn-dashboard");

  let supabaseClient = null;

  // Initialize and check connection
  function checkAuthAndLoad() {
    chrome.runtime.sendMessage({ action: "GET_SESSION" }, async (response) => {
      if (response && response.success && response.session) {
        // Connected!
        statusCard.className = "status-card connected";
        statusTitle.textContent = "Connected";
        statusDesc.textContent = `Logged in: ${response.session.user.email}`;
        
        syncBtn.disabled = false;
        notificationBlock.style.display = "none";

        // Retrieve config from storage to make requests
        supabaseClient = supabase.createClient(response.url, response.anonKey);
        await supabaseClient.auth.setSession({
          access_token: response.session.access_token,
          refresh_token: response.session.refresh_token
        });

        // Fetch the active target semester name
        fetchTargetSemester(response.session.user.id);

        // Load sync stats from storage
        loadSyncStats();
      } else {
        // Check if we were ever connected to distinguish from expired state
        chrome.storage.local.get(["supabase_url"], (data) => {
          syncBtn.disabled = true;
          targetSemesterVal.textContent = "-";
          notificationBlock.style.display = "block";

          if (data.supabase_url) {
            // Expired state
            statusCard.className = "status-card disconnected";
            statusTitle.textContent = "Session Expired";
            statusDesc.textContent = "Please reconnect the extension.";
            notificationBlock.innerHTML = `
              Course Hub session expired.<br>
              Go to Settings in the Dashboard and click <strong>Reconnect</strong>.
            `;
          } else {
            // Disconnected state
            statusCard.className = "status-card disconnected";
            statusTitle.textContent = "Not Connected";
            statusDesc.textContent = "Open Moodle Course Hub and connect the extension.";
            notificationBlock.innerHTML = `
              Course Hub extension is not connected.<br>
              Open your dashboard settings and click <strong>Connect Extension</strong>.
            `;
          }
        });
      }
    });
  }

  // Fetch target semester label from Supabase
  async function fetchTargetSemester(userId) {
    if (!supabaseClient) return;
    try {
      // Get settings first to identify target semester
      const { data: settings } = await supabaseClient
        .from('settings')
        .select('current_semester_id')
        .eq('user_id', userId)
        .maybeSingle();

      let semId = settings?.current_semester_id;
      
      if (!semId) {
        // Fallback to first current semester
        const { data: semesters } = await supabaseClient
          .from('semesters')
          .select('id')
          .eq('user_id', userId)
          .eq('is_current', true)
          .limit(1);
        if (semesters && semesters.length > 0) semId = semesters[0].id;
      }

      if (semId) {
        const { data: targetSemester } = await supabaseClient
          .from('semesters')
          .select('name')
          .eq('id', semId)
          .maybeSingle();

        if (targetSemester) {
          targetSemesterVal.textContent = targetSemester.name;
        }
      }
    } catch (err) {
      console.error("Failed to query target semester details:", err);
    }
  }

  // Load metrics and sync timestamps from storage
  function loadSyncStats() {
    chrome.storage.local.get([
      "last_sync_time",
      "detected_count",
      "added_count",
      "sync_status"
    ], (data) => {
      if (data.last_sync_time) {
        lastSyncVal.textContent = data.last_sync_time;
        metricDetected.textContent = data.detected_count || 0;
        metricAdded.textContent = data.added_count || 0;
      }
    });
  }

  // Trigger manual scraping and synchronization
  syncBtn.addEventListener("click", () => {
    notificationBlock.style.display = "none";
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing...";

    // Find if the user has an open Moodle dashboard tab
    chrome.tabs.query({ url: "*://moodle.mitaoe.ac.in/*" }, (tabs) => {
      const dashboardTab = tabs.find(t => 
        t.url.includes("/my/") || 
        t.url.includes("/my/index.php") || 
        t.url.includes("/my/courses.php") ||
        t.url === "http://moodle.mitaoe.ac.in/"
      );

      if (!dashboardTab) {
        // Moodle is not open on dashboard
        notificationBlock.style.display = "block";
        notificationBlock.className = "notification-text";
        notificationBlock.innerHTML = `
          <strong>Moodle Tab Closed</strong><br>
          Please open your Moodle Portal Dashboard 
          (<a href="http://moodle.mitaoe.ac.in/my/" target="_blank" style="color:var(--accent-cyan);">mitaoe.ac.in/my/</a>) 
          in a tab to run sync.
        `;
        syncBtn.disabled = false;
        syncBtn.textContent = "Sync Now";
        return;
      }

      // Send trigger sync message to content script on that tab
      chrome.tabs.sendMessage(dashboardTab.id, { action: "TRIGGER_SYNC" }, (res) => {
        setTimeout(() => {
          loadSyncStats();
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Now";
        }, 1500); // Wait for sync operation and storage save
      });
    });
  });

  // Open the Web app dashboard in a new tab
  dashboardBtn.addEventListener("click", () => {
    chrome.storage.local.get(["supabase_web_app_url"], (data) => {
      const url = data.supabase_web_app_url || "http://localhost:8000";
      chrome.tabs.create({ url: `${url}/dashboard.html` });
    });
  });

  // Run checks
  checkAuthAndLoad();
});
