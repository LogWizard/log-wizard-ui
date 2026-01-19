-- Add avatar caching columns to users table (MariaDB)
-- Run this in log_wizard database

ALTER TABLE users 
ADD COLUMN avatar_cached TINYINT(1) DEFAULT 0 COMMENT 'Has cached avatar file (1) or not (0)',
ADD COLUMN last_avatar_check BIGINT DEFAULT 0 COMMENT 'Unix timestamp of last avatar check';

-- Create indexes for faster queries  
CREATE INDEX idx_avatar_cached ON users(avatar_cached);
CREATE INDEX idx_last_avatar_check ON users(last_avatar_check);

-- Initialize existing users
UPDATE users SET last_avatar_check = 0 WHERE last_avatar_check IS NULL;

