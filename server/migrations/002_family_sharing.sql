-- Migration 002: family account sharing
-- Allows multiple user accounts to share the same family data

ALTER TABLE users ADD COLUMN IF NOT EXISTS family_owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS family_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    invitee_email TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_family_invites_token ON family_invites(token);
CREATE INDEX IF NOT EXISTS idx_family_invites_owner ON family_invites(owner_id);
