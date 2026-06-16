// Admin auth gate — included on every admin page (except login).
// Verifies a Supabase session exists AND the user has a row in admins.
// If either check fails, redirect to /admin/login.html.

(function () {
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) {
    console.error('Supabase client unavailable');
    location.replace('/admin/login.html');
    return;
  }

  window.adminReady = (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      location.replace('/admin/login.html');
      return null;
    }

    const { data: row } = await sb
      .from('admins')
      .select('user_id, email, display_name')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!row) {
      // Signed in but not in admins — sign out and bounce.
      await sb.auth.signOut();
      alert('That account is not an admin on this site.');
      location.replace('/admin/login.html');
      return null;
    }

    document.body.dataset.adminReady = '1';
    return { sb, session, admin: row };
  })();

  // Mount sidebar identity + logout button when the shell exists.
  window.adminReady.then((ctx) => {
    if (!ctx) return;
    const id = document.querySelector('[data-admin-identity]');
    if (id) id.textContent = ctx.admin.display_name || ctx.admin.email;
    document.querySelectorAll('[data-admin-logout]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await ctx.sb.auth.signOut();
        location.replace('/admin/login.html');
      });
    });
  });
})();
