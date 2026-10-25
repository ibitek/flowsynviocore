(() => {
  const cfg = window.SYNVIO_CONFIG || {};
  const configured =
    cfg.supabaseUrl &&
    cfg.supabasePublishableKey &&
    !cfg.supabaseUrl.includes("PASTE_") &&
    !cfg.supabasePublishableKey.includes("PASTE_");

  window.SYNVIO_CONFIGURED = Boolean(configured);

  if (!configured) {
    window.synvioSupabase = null;
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase browser library failed to load.");
    window.synvioSupabase = null;
    return;
  }

  window.synvioSupabase = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
