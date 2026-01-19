
import { initDB } from './src/services/db.js';
import { MessageSyncer } from './src/services/sync-service.js';
import fs from 'fs';

async function verify() {
    console.log('🧪 Starting Verification...');

    // 1. Test DB Connection & Migrations
    console.log('Step 1: Init DB & Tables');
    const pool = await initDB();
    if (!pool) {
        console.error('❌ DB Init Failed');
        process.exit(1);
    }
    console.log('✅ DB tables ensured.');

    // 2. Check Tables
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables found:', tables.map(t => Object.values(t)[0]));

    if (!tables.some(t => Object.values(t)[0] === 'messages')) {
        console.error('❌ Messages table missing!');
        process.exit(1);
    }

    // 3. Test Sync Service (Dry Run - just init and scan 1 dir)
    console.log('Step 2: Testing Sync Service Init');
    // Read path from config or default
    const MSG_PATH = 'D:/OSPanel/domains/kyivstar-nelegal-it-community.com.ua/Node_Home/GitHub/ks_gys_bot/messages';

    if (fs.existsSync(MSG_PATH)) {
        console.log(`✅ Message path exists: ${MSG_PATH}`);
        const syncer = new MessageSyncer(MSG_PATH);
        await syncer.scanDirectory(MSG_PATH); // Just top level scan
        console.log('✅ Sync Service scan initiated successfully.');
    } else {
        console.warn('⚠️ Message path not found, skipping sync test.');
    }

    console.log('🎉 Verification PASSED! You can restart the main server now.');
    process.exit(0);
}

verify().catch(e => {
    console.error('❌ Verification Error:', e);
    process.exit(1);
});
