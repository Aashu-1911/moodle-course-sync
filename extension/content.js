// Moodle Course Hub Extension - Content Script

let globalSupabaseClient = null;

// Clean and shorten course name by removing academic years, division codes, teachers, etc.
function cleanCourseTitle(title) {
  if (!title) return "";
  let clean = title;
  
  // Remove HTML entities
  clean = clean.replace(/&amp;/g, '&');
  
  // Remove bracketed patterns matching academic years, divisions, semesters or batch details:
  // e.g. ( AY 2025-26 SEM-IV ) or ( 2025 - 26 Sem - III & IV)
  clean = clean.replace(/\(\s*(?:AY|DIV|Batch|Sem|\d{4}-\d{2})[^)]*\)/gi, '');
  
  // Remove standalone division and batch text patterns:
  clean = clean.replace(/DIV\s*-\s*[A-Z](?:\s*&\s*Batch\s*-\s*[A-Z0-9]+)?/gi, '');
  clean = clean.replace(/-\s*[A-Z]\b/g, ''); 
  
  // Remove metadata brackets
  clean = clean.replace(/\(\s*MDM[^)]*\)/gi, '');
  
  // Remove trailing credits/teachers
  clean = clean.replace(/-\s*PDG\b/gi, '');
  clean = clean.replace(/-\s*[A-Z][a-z]+\s+[A-Z][a-z]+/g, '');
  
  // Clean empty brackets
  clean = clean.replace(/\(\s*\)/g, '');
  
  // Clean spaces and trailing marks
  clean = clean.replace(/\s+/g, ' ');
  clean = clean.replace(/\s*-\s*$/g, '');
  clean = clean.trim();
  
  // Special cases
  clean = clean.replace(/-A\b/gi, '');
  clean = clean.replace(/\b lab\b/gi, ' Lab');
  clean = clean.replace(/\b theory\b/gi, ' Theory');
  clean = clean.replace(/-\s*Swapnali Mohol/gi, '');
  
  // Clean hyphens spacing
  clean = clean.replace(/\s*-\s*/g, ' - ');

  // Strip manual category suffix overrides
  clean = clean.replace(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/gi, '');
  
  return clean.trim();
}

// Debounce helper to prevent excessive database calls during rapid DOM mutations
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 1. Scraping: Extract Moodle Course links from DOM
function extractMoodleCourses() {
  const detected = [];

  // Moodle Boost Theme Selectors (My overview dashboard cards/lists)
  const cards = document.querySelectorAll(
    '[data-region="course-card"], [data-region="course-list-item"], [data-region="course-summaryitem"], .dashboard-card, .course-summaryitem'
  );

  if (cards && cards.length > 0) {
    console.log(`[Moodle Hub] Found ${cards.length} structured course container cards.`);
    cards.forEach(card => {
      // Find course view link inside card
      const linkEl = card.querySelector('a.coursename, a[href*="/course/view.php?id="]');
      if (!linkEl) return;

      const url = linkEl.href;
      
      // Extract name carefully from link element text or its .multiline span
      const multilineEl = linkEl.querySelector('.multiline');
      let name = multilineEl ? multilineEl.innerText : linkEl.innerText;
      
      // Clean name: remove progress bars or dates if accidentally grabbed
      name = cleanCourseName(name);

      const moodleCourseId = parseCourseIdFromUrl(url);
      if (moodleCourseId) {
        detected.push({ moodleCourseId, name, url });
      }
    });
  }

  // Fallback: If no structured cards are found, scan all links on page
  if (detected.length === 0) {
    console.log("[Moodle Hub] No dashboard cards found. Scanning page for fallback course links...");
    const links = document.querySelectorAll('a[href*="/course/view.php?id="]');
    links.forEach(link => {
      const url = link.href;
      let name = link.innerText;
      
      name = cleanCourseName(name);
      const moodleCourseId = parseCourseIdFromUrl(url);
      
      // Ignore empty links or links with generic labels (like "Go to course" or images)
      if (moodleCourseId && name && name.length > 3 && !isGenericText(name)) {
        detected.push({ moodleCourseId, name, url });
      }
    });
  }

  return detected;
}

// Parse course id query parameters from URL
function parseCourseIdFromUrl(urlStr) {
  try {
    const url = new URL(urlStr, window.location.origin);
    return url.searchParams.get("id");
  } catch (err) {
    // String parsing fallback if URL construction fails
    const match = urlStr.match(/[?&]id=(\d+)/);
    return match ? match[1] : null;
  }
}

// Clean extracted name strings from Moodle junk
function cleanCourseName(name) {
  if (!name) return "";
  return name
    .replace(/\s+/g, ' ') // Collapse multiple whitespace
    .replace(/Course is starred/gi, '')
    .replace(/starred/gi, '')
    .trim();
}

// Helper to screen out generic buttons or links matching Moodle views
function isGenericText(text) {
  const genericTerms = ["course", "view", "enter", "go", "details", "star", "unstar", "summary", "activities"];
  return genericTerms.includes(text.toLowerCase());
}

