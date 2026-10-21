-- Promote an existing user to Owner (role only; does not set password).
-- Edit the email in the WHERE clause if needed, then:
--   psql "$DATABASE_URL" -f scripts/promote-owner.sql

UPDATE "User"
SET
  role = 'OWNER',
  username = CASE WHEN username IS NULL OR username = '' THEN 'jOjo' ELSE username END,
  "displayUsername" = CASE
    WHEN "displayUsername" IS NULL OR "displayUsername" = '' THEN 'jOjo'
    ELSE "displayUsername"
  END,
  image = COALESCE(image, '/avatars/tree-stump.jpg'),
  "emailVerified" = true
WHERE lower(email) = lower('jojo@local.dev')
   OR username ILIKE 'jojo';

SELECT id, username, email, role FROM "User" WHERE role = 'OWNER';
