
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// Configuration 🌿
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true // Allow initialization scripts
};

let pool = null;

export async function initDB() {
    try {
        console.log('🔌 Connecting to MariaDB...', { host: dbConfig.host, port: dbConfig.port });

        // 1. Connect without Database to Create it
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });

        console.log('✨ Connected! Identifying database...');

        // 2. Create Database if not exists
        await connection.query(`CREATE DATABASE IF NOT EXISTS log_wizard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.end();

        // 3. Create Pool with Database
        pool = mysql.createPool({
            ...dbConfig,
            database: 'log_wizard',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // 4. Init Tables
        await createTables();

        console.log('✅ Database initialized successfully.');
        return pool;

    } catch (error) {
        console.error('❌ Database Initialization Error:', error.message);
        // Do not crash app, just log error (maybe retry?)
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
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Optional: Cache individual stickers to avoid frequent API calls?
        -- For now, we trust the set structure from API.
    `;

    await pool.query(query);

    // Seed default sets if empty
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM sticker_sets');
    if (rows[0].count === 0) {
        console.log('🌱 Seeding default sticker sets...');
        const defaults = [
            'Brilevsky',
            'VikostVSpack',
            'horoshok_k_by_fStikBot',
            'CystsDribsAssai_by_fStikBot'
        ];

        for (const set of defaults) {
            await pool.query('INSERT IGNORE INTO sticker_sets (name, title) VALUES (?, ?)', [set, set]);
        }
    }
}

export async function getStickerSets() {
    if (!pool) return [];
    try {
        const [rows] = await pool.query('SELECT * FROM sticker_sets WHERE is_active = 1 ORDER BY id ASC');
        return rows;
    } catch (e) {
        console.error('DB Error:', e);
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
