import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from parent directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'log_wizard',
    port: Number(process.env.DB_PORT) || 3306
};

async function nukeMessage(messageId) {
    console.log(`☢️ Starting NUCLEAR DELETE for Message ID: ${messageId}`);

    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('✅ Connected to DB');

        // 1. Check if exists
        const [rows] = await connection.execute('SELECT * FROM messages WHERE message_id = ?', [messageId]);
        if (rows.length === 0) {
            console.log('⚠️ Message not found in active messages table.');
        } else {
            console.log(`🎯 Found message in active table:`, rows[0]);
            // 2. Delete
            await connection.execute('DELETE FROM messages WHERE message_id = ?', [messageId]);
            console.log('💥 DELETED from active messages.');
        }

        // 3. Check Archive
        const [archRows] = await connection.execute('SELECT * FROM messages_archive WHERE message_id = ?', [messageId]);
        if (archRows.length === 0) {
            console.log('⚠️ Message not found in archive table.');
        } else {
            console.log(`🎯 Found message in ARCHIVE table:`, archRows[0]);
            // 4. Delete Archive
            await connection.execute('DELETE FROM messages_archive WHERE message_id = ?', [messageId]);
            console.log('💥 DELETED from archive messages.');
        }

        console.log('🏁 Nuclear cleanup finished.');

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        if (connection) await connection.end();
    }
}

// Get ID from args
const id = process.argv[2];
if (!id) {
    console.error('❌ Please provide a Message ID argument.');
    console.log('Usage: node hard_delete_message.js <message_id>');
} else {
    nukeMessage(id);
}
