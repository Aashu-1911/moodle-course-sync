// Moodle Course Hub Extension - Course Checker Script
// Injected first when Moodle MITOAE website is detected.
// Scans the page for courses and reports any new additions.

(function () {
  "use strict";

  const STORAGE_KEY = "known_moodle_courses";
  const NEW_COURSES_KEY = "newly_added_courses";

  // Extract all course links from the current Moodle page
  function extractCoursesFromPage() {
    const courses = [];
    const seen = new Set();

    // Primary: structured Moodle Boost theme cards
    const cards = document.querySelectorAll(
      '[data-region="course-card"], [data-region="course-list-item"], [data-region="course-summaryitem"], .dashboard-card, .course-summaryitem'
    );

    if (cards.length > 0) {
      cards.forEach((card) => {
        const linkEl = card.querySelector(
          'a.coursename, a[href*="/course/view.php?id="]'
        );
        if (!linkEl) return;

        const url = linkEl.href;
        const multilineEl = linkEl.querySelector(".multiline");
        const name = multilineEl
          ? multilineEl.innerText.trim()
          : linkEl.innerText.trim();

        const id = extractIdFromUrl(url);
        if (id && !seen.has(id)) {
          seen.add(id);
          courses.push({ id, name, url });
        }
      });
    }

    // Fallback: scan all course view links on the page
    if (courses.length === 0) {
      document
        .querySelectorAll('a[href*="/course/view.php?id="]')
        .forEach((link) => {
          const url = link.href;
          const name = link.innerText.trim();
          const id = extractIdFromUrl(url);

          if (
            id &&
            name &&
            name.length > 3 &&
            !seen.has(id) &&
            !isGenericText(name)
          ) {
            seen.add(id);
            courses.push({ id, name, url });
          }
        });
    }

    return courses;
  }

  function extractIdFromUrl(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      return url.searchParams.get("id");
    } catch {
      const match = urlStr.match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    }
  }

  function isGenericText(text) {
    const generic = [
      "course",
      "view",
      "enter",
      "go",
      "details",
      "star",
      "unstar",
      "summary",
      "activities",
    ];
    return generic.includes(text.toLowerCase());
  }

  // Compare current page courses against previously known courses
  function detectNewCourses(currentCourses, knownCourseIds) {
    return currentCourses.filter((c) => !knownCourseIds.has(c.id));
  }

  // Main check logic — runs immediately on injection
  function runCourseCheck() {
    const pageCourses = extractCoursesFromPage();

    if (pageCourses.length === 0) {
      console.log(
        "[Moodle Hub Checker] No courses found on this page. Skipping check."
      );
      return;
    }

    console.log(
      `[Moodle Hub Checker] Found ${pageCourses.length} course(s) on page.`
    );

    // Load previously known course IDs from storage
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      console.warn(
        "[Moodle Hub Checker] chrome.storage unavailable. Cannot persist check."
      );
      return;
    }

    chrome.storage.local.get([STORAGE_KEY], (data) => {
      const knownIds = new Set(data[STORAGE_KEY] || []);

      // First ever run — no stored courses yet, so store and report all as initial
      if (knownIds.size === 0) {
        const allIds = pageCourses.map((c) => c.id);
        chrome.storage.local.set({ [STORAGE_KEY]: allIds });
        console.log(
          `[Moodle Hub Checker] First run. Stored ${allIds.length} course IDs as baseline.`
        );
        return;
      }

      // Detect new courses not in the stored set
      const newCourses = detectNewCourses(pageCourses, knownIds);

      if (newCourses.length > 0) {
        console.log(
          `[Moodle Hub Checker] 🆕 ${newCourses.length} new course(s) detected!`
        );
        newCourses.forEach((c) => {
          console.log(`  → New: ${c.name} (id=${c.id})`);
        });

        // Merge new IDs into known set and persist
        const updatedIds = [...knownIds, ...newCourses.map((c) => c.id)];
        const uniqueIds = [...new Set(updatedIds)];

        chrome.storage.local.set({
          [STORAGE_KEY]: uniqueIds,
          [NEW_COURSES_KEY]: newCourses.map((c) => ({
            id: c.id,
            name: c.name,
            url: c.url,
            detectedAt: new Date().toISOString(),
          })),
        });

        // Notify background so it can alert the user or trigger a sync
        try {
          chrome.runtime.sendMessage({
            action: "NEW_COURSES_DETECTED",
            courses: newCourses,
          });
        } catch (e) {
          console.warn(
            "[Moodle Hub Checker] Could not notify background:",
            e.message
          );
        }
      } else {
        console.log(
          "[Moodle Hub Checker] No new courses since last check."
        );

        // Update known IDs in case courses were removed and re-added
        const currentIds = pageCourses.map((c) => c.id);
        chrome.storage.local.set({ [STORAGE_KEY]: currentIds });
      }
    });
  }

  // Run the check as soon as the DOM is ready
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    runCourseCheck();
  } else {
    document.addEventListener("DOMContentLoaded", runCourseCheck);
  }
})();
