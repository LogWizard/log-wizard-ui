import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { getPool } from './db.js';
import { ConfigManager } from '../config-manager.js';

/**
 * 🌿 Avatar Service
 * background worker that slowly fetches avatars for users who don't have them cached.
 */
export class AvatarService {
    constructor(appDirectory) {
        this.appDirectory = appDirectory;
        this.configManager = new ConfigManager(path.join(appDirectory, 'config.json'));
        this.isRunning = false;
        this.queue = new Set();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.processQueue();
        console.log('👤 Avatar Service started.');
    }

    addToQueue(userId) {
        this.queue.add(userId);
    }

    async processQueue() {
        if (!this.isRunning) return;

        try {
            const pool = getPool();
            if (!pool) {
                setTimeout(() => this.processQueue(), 1000);
                return;
            }

            // 1. Find users needing avatars (photo_url IS NULL)
            // Limit to 10 at a time to be kind to Telegram
            const [rows] = await pool.query(`
                SELECT id FROM users 
                WHERE photo_url IS NULL 
                AND is_bot = 0 
                ORDER BY updated_at DESC -- Priorities recently active
                LIMIT 10
            `);

            for (const row of rows) {
                await this.fetchAvatar(row.id);
                // 🌿 Throttle: 500ms between requests
                await new Promise(r => setTimeout(r, 500));
            }

        } catch (e) {
            console.error('AvatarService Error:', e);
        } finally {
            // Check again in 5 seconds
            setTimeout(() => this.processQueue(), 5000);
        }
    }

    async fetchAvatar(userId) {
        const pool = getPool();
        const avatarDir = path.join(this.appDirectory, 'public', 'avatars');
        if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
        const avatarFile = path.join(avatarDir, `${userId}.jpg`);
        const relativePath = `/avatars/${userId}.jpg`;

        // 1. Check local file first (maybe manually placed or old fetch)
        if (fs.existsSync(avatarFile)) {
            await pool.query('UPDATE users SET photo_url = ? WHERE id = ?', [relativePath, userId]);
            return;
        }

        // 2. Fetch from Telegram
        try {
            const paramsOnConfig = await this.configManager.read();
            const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token'];

            if (!token) return;

            const profileUrl = `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`;
            const response = await fetch(profileUrl);
            const data = await response.json();

            if (data.ok && data.result.total_count > 0) {
                const fileId = data.result.photos[0][0].file_id;
                const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                const fileData = await fileResp.json();

                if (fileData.ok) {
                    const filePath = fileData.result.file_path;
                    const photoUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

                    // Download
                    const imgRes = await fetch(photoUrl);
                    const arrayBuffer = await imgRes.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    fs.writeFileSync(avatarFile, buffer);

                    // Update DB with SUCCESS
                    await pool.query('UPDATE users SET photo_url = ? WHERE id = ?', [relativePath, userId]);
                    // console.log(`👤 Fetched avatar for ${userId}`);
                }
            } else {
                // No photo, mark as 'none' to stop retrying
                await pool.query('UPDATE users SET photo_url = ? WHERE id = ?', ['none', userId]);
            }

        } catch (e) {
            console.warn(`Failed to fetch avatar for ${userId}:`, e.message);
        }
    }
}
