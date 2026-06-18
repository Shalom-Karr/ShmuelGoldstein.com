-- ============================================================
-- Add delete policy for contact_messages so admins can remove records
-- ============================================================
create policy "admins delete messages" on contact_messages
  for delete using (is_admin());
