
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(__filename), '..');
const MESSAGES_ROOT = path.resolve(appRoot, '../ks_gys_bot/messages');

const dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'Pasha0407!',
    database: 'log_wizard'
};

const MSG_ID = 294123; // Target ID

async function debugData() {
    console.log(`🔎 hunting for message ${MSG_ID}...`);

    // 1. File Check SKIPPED

    // 2. Check DB
    const pool = mysql.createPool(dbConfig);
    try {
        const [rows] = await pool.query('SELECT * FROM messages WHERE message_id = ?', [MSG_ID]);
        if (rows.length === 0) {
            console.log('❌ Message NOT FOUND in DB');
        } else {
            const row = rows[0];
            console.log('✅ Message FOUND in DB');
            console.log(`   ID: ${row.id} | UniqueID: ${row.unique_id} | Date: ${row.date}`);
            console.log(`   Raw Data Length: ${row.raw_data ? row.raw_data.length : 0}`);
            console.log('   DB Raw Data:', row.raw_data ? row.raw_data.substring(0, 200) + '...' : 'NULL');

            if (row.raw_data) {
                try {
                    const parsed = JSON.parse(row.raw_data);
                    console.log('   DB Parsed Reactions:', JSON.stringify(parsed.reactions, null, 2));
                } catch (e) {
                    console.log('   ❌ Failed to parse raw_data');
                }
            } else {
                console.log('   ❌ Raw Data is NULL/Empty');
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
    process.exit();
}

function getAllJsonFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        try {
            if (fs.statSync(filePath).isDirectory()) {
                getAllJsonFiles(filePath, fileList);
            } else {
                if (file.endsWith('.json')) fileList.push(filePath);
            }
        } catch (e) { }
    });
    return fileList;
}

debugData();