// 2. Validate course object properties
function validateMoodleCourse(course) {
  if (!course.moodleCourseId || isNaN(parseInt(course.moodleCourseId, 10))) {
    return false;
  }
  if (!course.name || course.name.trim().length === 0) {
    return false;
  }
  if (!course.url || !course.url.includes("/course/view.php?id=")) {
    return false;
  }
  return true;
}

// 3. Normalize and deduplicate course records
function normalizeMoodleCourses(courses) {
  const uniqueMap = new Map();

  courses.forEach(course => {
    if (!validateMoodleCourse(course)) return;

    // Convert relative URLs to absolute
    const absoluteUrl = new URL(course.url, window.location.origin).href;
    
    const normalized = {
      moodleCourseId: course.moodleCourseId.toString(),
      name: course.name.trim(),
      url: absoluteUrl
    };

    // Deduplicate: If course already exists, keep it
    if (!uniqueMap.has(normalized.moodleCourseId)) {
      uniqueMap.set(normalized.moodleCourseId, normalized);
    }
  });

  return Array.from(uniqueMap.values());
}

// Injects a small visual banner into Moodle page notifying the sync outcome
function injectSyncBanner(addedCount, isFirstSync = false) {
  // Remove existing banner first
  const existing = document.getElementById("moodle-hub-sync-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "moodle-hub-sync-banner";
  
  // Style properties
  Object.assign(banner.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    background: "#0f172a",
    color: "#f8fafc",
    padding: "16px 20px",
    borderRadius: "12px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
    zIndex: "99999",
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.9rem",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    borderLeft: "5px solid #06b6d4",
    transition: "all 0.5s ease"
  });

  let message = "";
  if (addedCount > 0) {
    message = `<strong>Moodle Course Hub Linked!</strong><br>Found and synchronized ${addedCount} new course(s).`;
  } else {
    message = `<strong>Moodle Course Hub Connected</strong><br>Sync complete. All courses up to date.`;
  }

  banner.innerHTML = `
    <div>${message}</div>
    <div style="font-size:0.75rem; color:#94a3b8; display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      <span>Auto-synced successfully</span>
      <button id="close-sync-banner" style="background:transparent; border:none; color:#f8fafc; font-weight:bold; cursor:pointer; margin-left:12px;">✕</button>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelector("#close-sync-banner").addEventListener("click", () => banner.remove());
  setTimeout(() => banner.remove(), 6000);
}

// Helper to verify if extension context is still valid (not reloaded/invalidated)
function isContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
}

function safeStorageSet(items, callback) {
  if (isContextValid()) {
    chrome.storage.local.set(items, callback);
  }
}

function safeStorageGet(keys, callback) {
  if (isContextValid()) {
    chrome.storage.local.get(keys, callback);
  }
}

function getHtmlHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// 4. Synchronize courses back to Supabase Central database
async function runSynchronization() {
  console.log("[Moodle Hub] Running scraper and sync routine...");

  if (!isContextValid()) {
    console.warn("[Moodle Hub] Extension context is invalidated. Please refresh the page to sync.");
    return;
  }

  // Retrieve auth credentials from background service worker coordinator
  try {
    chrome.runtime.sendMessage({ action: "GET_SESSION" }, async (response) => {
      if (!isContextValid()) return;
      
      if (!response || !response.success) {
        safeStorageGet(["supabase_url"], (data) => {
          if (!isContextValid()) return;
          if (!data.supabase_url) {
            console.warn("[Moodle Hub] Course Hub extension is not connected. Open the Course Hub dashboard and connect the extension.");
          } else {
            console.warn("[Moodle Hub] Course Hub session expired. Please reconnect the extension.");
          }
        });
        safeStorageSet({ "sync_status": "disconnected" });
        return;
      }

      const session = response.session;
      const url = response.url;
      const anonKey = response.anonKey;

      // Initialize client
      if (typeof supabase === 'undefined') {
        console.error("[Moodle Hub] Supabase client script not loaded.");
        return;
      }

      if (!globalSupabaseClient) {
        globalSupabaseClient = supabase.createClient(url, anonKey);
      }
      const client = globalSupabaseClient;
      let authError = null;
      try {
        const { error } = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        authError = error;
      } catch (fetchErr) {
        console.warn("[Moodle Hub] Network error setting Supabase session:", fetchErr.message);
        safeStorageSet({ "sync_status": "network_error" });
        return;
      }

      if (authError) {
        console.error("[Moodle Hub] Failed to re-authenticate session:", authError.message);
        safeStorageSet({ "sync_status": "auth_expired" });
        return;
      }

      const user = session.user;
      
      // Scrape and normalize courses
      const rawCourses = extractMoodleCourses();
      const detectedCourses = normalizeMoodleCourses(rawCourses);

      if (detectedCourses.length === 0) {
        console.log("[Moodle Hub] No valid courses found on this page.");
        safeStorageSet({
          "last_sync_time": new Date().toLocaleString(),
          "detected_count": 0,
          "existing_count": 0,
          "added_count": 0,
          "sync_status": "no_courses"
        }, () => {
          renderMoodleHubUI(client, user);
        });
        return;
      }

    try {
      // 1. Fetch user settings to obtain current semester and auto-assign settings
      const { data: settings, error: settingsError } = await client
        .from('settings')
        .select('current_semester_id, auto_assign_new_courses')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settingsError) throw settingsError;

      let currentTargetSemesterId = settings?.current_semester_id;
      const autoAssignEnabled = settings ? settings.auto_assign_new_courses : true;

      // Fallback: If settings doesn't specify a semester, get active current semester ID
      if (!currentTargetSemesterId) {
        const { data: semesters } = await client
          .from('semesters')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_current', true)
          .limit(1);
        
        if (semesters && semesters.length > 0) {
          currentTargetSemesterId = semesters[0].id;
        }
      }

      // 2. Fetch all existing courses from Supabase
      const { data: dbCourses, error: dbCoursesError } = await client
        .from('courses')
        .select('*')
        .eq('user_id', user.id);

      if (dbCoursesError) throw dbCoursesError;

      const existingCourses = dbCourses || [];
      const existingMap = new Map(existingCourses.map(c => [c.moodle_course_id ? c.moodle_course_id.toString() : "", c]));

      // Determine if this is the first sync (no courses currently exist in the database)
      const isFirstSync = (existingCourses.length === 0);

      // Metrics counters
      let detectedCount = detectedCourses.length;
      let existingCount = 0;
      let addedCount = 0;
      let updatedCount = 0;
      let unassignedCount = 0;
      let errorsCount = 0;

      const detectedIds = new Set(detectedCourses.map(c => c.moodleCourseId));

      // 3. Compare detected courses
      for (const course of detectedCourses) {
        if (existingMap.has(course.moodleCourseId)) {
          existingCount++;
          const match = existingMap.get(course.moodleCourseId);
          
          const updates = {};
          let needsUpdate = false;

          // Safe Updates: check if name or url changed, update only metadata
          if (match.name !== course.name) {
            updates.name = course.name;
            needsUpdate = true;
          }
          if (match.url !== course.url) {
            updates.url = course.url;
            needsUpdate = true;
          }
          // Restore to active if it was marked inactive
          if (!match.is_moodle_active) {
            updates.is_moodle_active = true;
            needsUpdate = true;
          }

          if (needsUpdate) {
            console.log(`[Moodle Hub] Updating course metadata for: ${course.name}`);
            updates.updated_at = new Date().toISOString();
            const { error: updateErr } = await client
              .from('courses')
              .update(updates)
              .eq('id', match.id);

            if (!updateErr) {
              updatedCount++;
            } else {
              errorsCount++;
              console.error(`[Moodle Hub] Update failed for ${course.name}:`, updateErr.message);
            }
          }
        } else {
          // New Course discovered!
          console.log(`[Moodle Hub] Discovered new course: ${course.name}`);
          
          let targetSemId = currentTargetSemesterId;
          let nextPosition = 0;

          // First sync or auto-assign disabled? Insert as unassigned (semester_id = null)
          if (isFirstSync || !autoAssignEnabled) {
            targetSemId = null;
            unassignedCount++;
          } else {
            addedCount++;
            // Calculate next position in targeted semester
            if (targetSemId) {
              const { data: posData } = await client
                .from('courses')
                .select('position')
                .eq('user_id', user.id)
                .eq('semester_id', targetSemId)
                .order('position', { ascending: false })
                .limit(1);

              if (posData && posData.length > 0) {
                nextPosition = posData[0].position + 1;
              }
            }
          }

          const { error: insertErr } = await client
            .from('courses')
            .insert({
              user_id: user.id,
              moodle_course_id: course.moodleCourseId,
              semester_id: targetSemId,
              name: course.name,
              display_name: cleanCourseTitle(course.name),
              url: course.url,
              position: nextPosition,
              is_hidden: false,
              is_moodle_active: true
            });

          if (insertErr) {
            errorsCount++;
            // Revert metric counts
            if (isFirstSync || !autoAssignEnabled) {
              unassignedCount = Math.max(0, unassignedCount - 1);
            } else {
              addedCount = Math.max(0, addedCount - 1);
            }
            console.error(`[Moodle Hub] Insertion failed for course ${course.name}:`, insertErr.message);
          }
        }
      }

      // 4. Inactive course detection (Phase 13)
      for (const dbCourse of existingCourses) {
        const courseIdStr = dbCourse.moodle_course_id ? dbCourse.moodle_course_id.toString() : "";
        if (!detectedIds.has(courseIdStr) && dbCourse.is_moodle_active) {
          console.log(`[Moodle Hub] Marking course as inactive (not seen on Moodle): ${dbCourse.name}`);
          const { error: inactiveErr } = await client
            .from('courses')
            .update({ is_moodle_active: false })
            .eq('id', dbCourse.id);
          
          if (inactiveErr) {
            console.error(`[Moodle Hub] Failed to set inactive for ${dbCourse.name}:`, inactiveErr.message);
          }
        }
      }

      // Save sync status metrics
      const syncTime = new Date().toISOString();
      const syncMessage = `Detected: ${detectedCount}, Existing: ${existingCount}, Added: ${addedCount}, Updated: ${updatedCount}, Unassigned: ${unassignedCount}, Errors: ${errorsCount}`;
      const syncStatus = (errorsCount > 0) ? 'error' : 'success';
      
      // Sync report directly to DB Settings
      try {
        await client
          .from('settings')
          .update({
            last_sync_at: syncTime,
            last_sync_status: syncStatus,
            last_sync_message: syncMessage
          })
          .eq('user_id', user.id);
      } catch (settingsUpdateErr) {
        console.warn("[Moodle Hub] Failed to sync report to database settings:", settingsUpdateErr.message);
      }

      // Re-fetch latest courses, semesters and settings to ensure accurate HTML generation
      let coursesToUse = [];
      let semestersToUse = [];
      let settingsToUse = settings;
      try {
        const [upCourses, upSems, upSet] = await Promise.all([
          client.from('courses').select('*').eq('user_id', user.id).order('position', { ascending: true }),
          client.from('semesters').select('*').eq('user_id', user.id).order('semester_number', { ascending: true }),
          client.from('settings').select('*').eq('user_id', user.id).maybeSingle()
        ]);
        if (upCourses.data) coursesToUse = upCourses.data;
        if (upSems.data) semestersToUse = upSems.data;
        if (upSet.data) settingsToUse = upSet.data;
      } catch (refetchErr) {
        console.warn("[Moodle Hub] Failed to re-fetch database for HTML generation:", refetchErr.message);
      }

      try {
        const generatedHtml = generateMoodleCourseHubHTML(coursesToUse, semestersToUse, settingsToUse, user?.email);
        const newHash = getHtmlHash(generatedHtml);
        const lastGenTime = new Date().toLocaleString();

        safeStorageGet(["htmlHash", "newly_detected_courses"], (storeData) => {
          if (!isContextValid()) return;
          const oldHash = storeData?.htmlHash;
          const isChanged = (oldHash !== newHash);

          const updatesToStore = {
            "htmlHash": newHash,
            "last_generated_at": lastGenTime
          };

          if (isChanged) {
            updatesToStore.html_updated = true;
            
            if (addedCount > 0 || unassignedCount > 0) {
              const prevNewlyScraped = storeData?.newly_detected_courses || [];
              const newlyScrapedNames = detectedCourses
                .filter(dc => !existingMap.has(dc.moodleCourseId))
                .map(dc => dc.name);
              
              const combined = Array.from(new Set([...prevNewlyScraped, ...newlyScrapedNames]));
              updatesToStore.newly_detected_courses = combined;
            }
          }

          safeStorageSet(updatesToStore);
        });
      } catch (genErr) {
        console.error("[Moodle Hub] HTML Generation failed during sync:", genErr.message);
      }

      safeStorageSet({
        "last_sync_time": new Date().toLocaleString(),
        "detected_count": detectedCount,
        "existing_count": existingCount,
        "added_count": addedCount,
        "updated_count": updatedCount,
        "unassigned_count": unassignedCount,
        "errors_count": errorsCount,
        "sync_status": "connected"
      }, () => {
        if (!isContextValid()) return;
        console.log(`[Moodle Hub] Synchronization complete. ${syncMessage}`);
        injectSyncBanner(addedCount + unassignedCount);
        renderMoodleHubUI(client, user);
      });

    } catch (err) {
      console.error("[Moodle Hub] Sync error:", err.message);
      
      // Update setting DB with failure logs
      try {
        await client
          .from('settings')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: 'error',
            last_sync_message: `Sync error: ${err.message}`
          })
          .eq('user_id', user.id);
      } catch (settingsErrUpdate) {
        console.warn("[Moodle Hub] Failed to sync error to database settings:", settingsErrUpdate.message);
      }

      safeStorageSet({ "sync_status": "error" });
    }
  });
  } catch (outerErr) {
    console.warn("[Moodle Hub] Synchronization skipped due to context or messaging error:", outerErr.message);
  }
}

// 6. Dynamically render customized Moodle Course Hub Dashboard directly inside Moodle Portal (Phase 8)
async function renderMoodleHubUI(client, user) {
  const userId = user.id;
  console.log("[Moodle Hub] Populating customized Course Hub UI...");

  try {
    // Fetch configuration settings, semesters and courses
    const [settingsRes, semestersRes, coursesRes] = await Promise.all([
      client.from('settings').select('*').eq('user_id', userId).maybeSingle(),
      client.from('semesters').select('*').eq('user_id', userId).order('semester_number', { ascending: true }),
      client.from('courses').select('*').eq('user_id', userId).order('position', { ascending: true })
    ]);

    if (semestersRes.error || coursesRes.error) {
      console.error("[Moodle Hub] Database query failed during UI rendering:", semestersRes.error || coursesRes.error);
      return;
    }

    const userSettings = settingsRes.data;
    const allSemesters = semestersRes.data || [];
    const allCourses = coursesRes.data || [];

    // Filter visible semesters
    const visibleSemesters = allSemesters.filter(s => !s.is_archived);
    if (visibleSemesters.length === 0) return;

    // Target active semester selection
    let activeSemId = userSettings?.current_semester_id;
    const activeSemExists = visibleSemesters.some(s => s.id === activeSemId);
    if (!activeSemId || !activeSemExists) {
      const activeSem = visibleSemesters.find(s => s.is_current) || visibleSemesters[0];
      activeSemId = activeSem.id;
    }

    // Locate or create target insertion block on Moodle overview page
    let moodleContainer = document.querySelector('[data-region="myoverview"], #region-main');
    if (!moodleContainer) return;

    // Hide Moodle's standard cards to avoid layout clutter
    const nativeLists = document.querySelectorAll(
      '[data-region="course-cards"], .block-myoverview .card-deck, [data-region="course-list"], .myoverview-course-list'
    );
    nativeLists.forEach(el => el.style.display = "none");

    // Create our customized container if missing
    let customPanel = document.getElementById("moodle-course-hub-container");
    if (!customPanel) {
      customPanel = document.createElement("div");
      customPanel.id = "moodle-course-hub-container";
      moodleContainer.parentNode.insertBefore(customPanel, moodleContainer);
    }
    customPanel.className = "ashish-course-hub";

    // Inject stylesheet once
    if (!document.getElementById("moodle-hub-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "moodle-hub-styles";
      styleEl.textContent = `
        #moodle-course-hub-container {
          background: #f8fafc;
          border-radius: 16px;
          padding: 20px 28px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
          border: 1px solid rgba(0,0,0,0.02);
          margin-bottom: 24px;
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          position: relative;
          overflow: hidden;
        }
        #moodle-course-hub-container.dark-mode {
          background: #0f172a;
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.05);
          box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        }
        
        #moodle-course-hub-container::before {
          content: "";
          position: absolute;
          top: -100px;
          right: -100px;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, rgba(217,70,239,0.05) 50%, rgba(255,255,255,0) 100%);
          z-index: 0;
          pointer-events: none;
        }

        .hub-header {
          position: relative;
          z-index: 1;
          margin-bottom: 32px;
        }
        .hub-title {
          font-size: 2.2rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 6px 0;
          letter-spacing: -0.02em;
        }
        .dark-mode .hub-title {
          color: #f8fafc;
        }
        .hub-subtitle {
          font-size: 1rem;
          color: #64748b;
          margin: 0;
        }
        .dark-mode .hub-subtitle {
          color: #94a3b8;
        }

        /* Horizontal Tabs Selector Bar */
        .hub-tabs-bar {
          background: white;
          border-radius: 16px;
          padding: 8px;
          box-shadow: 0 4px 20px rgba(15,23,42,0.02);
          border: 1px solid #f1f5f9;
          display: flex;
          gap: 4px;
          margin-bottom: 32px;
          overflow-x: auto;
          position: relative;
          z-index: 1;
        }
        .dark-mode .hub-tabs-bar {
          background: #1e293b;
          border-color: #334155;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .hub-tab-v2 {
          flex: 1;
          text-align: center;
          padding: 8px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.85rem;
          color: #94a3b8;
          transition: all 0.25s ease;
          white-space: nowrap;
        }
        .hub-tab-v2:hover {
          color: #475569;
          background: #f8fafc;
        }
        .dark-mode .hub-tab-v2:hover {
          color: #cbd5e1;
          background: #334155;
        }
        .hub-tab-v2.active {
          background: linear-gradient(135deg, #6366f1, #d946ef);
          color: white;
          box-shadow: 0 4px 15px rgba(99,102,241,0.25);
        }

        /* 3-Column Courses Grid */
        .hub-grid-v2 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          position: relative;
          z-index: 1;
        }
        @media (max-width: 1024px) {
          .hub-grid-v2 {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 768px) {
          .hub-grid-v2 {
            grid-template-columns: 1fr;
          }
        }

        /* Course Card V2 */
        .course-card-v2 {
          background: white;
          border-radius: 10px;
          padding: 10px 14px;
          text-decoration: none !important;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #f1f5f9;
          box-shadow: 0 2px 6px rgba(15,23,42,0.01);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dark-mode .course-card-v2 {
          background: #1e293b;
          border-color: #334155;
        }

        /* Category Theme Variables */
        .course-card-v2.accent-purple {
          --theme-color: #8b5cf6;
          --border-color: rgba(139,92,246,0.12);
          --btn-bg: #f5f3ff;
          --shadow-glow: rgba(139,92,246,0.15);
        }
        .course-card-v2.accent-pink {
          --theme-color: #ec4899;
          --border-color: rgba(236,72,153,0.12);
          --btn-bg: #fdf2f8;
          --shadow-glow: rgba(236,72,153,0.15);
        }
        .course-card-v2.accent-blue {
          --theme-color: #3b82f6;
          --border-color: rgba(59,130,246,0.12);
          --btn-bg: #eff6ff;
          --shadow-glow: rgba(59,130,246,0.15);
        }
        .course-card-v2.accent-green {
          --theme-color: #10b981;
          --border-color: rgba(16,185,129,0.12);
          --btn-bg: #ecfdf5;
          --shadow-glow: rgba(16,185,129,0.15);
        }
        .course-card-v2.accent-orange {
          --theme-color: #f97316;
          --border-color: rgba(249,115,22,0.12);
          --btn-bg: #fff7ed;
          --shadow-glow: rgba(249,115,22,0.15);
        }

        .course-card-v2 {
          border-color: var(--border-color);
        }
        .course-card-v2:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px var(--shadow-glow);
          border-color: var(--theme-color);
        }

        .card-left {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          margin-right: 12px;
        }
        .card-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.3;
          transition: color 0.2s ease;
        }
        .dark-mode .card-title {
          color: #f8fafc;
        }
        .course-card-v2:hover .card-title {
          color: var(--theme-color);
        }
        
        .card-tag {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: var(--theme-color);
          text-transform: uppercase;
        }

        /* Circle Arrow Button */
        .card-arrow-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--btn-bg);
          color: var(--theme-color);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: bold;
          transition: all 0.25s ease;
        }
        .dark-mode .card-arrow-btn {
          background: rgba(255,255,255,0.03);
        }
        .course-card-v2:hover .card-arrow-btn {
          background: var(--theme-color);
          color: white;
          transform: scale(1.1);
        }

        .course-card-v2.inactive {
          opacity: 0.6;
        }

        /* Bottom Sparkle Quote Footer */
        .hub-footer {
          margin-top: 40px;
          background: #f5f3ff;
          border: 1px solid rgba(139,92,246,0.08);
          padding: 14px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
          z-index: 1;
        }
        .dark-mode .hub-footer {
          background: rgba(139,92,246,0.05);
          border-color: rgba(139,92,246,0.15);
        }
        .hub-footer-text {
          font-size: 0.9rem;
          font-weight: 600;
          color: #6d28d9;
          font-style: italic;
        }
        .dark-mode .hub-footer-text {
          color: #a78bfa;
        }

        /* Centered Pokemon Row */
        .hub-poke-row {
          margin-top: 30px;
          border-top: 1px solid #e2e8f0;
          padding-top: 24px;
          position: relative;
          z-index: 1;
          width: 100%;
        }
        .dark-mode .hub-poke-row {
          border-color: #334155;
        }
        .hub-poke-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 24px;
          justify-content: center;
          align-items: center;
        }
        .hub-poke-card {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .hub-poke-img {
          width: 50px;
          height: 50px;
          object-fit: contain;
          image-rendering: pixelated;
          animation: float 2.5s ease-in-out infinite;
        }
        .hub-poke-card:hover .hub-poke-img {
          animation: bounce 0.4s ease infinite alternate;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes bounce {
          from { transform: translateY(0px); }
          to { transform: translateY(-8px); }
        }
        
        /* Narrow Screen Mobile Optimizations */
        @media (max-width: 480px) {
          #moodle-course-hub-container {
            padding: 14px 16px !important;
          }
          .hub-tabs-bar {
            padding: 6px !important;
            margin-bottom: 20px !important;
          }
          .hub-tab-v2 {
            padding: 6px 8px !important;
            font-size: 0.75rem !important;
            border-radius: 8px !important;
          }
          .course-card-v2 {
            padding: 8px 12px !important;
          }
          .card-title {
            font-size: 0.78rem !important;
          }
          .card-tag {
            font-size: 0.58rem !important;
          }
          .card-arrow-btn {
            width: 20px !important;
            height: 20px !important;
            font-size: 0.7rem !important;
          }
        }
        
        /* Category Headers & Spacing */
        .category-section {
          margin-bottom: 24px;
        }
        .category-header {
          font-size: 0.82rem;
          font-weight: 700;
          color: #475569;
          margin-top: 14px;
          margin-bottom: 10px;
          padding-left: 8px;
          border-left: 3px solid #6366f1;
          display: flex;
          align-items: center;
          gap: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .dark-mode .category-header {
          color: #94a3b8;
          border-left-color: #a78bfa;
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Apply dark/light styles based on configuration
    const isDarkTheme = userSettings?.theme === "dark" || 
      (userSettings?.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    if (isDarkTheme) {
      customPanel.className = "dark-mode";
    } else {
      customPanel.className = "";
    }

    // Inner render function to update courses list
    const renderContent = (activeId) => {
      customPanel.innerHTML = "";

      const email = user?.email || "";
      let username = email ? email.split('@')[0] : "Ashish";
      if (!username || /^\d+$/.test(username)) {
        username = "Ashish";
      }
      const capName = username.charAt(0).toUpperCase() + username.slice(1);
      const titleText = `${capName}'s Courses`;

      // Title header
      const headerDiv = document.createElement("div");
      headerDiv.className = "hub-header";
      headerDiv.innerHTML = `
        <h1 class="hub-title">${titleText}</h1>
        <p class="hub-subtitle">Explore your enrolled courses and labs for the selected semester.</p>
      `;
      customPanel.appendChild(headerDiv);

      // Semesters selector horizontal tabs bar
      const tabsDiv = document.createElement("div");
      tabsDiv.className = "hub-tabs-bar";
      visibleSemesters.forEach(sem => {
        const tab = document.createElement("div");
        tab.className = `hub-tab-v2 ${sem.id === activeId ? 'active' : ''}`;
        tab.textContent = sem.name;
        tab.onclick = () => {
          renderContent(sem.id);
        };
        tabsDiv.appendChild(tab);
      });
      customPanel.appendChild(tabsDiv);

      const filteredCourses = allCourses.filter(c => c.semester_id === activeId && !c.is_hidden);

      if (filteredCourses.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.textAlign = "center";
        emptyDiv.style.padding = "32px";
        emptyDiv.style.color = "#64748b";
        emptyDiv.style.fontSize = "0.95rem";
        emptyDiv.textContent = "No courses configured for this semester. Manage mapping in the Web Hub.";
        customPanel.appendChild(emptyDiv);
      } else {
        const coreCourses = [];
        const labCourses = [];
        const otherCourses = [];

        filteredCourses.forEach(course => {
          const name = course.name.toLowerCase();
          let isLab = name.includes("lab") || name.includes("practical") || name.includes("workshop");
          let isOther = name.includes("project") || name.includes("prototype") || name.includes("design") ||
                          name.includes("foundation") || name.includes("basic") ||
                          name.includes("constitution") || name.includes("mandatory") || name.includes("ethics") ||
                          name.includes("elective") || name.includes("environmental") || name.includes("seminar");

          // Apply manual category suffixes if present in display_name
          const dispLower = course.display_name.toLowerCase();
          if (dispLower.endsWith(" (lab)")) {
            isLab = true;
            isOther = false;
          } else if (dispLower.endsWith(" (other)")) {
            isLab = false;
            isOther = true;
          } else if (dispLower.endsWith(" (core)")) {
            isLab = false;
            isOther = false;
          }

          if (isLab) {
            labCourses.push(course);
          } else if (isOther) {
            otherCourses.push(course);
          } else {
            coreCourses.push(course);
          }
        });

        // Sort each category alphabetically by display_name
        const alphaSort = (a, b) => a.display_name.localeCompare(b.display_name);
        coreCourses.sort(alphaSort);
        labCourses.sort(alphaSort);
        otherCourses.sort(alphaSort);

        const renderCategorySection = (title, courses, icon) => {
          if (courses.length === 0) return;

          const sectionDiv = document.createElement("div");
          sectionDiv.className = "category-section";

          const header = document.createElement("h3");
          header.className = "category-header";
          header.innerHTML = `<span>${icon}</span> ${title} (${courses.length})`;
          sectionDiv.appendChild(header);

          const gridDiv = document.createElement("div");
          gridDiv.className = "hub-grid-v2";

          courses.forEach((c, idx) => {
            const card = document.createElement("a");
            card.href = c.url;
            card.target = "_blank";

            // Dynamic category themes based on manual overrides
            const cName = c.name.toLowerCase();
            const dispLower = c.display_name.toLowerCase();
            
            let isLab = cName.includes("lab") || cName.includes("practical") || cName.includes("workshop");
            let isOther = cName.includes("project") || cName.includes("prototype") || cName.includes("design") ||
                          cName.includes("foundation") || cName.includes("basic") ||
                          cName.includes("constitution") || cName.includes("mandatory") || cName.includes("ethics") ||
                          cName.includes("elective") || cName.includes("environmental") || cName.includes("seminar");

            if (dispLower.endsWith(" (lab)")) {
              isLab = true;
              isOther = false;
            } else if (dispLower.endsWith(" (other)")) {
              isLab = false;
              isOther = true;
            } else if (dispLower.endsWith(" (core)")) {
              isLab = false;
              isOther = false;
            }

            let themeClass = "purple";
            let tagLabel = "CORE SUBJECT";

            if (isLab) {
              themeClass = "pink";
              tagLabel = "LAB COURSE";
            } else if (isOther) {
              if (cName.includes("project") || cName.includes("prototype") || cName.includes("design")) {
                themeClass = "green";
                tagLabel = "PROJECT";
              } else if (cName.includes("foundation") || cName.includes("basic")) {
                themeClass = "blue";
                tagLabel = "FOUNDATION";
              } else if (cName.includes("constitution") || cName.includes("mandatory") || cName.includes("ethics")) {
                themeClass = "orange";
                tagLabel = "MANDATORY";
              } else if (cName.includes("elective") || cName.includes("environmental")) {
                themeClass = "green";
                tagLabel = "OPEN ELECTIVE";
              } else {
                themeClass = "green";
                tagLabel = "OTHER COURSE";
              }
            } else {
              themeClass = "purple";
              tagLabel = "CORE SUBJECT";
            }

            card.className = `course-card-v2 accent-${themeClass} ${c.is_moodle_active ? '' : 'inactive'}`;
            card.innerHTML = `
              <div class="card-left">
                <div class="card-title">${escapeHTML(cleanCourseTitle(c.display_name))}</div>
                <div class="card-tag">${tagLabel}</div>
              </div>
              <div class="card-arrow-btn">→</div>
            `;
            gridDiv.appendChild(card);
          });

          sectionDiv.appendChild(gridDiv);
          customPanel.appendChild(sectionDiv);
        };

        renderCategorySection("Core Subjects", coreCourses, "📚");
        renderCategorySection("Lab Courses", labCourses, "🔬");
        renderCategorySection("Other Courses", otherCourses, "✨");
      }

      // Quote footer
      const footerDiv = document.createElement("div");
      footerDiv.className = "hub-footer";
      footerDiv.innerHTML = `
        <span style="font-size:1.1rem;">🎓</span>
        <span class="hub-footer-text">Stay consistent, keep learning, and make it count.</span>
        <span style="font-size:1.1rem; color:#a78bfa;">✦</span>
      `;
      customPanel.appendChild(footerDiv);

      // Pokemon sprites section if enabled
      if (userSettings?.pokemon_enabled) {
        const pokeRow = document.createElement("div");
        pokeRow.className = "hub-poke-row";

        const pokeGrid = document.createElement("div");
        pokeGrid.className = "hub-poke-grid";

        const starters = [
          { id: 1, name: "Bulbasaur" },
          { id: 4, name: "Charmander" },
          { id: 7, name: "Squirtle" },
          { id: 25, name: "Pikachu" },
          { id: 39, name: "Jigglypuff" },
          { id: 133, name: "Eevee" }
        ];

        starters.forEach(poke => {
          const card = document.createElement("div");
          card.className = "hub-poke-card";
          card.setAttribute("title", poke.name);
          card.innerHTML = `
            <img class="hub-poke-img" 
                 src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${poke.id}.gif" 
                 alt="${poke.name}">
          `;
          pokeGrid.appendChild(card);
        });

        pokeRow.appendChild(pokeGrid);
        customPanel.appendChild(pokeRow);
      }
    };

    // Render active semester first
    renderContent(activeSemId);

  } catch (err) {
    console.error("[Moodle Hub] Failed to render dynamic custom dashboard UI:", err.message);
  }
}

// Escape HTML helper
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 7. Watch for dynamic content changes inside Moodle (Course overview AJAX loading)
function setupDynamicCourseObserver() {
  const container = document.querySelector('#page-content, body');
  if (!container) return;

  // Run dynamic detection on DOM changes, debounced to prevent sync loops
  const debouncedSync = debounce(runSynchronization, 2000);

  const observer = new MutationObserver((mutations) => {
    let shouldSync = false;
    for (const mutation of mutations) {
      // Check if course overview content is added
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Avoid observer loops on our own custom container
            if (node.id === "moodle-course-hub-container" || node.querySelector("#moodle-course-hub-container")) {
              continue;
            }
            if (
              node.querySelector('[data-region="course-card"]') ||
              node.classList.contains("course-summaryitem") ||
              node.querySelector('.coursename')
            ) {
              shouldSync = true;
              break;
            }
          }
        }
      }
      if (shouldSync) break;
    }

    if (shouldSync) {
      console.log("[Moodle Hub] Dynamic content loading detected inside overview block.");
      debouncedSync();
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  console.log("[Moodle Hub] Mutation observer successfully bound to Moodle dashboard.");
}

// Initialize scraper routine on page load
function init() {
  const path = window.location.pathname;
  // Dashboard URL matches
  const isDashboard = path === "/my/" || path === "/my/index.php" || path === "/my/courses.php" || path === "/";
  
  if (isDashboard) {
    console.log("[Moodle Hub] Dashboard page matched. Initiating auto sync...");
    runSynchronization();
    setupDynamicCourseObserver();
  }
}

// Wait for page assets
if (document.readyState === "complete" || document.readyState === "interactive") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}

// Listener for manual sync calls from extension popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TRIGGER_SYNC") {
    runSynchronization().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
