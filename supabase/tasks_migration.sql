-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zuqohqbkmkcxzxcnsbyr/sql/new

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority  text    DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS category  text    DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS due_date  date,
  ADD COLUMN IF NOT EXISTS progress  integer DEFAULT 0;
