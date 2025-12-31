const SUPABASE_URL = "https://gmvulstojuiggxstomcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdnVsc3RvanVpZ2d4c3RvbWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTExOTMsImV4cCI6MjA4Mjc2NzE5M30.b8bXDljJkrOlQV8xEgMhGXvHOFq18V1s74Gc2vmqTew";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
