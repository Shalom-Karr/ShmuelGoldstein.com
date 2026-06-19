// Verifies a caller's Supabase session JWT (Authorization: Bearer <jwt>)
// and confirms the user has a row in the `admins` table.
// Returns { user, admin } on success or { error: { status, message } }.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(event) {
  const raw = event.headers.authorization || event.headers.Authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!token) return { error: { status: 401, message: 'Missing session token' } };

  if (!ANON || !SERVICE) {
    return { error: { status: 500, message: 'Server not configured (Supabase keys)' } };
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return { error: { status: 401, message: 'Invalid or expired session' } };
  const user = await userRes.json();

  const adminRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,email,display_name`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
  );
  if (!adminRes.ok) return { error: { status: 500, message: 'Admin lookup failed' } };
  const rows = await adminRes.json();
  if (!Array.isArray(rows) || !rows.length) return { error: { status: 403, message: 'Not an admin' } };

  return { user, admin: rows[0] };
}

module.exports = { requireAdmin };
