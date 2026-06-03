
import { initDB, getPool } from '../services/db.js';
import { logInfo, logWarn, logError } from '../utils/logger.js';

async function forceArchive() {
    logInfo('🚀 Starting Force Archive...');

    // Initialize DB Connection
    await initDB();
    const pool = getPool();

    if (!pool) {
        logError('❌ Failed to connect to DB');
        process.exit(1);
    }

    try {
        const cutoffDate = '2026-01-19 01:00:00';
        logInfo(`📅 Cutoff Date: ${cutoffDate}`);

        // 1. Check Candidates
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM messages WHERE date < ?`, [cutoffDate]);
        const count = rows[0].count;
        logInfo(`📊 Found ${count} messages to archive.`);

        if (count === 0) {
            logInfo('✨ Nothing to archive. DB is clean.');
            process.exit(0);
        }

        // 2. Insert into Archive
        logInfo('📦 Copying to archive...');
        const [copyRes] = await pool.query(`
            INSERT IGNORE INTO messages_archive 
            SELECT * FROM messages WHERE date < ?
        `, [cutoffDate]);
        logInfo(`✅ Copied ${copyRes.affectedRows} rows.`);

        // 3. Delete from Main
        logInfo('🔥 Deleting from main table...');
        const [delRes] = await pool.query(`
            DELETE FROM messages WHERE date < ?
        `, [cutoffDate]);
        logInfo(`✅ Deleted ${delRes.affectedRows} rows.`);

        logInfo('🎉 Archive Migration Complete!');

    } catch (e) {
        logError('❌ Error during archive:', e);
    } finally {
        process.exit(0);
    }
}

forceArchive();
