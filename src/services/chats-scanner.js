
import fs from 'fs';
import path from 'path';

export class ChatsScanner {
    constructor(msgPath) {
        this.msgPath = msgPath;
        this.cacheFile = path.join(process.cwd(), 'chats_cache.json');
        this.chats = {}; // { chatId: { name, avatar, lastDate } }
    }

    async scan(forceFull = false) {
        console.log('🌿 Starting global chats scan (Flat Structure)...');
        try {
            // Load cache
            if (fs.existsSync(this.cacheFile) && !forceFull) {
                try {
                    this.chats = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                } catch (e) { console.error('Cache load error:', e); }
            }

            if (!fs.existsSync(this.msgPath)) {
                return {};
            }

            let dateFolders = fs.readdirSync(this.msgPath)
                .filter(f => /^\d{2}\.\d{2}\.\d{4}$/.test(f));

            // Sort newest first
            dateFolders.sort((a, b) => { // DD.MM.YYYY sort
                const [d1, m1, y1] = a.split('.');
                const [d2, m2, y2] = b.split('.');
                return new Date(`${y2}-${m2}-${d2}`) - new Date(`${y1}-${m1}-${d1}`);
            });

            // Limit scan for performance if cache exists (only scan recent dates)
            // But user wants ALL chats. 
            // Strategy: Scan ALL dates, but stop reading files if chat is already fully known? 
            // No, we might miss new chats.

            // To be fast, we read files in parallel with limits.

            for (const date of dateFolders) {
                const datePath = path.join(this.msgPath, date);

                // Get list of JSON files
                // Note: The folder contains FILES directly (123456.json)
                const files = fs.readdirSync(datePath).filter(f => f.endsWith('.json'));

                // Process in chunks to avoid blocking event loop
                // We just need to identify unique Chat IDs.

                // Optimization: Maybe we don't need to read ALL files.
                // But we don't know which file belongs to which chat without reading (or guessing from filename).
                // Let's read them.

                for (const file of files) {
                    try {
                        // Quick async read
                        const content = fs.readFileSync(path.join(datePath, file), 'utf8');
                        const msg = JSON.parse(content);

                        // Extract chat info
                        if (msg.chat && msg.chat.id) {
                            const chatId = msg.chat.id.toString();

                            if (!this.chats[chatId]) {
                                // New chat found
                                this.chats[chatId] = {
                                    id: chatId,
                                    name: msg.chat.title || (msg.chat.first_name ? `${msg.chat.first_name} ${msg.chat.last_name || ''}`.trim() : chatId),
                                    type: msg.chat.type,
                                    lastDate: date, // Keep track of latest activity
                                    lastMessage: {
                                        time: msg.date,
                                        text: msg.text || (msg.caption ? '[Media]' : '[Message]')
                                    }
                                };
                            } else {
                                // Existing chat - update lastDate if this date is newer (we iterate newest dates first, so usually current is newest)
                                // But we scan dates desc, so yes.
                                // Update name if missing
                                if ((!this.chats[chatId].name || this.chats[chatId].name.startsWith(chatId)) && msg.chat.first_name) {
                                    this.chats[chatId].name = `${msg.chat.first_name} ${msg.chat.last_name || ''}`.trim();
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore corrupted files
                    }
                }
                // console.log(`  Scanned ${date} (${files.length} files)`);
            }

            // Save cache
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.chats, null, 2));
            console.log(`✅ Scan complete. Found ${Object.keys(this.chats).length} chats.`);
            return this.chats;

        } catch (err) {
            console.error('Scan error:', err);
            return this.chats;
        }
    }

    getCached() {
        if (fs.existsSync(this.cacheFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            } catch (e) { return {}; }
        }
        return {};
    }
}
