CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    base_url TEXT NOT NULL,
    encrypted_credentials TEXT,
    config JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'connected',
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(family_id, type)
);

CREATE INDEX IF NOT EXISTS idx_integrations_family_id ON integrations(family_id);
