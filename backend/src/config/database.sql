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

-- =============================================
-- LifeBet Tables
-- =============================================

-- Bets table
CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id VARCHAR(66) UNIQUE NOT NULL, -- bytes32 hex (on-chain ID)
    creator_id UUID NOT NULL REFERENCES users(id),
    statement TEXT NOT NULL,
    rules TEXT,
    outcomes JSONB NOT NULL, -- e.g. ["He will talk", "He won't talk"]
    stake_amount BIGINT NOT NULL, -- per bettor (6 decimals)
    token_address VARCHAR(42) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    visibility VARCHAR(20) NOT NULL DEFAULT 'public',
    show_picks BOOLEAN DEFAULT FALSE,
    min_bettors INT DEFAULT 2,
    max_bettors INT DEFAULT 100,
    betting_deadline TIMESTAMP NOT NULL,
    resolve_date TIMESTAMP NOT NULL,
    judge_deadline TIMESTAMP NOT NULL,
    settle_by TIMESTAMP NOT NULL,
    winning_outcome SMALLINT,
    total_pool BIGINT DEFAULT 0,
    settlement_tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bets_bet_id ON bets(bet_id);
CREATE INDEX idx_bets_creator ON bets(creator_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_betting_deadline ON bets(betting_deadline);
CREATE INDEX idx_bets_created_at ON bets(created_at DESC);

-- Trigger for bets table
CREATE TRIGGER update_bets_updated_at BEFORE UPDATE ON bets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bet participants table (bettors and judges)
CREATE TABLE bet_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID NOT NULL REFERENCES bets(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL, -- 'bettor' or 'judge'
    outcome SMALLINT, -- 1-indexed (bettors pick)
    vote SMALLINT, -- 1-indexed (judges vote)
    invite_status VARCHAR(20) DEFAULT 'pending', -- pending/accepted/declined
    deposited BOOLEAN DEFAULT FALSE,
    claimed BOOLEAN DEFAULT FALSE,
    claim_tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bet_id, user_id)
);

CREATE INDEX idx_bet_participants_bet ON bet_participants(bet_id);
CREATE INDEX idx_bet_participants_user ON bet_participants(user_id);
CREATE INDEX idx_bet_participants_role ON bet_participants(role);
CREATE INDEX idx_bet_participants_invite ON bet_participants(invite_status);

-- Trigger for bet_participants table
CREATE TRIGGER update_bet_participants_updated_at BEFORE UPDATE ON bet_participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bet events table (audit trail)
CREATE TABLE bet_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID NOT NULL REFERENCES bets(id),
    event_type VARCHAR(50) NOT NULL, -- created/judge_invited/judge_accepted/bet_placed/locked/vote_cast/settled/cancelled
    actor_id UUID REFERENCES users(id),
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bet_events_bet ON bet_events(bet_id);
CREATE INDEX idx_bet_events_type ON bet_events(event_type);

-- Bet status values:
-- 'draft' - Bet created, waiting for judges to accept
-- 'open' - All judges accepted, betting window open
-- 'locked' - Betting window closed, waiting for resolve date
-- 'judging' - Resolve date passed, judges voting
-- 'settled' - Winning outcome determined, winners can claim
-- 'disputed' - Judges couldn't reach consensus
-- 'cancelled' - Bet cancelled by creator or platform
-- 'expired' - Not enough bettors or judges didn't accept
-- 'refunded' - Emergency refund after settle_by deadline
