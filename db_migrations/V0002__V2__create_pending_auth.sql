CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.pending_auth (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(6) NOT NULL,
    confirmed BOOLEAN DEFAULT FALSE,
    telegram_id BIGINT,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    photo_url TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_auth_code ON t_p89855177_ai_chat_safety.pending_auth(code);
