import { promises as fs } from 'fs'; // 🌿 Async FS
import path from 'path';
import { getPool } from './db.js';

export class MessageSyncer {
    constructor(basePath) {
        this.basePath = basePath;
        this.isRunning = false;
        this.totalFiles = 0;
        this.processedFiles = 0;
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.time('Sync');
        console.log('🔄 Starting Message Sync (Async & Non-Blocking)...');

        try {
            const pool = getPool();
            if (!pool) throw new Error('DB Not ready');

            await this.scanDirectory(this.basePath);
        } catch (e) {
            console.error('❌ Sync Error:', e);
        } finally {
            this.isRunning = false;
            console.timeEnd('Sync');
            console.log(`✅ Sync Complete. Processed ${this.processedFiles} files.`);
        }
    }

    async scanDirectory(dir) {
        try {
            // 🌿 Async Readdir
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    await this.processFile(fullPath);

                    // 🌿 CRITICAL: Yield to Event Loop every 50 files
                    // This prevents the server from freezing during heavy I/O
                    if (this.processedFiles % 50 === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                }
            }
        } catch (e) {
            // Ignore access errors etc
        }
    }

    async processFile(filePath) {
        try {
            // 🌿 Async Read
            const content = await fs.readFile(filePath, 'utf8');
            if (!content) return;

            const msg = JSON.parse(content);
            await this.ingestMessage(msg);
            this.processedFiles++;

            if (this.processedFiles % 2000 === 0) {
                console.log(`🔄 Synced ${this.processedFiles} messages...`);
            }
        } catch (e) {
            // console.warn(`Skipping corrupted file: ${filePath}`);
        }
    }

    async ingestMessage(msg) {
        const pool = getPool();
        if (!pool) return;

        // 1. Upsert Chat
        const chat = msg.chat;
        if (chat) {
            await pool.query(`
                INSERT INTO chats (id, title, username, type, last_updated)
                VALUES (?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    title = VALUES(title), 
                    username = VALUES(username);
            `, [chat.id, chat.title || chat.first_name || 'Unknown', chat.username || null, chat.type]);
        }

        // 2. Upsert User (From)
        const from = msg.from;
        if (from) {
            await pool.query(`
                INSERT INTO users (id, first_name, last_name, username, is_bot, language_code)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    first_name = VALUES(first_name),
                    username = VALUES(username);
            `, [from.id, from.first_name, from.last_name, from.username, from.is_bot ? 1 : 0, from.language_code]);
        }

        // 3. Upsert Message
        const chatId = msg.chat?.id || 0;
        const msgId = msg.message_id;
        const uniqueId = `${chatId}_${msgId}`; // Composite Key
        const date = new Date(msg.date * 1000);

        // Determine Type & Media
        let type = 'text';
        let mediaUrl = null;

        if (msg.photo) { type = 'photo'; mediaUrl = msg.url_photo || (Array.isArray(msg.photo) ? msg.photo[0].file_id : null); }
        else if (msg.voice) { type = 'voice'; mediaUrl = msg.url_voice; }
        else if (msg.video) { type = 'video'; mediaUrl = msg.url_video; }
        else if (msg.sticker) { type = 'sticker'; mediaUrl = msg.url_sticker; }
        else if (msg.audio) { type = 'audio'; mediaUrl = msg.url_audio; }
        else if (msg.document) { type = 'document'; mediaUrl = msg.url_document; }
        else if (msg.video_note) { type = 'video_note'; mediaUrl = msg.url_video_note; }

        await pool.query(`
            INSERT INTO messages (
                unique_id, message_id, chat_id, from_id, date, text, caption, type, media_url, reply_to_msg_id, raw_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text = VALUES(text),
                raw_data = VALUES(raw_data); -- Update if content changed
        `, [
            uniqueId,
            msgId,
            chatId,
            from?.id || null,
            date,
            msg.text || null,
            msg.caption || null,
            type,
            mediaUrl,
            msg.reply_to_message?.message_id || null,
            JSON.stringify(msg)
        ]);
    }
}
