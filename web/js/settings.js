// Moodle Course Hub - Settings Page Logic

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

  // DOM Elements - Navigation
  const backBtn = document.getElementById("btn-back");

  // DOM Elements - General Settings
  const currentSemSelect = document.getElementById("select-current-semester");
  const selectTheme = document.getElementById("select-theme");
  const checkAutoAssign = document.getElementById("check-auto-assign");
  const checkPokemon = document.getElementById("check-pokemon");

  // DOM Elements - Semester Management
  const semestersContainer = document.getElementById("settings-semesters-container");
  const createSemBtn = document.getElementById("btn-create-semester");
  const semesterModal = document.getElementById("semester-modal");
  const closeSemModalBtn = document.getElementById("close-semester-modal");
  const cancelSemBtn = document.getElementById("btn-cancel-semester");
  const saveSemBtn = document.getElementById("btn-save-semester");
  const inputSemName = document.getElementById("input-semester-name");
  const semModalTitle = document.getElementById("semester-modal-title");

  // DOM Elements - Course Management
  const editSemSelect = document.getElementById("select-edit-semester");
  const coursesContainer = document.getElementById("settings-courses-container");

  // DOM Elements - Modals
  const renameModal = document.getElementById("rename-modal");
  const closeRenameBtn = document.getElementById("close-rename-modal");
  const cancelRenameBtn = document.getElementById("btn-cancel-rename");
  const saveRenameBtn = document.getElementById("btn-save-rename");
  const inputDisplayName = document.getElementById("input-display-name");
  const originalCourseNameDiv = document.getElementById("original-course-name");

  const moveModal = document.getElementById("move-modal");
  const closeMoveBtn = document.getElementById("close-move-modal");
  const cancelMoveBtn = document.getElementById("btn-cancel-move");
  const saveMoveBtn = document.getElementById("btn-save-move");
  const moveCourseDisplayNameStr = document.getElementById("move-course-display-name");
  const selectTargetSemester = document.getElementById("select-target-semester");
  const selectTargetCategory = document.getElementById("select-target-category");

  const toast = document.getElementById("toast-notify");

  // State Variables
  let allSemesters = [];
  let allCourses = [];
  let userSettings = null;

  // Modal active states
  let currentEditingCourseId = null;
  let currentEditingSemId = null; // null means creating

  // Toast message utility
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.background = isError ? "#ef4444" : "linear-gradient(135deg, var(--primary-navy), var(--accent-blue))";
    toast.classList.add("active");
    setTimeout(() => {
      toast.classList.remove("active");
    }, 3000);
  }

  // Navigation Event
  backBtn.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  // Apply Theme Helper
  function applyTheme(themeName) {
    if (themeName === "dark") {
      document.body.classList.add("dark-theme");
    } else if (themeName === "light") {
      document.body.classList.remove("dark-theme");
    } else {
      // System Default Theme
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.body.classList.add("dark-theme");
      } else {
        document.body.classList.remove("dark-theme");
      }
    }
  }

  // Fetch all initial data
  async function loadData() {
    await DB.ensureInitialized(user.id);

    const [semesters, courses, settings] = await Promise.all([
      DB.getSemesters(user.id),
      DB.getCourses(user.id),
      DB.getSettings(user.id)
    ]);

    allSemesters = semesters;
    allCourses = courses;
    userSettings = settings;

    // Apply Settings
    if (userSettings) {
      applyTheme(userSettings.theme);
      selectTheme.value = userSettings.theme;
      checkAutoAssign.checked = userSettings.auto_assign_new_courses;
      checkPokemon.checked = userSettings.pokemon_enabled;
    }

    renderSemestersList();
    renderSemestersDropdowns();
    renderCoursesList();
  }

  // Render Semester manager items list
  function renderSemestersList() {
    semestersContainer.innerHTML = "";
    if (allSemesters.length === 0) {
      semestersContainer.innerHTML = `<div class="empty-state" style="padding: 16px;"><p>No semesters configured.</p></div>`;
      return;
    }

    allSemesters
      .sort((a, b) => a.semester_number - b.semester_number)
      .forEach((sem, index) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "settings-course-item";

        // Badges HTML
        const currentBadge = sem.is_current ? '<span class="course-badge">Current Target</span>' : '';
        const archivedBadge = sem.is_archived ? '<span class="course-badge" style="background:#ef4444; color:white;">Archived</span>' : '';

        itemDiv.innerHTML = `
          <div class="course-item-info">
            <div class="settings-title" style="display:flex; align-items:center; gap: 8px;">
              ${escapeHTML(sem.name)}
              ${currentBadge}
              ${archivedBadge}
            </div>
            <div class="settings-desc" style="font-size:0.75rem;">Rank: ${sem.semester_number}</div>
          </div>
          <div class="course-item-actions">
            <button class="action-btn btn-sem-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
            <button class="action-btn btn-sem-down" title="Move Down" ${index === allSemesters.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="action-btn btn-sem-rename">Rename</button>
            <button class="action-btn btn-sem-current" ${sem.is_current || sem.is_archived ? 'disabled' : ''}>Make Target</button>
            <button class="action-btn btn-sem-archive">${sem.is_archived ? 'Activate' : 'Archive'}</button>
          </div>
        `;

        // Event listeners for Semester actions
        // 1. Move Up (Reorder)
        itemDiv.querySelector(".btn-sem-up").addEventListener("click", async () => {
          if (index > 0) {
            const current = allSemesters[index];
            const previous = allSemesters[index - 1];
            const tempPos = current.semester_number;
            
            current.semester_number = previous.semester_number;
            previous.semester_number = tempPos;

            try {
              await DB.updateSemesterPositions(user.id, [
                { id: current.id, semester_number: current.semester_number },
                { id: previous.id, semester_number: previous.semester_number }
              ]);
              allSemesters = await DB.getSemesters(user.id);
              renderSemestersList();
              renderSemestersDropdowns();
              showToast("Semester layout reordered.");
            } catch (err) {
              showToast("Reordering failed.", true);
            }
          }
        });

        // 2. Move Down (Reorder)
        itemDiv.querySelector(".btn-sem-down").addEventListener("click", async () => {
          if (index < allSemesters.length - 1) {
            const current = allSemesters[index];
            const next = allSemesters[index + 1];
            const tempPos = current.semester_number;
            
            current.semester_number = next.semester_number;
            next.semester_number = tempPos;

            try {
              await DB.updateSemesterPositions(user.id, [
                { id: current.id, semester_number: current.semester_number },
                { id: next.id, semester_number: next.semester_number }
              ]);
              allSemesters = await DB.getSemesters(user.id);
              renderSemestersList();
              renderSemestersDropdowns();
              showToast("Semester layout reordered.");
            } catch (err) {
              showToast("Reordering failed.", true);
            }
          }
        });

        // 3. Rename
        itemDiv.querySelector(".btn-sem-rename").addEventListener("click", () => {
          currentEditingSemId = sem.id;
          inputSemName.value = sem.name;
          semModalTitle.textContent = "Rename Semester";
          semesterModal.classList.add("active");
        });

        // 4. Set Current
        itemDiv.querySelector(".btn-sem-current").addEventListener("click", async () => {
          try {
            const success = await DB.setCurrentSemester(user.id, sem.id);
            if (success) {
              userSettings.current_semester_id = sem.id;
              allSemesters.forEach(s => s.is_current = (s.id === sem.id));
              renderSemestersList();
              renderSemestersDropdowns();
              showToast(`${sem.name} set as active target semester.`);
            }
          } catch (err) {
            showToast("Failed to change active target.", true);
          }
        });

        // 5. Archive / Unarchive
        itemDiv.querySelector(".btn-sem-archive").addEventListener("click", async () => {
          const isArchiving = !sem.is_archived;
          
          if (isArchiving && sem.is_current) {
            showToast("Cannot archive the active target semester. Set another semester as target first.", true);
            return;
          }

          try {
            const updated = await DB.updateSemester(user.id, sem.id, { is_archived: isArchiving });
            if (updated) {
              sem.is_archived = updated.is_archived;
              renderSemestersList();
              renderSemestersDropdowns();
              showToast(isArchiving ? `${sem.name} archived.` : `${sem.name} restored.`);
            }
          } catch (err) {
            showToast("Failed to update status.", true);
          }
        });

        semestersContainer.appendChild(itemDiv);
      });
      renderMoodleHTMLExport();
  }

  // Populate semester selects in general settings and filters
  function renderSemestersDropdowns() {
    // Cache current selections
    const prevCurrentVal = currentSemSelect.value;
    const prevEditVal = editSemSelect.value;
    const prevMoveVal = selectTargetSemester.value;

    currentSemSelect.innerHTML = "";
    editSemSelect.innerHTML = "";
    selectTargetSemester.innerHTML = "";

    // 1. Current semester dropdown must exclude archived semesters
    allSemesters
      .filter(s => !s.is_archived)
      .sort((a, b) => a.semester_number - b.semester_number)
      .forEach(sem => {
        const opt = document.createElement("option");
        opt.value = sem.id;
        opt.textContent = sem.name;
        currentSemSelect.appendChild(opt);
      });

    // 2. Edit semester filter and Target Semester moves can display all (including archived)
    allSemesters
      .sort((a, b) => a.semester_number - b.semester_number)
      .forEach(sem => {
        const label = sem.is_archived ? `${sem.name} (Archived)` : sem.name;

        const opt1 = document.createElement("option");
        opt1.value = sem.id;
        opt1.textContent = label;
        editSemSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = sem.id;
        opt2.textContent = label;
        selectTargetSemester.appendChild(opt2);
      });

    // Add Unassigned Option to Edit Dropdown
    const optUnassigned = document.createElement("option");
    optUnassigned.value = "unassigned";
    optUnassigned.textContent = "⚠ Unassigned Courses";
    editSemSelect.appendChild(optUnassigned);

    // Reapply choices or defaults
    if (userSettings?.current_semester_id) {
      currentSemSelect.value = userSettings.current_semester_id;
    } else if (prevCurrentVal && currentSemSelect.querySelector(`option[value="${prevCurrentVal}"]`)) {
      currentSemSelect.value = prevCurrentVal;
    }

    if (prevEditVal && editSemSelect.querySelector(`option[value="${prevEditVal}"]`)) {
      editSemSelect.value = prevEditVal;
    } else if (userSettings?.current_semester_id) {
      editSemSelect.value = userSettings.current_semester_id;
    }

    if (prevMoveVal && selectTargetSemester.querySelector(`option[value="${prevMoveVal}"]`)) {
      selectTargetSemester.value = prevMoveVal;
    }
  }

  // General Settings event listeners
  currentSemSelect.addEventListener("change", async () => {
    const selectedSemId = currentSemSelect.value;
    try {
      const success = await DB.setCurrentSemester(user.id, selectedSemId);
      if (success) {
        editSemSelect.value = selectedSemId;
        userSettings.current_semester_id = selectedSemId;
        allSemesters.forEach(s => s.is_current = (s.id === selectedSemId));
        
        renderSemestersList();
        renderSemestersDropdowns();
        renderCoursesList();
        showToast("Current semester target updated.");
      }
    } catch (err) {
      showToast("Error updating current semester.", true);
    }
  });

  selectTheme.addEventListener("change", async () => {
    const newTheme = selectTheme.value;
    applyTheme(newTheme);
    try {
      await DB.updateSettings(user.id, { theme: newTheme });
    } catch (err) {
      showToast("Error saving theme setting.", true);
    }
  });

  checkAutoAssign.addEventListener("change", async () => {
    const enabled = checkAutoAssign.checked;
    try {
      await DB.updateSettings(user.id, { auto_assign_new_courses: enabled });
      userSettings.auto_assign_new_courses = enabled;
      showToast(enabled ? "Auto-assignment enabled." : "Auto-assignment disabled.");
    } catch (err) {
      showToast("Error saving auto-assignment setting.", true);
    }
  });

  checkPokemon.addEventListener("change", async () => {
    const enabled = checkPokemon.checked;
    try {
      await DB.updateSettings(user.id, { pokemon_enabled: enabled });
      userSettings.pokemon_enabled = enabled;
      showToast(enabled ? "Pokémon companions enabled." : "Pokémon companions disabled.");
    } catch (err) {
      showToast("Error saving companion setting.", true);
    }
  });

  editSemSelect.addEventListener("change", () => {
    renderCoursesList();
  });

  // Render course list in management console
  function renderCoursesList() {
    coursesContainer.innerHTML = "";
    const filterSemId = editSemSelect.value;

    const filtered = allCourses
      .filter(c => {
        if (filterSemId === "unassigned") {
          return !c.semester_id;
        }
        return c.semester_id === filterSemId;
      })
      .sort((a, b) => a.position - b.position);

    if (filtered.length === 0) {
      coursesContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <p>No courses found in this semester.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((course, index) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "settings-course-item";

      itemDiv.innerHTML = `
        <div class="course-item-info">
          <div class="settings-title" style="display:flex; align-items:center; gap: 8px;">
            ${escapeHTML(course.display_name)}
            ${course.is_hidden ? '<span class="course-badge" style="background:#e11d48; color:white; font-size:0.65rem; padding: 2px 6px;">Hidden</span>' : ''}
          </div>
          <div class="settings-desc" style="font-size:0.8rem;">Moodle: ${escapeHTML(course.name)}</div>
          <div class="settings-desc" style="font-size:0.75rem; color: var(--accent-blue); margin-top: 4px;">ID: ${course.moodle_course_id} | Position: ${course.position}</div>
        </div>
        <div class="course-item-actions">
          <button class="action-btn btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button class="action-btn btn-down" title="Move Down" ${index === filtered.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="action-btn btn-rename">Rename</button>
          <button class="action-btn btn-move">Move</button>
          <button class="action-btn btn-hide">${course.is_hidden ? 'Restore' : 'Hide'}</button>
          <button class="action-btn danger btn-delete">Delete</button>
        </div>
      `;

      // Up/Down reordering
      itemDiv.querySelector(".btn-up").addEventListener("click", async () => {
        if (index > 0) {
          const current = filtered[index];
          const previous = filtered[index - 1];
          const tempPos = current.position;
          
          current.position = previous.position;
          previous.position = tempPos;

          try {
            await DB.updateCoursePositions(user.id, [
              { id: current.id, position: current.position },
              { id: previous.id, position: previous.position }
            ]);
            allCourses = await DB.getCourses(user.id);
            renderCoursesList();
            showToast("Course reordered.");
          } catch (err) {
            showToast("Reordering failed.", true);
          }
        }
      });

      itemDiv.querySelector(".btn-down").addEventListener("click", async () => {
        if (index < filtered.length - 1) {
          const current = filtered[index];
          const next = filtered[index + 1];
          const tempPos = current.position;

          current.position = next.position;
          next.position = tempPos;

          try {
            await DB.updateCoursePositions(user.id, [
              { id: current.id, position: current.position },
              { id: next.id, position: next.position }
            ]);
            allCourses = await DB.getCourses(user.id);
            renderCoursesList();
            showToast("Course reordered.");
          } catch (err) {
            showToast("Reordering failed.", true);
          }
        }
      });

      // Actions
      itemDiv.querySelector(".btn-rename").addEventListener("click", () => {
        currentEditingCourseId = course.id;
        originalCourseNameDiv.textContent = course.name;
        // Strip category suffix before displaying in input
        const cleanName = course.display_name.replace(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/gi, '');
        inputDisplayName.value = cleanName;
        renameModal.classList.add("active");
      });

      itemDiv.querySelector(".btn-move").addEventListener("click", () => {
        currentEditingCourseId = course.id;
        // Strip category suffix before displaying course name in paragraph
        const cleanName = course.display_name.replace(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/gi, '');
        moveCourseDisplayNameStr.textContent = cleanName;
        selectTargetSemester.value = course.semester_id;
        
        // Populate Target Category select
        const suffixMatch = course.display_name.match(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/i);
        if (suffixMatch) {
          const suffixWord = suffixMatch[0].replace(/[()]/g, "").trim().toLowerCase();
          selectTargetCategory.value = suffixWord; // "core", "lab", or "other"
        } else {
          selectTargetCategory.value = "";
        }
        
        moveModal.classList.add("active");
      });

      itemDiv.querySelector(".btn-hide").addEventListener("click", async () => {
        try {
          const updated = await DB.updateCourse(user.id, course.id, { is_hidden: !course.is_hidden });
          if (updated) {
            course.is_hidden = updated.is_hidden;
            renderCoursesList();
            showToast(updated.is_hidden ? "Course card hidden from dashboard." : "Course card restored to dashboard.");
          }
        } catch (err) {
          showToast("Failed to update status.", true);
        }
      });

      itemDiv.querySelector(".btn-delete").addEventListener("click", async () => {
        const confirmed = confirm(`Are you sure you want to delete ${course.display_name}? This action cannot be undone.`);
        if (confirmed) {
          try {
            const success = await DB.deleteCourse(user.id, course.id);
            if (success) {
              allCourses = allCourses.filter(c => c.id !== course.id);
              renderCoursesList();
              showToast("Course deleted successfully.");
            }
          } catch (err) {
            showToast("Deletion failed.", true);
          }
        }
      });

      coursesContainer.appendChild(itemDiv);
    });
    renderMoodleHTMLExport();
  }

  // Modals Save and Close Handlers
  // 1. Semester Creation/Renaming Modals
  createSemBtn.addEventListener("click", () => {
    currentEditingSemId = null;
    inputSemName.value = "";
    semModalTitle.textContent = "Add Semester";
    semesterModal.classList.add("active");
  });

  closeSemModalBtn.addEventListener("click", () => semesterModal.classList.remove("active"));
  cancelSemBtn.addEventListener("click", () => semesterModal.classList.remove("active"));

  saveSemBtn.addEventListener("click", async () => {
    const semName = inputSemName.value.trim();
    if (!semName) {
      showToast("Semester name cannot be empty.", true);
      return;
    }

    try {
      if (currentEditingSemId) {
        // Rename existing semester
        const updated = await DB.updateSemester(user.id, currentEditingSemId, { name: semName });
        if (updated) {
          const localSem = allSemesters.find(s => s.id === currentEditingSemId);
          if (localSem) localSem.name = updated.name;
          showToast("Semester renamed.");
        }
      } else {
        // Create new semester
        const created = await DB.createSemester(user.id, semName);
        if (created) {
          allSemesters.push(created);
          showToast(`Semester ${semName} created successfully.`);
        }
      }
      semesterModal.classList.remove("active");
      renderSemestersList();
      renderSemestersDropdowns();
      renderCoursesList();
    } catch (err) {
      showToast(currentEditingSemId ? "Rename failed." : "Creation failed.", true);
    }
  });

  // 2. Rename Course Modals
  closeRenameBtn.addEventListener("click", () => renameModal.classList.remove("active"));
  cancelRenameBtn.addEventListener("click", () => renameModal.classList.remove("active"));
  
  saveRenameBtn.addEventListener("click", async () => {
    let newDisplayName = inputDisplayName.value.trim();
    if (!newDisplayName) {
      showToast("Display name cannot be empty.", true);
      return;
    }

    try {
      const localCourse = allCourses.find(c => c.id === currentEditingCourseId);
      if (localCourse) {
        // Keep category suffix if present in previous display name
        const suffixMatch = localCourse.display_name.match(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/i);
        if (suffixMatch) {
          newDisplayName = newDisplayName + " " + suffixMatch[0].trim();
        }
      }

      const updated = await DB.updateCourse(user.id, currentEditingCourseId, { display_name: newDisplayName });
      if (updated) {
        if (localCourse) localCourse.display_name = updated.display_name;
        
        renameModal.classList.remove("active");
        renderCoursesList();
        showToast("Display name saved.");
      }
    } catch (err) {
      showToast("Rename failed.", true);
    }
  });

  // 3. Move Course Modals
  closeMoveBtn.addEventListener("click", () => moveModal.classList.remove("active"));
  cancelMoveBtn.addEventListener("click", () => moveModal.classList.remove("active"));

  saveMoveBtn.addEventListener("click", async () => {
    const targetSemId = selectTargetSemester.value;
    if (!targetSemId) return;

    const targetCategory = selectTargetCategory.value; // "", "core", "lab", "other"

    try {
      const localCourse = allCourses.find(c => c.id === currentEditingCourseId);
      if (!localCourse) return;

      // Strip existing category suffix from current display_name
      let cleanName = localCourse.display_name.replace(/\s*\(\s*(?:Core|Lab|Other)\s*\)\s*$/gi, '');
      
      // Determine new display_name with chosen category suffix
      let newDisplayName = cleanName;
      if (targetCategory === "core") {
        newDisplayName = cleanName + " (Core)";
      } else if (targetCategory === "lab") {
        newDisplayName = cleanName + " (Lab)";
      } else if (targetCategory === "other") {
        newDisplayName = cleanName + " (Other)";
      }

      const updated = await DB.updateCourse(user.id, currentEditingCourseId, { 
        semester_id: targetSemId,
        display_name: newDisplayName
      });

      if (updated) {
        localCourse.semester_id = updated.semester_id;
        localCourse.display_name = updated.display_name;

        moveModal.classList.remove("active");
        renderCoursesList();
        showToast("Course assignment updated.");
      }
    } catch (err) {
      showToast("Reassignment failed.", true);
    }
  });

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

  // Setup the secure extension connection bridge handshake
  function setupExtensionHandshake() {
    const connectBtn = document.getElementById("btn-connect-extension");
    const statusDesc = document.getElementById("extension-status-desc");
    const mobileNote = document.querySelector(".mobile-note");
    const desktopNote = document.getElementById("extension-help-note");
    
    if (!connectBtn || !statusDesc) return;

    // 1. Check for Mobile Device Context (Step 10)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobile) {
      statusDesc.innerHTML = `<span style="color:#64748b; font-weight:600;">Not required on mobile</span>`;
      connectBtn.style.display = "none";
      if (mobileNote) mobileNote.style.display = "block";
      if (desktopNote) desktopNote.style.display = "none";
      return;
    }

    // Default desktop presentation: check connection status
    if (desktopNote) {
      desktopNote.style.display = "block";
    }

    let isExtensionInstalled = false;
    let isExtensionConnected = false;

    // 2. Listen to message events from the connector.js script
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;

      const message = event.data;
      if (!message || typeof message !== "object") return;

      // Handle presence & existing connection check
      if (message.type === "CHECK_EXTENSION_PRESENT_RESPONSE") {
        isExtensionInstalled = true;
        isExtensionConnected = message.connected;
        
        connectBtn.disabled = false;
        if (isExtensionConnected) {
          statusDesc.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ Connected</span><br><span style="font-size:0.8rem; color:#64748b;">Logged in as: ${message.email}</span>`;
          connectBtn.textContent = "Disconnect";
          connectBtn.className = "btn-secondary";
          connectBtn.style.background = "#e2e8f0";
          connectBtn.style.color = "#475569";
        } else {
          statusDesc.textContent = "Installed — Not Connected";
          connectBtn.textContent = "Connect Extension";
          connectBtn.className = "btn-primary";
          connectBtn.style.background = "";
          connectBtn.style.color = "";
        }
      }

      // Handle connection handshake response
      if (message.type === "CONNECT_EXTENSION_RESPONSE") {
        if (message.success) {
          isExtensionConnected = true;
          statusDesc.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ Connected</span><br><span style="font-size:0.8rem; color:#64748b;">Logged in as: ${message.email}</span>`;
          connectBtn.textContent = "Disconnect";
          connectBtn.className = "btn-secondary";
          connectBtn.style.background = "#e2e8f0";
          connectBtn.style.color = "#475569";
          showToast("Extension successfully connected!");
        } else {
          showToast(`Connection failed: ${message.error}`, true);
        }
      }

      // Handle disconnect response
      if (message.type === "DISCONNECT_EXTENSION_RESPONSE") {
        isExtensionConnected = false;
        statusDesc.textContent = "Installed — Not Connected";
        connectBtn.textContent = "Connect Extension";
        connectBtn.className = "btn-primary";
        connectBtn.style.background = "";
        connectBtn.style.color = "";
        showToast("Extension disconnected.");
      }
    });

    // Fire check request on load
    window.postMessage({ type: "CHECK_EXTENSION_PRESENT_REQUEST" }, "*");

    // 3. Fallback state if extension is not installed/detected (Step 9)
    setTimeout(() => {
      if (!isExtensionInstalled) {
        statusDesc.innerHTML = `<span style="color:#ef4444; font-weight:600;">Extension not detected</span>`;
        connectBtn.disabled = true;
        
        if (desktopNote) {
          desktopNote.style.display = "block";
          desktopNote.innerHTML = `
            <strong>Extension not detected</strong><br>
            The desktop Chrome extension is required for automatic Moodle synchronization.<br>
            The Course Hub dashboard and mobile PWA still work without it.
          `;
        }
      }
    }, 1200);

    // 4. Bind Connection actions
    connectBtn.addEventListener("click", () => {
      if (isExtensionConnected) {
        // Disconnect handshake: clear extension tokens without signing out of Supabase (Step 6)
        window.postMessage({ type: "DISCONNECT_EXTENSION_REQUEST" }, "*");
      } else {
        // Connect handshake: Validate dashboard session exists first (Step 5)
        const sessionKey = Object.keys(localStorage).find(
          key => key.startsWith("sb-") && key.endsWith("-auth-token")
        );
        if (!sessionKey) {
          showToast("You are not logged into Moodle Course Hub. Please log in first.", true);
          statusDesc.textContent = "Please log in first.";
          return;
        }

        const rawData = localStorage.getItem(sessionKey);
        const session = rawData ? JSON.parse(rawData) : null;
        const url = window.ENV?.SUPABASE_URL;
        const anonKey = window.ENV?.SUPABASE_ANON_KEY;

        if (!session || !url || !anonKey) {
          showToast("You are not logged into Moodle Course Hub. Please log in first.", true);
          statusDesc.textContent = "Please log in first.";
          return;
        }

        // Post credentials payload for connection
        window.postMessage({
          type: "CONNECT_EXTENSION_REQUEST",
          session: session,
          url: url,
          anonKey: anonKey,
          webAppUrl: window.location.origin
        }, "*");
      }
    });
  }

  // HTML Export generation & preview
  const btnWebCopyHtml = document.getElementById("btn-web-copy-html");
  const btnWebDownloadHtml = document.getElementById("btn-web-download-html");
  const websiteHtmlTime = document.getElementById("website-html-time");
  const moodleHtmlPreviewFrame = document.getElementById("moodle-html-preview-frame");

  function renderMoodleHTMLExport() {
    if (!allCourses || !allSemesters) return;
    try {
      const generatedHtml = generateMoodleCourseHubHTML(allCourses, allSemesters, userSettings, user?.email);
      moodleHtmlPreviewFrame.innerHTML = generatedHtml;
      
      // Bind tabs event listeners inside preview card
      const tabs = moodleHtmlPreviewFrame.querySelectorAll(".hub-tab-v2");
      const grids = moodleHtmlPreviewFrame.querySelectorAll(".hub-semester-grid");
      const emptyStates = moodleHtmlPreviewFrame.querySelectorAll(".hub-empty-state");

      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          const activeId = tab.getAttribute("data-sem-id");
          tabs.forEach(t => t.classList.remove("active"));
          tab.classList.add("active");

          grids.forEach(grid => {
            grid.style.display = (grid.getAttribute("id") === "sem-grid-" + activeId) ? "block" : "none";
          });

          emptyStates.forEach(empty => {
            empty.style.display = (empty.getAttribute("id") === "sem-empty-" + activeId) ? "block" : "none";
          });
        });
      });

      const timeStr = new Date().toLocaleString();
      websiteHtmlTime.textContent = `Last generated: ${timeStr}`;
      document.getElementById("website-html-status").textContent = "HTML generated successfully";
    } catch (err) {
      console.error("HTML Export generation failed:", err);
      document.getElementById("website-html-status").textContent = "Generation failed";
    }
  }

  btnWebCopyHtml.addEventListener("click", () => {
    try {
      const htmlStr = generateMoodleCourseHubHTML(allCourses, allSemesters, userSettings, user?.email);
      navigator.clipboard.writeText(htmlStr);
      showToast("Moodle HTML copied to clipboard!");
    } catch (err) {
      showToast("Copy failed.", true);
    }
  });

  btnWebDownloadHtml.addEventListener("click", () => {
    try {
      const htmlStr = generateMoodleCourseHubHTML(allCourses, allSemesters, userSettings, user?.email);
      const blob = new Blob([htmlStr], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ashish-moodle-courses.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("HTML file download triggered.");
    } catch (err) {
      showToast("Download failed.", true);
    }
  });

  // Load configurations
  loadData();
  setupExtensionHandshake();
});
