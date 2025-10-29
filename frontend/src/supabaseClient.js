// src/supabaseClient.js

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tezynannoajpbwxlyccd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlenluYW5ub2FqcGJ3eGx5Y2NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDA2MzcsImV4cCI6MjA3NjcxNjYzN30.eJejjCddT7A6ZiIzNMYmhICEsGRPhHFCPxQ0Eeg-qPk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)