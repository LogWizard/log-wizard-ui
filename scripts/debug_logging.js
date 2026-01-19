import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../src/config-manager.js';

// Setup Mock Environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '..');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

async function testLogging() {
    console.log('🐞 Starting Debug Logging (Ladybug)...');

    // 1. Read Config
    try {
        const config = configManager.read();
        console.log('✅ Config Loaded. Path:', config['Listening Path']);
    } catch (e) {
        console.error('❌ Config Load Failed:', e);
        return;
    }

    // 2. Test File Saving
    const mockMsg = {
        message_id: 999999,
        chat: { id: 584278239 }, // Dasha
        date: Math.floor(Date.now() / 1000),
        text: 'DEBUG_TEST_MESSAGE',
        sticker: { file_id: 'DEBUG_STICKER' }
    };

    try {
        const config = configManager.read();
        const msgPathBase = config['Listening Path'] || 'messages';
        const dateObj = new Date(mockMsg.date * 1000);
        const dateStr = dateObj.toLocaleDateString('uk-UA');

        const folderPath = path.join(msgPathBase, dateStr); // Should trigger recursive creation if needed
        const chatIdStr = String(mockMsg.chat.id);

        let finalPath = folderPath;
        // Logic from saveMessageLocally?
        // Wait, saveMessageLocally in send-message.js:
        /*
        const folderPath = path.join(msgPathBase, dateStr);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        const fileName = `${msg.message_id}.json`;
        const filePath = path.join(folderPath, fileName);
        */
        // Note: It does NOT put it in ChatID subfolder in saveMessageLocally implementation I viewed!
        // But ks_gys_bot DOES put it in ChatID subfolder if it's private?
        // Let's emulate exactly what send-message.js does.

        if (!fs.existsSync(folderPath)) {
            console.log(`📁 Creating folder ${folderPath}`);
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const filePath = path.join(folderPath, `${mockMsg.message_id}.json`);
        console.log(`💾 Attempting to write to ${filePath}`);
        fs.writeFileSync(filePath, JSON.stringify(mockMsg, null, 2));
        console.log('✅ File Write Success!');

        // Remove it cleanup
        fs.unlinkSync(filePath);
        console.log('🧹 Cleanup Success');

    } catch (e) {
        console.error('❌ File Save Failed:', e);
    }

    // 3. Test DB Connection (using simple import to see if it fails)
    try {
        console.log('🔌 Testing DB Import...');
        const { getPool, initDB } = await import('../src/services/db.js');
        await initDB(); // Ensure initialized
        const pool = getPool();
        if (pool) {
            console.log('✅ DB Pool Acquired');
            const [rows] = await pool.query('SELECT 1 as val');
            console.log('✅ DB Query Success:', rows);
        } else {
            console.error('❌ DB Pool is NULL');
        }
    } catch (e) {
        console.error('❌ DB Test Failed:', e);
    }
}

testLogging();
