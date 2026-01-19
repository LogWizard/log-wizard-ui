
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

const MSG_ID = 294138; // Target ID

async function debugData() {
    console.log(`🔎 hunting for message ${MSG_ID}...`);

    // 1. Scan FS
    console.log(`📂 Scanning ${MESSAGES_ROOT} for *${MSG_ID}.json...`);
    // Find file
    const files = getAllJsonFiles(MESSAGES_ROOT);
    const targetFile = files.find(f => f.includes(`${MSG_ID}.json`));

    if (targetFile) {
        console.log(`✅ File found: ${targetFile}`);
        const content = fs.readFileSync(targetFile, 'utf8');
        const json = JSON.parse(content);
        console.log(`📄 File Content Reactions:`, json.reactions);
        console.log(`📄 File Content Keys:`, Object.keys(json));
    } else {
        console.error(`❌ File NOT found in FS!`);
    }

    // 2. Check DB
    const pool = mysql.createPool(dbConfig);
    try {
        const [rows] = await pool.query('SELECT raw_data FROM messages WHERE message_id = ?', [MSG_ID]);
        if (rows.length > 0) {
            console.log(`🗄️ DB Record Found.`);
            if (rows[0].raw_data) {
                const dbJson = typeof rows[0].raw_data === 'string' ? JSON.parse(rows[0].raw_data) : rows[0].raw_data;
                console.log(`🗄️ DB Raw Data Reactions:`, dbJson.reactions);
            } else {
                console.log(`🗄️ DB Raw Data is NULL/Empty`);
            }
        } else {
            console.log(`🗄️ No DB Record found for ${MSG_ID}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
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
