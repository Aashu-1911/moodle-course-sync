-- Supabase Schema for Moodle Course Hub

-- 1. Create Semesters Table
CREATE TABLE IF NOT EXISTS semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    semester_number INTEGER NOT NULL,
    is_current BOOLEAN DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Ensure only one semester is set as current per user
CREATE UNIQUE INDEX IF NOT EXISTS unique_current_semester ON semesters (user_id) WHERE (is_current = true);

-- 2. Create Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    moodle_course_id TEXT NOT NULL,
    semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    url TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    is_moodle_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Prevent duplicate moodle course IDs for the same user
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_moodle_course ON courses (user_id, moodle_course_id);

-- 3. Create Settings Table
CREATE TABLE IF NOT EXISTS settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL,
    pokemon_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_assign_new_courses BOOLEAN NOT NULL DEFAULT true,
    theme TEXT NOT NULL DEFAULT 'light',
    last_sync_at TIMESTAMPTZ DEFAULT null,
    last_sync_status TEXT NOT NULL DEFAULT 'none',
    last_sync_message TEXT DEFAULT null,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Create a helper function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to update the updated_at timestamp
CREATE OR REPLACE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
