import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

// Simple DB Config (Hardcoded as per user env for script)
const dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'Pasha0407!',
    database: 'log_wizard'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // scripts/
const appRoot = path.resolve(__dirname, '..'); // root

// Hardcoded path to messages folder
// Adjust this if your 'messages' folder is elsewhere
const MESSAGES_ROOT = path.join(appRoot, 'messages');

async function migrate() {
    console.log('🦆 Starting Migration Duck...');
    const pool = mysql.createPool(dbConfig);

    try {
        await pool.query('SELECT 1');
        console.log('🔌 DB Connected');

        if (!fs.existsSync(MESSAGES_ROOT)) {
            console.error(`❌ Messages folder not found at ${MESSAGES_ROOT}`);
            return;
        }

        const dateFolders = fs.readdirSync(MESSAGES_ROOT);
        let totalProcessed = 0;
        let totalInserted = 0;

        for (const dateFolder of dateFolders) {
            const datePath = path.join(MESSAGES_ROOT, dateFolder);
            if (!fs.statSync(datePath).isDirectory()) continue;

            console.log(`📂 Scanning date: ${dateFolder}`);

            // Should be folders or files.
            // Structure: messages/DD.MM.YYYY/ChatID/ChatID_MsgID.json OR messages/DD.MM.YYYY/ChatID_MsgID.json (Legacy)
            // Recursive walk helper needed
            const files = getAllJsonFiles(datePath);

            for (const file of files) {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    const msg = JSON.parse(content);

                    if (!msg.message_id || !msg.chat || !msg.chat.id) continue;

                    totalProcessed++;

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

                    // Insert IGNORE to skip existing
                    const [res] = await pool.query(`
                        INSERT IGNORE INTO messages (message_id, chat_id, from_id, date, text, caption, type, media_url, raw_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        msg.message_id,
                        msg.chat.id,
                        msg.from?.id || 0,
                        new Date(msg.date * 1000),
                        text,
                        msg.caption || null,
                        type,
                        mediaUrl,
                        JSON.stringify(msg)
                    ]);

                    if (res.affectedRows > 0) {
                        totalInserted++;
                        process.stdout.write('.');
                    }
                } catch (e) {
                    // console.warn(`Error processing file ${file}:`, e.message);
                }
            }
            console.log(''); // newline
        }

        console.log(`🏁 Migration complete! Scanned ${totalProcessed}, Inserted ${totalInserted} new messages.`);

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

migrate();
