// Moodle Course Hub - Dashboard Page Logic

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

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Guard page and get current user
  let user;
  try {
    user = await Auth.requireAuth();
  } catch (err) {
    console.error("Auth guard failed:", err);
    return;
  }

  if (!user) return;

  // DOM Elements
  const themeToggleBtn = document.getElementById("theme-toggle");
  const logoutBtn = document.getElementById("btn-logout");
  const settingsBtn = document.getElementById("btn-settings");
  const tabsContainer = document.getElementById("semester-tabs-container");
  const gridContainer = document.getElementById("course-grid-container");
  const pokemonRow = document.getElementById("pokemon-row-container");
  const pokemonContainer = document.getElementById("pokemon-sprites-container");
  const toast = document.getElementById("toast-notify");

  // DOM Elements - Unassigned Courses mapping UI
  const unassignedContainer = document.getElementById("unassigned-courses-container");
  const unassignedCountSpan = document.getElementById("unassigned-count");
  const unassignedList = document.getElementById("unassigned-courses-list");
  const selectAllBtn = document.getElementById("btn-select-all-unassigned");
  const deselectAllBtn = document.getElementById("btn-deselect-all-unassigned");
  const bulkSemesterSelect = document.getElementById("select-bulk-semester");
  const bulkAssignBtn = document.getElementById("btn-bulk-assign");

  // State Variables
  let allSemesters = [];
  let allCourses = [];
  let userSettings = null;
  let selectedSemesterId = null;

  // Localized list of Gen 1 Pokemon names
  const pokemonNames = [
    "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", 
    "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree", 
    "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", 
    "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", 
    "Sandshrew", "Sandslash", "Nidoran♀", "Nidorina", "Nidoqueen", "Nidoran♂", 
    "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", 
    "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", 
    "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth", 
    "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", 
    "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", 
    "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool", 
    "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", 
    "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel", 
    "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", 
    "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", 
    "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", 
    "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", 
    "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", 
    "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", 
    "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", 
    "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", 
    "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", 
    "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew"
  ];

  // Toast message utility
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.background = isError ? "#ef4444" : "linear-gradient(135deg, var(--primary-navy), var(--accent-blue))";
    toast.classList.add("active");
    setTimeout(() => {
      toast.classList.remove("active");
    }, 3000);
  }

  // Navigation handlers
  settingsBtn.addEventListener("click", () => {
    window.location.href = "settings.html";
  });

  logoutBtn.addEventListener("click", async () => {
    await Auth.signOut();
  });

  // Apply Theme Helper
  function applyTheme(themeName) {
    if (themeName === "dark") {
      document.body.classList.add("dark-theme");
      themeToggleBtn.textContent = "☀️";
    } else if (themeName === "light") {
      document.body.classList.remove("dark-theme");
      themeToggleBtn.textContent = "🌙";
    } else {
      // System Theme support
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.body.classList.add("dark-theme");
      } else {
        document.body.classList.remove("dark-theme");
      }
      themeToggleBtn.textContent = "🌓";
    }
  }

  // Theme Toggle Event (rotates client setting manually between light and dark)
  themeToggleBtn.addEventListener("click", async () => {
    const isDark = document.body.classList.contains("dark-theme");
    const newTheme = isDark ? "light" : "dark";
    
    applyTheme(newTheme);

    try {
      await DB.updateSettings(user.id, { theme: newTheme });
    } catch (err) {
      console.error("Failed to update theme in database:", err.message);
    }
  });

  // Calculate relative time for sync status
  function formatRelativeTime(dateString) {
    if (!dateString) return "never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    
    if (isNaN(diffMs)) return dateString;
    
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return "just now";
    
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  // Render Dynamic Sync Status
  function updateSyncStatusDisplay() {
    const syncDot = document.querySelector(".sync-dot");
    const syncCard = document.querySelector(".sync-status-card");
    const syncTimeDesc = document.getElementById("sync-time-desc");
    const syncTitle = syncCard.querySelector(".settings-title");

    if (!userSettings || userSettings.last_sync_status === "none" || !userSettings.last_sync_at) {
      syncTitle.textContent = "Cloud Setup Inactive";
      syncTimeDesc.textContent = "Connect the Chrome Extension on desktop to sync courses.";
      syncCard.style.borderLeftColor = "var(--text-secondary)";
      syncDot.style.background = "var(--text-secondary)";
      return;
    }

    const relTime = formatRelativeTime(userSettings.last_sync_at);
    const msg = userSettings.last_sync_message || "Courses up to date.";

    if (userSettings.last_sync_status === "error") {
      syncTitle.textContent = "⚠ Sync Failed";
      syncTimeDesc.textContent = `${msg} (Reported ${relTime})`;
      syncCard.style.borderLeftColor = "#ef4444";
      syncDot.style.background = "#ef4444";
    } else {
      syncTitle.textContent = "✓ Cloud Synchronized";
      syncTimeDesc.textContent = `${msg} — Synced ${relTime}`;
      syncCard.style.borderLeftColor = "#10b981";
      syncDot.style.background = "#10b981";
    }
  }

  // Fetch all initial data
  async function loadData() {
    try {
      await DB.ensureInitialized(user.id);
      
      const [semesters, courses, settings] = await Promise.all([
        DB.getSemesters(user.id),
        DB.getCourses(user.id),
        DB.getSettings(user.id)
      ]);

      allSemesters = semesters;
      allCourses = courses;
      userSettings = settings;

      if (userSettings) {
        applyTheme(userSettings.theme);
        selectedSemesterId = userSettings.current_semester_id;
        updateSyncStatusDisplay();
      }

      // Default to first non-archived semester if selected semester is unset or archived
      const visibleSems = allSemesters.filter(s => !s.is_archived);
      const isSelectedArchived = allSemesters.find(s => s.id === selectedSemesterId)?.is_archived;

      if ((!selectedSemesterId || isSelectedArchived) && visibleSems.length > 0) {
        const activeSem = visibleSems.find(s => s.is_current) || visibleSems[0];
        selectedSemesterId = activeSem.id;
      }

      // Separate unassigned and assigned courses
      const unassigned = allCourses.filter(c => !c.semester_id);
      
      renderSemesters();
      renderCourses();
      renderUnassignedCourses(unassigned);
    } catch (err) {
      console.error("Connection failed. Loading offline caches...", err);
      showToast("Offline mode. Some data may be outdated.", true);
    }
  }

  // Render Semester Tabs (filtering out archived semesters)
  function renderSemesters() {
    tabsContainer.innerHTML = "";
    const visibleSemesters = allSemesters.filter(s => !s.is_archived);

    if (visibleSemesters.length === 0) {
      tabsContainer.innerHTML = `<div class="semester-tab active">No Semesters</div>`;
      return;
    }

    visibleSemesters.forEach(sem => {
      const tab = document.createElement("div");
      tab.className = `semester-tab ${sem.id === selectedSemesterId ? 'active' : ''}`;
      tab.textContent = sem.name;
      tab.addEventListener("click", () => {
        if (selectedSemesterId === sem.id) return;
        
        selectedSemesterId = sem.id;
        
        // Update active tab styles
        document.querySelectorAll(".semester-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        renderCourses();
      });
      tabsContainer.appendChild(tab);
    });
  }

  // Render course list for selected semester
  function renderCourses() {
    gridContainer.innerHTML = "";
    pokemonContainer.innerHTML = "";

    const filteredCourses = allCourses.filter(c => c.semester_id === selectedSemesterId && !c.is_hidden);

    if (filteredCourses.length === 0) {
      gridContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <p>No courses found for this semester.</p>
          <p style="font-size: 0.85rem; margin-top: 8px;">Sync courses from Moodle using the desktop Chrome extension or manage courses in Settings.</p>
        </div>
      `;
      pokemonRow.style.display = "none";
      return;
    }

    // Render course cards grouped by category and sorted alphabetically
    gridContainer.innerHTML = "";

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
      gridDiv.className = "course-grid";

      courses.forEach((course, idx) => {
        const card = document.createElement("a");
        card.href = course.url;
        card.target = "_blank";

        // Dynamic category themes based on manual overrides
        const cName = course.name.toLowerCase();
        const dispLower = course.display_name.toLowerCase();
        
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

        card.className = `course-card-v2 accent-${themeClass} ${course.is_moodle_active ? '' : 'inactive'}`;
        card.innerHTML = `
          <div class="card-left">
            <div class="card-title">${escapeHTML(cleanCourseTitle(course.display_name))}</div>
            <div class="card-tag">${tagLabel}</div>
          </div>
          <div class="card-arrow-btn">→</div>
        `;
        gridDiv.appendChild(card);
      });

      sectionDiv.appendChild(gridDiv);
      gridContainer.appendChild(sectionDiv);
    };

    renderCategorySection("Core Subjects", coreCourses, "📚");
    renderCategorySection("Lab Courses", labCourses, "🔬");
    renderCategorySection("Other Courses", otherCourses, "✨");

    // Render companion Pokemon sprites (exactly 5 starters running inside a track) if enabled
    pokemonContainer.innerHTML = "";
    if (userSettings && userSettings.pokemon_enabled) {
      const starters = [
        { id: 1, name: "Bulbasaur" },
        { id: 4, name: "Charmander" },
        { id: 7, name: "Squirtle" },
        { id: 25, name: "Pikachu" },
        { id: 39, name: "Jigglypuff" },
        { id: 133, name: "Eevee" }
      ];

      starters.forEach(poke => {
        const pokeCard = document.createElement("div");
        pokeCard.className = "pokemon-sprite-container";
        pokeCard.setAttribute("title", poke.name);
        pokeCard.innerHTML = `
          <img class="pokemon-sprite-img" 
               src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${poke.id}.gif" 
               alt="${poke.name}">
        `;
        pokemonContainer.appendChild(pokeCard);
      });
      pokemonRow.style.display = "block";
    } else {
      pokemonRow.style.display = "none";
    }
  }

  // Render Unassigned Courses First-run panel
  function renderUnassignedCourses(unassigned) {
    unassignedList.innerHTML = "";
    if (unassigned.length === 0) {
      unassignedContainer.style.display = "none";
      return;
    }

    unassignedContainer.style.display = "block";
    unassignedCountSpan.textContent = unassigned.length;

    // Fill bulk selector with non-archived semesters
    bulkSemesterSelect.innerHTML = '<option value="">-- Select Semester --</option>';
    allSemesters
      .filter(s => !s.is_archived)
      .sort((a, b) => a.semester_number - b.semester_number)
      .forEach(sem => {
        const opt = document.createElement("option");
        opt.value = sem.id;
        opt.textContent = sem.name;
        bulkSemesterSelect.appendChild(opt);
      });

    unassigned.forEach(course => {
      const row = document.createElement("div");
      row.className = "settings-course-item";
      row.style.background = "rgba(0,0,0,0.02)";
      row.style.padding = "8px 12px";
      row.style.borderRadius = "var(--border-radius-sm)";
      row.style.border = "1px solid rgba(0,0,0,0.05)";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "12px";

      // HTML Options for individual selectors
      let semOptionsHTML = '<option value="">-- Assign --</option>';
      allSemesters
        .filter(s => !s.is_archived)
        .sort((a, b) => a.semester_number - b.semester_number)
        .forEach(sem => {
          semOptionsHTML += `<option value="${sem.id}">${sem.name}</option>`;
        });

      row.innerHTML = `
        <input type="checkbox" class="unassigned-checkbox" data-id="${course.id}" style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
        <div style="flex-grow: 1; min-width: 0;">
          <div class="settings-title" style="font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(course.display_name)}</div>
          <div class="settings-desc" style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Moodle: ${escapeHTML(course.name)} (ID: ${course.moodle_course_id})</div>
        </div>
        <div class="select-wrapper" style="margin: 0; width: 110px; flex-shrink: 0;">
          <select class="individual-sem-select" data-id="${course.id}" style="padding: 4px; font-size: 0.75rem; width: 100%;">
            ${semOptionsHTML}
          </select>
        </div>
      `;

      // Listen to individual select assignment updates
      row.querySelector(".individual-sem-select").addEventListener("change", async (e) => {
        const semId = e.target.value;
        if (!semId) return;

        try {
          const success = await DB.updateCoursesSemester(user.id, [course.id], semId);
          if (success) {
            showToast(`Assigned ${course.display_name} successfully.`);
            loadData();
          } else {
            showToast("Failed to assign course.", true);
          }
        } catch (err) {
          showToast("Reassignment failed.", true);
        }
      });

      unassignedList.appendChild(row);
    });

    // Handle Checkboxes toggling bulk assign button state
    const checkboxes = unassignedList.querySelectorAll(".unassigned-checkbox");
    const updateBulkBtnState = () => {
      const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      bulkAssignBtn.disabled = selectedCount === 0 || !bulkSemesterSelect.value;
    };

    checkboxes.forEach(cb => cb.addEventListener("change", updateBulkBtnState));
    bulkSemesterSelect.addEventListener("change", updateBulkBtnState);

    // Select/Deselect All buttons
    selectAllBtn.onclick = () => {
      checkboxes.forEach(cb => cb.checked = true);
      updateBulkBtnState();
    };
    deselectAllBtn.onclick = () => {
      checkboxes.forEach(cb => cb.checked = false);
      updateBulkBtnState();
    };

    // Bulk Assignment save trigger
    bulkAssignBtn.onclick = async () => {
      const selectedIds = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.getAttribute("data-id"));

      const targetSemId = bulkSemesterSelect.value;
      if (selectedIds.length === 0 || !targetSemId) return;

      try {
        const success = await DB.updateCoursesSemester(user.id, selectedIds, targetSemId);
        if (success) {
          showToast(`Assigned ${selectedIds.length} course(s) successfully.`);
          loadData();
        } else {
          showToast("Bulk assignment failed.", true);
        }
      } catch (err) {
        showToast("Bulk assignment failed.", true);
      }
    };
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

  // PWA install banner setup
  let deferredPrompt;
  const pwaBanner = document.getElementById("pwa-install-banner");
  const installBtn = document.getElementById("btn-pwa-install");
  const dismissBtn = document.getElementById("btn-pwa-dismiss");

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    pwaBanner.style.display = 'flex';
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA Installation outcome: ${outcome}`);
    deferredPrompt = null;
    pwaBanner.style.display = 'none';
  });

  dismissBtn.addEventListener('click', () => {
    pwaBanner.style.display = 'none';
  });

  // Start initialization
  loadData();

  // Lightweight periodic refresh (polling) when tab is active to sync extension updates
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log("[Dashboard] Performing periodic background sync refresh...");
      loadData();
    }
  }, 30000);

  // Handle online/offline events
  window.addEventListener('online', () => {
    showToast("Connection restored. Synchronizing...");
    loadData();
  });

  window.addEventListener('offline', () => {
    showToast("Connection lost. Working offline.", true);
    // Update Sync status card to show Offline
    const syncDot = document.querySelector(".sync-dot");
    const syncCard = document.querySelector(".sync-status-card");
    const syncTimeDesc = document.getElementById("sync-time-desc");
    const syncTitle = syncCard?.querySelector(".settings-title");

    if (syncTitle && syncTimeDesc && syncCard && syncDot) {
      syncTitle.textContent = "🔌 Device Offline";
      syncTimeDesc.textContent = "Some network operations are disabled until connection returns.";
      syncCard.style.borderLeftColor = "#ef4444";
      syncDot.style.background = "#ef4444";
    }
  });
});
