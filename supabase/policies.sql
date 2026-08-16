-- Supabase Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------
-- Semesters Table Policies
-- ----------------------------------------------------
CREATE POLICY "Users can view their own semesters" 
ON semesters FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own semesters" 
ON semesters FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own semesters" 
ON semesters FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own semesters" 
ON semesters FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- ----------------------------------------------------
-- Courses Table Policies
-- ----------------------------------------------------
CREATE POLICY "Users can view their own courses" 
ON courses FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own courses" 
ON courses FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own courses" 
ON courses FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own courses" 
ON courses FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- ----------------------------------------------------
-- Settings Table Policies
-- ----------------------------------------------------
CREATE POLICY "Users can view their own settings" 
ON settings FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings" 
ON settings FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON settings FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings" 
ON settings FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);
