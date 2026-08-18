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
  let currentCourses = null;
  let currentSemesters = null;
  let currentSettings = null;
  let currentUserEmail = "";

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
        try {
          supabaseClient = supabase.createClient(response.url, response.anonKey);
          await supabaseClient.auth.setSession({
            access_token: response.session.access_token,
            refresh_token: response.session.refresh_token
          });
        } catch (authErr) {
          console.warn("[Moodle Hub Popup] Auth connection failed:", authErr.message);
          statusCard.className = "status-card disconnected";
          statusTitle.textContent = "Offline Mode";
          statusDesc.textContent = "Cannot reach server. Sync is disabled.";
          syncBtn.disabled = true;
          return;
        }

        // Fetch the active target semester name
        fetchTargetSemester(response.session.user.id);

        // Load sync stats from storage
        loadSyncStats();

        // Retrieve and load HTML Export data
        loadHtmlExport(response.session.user.id, response.session.user.email);
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
          chrome.storage.local.set({ "target_semester_name": targetSemester.name });
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
          chrome.runtime.sendMessage({ action: "GET_SESSION" }, (response) => {
            if (response && response.success && response.session) {
              loadHtmlExport(response.session.user.id, response.session.user.email);
            }
          });
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Now";
        }, 1500); // Wait for sync operation and storage save
      });
    });
  });

  // Open the Web app dashboard in a new tab
  dashboardBtn.addEventListener("click", () => {
    chrome.storage.local.get(["supabase_web_app_url"], (data) => {
      const url = data.supabase_web_app_url || "https://course-sync-eight.vercel.app";
      chrome.tabs.create({ url: `${url}/dashboard.html` });
    });
  });

  // HTML Export Action Bindings & Handlers
  async function loadHtmlExport(userId, email) {
    if (!supabaseClient) return;
    try {
      const [coursesRes, semestersRes, settingsRes] = await Promise.all([
        supabaseClient.from('courses').select('*').eq('user_id', userId).order('position', { ascending: true }),
        supabaseClient.from('semesters').select('*').eq('user_id', userId).order('semester_number', { ascending: true }),
        supabaseClient.from('settings').select('*').eq('user_id', userId).maybeSingle()
      ]);

      if (coursesRes.error || semestersRes.error) {
        console.error("Failed to query data for HTML export:", coursesRes.error || semestersRes.error);
        document.getElementById("html-status-desc").textContent = "Generation failed";
        return;
      }

      currentCourses = coursesRes.data || [];
      currentSemesters = semestersRes.data || [];
      currentSettings = settingsRes.data || {};
      currentUserEmail = email;

      document.getElementById("html-status-desc").textContent = "✓ HTML ready";
      document.getElementById("html-export-section").style.display = "block";

      checkNewCourseNotification(currentCourses, currentSemesters, currentSettings, email);
    } catch (err) {
      console.error("Error setting up HTML Export:", err);
      document.getElementById("html-status-desc").textContent = "Offline / Connection error";
    }
  }

  function checkNewCourseNotification(courses, semesters, settings, email) {
    chrome.storage.local.get(["newly_detected_courses", "target_semester_name"], (data) => {
      const newCourses = data.newly_detected_courses || [];
      if (newCourses.length > 0) {
        const notifyBlock = document.getElementById("new-course-notify");
        const listDiv = document.getElementById("new-courses-list");
        const assignDiv = document.getElementById("new-course-assigned");
        
        listDiv.innerHTML = "";
        newCourses.forEach(name => {
          const item = document.createElement("div");
          item.style.padding = "2px 0";
          item.textContent = `• ${name}`;
          listDiv.appendChild(item);
        });

        let targetSemName = data.target_semester_name || "Target Semester";
        assignDiv.textContent = `Assigned to: ${targetSemName}`;
        notifyBlock.style.display = "flex";
      }
    });
  }

  function triggerDownloadHtml() {
    if (!currentCourses || !currentSemesters) return;
    try {
      const htmlStr = generateMoodleCourseHubHTML(currentCourses, currentSemesters, currentSettings, currentUserEmail);
      const blob = new Blob([htmlStr], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ashish-moodle-courses.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }

  function triggerCopyHtml() {
    if (!currentCourses || !currentSemesters) return;
    try {
      const htmlStr = generateMoodleCourseHubHTML(currentCourses, currentSemesters, currentSettings, currentUserEmail);
      navigator.clipboard.writeText(htmlStr);
      
      const descLabel = document.getElementById("html-status-desc");
      const prevText = descLabel.textContent;
      descLabel.textContent = "✓ Moodle HTML copied to clipboard";
      descLabel.style.color = "var(--color-success)";
      setTimeout(() => {
        descLabel.textContent = prevText;
        descLabel.style.color = "var(--text-sub)";
      }, 3000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  document.getElementById("btn-copy-html").addEventListener("click", triggerCopyHtml);
  document.getElementById("btn-download-html").addEventListener("click", triggerDownloadHtml);
  
  document.getElementById("close-notify-btn").addEventListener("click", () => {
    chrome.storage.local.remove("newly_detected_courses", () => {
      document.getElementById("new-course-notify").style.display = "none";
    });
  });

  document.getElementById("btn-download-new-html").addEventListener("click", () => {
    triggerDownloadHtml();
    chrome.storage.local.remove("newly_detected_courses", () => {
      document.getElementById("new-course-notify").style.display = "none";
    });
  });

  // Run checks
  checkAuthAndLoad();
});
