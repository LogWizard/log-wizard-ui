
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

    await pool.query(query);

    // Seed default sets ALWAYS if they are missing
    const defaults = [
        'Brilevsky',
        'VikostVSpack',
        'horoshok_k_by_fStikBot',
        'CystsDribsAssai_by_fStikBot'
    ];

    // Efficient seeding: Insert Ignore
    for (const set of defaults) {
        // Try to insert
        try {
            // INSERT IGNORE doesn't work well with promise pools sometimes returning warnings instead of rows
            // Use ON DUPLICATE KEY UPDATE to ensure it's there and active
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
