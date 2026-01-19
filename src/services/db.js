
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// Configuration 🌿
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1', // Or localhost
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '' // Default empty
};

let pool = null;

// Helper to try connection with specific config
async function attemptConnection(config) {
    try {
        const conn = await mysql.createConnection(config);
        return conn;
    } catch (e) {
        return null;
    }
}

export async function initDB() {
    console.log('🔌 Connecting to MariaDB...', { host: dbConfig.host, port: dbConfig.port, user: dbConfig.user });

    let connection = null;

    // 1. Try with configurated password
    connection = await attemptConnection({ ...dbConfig, database: undefined });

    // 2. If failed and password was empty, try 'root'
    if (!connection && !dbConfig.password) {
        console.warn('⚠️ Connection failed with empty password. Trying "root"...');
        connection = await attemptConnection({ ...dbConfig, password: 'root', database: undefined });
        if (connection) dbConfig.password = 'root'; // Update config
    }

    if (!connection) {
        console.error('❌ Database Connection Failed! Please check your credentials and port (3307).');
        return null;
    }

    try {
        console.log('✨ Connected! Checking database...');

        // 2. Create Database if not exists
        await connection.query(`CREATE DATABASE IF NOT EXISTS log_wizard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.end();

        // 3. Create Pool with Database
        pool = mysql.createPool({
            ...dbConfig,
            database: 'log_wizard',
            waitForConnections: true,
            connectionLimit: 10,
            multipleStatements: true
        });

        // 4. Init Tables
        await createTables();

        console.log('✅ Database initialized successfully.');
        return pool;

    } catch (error) {
        console.error('❌ Database Init Error:', error.message);
        return null;
    }
}

async function createTables() {
    if (!pool) return;

    const query = `
        CREATE TABLE IF NOT EXISTS sticker_sets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            title VARCHAR(255),
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // 1. Sticker Sets
    await pool.query(query);

    // 2. Users Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            username VARCHAR(255),
            is_bot BOOLEAN DEFAULT 0,
            language_code VARCHAR(10),
            photo_url VARCHAR(255), -- 🌿 Cache avatar URL
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
    `);

    // 🌿 Migration: Add column if missing (for existing installs)
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN photo_url VARCHAR(255)`);
    } catch (e) {
        // Ignore "Duplicate column name" error
    }

    // 3. Chats Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chats (
            id BIGINT PRIMARY KEY,
            title VARCHAR(255),
            username VARCHAR(255),
            type VARCHAR(50),
            photo_url TEXT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
    `);

    // 4. Messages Table (Wide Schema with JSON)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            unique_id VARCHAR(191) PRIMARY KEY, -- Composite key: chat_id + '_' + message_id
            message_id BIGINT NOT NULL,
            chat_id BIGINT NOT NULL,
            from_id BIGINT,
            date TIMESTAMP,
            text TEXT,
            caption TEXT,
            type VARCHAR(50),
            media_url TEXT,
            reply_to_msg_id BIGINT,
            raw_data JSON, -- 🌿 Full original JSON for perfect fidelity
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_chat_date (chat_id, date),
            INDEX idx_date (date),
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            -- Note: We don't enforce FK on from_id strictly to avoid issues with unknown users/channels
        );
    `);

    // 5. Messages Archive Table (Clone of messages) 🌿
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages_archive LIKE messages;
    `);

    // 🌿 Archive Migration (One-off)
    // Runs automatically on start if condition met
    await runArchiveMigration();
}

/**
 * Moves old synced messages to archive to fix UI glitches
 */
export async function runArchiveMigration() {
    if (!pool) return;
    try {
        // Cutoff: 19.01.2026 01:00:00 (Today timestamp requested by user)
        const cutoffDate = '2026-01-19 01:00:00';

        // Count candidates
        const [countRes] = await pool.query(`SELECT COUNT(*) as count FROM messages WHERE date < ?`, [cutoffDate]);
        const count = countRes[0].count;

        if (count > 0) {
            console.log(`📦 Archiving ${count} old messages (before ${cutoffDate})...`);

            // 1. Move to Archive
            await pool.query(`
                INSERT IGNORE INTO messages_archive 
                SELECT * FROM messages WHERE date < ?
            `, [cutoffDate]);

            // 2. Delete from Main
            await pool.query(`
                DELETE FROM messages WHERE date < ?
            `, [cutoffDate]);

            console.log('✅ Archive Complete! Clutter removed.');
        } else {
            // console.log('📦 Archive check: Clean.');
        }

    } catch (e) {
        console.error('Archive Error:', e);
    }

    // Seed default sets ALWAYS if they are missing
    const defaults = [
        'Brilevsky',
        'VikostVSpack',
        'horoshok_k_by_fStikBot',
        'CystsDribsAssai_by_fStikBot'
    ];

    // Efficient seeding: Insert Ignore
    for (const set of defaults) {
        try {
            await pool.query('INSERT INTO sticker_sets (name, title) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_active = 1', [set, set]);
        } catch (e) {
            console.error('Seed Error:', e.message);
        }
    }
    console.log('🌱 Seeded sticker sets.');
}

export async function getStickerSets() {
    if (!pool) {
        console.warn('⚠️ DB Pool not ready for getStickerSets');
        return [];
    }
    try {
        const [rows] = await pool.query('SELECT * FROM sticker_sets WHERE is_active = 1 ORDER BY id DESC'); // Newest first
        return rows;
    } catch (e) {
        console.error('DB Select Error:', e);
        return [];
    }
}

export async function addStickerSet(name, title) {
    if (!pool) return false;
    try {
        await pool.query('INSERT INTO sticker_sets (name, title) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_active = 1', [name, title || name]);
        return true;
    } catch (e) {
        console.error('DB Insert Error:', e);
        throw e;
    }
}

export function getPool() {
    return pool;
}
