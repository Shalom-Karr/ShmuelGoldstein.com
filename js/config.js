// Public Supabase configuration.
// The anon key is intentionally public — Row Level Security in Supabase
// is what controls what this key can actually read or write. Do NOT add
// the service-role key to this file. That lives in Netlify env vars
// only and is used by Netlify Functions.
// Stripe publishable key is public by design — it can only create client-side
// tokens/sessions. The SECRET key (sk_live_…) must never appear in this repo;
// it lives in Netlify env vars only (STRIPE_SECRET_KEY).
window.STRIPE_PK = 'pk_live_51ToQMoCbzbtejSzVG0SsHrE0NXTo3GHbfYmuQnWfnKeMyQObQDeZ42Bbx7JhVJkHXT7lR7D1PR8Ns55ar14j6Z2K00nVbKohsb';

window.SB = {
  url: 'https://pxxifzbljxnbivxkuvrf.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eGlmemJsanhuYml2eGt1dnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzM2MTUsImV4cCI6MjA5NzE0OTYxNX0.whhlTBkOxO7lHaDcb7B7KJV5JcbCd1UXOJcl9oeZF24',
};
window.getSupabase = function () {
  if (window._sbClient) return window._sbClient;
  if (typeof supabase === 'undefined') return null;
  window._sbClient = supabase.createClient(window.SB.url, window.SB.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return window._sbClient;
};
