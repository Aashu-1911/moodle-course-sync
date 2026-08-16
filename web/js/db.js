// Moodle Course Hub - Database Operations Library

const DB = {
  // Ensure the database is initialized for a user (create default semesters and settings)
  async ensureInitialized(userId) {
    if (!window.supabaseClient) return null;

    try {
      // 1. Check if semesters exist
      const { data: semesters, error: semError } = await window.supabaseClient
        .from('semesters')
        .select('*')
        .eq('user_id', userId);

      if (semError) throw semError;

      let activeSemesters = semesters || [];

      // 2. If no semesters exist, create defaults
      if (activeSemesters.length === 0) {
        console.log("Initializing database with default semesters...");
        const defaultSems = [
          { user_id: userId, name: "SEM 4", semester_number: 4, is_current: false },
          { user_id: userId, name: "SEM 5", semester_number: 5, is_current: true },
          { user_id: userId, name: "SEM 6", semester_number: 6, is_current: false },
          { user_id: userId, name: "SEM 7", semester_number: 7, is_current: false },
          { user_id: userId, name: "SEM 8", semester_number: 8, is_current: false }
        ];

        const { data: insertedSems, error: insertSemError } = await window.supabaseClient
          .from('semesters')
          .insert(defaultSems)
          .select();

        if (insertSemError) throw insertSemError;
        activeSemesters = insertedSems;
      }

      // Find SEM 5 (our default current semester)
      const sem5 = activeSemesters.find(s => s.name === "SEM 5") || activeSemesters[0];

      // 3. Check if settings exist
      const { data: settings, error: settingsError } = await window.supabaseClient
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      // 4. If settings do not exist, create defaults
      if (!settings) {
        console.log("Initializing database with default settings...");
        const defaultSettings = {
          user_id: userId,
          current_semester_id: sem5 ? sem5.id : null,
          pokemon_enabled: false,
          auto_assign_new_courses: true,
          theme: 'light'
        };

        const { error: insertSettingsError } = await window.supabaseClient
          .from('settings')
          .insert(defaultSettings);

        if (insertSettingsError) throw insertSettingsError;
      }

      return true;
    } catch (err) {
      console.error("Database initialization failed:", err.message);
      return false;
    }
  },

  // Get all semesters for the user
  async getSemesters(userId) {
    if (!window.supabaseClient) return [];
    const { data, error } = await window.supabaseClient
      .from('semesters')
      .select('*')
      .eq('user_id', userId)
      .order('semester_number', { ascending: true });

    if (error) {
      console.error("Error fetching semesters:", error.message);
      return [];
    }
    return data;
  },

  // Get all courses for the user
  async getCourses(userId) {
    if (!window.supabaseClient) return [];
    const { data, error } = await window.supabaseClient
      .from('courses')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) {
      console.error("Error fetching courses:", error.message);
      return [];
    }
    return data;
  },

  // Get settings for the user
  async getSettings(userId) {
    if (!window.supabaseClient) return null;
    const { data, error } = await window.supabaseClient
      .from('settings')
      .select('*, semesters(*)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error.message);
      return null;
    }
    return data;
  },

  // Update general settings
  async updateSettings(userId, updates) {
    if (!window.supabaseClient) return null;
    const { data, error } = await window.supabaseClient
      .from('settings')
      .update(updates)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error("Error updating settings:", error.message);
      throw error;
    }
    return data[0];
  },

  // Set the current semester for the user (handles both settings update and is_current toggling)
  async setCurrentSemester(userId, semesterId) {
    if (!window.supabaseClient) return false;

    try {
      // 1. Reset all is_current flag in semesters
      const { error: resetError } = await window.supabaseClient
        .from('semesters')
        .update({ is_current: false })
        .eq('user_id', userId);

      if (resetError) throw resetError;

      // 2. Set the target semester's is_current flag to true
      const { error: setError } = await window.supabaseClient
        .from('semesters')
        .update({ is_current: true })
        .eq('id', semesterId);

      if (setError) throw setError;

      // 3. Update current_semester_id in settings
      const { error: settingsError } = await window.supabaseClient
        .from('settings')
        .update({ current_semester_id: semesterId })
        .eq('user_id', userId);

      if (settingsError) throw settingsError;

      return true;
    } catch (err) {
      console.error("Failed to change current semester:", err.message);
      return false;
    }
  },

  // Create a new course
  async createCourse(userId, courseData) {
    if (!window.supabaseClient) return null;
    
    // Add position based on highest existing position in the targeted semester
    const { data: existing, error: fetchErr } = await window.supabaseClient
      .from('courses')
      .select('position')
      .eq('user_id', userId)
      .eq('semester_id', courseData.semester_id)
      .order('position', { ascending: false })
      .limit(1);

    let nextPosition = 0;
    if (!fetchErr && existing && existing.length > 0) {
      nextPosition = existing[0].position + 1;
    }

    const { data, error } = await window.supabaseClient
      .from('courses')
      .insert({
        user_id: userId,
        moodle_course_id: courseData.moodle_course_id,
        semester_id: courseData.semester_id,
        name: courseData.name,
        display_name: courseData.display_name || courseData.name,
        url: courseData.url,
        position: nextPosition,
        is_hidden: false
      })
      .select();

    if (error) {
      console.error("Error creating course:", error.message);
      throw error;
    }
    return data[0];
  },

  // Update a course
  async updateCourse(userId, courseId, updates) {
    if (!window.supabaseClient) return null;
    const { data, error } = await window.supabaseClient
      .from('courses')
      .update(updates)
      .eq('id', courseId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error("Error updating course:", error.message);
      throw error;
    }
    return data[0];
  },

  // Reorder courses in a semester
  async updateCoursePositions(userId, courseOrderList) {
    if (!window.supabaseClient) return false;
    
    // courseOrderList should be an array of objects: { id: courseId, position: newPosition }
    const promises = courseOrderList.map(item => 
      window.supabaseClient
        .from('courses')
        .update({ position: item.position })
        .eq('id', item.id)
        .eq('user_id', userId)
    );

    try {
      await Promise.all(promises);
      return true;
    } catch (err) {
      console.error("Error batch updating course positions:", err.message);
      return false;
    }
  },

  // Delete a course
  async deleteCourse(userId, courseId) {
    if (!window.supabaseClient) return false;
    const { error } = await window.supabaseClient
      .from('courses')
      .delete()
      .eq('id', courseId)
      .eq('user_id', userId);

    if (error) {
      console.error("Error deleting course:", error.message);
      return false;
    }
    return true;
  },

  // Create a new semester
  async createSemester(userId, name, semesterNumber) {
    if (!window.supabaseClient) return null;
    
    // If semesterNumber is not provided, calculate next available
    if (semesterNumber === undefined || semesterNumber === null) {
      const { data: existing, error: fetchErr } = await window.supabaseClient
        .from('semesters')
        .select('semester_number')
        .eq('user_id', userId)
        .order('semester_number', { ascending: false })
        .limit(1);

      semesterNumber = 1;
      if (!fetchErr && existing && existing.length > 0) {
        semesterNumber = existing[0].semester_number + 1;
      }
    }

    const { data, error } = await window.supabaseClient
      .from('semesters')
      .insert({
        user_id: userId,
        name: name,
        semester_number: semesterNumber,
        is_current: false,
        is_archived: false
      })
      .select();

    if (error) {
      console.error("Error creating semester:", error.message);
      throw error;
    }
    return data[0];
  },

  // Update a semester (rename or toggle archive)
  async updateSemester(userId, semesterId, updates) {
    if (!window.supabaseClient) return null;
    const { data, error } = await window.supabaseClient
      .from('semesters')
      .update(updates)
      .eq('id', semesterId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error("Error updating semester:", error.message);
      throw error;
    }
    return data[0];
  },

  // Reorder semesters
  async updateSemesterPositions(userId, semesterOrderList) {
    if (!window.supabaseClient) return false;
    
    const promises = semesterOrderList.map(item => 
      window.supabaseClient
        .from('semesters')
        .update({ semester_number: item.semester_number })
        .eq('id', item.id)
        .eq('user_id', userId)
    );

    try {
      await Promise.all(promises);
      return true;
    } catch (err) {
      console.error("Error batch updating semester positions:", err.message);
      return false;
    }
  },

  // Bulk update semester assignment for a list of course IDs
  async updateCoursesSemester(userId, courseIds, semesterId) {
    if (!window.supabaseClient) return false;
    const targetSemId = semesterId || null;

    try {
      const { error } = await window.supabaseClient
        .from('courses')
        .update({ semester_id: targetSemId })
        .in('id', courseIds)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Bulk course semester reassignment failed:", err.message);
      return false;
    }
  }
};

window.DB = DB;
