-- JAW Games Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    ens_name VARCHAR(255) UNIQUE NOT NULL,
    smart_account_address VARCHAR(42) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on smart_account_address for faster lookups
CREATE INDEX idx_users_smart_account ON users(smart_account_address);
CREATE INDEX idx_users_username ON users(username);

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(66) UNIQUE NOT NULL, -- bytes32 as hex string
    game_id VARCHAR(255) NOT NULL,
    player_a_id UUID NOT NULL REFERENCES users(id),
    player_b_id UUID NOT NULL REFERENCES users(id),
    stake_amount BIGINT NOT NULL, -- stored in smallest unit (6 decimals)
    token_address VARCHAR(42) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_creation',
    accept_by TIMESTAMP NOT NULL,
    deposit_by TIMESTAMP NOT NULL,
    settle_by TIMESTAMP NOT NULL,
    player_a_deposited BOOLEAN DEFAULT FALSE,
    player_b_deposited BOOLEAN DEFAULT FALSE,
    winner_id UUID REFERENCES users(id),
    settlement_tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for matches
CREATE INDEX idx_matches_match_id ON matches(match_id);
CREATE INDEX idx_matches_player_a ON matches(player_a_id);
CREATE INDEX idx_matches_player_b ON matches(player_b_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_created_at ON matches(created_at DESC);

-- Game sessions table (for real-time game state)
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id),
    game_state JSONB NOT NULL,
    current_turn UUID REFERENCES users(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    result JSONB
);

-- Create index on match_id
CREATE INDEX idx_game_sessions_match_id ON game_sessions(match_id);

-- Sessions table (ERC-7715 permission sessions)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    permission_id VARCHAR(66) NOT NULL,
    spender_address VARCHAR(42) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_permission_id ON sessions(permission_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for matches table
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Match status enum values:
-- 'pending_creation' - Match record created, waiting for blockchain tx
-- 'created' - Match created on blockchain
-- 'accepted' - Match accepted on blockchain
-- 'ready' - Both players deposited, game can start
-- 'in_progress' - Game is being played
-- 'settling' - Settlement transaction submitted
-- 'settled' - Match settled, winner paid
-- 'cancelled' - Match cancelled
-- 'refunded' - Match refunded

-- Sample queries for reference:

-- Get user by username
-- SELECT * FROM users WHERE username = $1;

-- Get user's matches
-- SELECT m.*,
--        ua.username as player_a_username,
--        ub.username as player_b_username,
--        uw.username as winner_username
-- FROM matches m
-- JOIN users ua ON m.player_a_id = ua.id
-- JOIN users ub ON m.player_b_id = ub.id
-- LEFT JOIN users uw ON m.winner_id = uw.id
-- WHERE m.player_a_id = $1 OR m.player_b_id = $1
-- ORDER BY m.created_at DESC;

-- Get pending invites for a user
-- SELECT m.*, ua.username as challenger_username
-- FROM matches m
-- JOIN users ua ON m.player_a_id = ua.id
-- WHERE m.player_b_id = $1 AND m.status IN ('created', 'pending_creation')
-- ORDER BY m.created_at DESC;
