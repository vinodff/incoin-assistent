// ============================================================
// Incoin Assistant — Supabase Client Configuration
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://zuqohqbkmkcxzxcnsbyr.supabase.co';
// Use legacy anon JWT key — required for supabase-js CDN (sb_publishable_ not supported)
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cW9ocWJrbWtjeHp4Y25zYnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2Njc0MDYsImV4cCI6MjA5MjI0MzQwNn0.--I4APXoZXPCkjWb0AZmxk6PW5m1-PIfixZ31AJgsos';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

