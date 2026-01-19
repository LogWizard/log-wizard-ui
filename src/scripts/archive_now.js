
import { initDB, getPool } from '../services/db.js';

async function forceArchive() {
    console.log('🚀 Starting Force Archive...');

    // Initialize DB Connection
    await initDB();
    const pool = getPool();

    if (!pool) {
        console.error('❌ Failed to connect to DB');
        process.exit(1);
    }

    try {
        const cutoffDate = '2026-01-19 01:00:00';
        console.log(`📅 Cutoff Date: ${cutoffDate}`);

        // 1. Check Candidates
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM messages WHERE date < ?`, [cutoffDate]);
        const count = rows[0].count;
        console.log(`📊 Found ${count} messages to archive.`);

        if (count === 0) {
            console.log('✨ Nothing to archive. DB is clean.');
            process.exit(0);
        }

        // 2. Insert into Archive
        console.log('📦 Copying to archive...');
        const [copyRes] = await pool.query(`
            INSERT IGNORE INTO messages_archive 
            SELECT * FROM messages WHERE date < ?
        `, [cutoffDate]);
        console.log(`✅ Copied ${copyRes.affectedRows} rows.`);

        // 3. Delete from Main
        console.log('🔥 Deleting from main table...');
        const [delRes] = await pool.query(`
            DELETE FROM messages WHERE date < ?
        `, [cutoffDate]);
        console.log(`✅ Deleted ${delRes.affectedRows} rows.`);

        console.log('🎉 Archive Migration Complete!');

    } catch (e) {
        console.error('❌ Error during archive:', e);
    } finally {
        process.exit(0);
    }
}

forceArchive();
