import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

// DB Config
const dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'Pasha0407!',
    database: 'log_wizard'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Path to messages
const MESSAGES_ROOT = path.resolve(appRoot, '../ks_gys_bot/messages');

async function migrateRecent() {
    console.log('🦆 Starting Recent Migration (Last 10h)...');

    // Check cutoff time (10 hours ago)
    const cutoffTime = Date.now() - (10 * 60 * 60 * 1000);
    console.log(`🕒 Searching for files modified after: ${new Date(cutoffTime).toLocaleString()}`);

    const pool = mysql.createPool(dbConfig);

    try {
        await pool.query('SELECT 1');
        console.log('🔌 DB Connected');

        if (!fs.existsSync(MESSAGES_ROOT)) {
            console.error(`❌ Messages folder not found at ${MESSAGES_ROOT}`);
            return;
        }

        const dateFolders = fs.readdirSync(MESSAGES_ROOT);
        let totalFound = 0;
        let totalUpdated = 0;

        // Optimized: Only check date folders that might contain recent files?
        // But 10h could span across midnight (yesterday and today).
        // Let's iterate all date folders but we can be smart.
        // Actually, just checking today and yesterday is enough usually.
        // But for safety, I'll scan all, filtering by mtime is fast enough for date folders usually.
        // Wait, date folders don't change mtime often. We must enter them.
        // Let's just scan "today" and "yesterday" folders if they exist to save time.

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Format: DD.MM.YYYY
        const formatFolder = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
        const targetFolders = [formatFolder(today), formatFolder(yesterday)];

        console.log(`📂 Scanning target folders: ${targetFolders.join(', ')}`);

        for (const dateFolder of dateFolders) {
            if (!targetFolders.includes(dateFolder)) continue; // Skip older

            const datePath = path.join(MESSAGES_ROOT, dateFolder);
            if (!fs.statSync(datePath).isDirectory()) continue;

            const files = getAllJsonFiles(datePath);

            for (const file of files) {
                try {
                    const stats = fs.statSync(file);
                    if (stats.mtimeMs < cutoffTime) continue; // Skip old files

                    totalFound++;

                    const content = fs.readFileSync(file, 'utf8');
                    const msg = JSON.parse(content);

                    if (!msg.message_id || !msg.chat || !msg.chat.id) continue;

                    // Logic similar to logToDB
                    let type = 'text';
                    let mediaUrl = null;
                    let text = msg.text || msg.caption || null;

                    if (msg.sticker) {
                        type = 'sticker';
                        mediaUrl = msg.url_sticker || msg.sticker.file_id;
                    } else if (msg.photo) {
                        type = 'photo';
                        mediaUrl = msg.url_photo || (Array.isArray(msg.photo) ? msg.photo[0].file_id : null);
                    } else if (msg.video) {
                        type = 'video';
                        mediaUrl = msg.url_video || msg.video.file_id;
                    } else if (msg.voice) {
                        type = 'voice';
                        mediaUrl = msg.url_voice || msg.voice.file_id;
                    } else if (msg.audio) {
                        type = 'audio';
                        mediaUrl = msg.url_audio || msg.audio.file_id;
                    } else if (msg.video_note) {
                        type = 'video_note';
                        mediaUrl = msg.url_video_note || msg.video_note.file_id;
                    } else if (msg.animation) {
                        type = 'animation';
                        mediaUrl = msg.url_animation || msg.animation.file_id;
                    }

                    const uniqueId = `${msg.chat.id}_${msg.message_id}`;

                    // UPDATE (Upsert) - Crucial for reactions!
                    await pool.query(`
                        INSERT INTO messages (unique_id, message_id, chat_id, from_id, date, text, caption, type, media_url, raw_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            text = VALUES(text),
                            caption = VALUES(caption),
                            media_url = VALUES(media_url),
                            raw_data = VALUES(raw_data)
                    `, [
                        uniqueId,
                        msg.message_id,
                        msg.chat.id,
                        msg.from?.id || 0,
                        new Date(msg.date * 1000),
                        text,
                        msg.caption || null,
                        type,
                        mediaUrl,
                        JSON.stringify(msg) // Contains updated reactions
                    ]);

                    totalUpdated++;
                    if (totalUpdated % 10 === 0) process.stdout.write('.');

                } catch (e) {
                    // console.warn(`Error processing file ${file}:`, e.message);
                }
            }
        }
        console.log('');
        console.log(`🏁 Sync complete! Found ${totalFound} changed files, Upserted ${totalUpdated} records.`);

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await pool.end();
    }
}

function getAllJsonFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllJsonFiles(filePath, fileList);
        } else {
            if (file.endsWith('.json')) fileList.push(filePath);
        }
    });
    return fileList;
}

migrateRecent();
