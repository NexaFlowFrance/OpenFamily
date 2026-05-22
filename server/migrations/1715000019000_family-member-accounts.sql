-- Up Migration
-- Multi-account families. Until now OpenFamily was single-user: each `users`
-- row owned a family and every data table was scoped by `user_id`. We now let
-- the family owner give individual members their own login WITHOUT reworking
-- that scoping: a member account simply points at the owner via
-- `family_owner_id`, and the auth middleware resolves the family scope to the
-- owner's id. NULL means "this account IS a family owner" (the register path).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS family_owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Members are created with a temporary password emailed to them; this flag
-- forces a password change on first login.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_family_owner_id ON users(family_owner_id);

-- Link a family-member card to its login account (set once an account exists),
-- plus the email the owner entered for that member.
ALTER TABLE family_members
    ADD COLUMN IF NOT EXISTS account_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE family_members
    ADD COLUMN IF NOT EXISTS email TEXT;

-- A given account backs at most one member card.
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_account_user_id
    ON family_members(account_user_id) WHERE account_user_id IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_family_members_account_user_id;
ALTER TABLE family_members DROP COLUMN IF EXISTS email;
ALTER TABLE family_members DROP COLUMN IF EXISTS account_user_id;
DROP INDEX IF EXISTS idx_users_family_owner_id;
ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;
ALTER TABLE users DROP COLUMN IF EXISTS family_owner_id;
