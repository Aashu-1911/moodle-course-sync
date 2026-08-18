// Centralized HTML Generator for Moodle Course Hub Block (PWA & Extension Shared)

// 1. Static Moodle-Safe HTML Exporter (Pure Inline CSS, Details/Summary, No CSS classes/style/script)
function generateMoodleStaticHTML(courses, semesters, settings, userEmail) {
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
    return `<div style="padding:20px; text-align:center; color:#64748b; font-family:Segoe UI,Arial,sans-serif;">No active semesters configured.</div>`;
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
    if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
      return false;
    }
    return true;
  };

  // Build semesters list html using native details and summary elements
  let semestersHtml = "";
  visibleSemesters.forEach(sem => {
    const isActive = sem.id === activeSemId;
    const semCourses = courses
      .filter(c => c.semester_id === sem.id && !c.is_hidden)
      .sort((a, b) => a.position - b.position);

    let semContent = "";
    if (semCourses.length === 0) {
      semContent = `
        <div style="text-align: center; padding: 24px; color: #64748b; font-size: 14px; font-family: Segoe UI,Arial,sans-serif;">
          No courses configured for this semester. Manage mapping in the Web Hub.
        </div>`;
    } else {
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

      const renderCategoryHTML = (catTitle, catCourses, icon, isLabFlag, isOtherFlag) => {
        if (catCourses.length === 0) return "";
        let cardsHtml = "";
        
        catCourses.forEach(c => {
          let themeColor = "#8b5cf6";
          let borderColor = "rgba(139,92,246,0.12)";
          let btnBg = "#f5f3ff";
          let tagLabel = "CORE SUBJECT";

          if (isLabFlag) {
            themeColor = "#ec4899";
            borderColor = "rgba(236,72,153,0.12)";
            btnBg = "#fdf2f8";
            tagLabel = "LAB COURSE";
          } else if (isOtherFlag) {
            const cNameLower = c.name.toLowerCase();
            if (cNameLower.includes("project") || cNameLower.includes("prototype") || cNameLower.includes("design")) {
              themeColor = "#10b981";
              borderColor = "rgba(16,185,129,0.12)";
              btnBg = "#ecfdf5";
              tagLabel = "PROJECT";
            } else if (cNameLower.includes("foundation") || cNameLower.includes("basic")) {
              themeColor = "#3b82f6";
              borderColor = "rgba(59,130,246,0.12)";
              btnBg = "#eff6ff";
              tagLabel = "FOUNDATION";
            } else if (cNameLower.includes("constitution") || cNameLower.includes("mandatory") || cNameLower.includes("ethics")) {
              themeColor = "#f97316";
              borderColor = "rgba(249,115,22,0.12)";
              btnBg = "#fff7ed";
              tagLabel = "MANDATORY";
            } else if (cNameLower.includes("elective") || cNameLower.includes("environmental")) {
              themeColor = "#10b981";
              borderColor = "rgba(16,185,129,0.12)";
              btnBg = "#ecfdf5";
              tagLabel = "OPEN ELECTIVE";
            } else {
              themeColor = "#10b981";
              borderColor = "rgba(16,185,129,0.12)";
              btnBg = "#ecfdf5";
              tagLabel = "OTHER COURSE";
            }
          }

          let cardBg = "#ffffff";
          if (tagLabel === "CORE SUBJECT") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #faf9fe 100%)";
          } else if (tagLabel === "LAB COURSE") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #fef9fc 100%)";
          } else if (tagLabel === "PROJECT") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #f9fdfb 100%)";
          } else if (tagLabel === "FOUNDATION") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #f9fbfd 100%)";
          } else if (tagLabel === "MANDATORY") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #fdfaf9 100%)";
          } else if (tagLabel === "OPEN ELECTIVE") {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #f9fdfb 100%)";
          } else {
            cardBg = "#ffffff linear-gradient(to right, #ffffff 70%, #f9fdfb 100%)";
          }

          const cleanLink = isValidUrl(c.url) ? c.url : "#";

          cardsHtml += `
            <a href="${escapeHTML(cleanLink)}" target="_blank" rel="noopener" style="display: flex; justify-content: space-between; align-items: center; flex: 1 1 260px; box-sizing: border-box; padding: 14px 16px; background: ${cardBg}; color: #1e293b; text-decoration: none !important; border: 1px solid ${borderColor}; border-radius: 12px; box-shadow: 0 4px 12px rgba(15,23,42,0.02); font-family: Segoe UI,Arial,sans-serif; margin: 4px; transition: all 0.2s ease; ${c.is_moodle_active ? '' : 'opacity: 0.5;'}" class="ashish-course-card-link">
              <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; margin-right: 12px;">
                <div style="font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: Segoe UI,Arial,sans-serif;">
                  ${escapeHTML(cleanCourseTitle(c.display_name))}
                </div>
                <div style="font-size: 9px; font-weight: 800; color: ${themeColor}; text-transform: uppercase; letter-spacing: 0.06em; font-family: Segoe UI,Arial,sans-serif; background: ${btnBg}; padding: 2px 8px; border-radius: 20px; width: fit-content; margin-top: 4px;">
                  ${tagLabel}
                </div>
              </div>
              <div style="width: 24px; height: 24px; border-radius: 50%; background: ${themeColor}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; box-shadow: 0 2px 8px ${borderColor};">
                →
              </div>
            </a>`;
        });

        return `
          <div style="margin-bottom: 24px;">
            <div style="font-family: Segoe UI,Arial,sans-serif; font-size: 12px; font-weight: 800; color: #475569; padding-left: 8px; border-left: 4px solid #6366f1; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
              ${icon} ${catTitle} (${catCourses.length})
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%; box-sizing: border-box;">
              ${cardsHtml}
            </div>
          </div>`;
      };

      semContent += renderCategoryHTML("Core Subjects", coreCourses, "📚", false, false);
      semContent += renderCategoryHTML("Lab Courses", labCourses, "🔬", true, false);
      semContent += renderCategoryHTML("Other Courses", otherCourses, "✨", false, true);
    }

    semestersHtml += `
      <details style="margin-bottom: 12px; background: #ffffff; border: 1px solid ${isActive ? 'rgba(99,102,241,0.2)' : '#e2e8f0'}; border-radius: 12px; box-shadow: ${isActive ? '0 4px 20px rgba(99,102,241,0.04)' : '0 4px 12px rgba(15,23,42,0.01)'}; overflow: hidden; width: 100%; box-sizing: border-box;" ${isActive ? 'open' : ''}>
        <summary style="cursor: pointer; padding: 14px 18px; background: ${isActive ? '#f5f3ff' : '#f1f5f9'}; color: ${isActive ? '#6366f1' : '#475569'}; font-weight: 700; font-size: 14px; font-family: Segoe UI,Arial,sans-serif; display: flex; justify-content: space-between; align-items: center; outline: none; user-select: none; border-bottom: 1px solid ${isActive ? 'rgba(99,102,241,0.1)' : '#e2e8f0'};">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${escapeHTML(sem.name)}</span>
            ${isActive ? `<span style="background: #6366f1; color: #ffffff; font-size: 9px; padding: 2px 8px; border-radius: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; font-family: Segoe UI,Arial,sans-serif; display: inline-block;">Active Target</span>` : ''}
          </div>
          <span style="font-size: 11px; color: ${isActive ? '#818cf8' : '#64748b'}; font-weight: normal;">Click to expand/collapse</span>
        </summary>
        <div style="padding: 20px 24px; box-sizing: border-box; background: #ffffff;">
          ${semContent}
        </div>
      </details>`;
  });

  // Build Pokemon section HTML
  let pokemonHtml = "";
  if (settings?.pokemon_enabled) {
    pokemonHtml = `
      <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; align-items: center;">
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/1.gif" alt="Bulbasaur"></div>
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/4.gif" alt="Charmander"></div>
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/7.gif" alt="Squirtle"></div>
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif" alt="Pikachu"></div>
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/39.gif" alt="Jigglypuff"></div>
          <div style="display: flex; align-items: center; justify-content: center;"><img style="width: 40px; height: 40px; object-fit: contain; display: block;" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/133.gif" alt="Eevee"></div>
        </div>
      </div>`;
  }

  // Generate output Moodle-ready structure
  const staticHtml = `
<!-- Moodle Course Hub Card Block -->
<div class="ashish-course-hub" id="moodle-course-hub-container" style="width: 100%; max-width: 900px; margin: 20px auto; padding: 24px; box-sizing: border-box; background: #ffffff; border-top: 4px solid #6366f1; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.03), 0 2px 10px rgba(0,0,0,0.01); font-family: Segoe UI,Arial,sans-serif; color: #0f172a; position: relative; overflow: hidden;">
  <div style="position: relative; z-index: 1; margin-bottom: 24px; font-family: Segoe UI,Arial,sans-serif;">
    <div style="font-size: 28px; line-height: 1.2; font-weight: 800; color: #6366f1; display: inline-block; margin: 0 0 6px 0; font-family: Segoe UI,Arial,sans-serif;">
      ${escapeHTML(titleText)}
    </div>
    <div style="font-size: 14px; line-height: 1.4; color: #64748b; font-family: Segoe UI,Arial,sans-serif;">
      Explore your enrolled courses and labs for the selected semester.
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box;">
    ${semestersHtml}
  </div>

  <div style="margin-top: 32px; background: #f5f3ff; border: 1px solid rgba(139,92,246,0.08); padding: 14px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; box-shadow: 0 4px 15px rgba(139,92,246,0.02);">
    <span style="font-size: 16px;">🎓</span>
    <span style="font-size: 13px; font-weight: 600; color: #6d28d9; font-style: italic; font-family: Segoe UI,Arial,sans-serif; text-align: center;">
      Stay consistent, keep learning, and make it count.
    </span>
    <span style="font-size: 14px; color: #a78bfa;">✦</span>
  </div>

  ${pokemonHtml}
</div>
  `.trim();

  return staticHtml;
}

// 2. Legacy generator and CSS wrapper (Kept for preview compatibility or references)
function generateMoodleCourseHubHTML(courses, semesters, settings, userEmail) {
  return generateMoodleStaticHTML(courses, semesters, settings, userEmail);
}

function generateMoodleCourseHubCSS() {
  return "";
}

// Node compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateMoodleStaticHTML, generateMoodleCourseHubHTML, generateMoodleCourseHubCSS };
}
