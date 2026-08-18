// Centralized HTML Generator for Moodle Course Hub Block
function generateMoodleCourseHubHTML(courses, semesters, settings, userEmail) {
  // Determine username
  const email = userEmail || "";
  let username = email ? email.split('@')[0] : "Ashish";
  if (!username || /^\d+$/.test(username)) {
    username = "Ashish";
  }
  const capName = username.charAt(0).toUpperCase() + username.slice(1);
  const titleText = `${capName}'s Courses`;

  // Sort visible semesters
  const visibleSemesters = semesters
    .filter(s => !s.is_archived)
    .sort((a, b) => a.semester_number - b.semester_number);

  if (visibleSemesters.length === 0) {
    return `<div style="padding:20px; text-align:center; color:#64748b;">No active semesters configured.</div>`;
  }

  // Determine active semester ID
  let activeSemId = settings?.current_semester_id;
  const activeSemExists = visibleSemesters.some(s => s.id === activeSemId);
  if (!activeSemId || !activeSemExists) {
    const activeSem = visibleSemesters.find(s => s.is_current) || visibleSemesters[0];
    activeSemId = activeSem.id;
  }

  // HTML escaping utility
  const escapeHTML = (str) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Cleaning course suffix utility
  const cleanCourseTitle = (name) => {
    if (!name) return "";
    return name
      .replace(/\s*\(lab\)$/i, "")
      .replace(/\s*\(other\)$/i, "")
      .replace(/\s*\(core\)$/i, "")
      .trim();
  };

  // Helper to check valid URL
  const isValidUrl = (urlStr) => {
    if (!urlStr) return false;
    const lower = urlStr.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
      return false;
    }
    return true;
  };

  // Build tabs HTML
  let tabsHtml = "";
  visibleSemesters.forEach(sem => {
    const isActive = sem.id === activeSemId;
    tabsHtml += `
      <div class="hub-tab-v2 ${isActive ? 'active' : ''}" data-sem-id="${sem.id}">
        ${escapeHTML(sem.name)}
      </div>`;
  });

  // Build semester course grids HTML
  let gridsHtml = "";
  visibleSemesters.forEach(sem => {
    const isActive = sem.id === activeSemId;
    const semCourses = courses
      .filter(c => c.semester_id === sem.id && !c.is_hidden)
      .sort((a, b) => a.position - b.position);

    // If no courses in this semester, show empty state
    if (semCourses.length === 0) {
      gridsHtml += `
        <div class="hub-empty-state" id="sem-empty-${sem.id}" style="display: ${isActive ? 'block' : 'none'}; text-align: center; padding: 32px; color: #64748b; font-size: 0.95rem;">
          No courses configured for this semester. Manage mapping in the Web Hub.
        </div>`;
      return;
    }

    // Separate by category
    const coreCourses = [];
    const labCourses = [];
    const otherCourses = [];

    semCourses.forEach(c => {
      const nameLower = c.name.toLowerCase();
      let isLab = nameLower.includes("lab") || nameLower.includes("practical") || nameLower.includes("workshop");
      let isOther = nameLower.includes("project") || nameLower.includes("prototype") || nameLower.includes("design") ||
                    nameLower.includes("foundation") || nameLower.includes("basic") ||
                    nameLower.includes("constitution") || nameLower.includes("mandatory") || nameLower.includes("ethics") ||
                    nameLower.includes("elective") || nameLower.includes("environmental") || nameLower.includes("seminar");

      const dispLower = c.display_name.toLowerCase();
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
        labCourses.push(c);
      } else if (isOther) {
        otherCourses.push(c);
      } else {
        coreCourses.push(c);
      }
    });

    const alphaSort = (a, b) => a.display_name.localeCompare(b.display_name);
    coreCourses.sort(alphaSort);
    labCourses.sort(alphaSort);
    otherCourses.sort(alphaSort);

    let semGridContent = "";

    const renderCategoryHTML = (catTitle, catCourses, icon, isLabFlag, isOtherFlag) => {
      if (catCourses.length === 0) return "";
      let cardsHtml = "";
      
      catCourses.forEach((c, idx) => {
        let themeClass = "purple";
        let tagLabel = "CORE SUBJECT";

        if (isLabFlag) {
          themeClass = "pink";
          tagLabel = "LAB COURSE";
        } else if (isOtherFlag) {
          const cNameLower = c.name.toLowerCase();
          if (cNameLower.includes("project") || cNameLower.includes("prototype") || cNameLower.includes("design")) {
            themeClass = "green";
            tagLabel = "PROJECT";
          } else if (cNameLower.includes("foundation") || cNameLower.includes("basic")) {
            themeClass = "blue";
            tagLabel = "FOUNDATION";
          } else if (cNameLower.includes("constitution") || cNameLower.includes("mandatory") || cNameLower.includes("ethics")) {
            themeClass = "orange";
            tagLabel = "MANDATORY";
          } else if (cNameLower.includes("elective") || cNameLower.includes("environmental")) {
            themeClass = "green";
            tagLabel = "OPEN ELECTIVE";
          } else {
            themeClass = "green";
            tagLabel = "OTHER COURSE";
          }
        }

        const cleanLink = isValidUrl(c.url) ? c.url : "#";

        cardsHtml += `
          <a href="${escapeHTML(cleanLink)}" target="_blank" rel="noopener" class="course-card-v2 accent-${themeClass} ${c.is_moodle_active ? '' : 'inactive'}">
            <div class="card-left">
              <div class="card-title">${escapeHTML(cleanCourseTitle(c.display_name))}</div>
              <div class="card-tag">${tagLabel}</div>
            </div>
            <div class="card-arrow-btn">→</div>
          </a>`;
      });

      return `
        <div class="category-section">
          <h3 class="category-header"><span>${icon}</span> ${catTitle} (${catCourses.length})</h3>
          <div class="hub-grid-v2">
            ${cardsHtml}
          </div>
        </div>`;
    };

    semGridContent += renderCategoryHTML("Core Subjects", coreCourses, "📚", false, false);
    semGridContent += renderCategoryHTML("Lab Courses", labCourses, "🔬", true, false);
    semGridContent += renderCategoryHTML("Other Courses", otherCourses, "✨", false, true);

    gridsHtml += `
      <div class="hub-semester-grid" id="sem-grid-${sem.id}" style="display: ${isActive ? 'block' : 'none'};">
        ${semGridContent}
      </div>`;
  });

  // Build Pokemon section HTML
  let pokemonHtml = "";
  if (settings?.pokemon_enabled) {
    pokemonHtml = `
      <div class="hub-poke-row">
        <div class="hub-poke-grid">
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/1.gif" alt="Bulbasaur"></div>
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/4.gif" alt="Charmander"></div>
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/7.gif" alt="Squirtle"></div>
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif" alt="Pikachu"></div>
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/39.gif" alt="Jigglypuff"></div>
          <div class="hub-poke-card"><img class="hub-poke-img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/133.gif" alt="Eevee"></div>
        </div>
      </div>`;
  }

  // Central CSS template (cleaned and styled)
  const cssStyles = `
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
      box-sizing: border-box;
      width: 100%;
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
    .hub-subtitle {
      font-size: 1rem;
      color: #64748b;
      margin: 0;
    }

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
      user-select: none;
    }
    .hub-tab-v2:hover {
      color: #475569;
      background: #f8fafc;
    }
    .hub-tab-v2.active {
      background: linear-gradient(135deg, #6366f1, #d946ef);
      color: white;
      box-shadow: 0 4px 15px rgba(99,102,241,0.25);
    }

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
      box-sizing: border-box;
    }

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
      min-width: 0;
    }
    .card-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #1e293b;
      line-height: 1.3;
      transition: color 0.2s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      flex-shrink: 0;
    }
    .course-card-v2:hover .card-arrow-btn {
      background: var(--theme-color);
      color: white;
      transform: scale(1.1);
    }

    .course-card-v2.inactive {
      opacity: 0.6;
    }

    .category-section {
      margin-bottom: 24px;
    }
    .category-header {
      font-size: 0.88rem;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 12px;
      padding-left: 8px;
      border-left: 3px solid #3b82f6;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

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
    .hub-footer-text {
      font-size: 0.9rem;
      font-weight: 600;
      color: #6d28d9;
      font-style: italic;
    }

    .hub-poke-row {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 24px;
      position: relative;
      z-index: 1;
      width: 100%;
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
    }
    .hub-poke-img {
      width: 50px;
      height: 50px;
      object-fit: contain;
      animation: float 2.5s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
    }

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
  `;

  // Combined Output block
  const fullHtml = `
<!-- Moodle Course Hub Card Block -->
<div id="moodle-course-hub-container">
  <div class="hub-header">
    <h1 class="hub-title">${titleText}</h1>
    <p class="hub-subtitle">Explore your enrolled courses and labs for the selected semester.</p>
  </div>

  <div class="hub-tabs-bar">
    ${tabsHtml}
  </div>

  ${gridsHtml}

  <div class="hub-footer">
    <span style="font-size:1.1rem;">🎓</span>
    <span class="hub-footer-text">${escapeHTML("Stay consistent, keep learning, and make it count.")}</span>
    <span style="font-size:1.1rem; color:#a78bfa;">✦</span>
  </div>

  ${pokemonHtml}
</div>

<style>
${cssStyles}
</style>

<script>
(function() {
  const container = document.getElementById("moodle-course-hub-container");
  if (!container) return;
  const tabs = container.querySelectorAll(".hub-tab-v2");
  const grids = container.querySelectorAll(".hub-semester-grid");
  const emptyStates = container.querySelectorAll(".hub-empty-state");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const activeId = tab.getAttribute("data-sem-id");
      
      // Update active tab styles
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // Toggle visible grids & empty states
      grids.forEach(grid => {
        if (grid.getAttribute("id") === "sem-grid-" + activeId) {
          grid.style.display = "block";
        } else {
          grid.style.display = "none";
        }
      });

      emptyStates.forEach(empty => {
        if (empty.getAttribute("id") === "sem-empty-" + activeId) {
          empty.style.display = "block";
        } else {
          empty.style.display = "none";
        }
      });
    });
  });
})();
</script>
  `.trim();

  return fullHtml;
}

// Node compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateMoodleCourseHubHTML };
}
