-- Migration 004: family join requests
-- A standalone user can ask to join an existing family. The family owner approves or rejects.

CREATE TABLE IF NOT EXISTS family_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_family_join_requests_owner ON family_join_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_family_join_requests_requester ON family_join_requests(requester_id);

-- A requester can only have one pending request at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_join_requests_pending
    ON family_join_requests(requester_id)
    WHERE status = 'pending';
