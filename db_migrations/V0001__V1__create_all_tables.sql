CREATE SCHEMA IF NOT EXISTS t_p89855177_ai_chat_safety;

CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    photo_url TEXT,
    auth_date BIGINT,
    filter_level VARCHAR(10) DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.chats (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES t_p89855177_ai_chat_safety.users(id),
    title VARCHAR(255) NOT NULL DEFAULT 'Новый диалог',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.messages (
    id BIGSERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL REFERENCES t_p89855177_ai_chat_safety.chats(id),
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'ai')),
    content TEXT NOT NULL,
    blocked BOOLEAN DEFAULT FALSE,
    block_reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES t_p89855177_ai_chat_safety.users(id),
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT,
    file_key TEXT,
    content_preview TEXT,
    status VARCHAR(20) DEFAULT 'processing',
    safe BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89855177_ai_chat_safety.sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES t_p89855177_ai_chat_safety.users(id),
    token VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON t_p89855177_ai_chat_safety.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON t_p89855177_ai_chat_safety.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON t_p89855177_ai_chat_safety.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON t_p89855177_ai_chat_safety.sessions(token);
