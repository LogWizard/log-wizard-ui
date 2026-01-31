// Підключаємо необхідні модулі
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import cors_proxy from 'cors-anywhere';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { ConfigManager } from './config-manager.js';
import { sendMessage, sendPhoto, sendVideo, sendAudio, sendVoice, sendSticker, sendVideoNote, sendVoiceNote, setReaction, deleteMessage, editMessage } from './api/send-message.js';
import { upload, uploadFile } from './api/upload.js';
import { getManualMode, setManualMode, getAllManualModes } from './api/manual-mode.js';
import { ChatsScanner } from './services/chats-scanner.js';
import { StatsService } from './services/stats-service.js'; // 🌿 Stats
import { initDB, getPool, getStickerSets, addStickerSet } from './services/db.js'; // 🌿 DB Service
import { MessageSyncer } from './services/sync-service.js'; // 🌿 Sync Service
import { AvatarService } from './services/avatar-service.js'; // 🌿 Avatar Service
import fetch from 'node-fetch'; // Ensure fetch is available

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appDirectory, '.env') });
dotenv.config({ path: path.join(appDirectory, '..', 'ks_gys_bot', '.env'), override: false });
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

const options = {
    key: fs.readFileSync(path.join(appDirectory, 'src', 'privatekey.pem')),
    cert: fs.readFileSync(path.join(appDirectory, 'src', 'certificate.pem'))
};

const app = express();
const server = https.createServer(options, app);

const serverConfig = configManager.read();
const BOT_TOKEN = process.env.BOT_TOKEN || serverConfig['Bot Token'] || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let userDbPool = null;
const getUserDbPool = async () => {
    if (userDbPool) return userDbPool;
    const host = process.env.BOTDB_HOST || process.env.USER_DB_HOST || process.env.DB_HOST;
    const port = parseInt(process.env.BOTDB_PORT || process.env.USER_DB_PORT || process.env.DB_PORT || '3306', 10);
    const user = process.env.BOTDB_USER || process.env.USER_DB_USER || process.env.DB_USER;
    const password = process.env.BOTDB_PASSWORD || process.env.USER_DB_PASSWORD || process.env.DB_PASSWORD;
    const database = process.env.BOTDB_NAME || process.env.USER_DB_NAME || process.env.DB_NAME;

    if (!host || !user || !database) {
        console.warn('⚠️ Bot DB not configured (missing BOTDB_HOST/USER/NAME)');
        return null;
    }

    console.log('🌿 Connecting to Bot DB...', { host, port, user, database });

    try {
        userDbPool = mysql.createPool({
            host,
            port,
            user,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 5,
            multipleStatements: true
        });
        // Test connection
        const conn = await userDbPool.getConnection();
        conn.release();
        console.log('✅ Bot DB connected successfully!');
    } catch (err) {
        console.error('❌ Bot DB connection failed:', err.message);
        userDbPool = null;
        return null;
    }

    return userDbPool;
};

const getFileUrlById = async (fileId) => {
    if (!BOT_TOKEN || !fileId) return null;
    try {
        const fileRes = await fetch(`${TELEGRAM_API}/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId })
        });
        const fileData = await fileRes.json();
        const filePath = fileData?.result?.file_path;
        if (!filePath) return null;
        return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    } catch (e) {
        return null;
    }
};

app.use(express.json());
async function readConfigPrams() { return configManager.read(); }
const getIPv4FromIPV6 = (ipAddress) => {
    const ipv6Pattern = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
    const match = ipAddress.match(ipv6Pattern);

    if (match) {
        return match[1]; // Повертаємо частину адреси після "::ffff:"
    }

    return ipAddress; // Якщо адреса не відповідає формату, повертаємо її без змін
};
export async function createMessageServer() {


    // 🌿 Config & Args Parsing (Restored)
    let MSG_PATH = "";
    let port = "";
    let corsServerPort = "";
    let logStr = "http";

    const args = process.argv.slice(2);
    const params = {};
    for (const arg of args) {
        const [key, value] = arg.split('=');
        params[key] = value;
    }

    if (Object.keys(params).length !== 0) {
        MSG_PATH = params['path'] ? params['path'] : `D:/OSPanel/domains/kyivstar-nelegal-it-community.com.ua/Node_Home/GitHub/ks_gys_bot/messages`;
        port = params['port'] ? params['port'] : `3003`;
        corsServerPort = params['corsServerPort'] ? params['corsServerPort'] : '3004';
    } else {
        const paramsOnConfig = await readConfigPrams();
        port = paramsOnConfig['Listening Port'];
        MSG_PATH = paramsOnConfig['Listening Path'];
        corsServerPort = paramsOnConfig['Cors Server Port'];
    }

    /* 🌿 CORS Anywhere disabled - not needed anymore
    cors_proxy.createServer({
        originWhitelist: [],
        requireHeader: ['origin', 'x-requested-with'],
        removeHeaders: ['cookie', 'cookie2']
    }).listen(corsServerPort, function () {
        console.log(`Server CORS Anywhere started on port ${corsServerPort}`);
    });
    */

    // 🌿 Init DB & Services (Background)
    await initDB();

    if (MSG_PATH) {
        // 🌿 Disabled Sync as user requested (using Direct DB now)
        // const syncer = new MessageSyncer(MSG_PATH);
        // syncer.start().catch(e => console.error('Sync error:', e));

        const avatarService = new AvatarService(appDirectory);
        avatarService.start();
    }

    let refreshOffset = 0;
    const refreshBatchSize = 200;
    const refreshIntervalMs = 105 * 60 * 1000;
    const refreshRecentMediaUrls = async () => {
        if (!BOT_TOKEN) return;
        const pool = getPool();
        if (!pool) return;

        try {
            const [rows] = await pool.query(`
                SELECT unique_id, raw_data, type, media_url
                FROM messages
                WHERE date >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND type IN ('photo','video','audio','voice','video_note','sticker','animation')
                ORDER BY date DESC
                LIMIT ? OFFSET ?
            `, [refreshBatchSize, refreshOffset]);

            if (!rows || rows.length === 0) {
                refreshOffset = 0;
                return;
            }

            for (const row of rows) {
                let msg = row.raw_data;
                if (!msg) continue;
                if (typeof msg === 'string') {
                    try { msg = JSON.parse(msg); } catch { continue; }
                }

                const fileId =
                    msg?.photo?.length ? msg.photo[msg.photo.length - 1].file_id :
                        msg?.video?.file_id ||
                        msg?.audio?.file_id ||
                        msg?.voice?.file_id ||
                        msg?.video_note?.file_id ||
                        msg?.sticker?.file_id ||
                        msg?.animation?.file_id ||
                        null;

                if (!fileId) continue;

                const url = await getFileUrlById(fileId);
                if (!url) continue;

                if (msg.photo?.length) msg.url_photo = url;
                if (msg.video) msg.url_video = url;
                if (msg.audio) msg.url_audio = url;
                if (msg.voice) msg.url_voice = url;
                if (msg.video_note) msg.url_video_note = url;
                if (msg.sticker) msg.url_sticker = url;
                if (msg.animation) msg.url_animation = url;

                await pool.query(
                    `UPDATE messages SET raw_data = ?, media_url = ? WHERE unique_id = ?`,
                    [JSON.stringify(msg), url, row.unique_id]
                );
            }

            refreshOffset += refreshBatchSize;
        } catch (e) {
            console.error('Media URL refresh error:', e.message);
        }
    };

    setInterval(refreshRecentMediaUrls, refreshIntervalMs);
    let folderPath = path.join(MSG_PATH, new Date().toLocaleDateString('uk-UA'), '/');

    /* Manual Mode API 🌿 */
    app.get('/api/get-manual-mode', getManualMode);
    app.post('/api/set-manual-mode', setManualMode);

    /* Api Settings */
    app.post('/api/v1/getSettings', async (req, res) => {
        const response = await readConfigPrams();
        await getDirectories(folderPath)
            .then((directories) => {
                if (directories) {
                    response.groups = directories;
                }
            })
            .catch((error) => console.error('getSettingsApi: ' + error));

        console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} POST`);

        res.status(200).send(response);
    });
    app.post('/api/v1/setSettings', async (req, res) => {
        const data = req.body;
        const selectedDate = formatDate(data.Date) ? formatDate(data.Date) : new Date().toLocaleDateString('uk-UA');
        const ipAddress = getIPv4FromIPV6(req.header('x-forwarded-for') || req.socket.remoteAddress);
        // console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} || ${ipAddress} POST\nbody:\n${JSON.stringify(data, null, 2)}`);
        writeConfigPrams(data);
        if (data['Listening Path']) {
            folderPath = path.join(data['Listening Path'], selectedDate);
        }

        if (data.group) {
            if (data.group !== 'allPrivate') {
                folderPath = path.join(folderPath, data.group);
            }
        }
        res.status(200).send({ success: true });
    });
    /* Api Settings */

    // 🌿 Message Sending APIs
    app.post('/api/send-message', sendMessage);
    app.post('/api/send-photo', sendPhoto);
    app.post('/api/send-video', sendVideo);
    app.post('/api/send-audio', sendAudio);
    app.post('/api/send-voice', sendVoice);
    app.post('/api/send-sticker', sendSticker);
    app.post('/api/send-video-note', sendVideoNote);
    app.post('/api/send-voice-note', sendVoiceNote);
    app.post('/api/set-reaction', setReaction);

    // 🌿 File URL Resolver
    app.get('/api/file-url/:fileId', async (req, res) => {
        const { fileId } = req.params;
        const url = await getFileUrlById(fileId);
        if (!url) return res.status(404).json({ error: 'File not found' });
        res.json({ url });
    });

    // 🌿 User profile from DB
    app.get('/api/user/:id', async (req, res) => {
        try {
            const tgId = req.params.id;

            // Спочатку шукаємо в БД бота по tg_id
            const userDb = await getUserDbPool();
            if (userDb) {
                try {
                    const [rows] = await userDb.query('SELECT * FROM users WHERE tg_id = ? LIMIT 1', [tgId]);
                    if (rows && rows.length > 0) {
                        const u = rows[0];
                        // Маппимо поля для фронту з нормальними лейблами
                        return res.json({
                            id: u.tg_id,
                            first_name: u.LastFirsNames || u.username,
                            real_name: u.name,
                            username: u.username,
                            'Пошта': u.email,
                            'XRM Логін': u.xrm_login,
                            'Баланс': u.balans,
                            'Авторизація': u.auth,
                            'SGE Авторизація': u.sge_auth
                        });
                    }
                } catch (e) {
                    console.error('User DB query error:', e.message);
                }
            }

            // Fallback на основну БД
            const pool = getPool();
            if (!pool) return res.status(503).json({ error: 'DB not ready' });
            const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [tgId]);
            if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
            res.json(rows[0]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 🌿 Sticker Sets API
    app.get('/api/sticker-sets', async (req, res) => {
        try {
            const sets = await getStickerSets();
            res.json(sets);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/sticker-sets/import', async (req, res) => {
        const { setName } = req.body || {};
        if (!setName) return res.status(400).json({ error: 'setName is required' });
        try {
            await addStickerSet(setName);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sticker-sets/:name', async (req, res) => {
        const { name } = req.params;
        if (!BOT_TOKEN) return res.status(500).json({ error: 'Bot token not configured' });

        try {
            const response = await fetch(`${TELEGRAM_API}/getStickerSet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await response.json();
            if (!data.ok) throw new Error(data.description || 'Failed to load sticker set');

            const stickers = await Promise.all((data.result.stickers || []).map(async (sticker) => {
                const previewId = sticker.thumbnail?.file_id || sticker.file_id;
                let url = null;
                try {
                    const fileRes = await fetch(`${TELEGRAM_API}/getFile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_id: previewId })
                    });
                    const fileData = await fileRes.json();
                    const filePath = fileData?.result?.file_path;
                    if (filePath) url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
                } catch (e) {
                    url = null;
                }
                return {
                    file_id: sticker.file_id,
                    file_unique_id: sticker.file_unique_id,
                    emoji: sticker.emoji,
                    url,
                    is_animated: Boolean(sticker.is_animated),
                    is_video: Boolean(sticker.is_video)
                };
            }));

            res.json({ name: data.result.name, title: data.result.title, stickers });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 🌿 File Upload API (CRITICAL - Was missing!)
    app.post('/api/upload', upload.single('file'), uploadFile);

    // 🌿 Edit & Delete Actions
    app.post('/api/delete-message', deleteMessage);
    app.post('/api/edit-message', editMessage);


    /* Цей роутер відповідає за get запитів /message */
    app.get('/messages', async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json([]);

        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const sinceParam = Number.parseInt(urlObj.searchParams.get('since')) || 0;
            const limitParam = Number.parseInt(urlObj.searchParams.get('limit')); // 🌿 Limit support
            const dateStr = urlObj.searchParams.get('date');
            const group = urlObj.searchParams.get('group');
            // 🌿 Archive Flag
            const includeArchive = urlObj.searchParams.get('include_archive') === 'true';

            let tableName = 'messages';
            let query = `
                SELECT m.*, u.photo_url as from_photo_url, u.first_name, u.last_name, u.username
                FROM ${tableName} m
                LEFT JOIN users u ON m.from_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (includeArchive) {
                query = `
                    SELECT m.*, u.photo_url as from_photo_url, u.first_name, u.last_name, u.username
                    FROM messages m
                    LEFT JOIN users u ON m.from_id = u.id
                    WHERE 1=1
                 `;
            }

            // 1. Group / Chat ID Filter
            if (group && group !== 'allPrivate') {
                const chatId = group;
                query += ` AND chat_id = ?`;
                params.push(chatId);
            }

            // 2. Date Filter
            if (dateStr) {
                const [d, m, y] = dateStr.split('.').map(Number);
                if (d && m && y) {
                    const startDate = new Date(y, m - 1, d, 0, 0, 0);
                    const endDate = new Date(y, m - 1, d, 23, 59, 59);
                    query += ` AND date >= ? AND date <= ?`;
                    params.push(startDate, endDate);
                }
            }

            // 3. Since ID
            if (sinceParam) {
                query += ` AND message_id > ?`;
                params.push(sinceParam);
            }

            // 4. Sort & Limit 🌿
            if (limitParam) {
                // Fetch LATEST messages (Newest first)
                query += ` ORDER BY date DESC, message_id DESC LIMIT ${limitParam}`;
            } else {
                // Legacy: Fetch OLDEST messages (Chronological) - usually for full date range
                query += ` ORDER BY date ASC, message_id ASC LIMIT 500`;
            }

            let [rows] = await pool.query(query, params);

            // 🌿 Fetch from Archive if requested and merge
            if (includeArchive) {
                let archiveQuery = `
                    SELECT m.*, u.photo_url as from_photo_url, u.first_name, u.last_name, u.username
                    FROM messages_archive m
                    LEFT JOIN users u ON m.from_id = u.id
                    WHERE 1=1
                `;
                const archiveParams = [];

                if (group && group !== 'allPrivate') {
                    archiveQuery += ` AND chat_id = ?`;
                    archiveParams.push(group);
                }
                if (dateStr) {
                    const [d, m, y] = dateStr.split('.').map(Number);
                    const startDate = new Date(y, m - 1, d, 0, 0, 0);
                    const endDate = new Date(y, m - 1, d, 23, 59, 59);
                    archiveQuery += ` AND date >= ? AND date <= ?`;
                    archiveParams.push(startDate, endDate);
                }
                if (sinceParam) {
                    archiveQuery += ` AND message_id > ?`;
                    archiveParams.push(sinceParam);
                }

                if (limitParam) {
                    archiveQuery += ` ORDER BY date DESC, message_id DESC LIMIT ${limitParam}`;
                } else {
                    archiveQuery += ` ORDER BY date ASC, message_id ASC LIMIT 500`;
                }

                const [archiveRows] = await pool.query(archiveQuery, archiveParams);
                // Combine and Deduplicate (Priority to 'messages' table) 🌿
                const messageMap = new Map();
                // Add archive first (lower priority)
                archiveRows.forEach(r => messageMap.set(r.unique_id, r));
                // Add main table (will overwrite archive if ID matches)
                rows.forEach(r => messageMap.set(r.unique_id, r));

                rows = Array.from(messageMap.values());
            }

            // 5. Final Sort 🌿
            if (limitParam) {
                // Sort by date DESC for limit slice
                rows.sort((a, b) => new Date(b.date) - new Date(a.date));
                if (rows.length > limitParam) rows = rows.slice(0, limitParam);
                // Reverse to ASC (Chronological) for frontend
                rows.reverse();
            } else {
                // Default ASC sort
                rows.sort((a, b) => new Date(a.date) - new Date(b.date));
            }

            // 5. Transform for Frontend
            res.set('Cache-Control', 'no-store');
            const messages = rows.map(row => {
                // Use raw_data if available for full fidelity, else construct
                let msg = row.raw_data;
                if (typeof msg === 'string') msg = JSON.parse(msg);
                if (!msg) {
                    // Fallback if raw_data missing
                    msg = {
                        message_id: row.message_id,
                        chat: { id: row.chat_id },
                        from: { id: row.from_id },
                        date: new Date(row.date).getTime() / 1000,
                        text: row.text
                    };
                }

                // 🌿 Enrich `from` with server-side user data (including photo_url)
                if (!msg.from) msg.from = {};
                // Ensure from.id exists from row data if not in raw_data
                if (!msg.from.id && row.from_id) msg.from.id = row.from_id;

                // Use cached avatar if available, otherwise trigger fetch
                if (row.from_photo_url && row.from_photo_url !== 'none' && msg.from.id) {
                    const avatarPath = path.join(appDirectory, 'public', 'avatars', `${msg.from.id}.jpg`);
                    msg.from.photo_url = fs.existsSync(avatarPath)
                        ? `/avatars/${msg.from.id}.jpg`
                        : `/api/avatar-image/${msg.from.id}`;
                } else {
                    msg.from.photo_url = 'none';
                }
                msg.from.first_name = msg.from.first_name || row.first_name;
                msg.from.last_name = msg.from.last_name || row.last_name;
                msg.from.username = msg.from.username || row.username;

                // Ensure time is Date object for frontend logic if needed (or keep timestamp)
                // Frontend expects `time` as Date object in current legacy code?
                // Let's check legacy: `time: new Date(message.date * 1000)`
                msg.time = new Date(msg.date * 1000);

                // 🌿 Url Replaser logic is already mostly in raw_data, 
                // but we might need to re-run it if we want fresh links? 
                // For now, return as is.
                return msg;
            });

            res.json(messages);

        } catch (err) {
            console.error(`DB Message Error: ${err}`);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    });
    /* Цей роутер відповідає за get запитів /message */

    // 🌿 ALL CHATS API
    // Scanner initialized below

    // 🌿 ALL CHATS API (DB-Backed ⚡)
    // 🌿 ALL CHATS API (DB-Backed ⚡) with Archive Support
    app.get('/api/get-all-chats', async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json([]);

        const includeArchive = req.query.include_archive === 'true';

        try {
            // Fetch chats sorted by last update
            const [rows] = await pool.query(`
                SELECT * FROM chats 
                ORDER BY last_updated DESC
            `);

            // 🌿 Advanced: Get last message for each chat to show preview
            const chatsWithLastMsg = await Promise.all(rows.map(async (chat) => {
                let lastMsg = null;

                // 1. Try Main Table
                const [msgs] = await pool.query(`
                    SELECT * FROM messages 
                    WHERE chat_id = ? 
                    ORDER BY date DESC 
                    LIMIT 1
                `, [chat.id]);

                if (msgs && msgs.length > 0) {
                    lastMsg = {
                        time: msgs[0].date,
                        text: msgs[0].text || (msgs[0].caption ? '📷 ' + msgs[0].caption : (msgs[0].type !== 'text' ? '[' + msgs[0].type + ']' : ''))
                    };
                }

                // 2. Try Archive Table (if enabled and not found in main)
                if (!lastMsg && includeArchive) {
                    try {
                        const [archMsgs] = await pool.query(`
                            SELECT * FROM messages_archive 
                            WHERE chat_id = ? 
                            ORDER BY date DESC 
                            LIMIT 1
                        `, [chat.id]);

                        if (archMsgs && archMsgs.length > 0) {
                            lastMsg = {
                                time: archMsgs[0].date,
                                text: '📦 ' + (archMsgs[0].text || (archMsgs[0].caption ? '📷 ' + archMsgs[0].caption : 'Archive Message'))
                            };
                        }
                    } catch (e) { /* ignore if table doesn't exist yet */ }
                }

                // 🌿 Filter Logic: Hide chat if no messages and archive is OFF
                // 3. Hide if no messages and archive not enabled
                if (!lastMsg && !includeArchive) {
                    return null; // Filter this out
                }

                // 🌿 Fetch user photo_url for private chats
                let photoUrl = 'none';
                const chatIdStr = String(chat.id);
                if (!chatIdStr.startsWith('-')) {
                    // Private chat - check if we have cached avatar first
                    const avatarPath = path.join(appDirectory, 'public', 'avatars', `${chat.id}.jpg`);
                    if (fs.existsSync(avatarPath)) {
                        photoUrl = `/avatars/${chat.id}.jpg`; // 🌿 Direct cached path
                    } else {
                        // Check DB to see if we should try fetching
                        const [userRows] = await pool.query(`
                            SELECT photo_url FROM users WHERE id = ? LIMIT 1
                        `, [chat.id]);

                        if (userRows && userRows.length > 0 && userRows[0].photo_url && userRows[0].photo_url !== 'none') {
                            photoUrl = `/api/avatar-image/${chat.id}`; // 🌿 Will trigger caching on first load
                        }
                    }
                }


                return {
                    id: chat.id.toString(), // Ensure string for JS
                    name: chat.title || chat.username || 'Unknown',
                    type: chat.type,
                    photo: photoUrl, // 🌿 Use fetched photo_url
                    lastMessage: lastMsg || { time: chat.last_updated, text: 'History' },
                    lastDate: lastMsg?.time || chat.last_updated
                };
            }));

            // Filter out nulls (hidden chats)
            res.json(chatsWithLastMsg.filter(c => c !== null));
        } catch (e) {
            console.error('API Error:', e);
            res.status(500).json([]);
        }
    });

    // 🌿 STATS API
    app.get('/api/stats', async (req, res) => {
        try {
            const days = parseInt(req.query.days) || 7;
            const statsService = new StatsService(MSG_PATH);
            const stats = await statsService.generateStats(days);
            res.json(stats);
        } catch (e) {
            console.error('Stats Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    /* Цей роутер відповідає за обробку запиту /chat */
    app.get('/chat', async (req, res) => {
        // console.log(__dirname); // 🌿 Removed verbose logging
        const filePath = path.join(appDirectory, '/public/index.html');
        // console.log(filePath); // 🌿 Removed verbose logging
        try {
            const data = await fs.promises.readFile(filePath);
            res.set('Cache-Control', 'no-store'); // 🌿 Force fresh load
            res.status(200).send(data.toString());
        } catch (err) {
            res.status(404).send();
        }
    });
    /* Цей роутер відповідає за обробку запиту /chat */

    /* Цей роутер відповідає за обробку всіх інших запитів */
    // 🌿 Sticker API Routes

    // 1. Get All Sticker Sets (from DB)
    app.get('/api/sticker-sets', async (req, res) => {
        const sets = await getStickerSets();
        res.json(sets);
    });

    // 2. Import Sticker Set (to DB)
    app.post('/api/sticker-sets/import', async (req, res) => {
        const { setName, title } = req.body;
        if (!setName) return res.status(400).json({ error: 'Name required' });

        try {
            // Validate with Telegram first
            const paramsOnConfig = await configManager.read();
            const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token']; // Try all sources

            const url = `https://api.telegram.org/bot${token}/getStickerSet?name=${setName}`;
            const check = await fetch(url);
            const data = await check.json();

            if (!data.ok) return res.status(400).json({ error: 'Telegram: ' + data.description });

            // Add to DB
            await addStickerSet(setName, title || data.result.title);
            res.json({ success: true, set: data.result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Get Stickers from Telegram (Proxy)
    app.get('/api/stickers/:setName', async (req, res) => {
        try {
            const { setName } = req.params;
            const paramsOnConfig = await configManager.read();
            const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token']; // Try all sources

            if (!token) {
                console.error('❌ No Bot Token found for stickers!');
                return res.status(500).json({ error: 'Server Config Error: No Bot Token' });
            }

            const url = `https://api.telegram.org/bot${token}/getStickerSet?name=${setName}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!data.ok) {
                console.warn(`⚠️ Telegram Error for set ${setName}:`, data.description);
                return res.status(400).json({ error: data.description });
            }
            res.json(data.result);
        } catch (error) {
            console.error('Sticker Set Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 4. Sticker Image Proxy
    app.get('/api/sticker-image/:fileId', async (req, res) => {
        try {
            const { fileId } = req.params;
            const paramsOnConfig = await configManager.read();
            const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token'];

            // 1. Get File Path
            const pathResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
            const pathData = await pathResp.json();

            if (!pathData.ok || !pathData.result.file_path) {
                return res.status(404).send('File not found');
            }

            // 2. Fetch Image Stream
            const imageUrl = `https://api.telegram.org/file/bot${token}/${pathData.result.file_path}`;
            const imageResp = await fetch(imageUrl);

            // Pipe to response
            const ext = path.extname(pathData.result.file_path);
            let contentType = 'image/webp';
            if (ext === '.tgs') contentType = 'application/json'; // Lottie
            if (ext === '.webm') contentType = 'video/webm';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');

            if (imageResp.body && imageResp.body.pipe) {
                imageResp.body.pipe(res);
            } else {
                const buffer = await imageResp.arrayBuffer();
                res.send(Buffer.from(buffer));
            }

        } catch (error) {
            console.error('Sticker Image Error:', error);
            res.status(500).send();
        }
    });

    // 🌿 Avatar Image Proxy with Physical Caching
    app.get('/api/avatar-image/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const avatarPath = path.join(appDirectory, 'public', 'avatars', `${userId}.jpg`);

            // 1. Check if cached file exists
            if (fs.existsSync(avatarPath)) {
                console.log(`✅ Serving cached avatar for user ${userId}`);
                return res.sendFile(avatarPath);
            }

            const pool = getPool();
            if (!pool) return res.status(404).send();

            // 2. Check cooldown for users without avatars
            const [userRows] = await pool.query(`
                SELECT avatar_cached, last_avatar_check, photo_url 
                FROM users WHERE id = ? LIMIT 1
            `, [userId]);

            if (userRows && userRows.length > 0) {
                const user = userRows[0];
                const now = Math.floor(Date.now() / 1000);
                const COOLDOWN_DAYS = 7;
                const cooldownPassed = (now - user.last_avatar_check) > (COOLDOWN_DAYS * 24 * 60 * 60);

                // If checked recently and no avatar, skip TG API call
                if (user.avatar_cached === 0 && !cooldownPassed) {
                    console.log(`⏰ Cooldown active for user ${userId}, skipping TG API`);
                    return res.status(404).send();
                }

                // 3. Fetch from Telegram API
                console.log(`🔍 Fetching avatar from Telegram for user ${userId}`);

                const paramsOnConfig = await configManager.read();
                const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'];

                if (!token) {
                    console.error('❌ No Bot Token found!');
                    return res.status(500).send();
                }

                // Try to use existing photo_url first
                let photoUrl = user.photo_url;

                // If no photo_url in DB, try getUserProfilePhotos
                if (!photoUrl || photoUrl === 'none') {
                    const photosResp = await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`);
                    const photosData = await photosResp.json();

                    if (!photosData.ok || photosData.result.total_count === 0) {
                        // No avatar - update cooldown
                        await pool.query(`
                            UPDATE users SET avatar_cached = 0, last_avatar_check = ? WHERE id = ?
                        `, [now, userId]);
                        console.log(`❌ No avatar for user ${userId}, cooldown set`);
                        return res.status(404).send();
                    }

                    // Get file_id of the largest photo
                    const photos = photosData.result.photos[0];
                    const largestPhoto = photos[photos.length - 1];
                    const fileId = largestPhoto.file_id;

                    // Get file path
                    const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                    const fileData = await fileResp.json();

                    if (!fileData.ok) throw new Error('Failed to get file path');

                    photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
                }

                // Download and save avatar
                const avatarResp = await fetch(photoUrl);
                if (!avatarResp.ok) throw new Error('Failed to download avatar');

                const buffer = await avatarResp.arrayBuffer();
                fs.writeFileSync(avatarPath, Buffer.from(buffer));

                // Update DB
                await pool.query(`
                    UPDATE users SET avatar_cached = 1, last_avatar_check = ? WHERE id = ?
                `, [now, userId]);

                console.log(`✅ Avatar cached for user ${userId}`);

                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(Buffer.from(buffer));
            }

            res.status(404).send();
        } catch (error) {
            console.error('Avatar fetch error:', error);
            res.status(404).send();
        }
    });

    // 🌿 Auto-Refresh Media URL (New!)
    app.get('/api/refresh-file-url', async (req, res) => {
        try {
            const { file_id } = req.query;
            if (!file_id) return res.status(400).json({ error: 'file_id required' });

            const paramsOnConfig = await configManager.read();
            const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token'];

            if (!token) return res.status(500).json({ error: 'No Bot Token' });

            // Call Telegram API
            const pathResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${file_id}`);
            const pathData = await pathResp.json();

            if (!pathData.ok) {
                return res.status(400).json({ error: pathData.description });
            }

            const newUrl = `https://api.telegram.org/file/bot${token}/${pathData.result.file_path}`;
            res.json({ url: newUrl });

        } catch (error) {
            console.error('Refresh URL Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 🌿 Static Files (Avatars) - Serve cached avatars
    app.use('/avatars', express.static(path.join(appDirectory, 'public', 'avatars')));

    // 🌿 Static Files (Uploads) - Fixes 404 & Encoding issues automatically
    app.use('/uploads', express.static(path.join(appDirectory, 'public', 'uploads')));

    // 🌿 Static Files (Assets)
    app.use(express.static(path.join(appDirectory, 'public')));

    app.get(/^\/(css|fonts|js)\//i, (req, res) => {
        // Use req.path to ignore query parameters like ?v=2 🌿
        const filePath = path.join(appDirectory, 'public', req.path);
        const fileExtension = path.extname(filePath);
        const contentType = fileTypes[fileExtension] || 'application/octet-stream';
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.status(404).send();
                } else { // Server error.
                    res.status(500).send(`Server error: ${err.code}`);
                }
            } else {
                res.status(200).type(contentType).send(content);
            }
        });
    });
    /* Цей роутер відповідає за обробку всіх інших запитів */

    /* from use https server */
    server.listen(port, () => {
        logStr = 'https://';
        console.log(`Express server started on port ${port}`);
    });
    /* from use https server */

    /* from use http server - 🌿 Enabled for Vite dev compatibility */
    app.listen(3333, () => {
        console.log(`HTTP Express server started on port 3333`);
    });
    /* from use http server */


    async function writeConfigPrams(params) {
        const configData = configManager.read();
        Object.assign(configData, params);
        configManager.write(configData);
    }
    function formatDate(date, time = false, tHour = false) {
        let d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear(),
            hour = '' + d.getHours(),
            minutes = '' + d.getMinutes(),
            seconds = '' + d.getSeconds();
        if (month.length < 2)
            month = '0' + month;

        if (day.length < 2)
            day = '0' + day;

        if (hour.length < 2)
            hour = '0' + hour;

        if (minutes.length < 2)
            minutes = '0' + minutes;

        if (seconds.length < 2)
            seconds = '0' + seconds;
        if (tHour) {
            return `${[hour, minutes].join(':')}`;
        }
        if (time) {
            return `${[day, month, year].join('.')} ${[hour, minutes, seconds].join(':')}`;
        } else {
            return `${[day, month, year].join('.')}`;
        }

    }
    async function getDirectories(path) {
        if (fs.existsSync(path)) {
            const entries = await fsp.readdir(path, { withFileTypes: true });
            const directories = entries.filter((entry) => entry.isDirectory());
            return directories.map((directory) => directory.name);
        }
    }
    async function urlReplaser(obj) {
        const paramsOnConfig = await configManager.read();
        const token = process.env.BOT_TOKEN || paramsOnConfig['Bot Token'] || paramsOnConfig['token'];

        // Debug 🌿
        const hasSticker = !!obj.sticker;
        const hasPhoto = !!obj.photo;
        const file_id = await findFileId(obj);

        if ((hasSticker || hasPhoto) && !obj.url_sticker && !obj.url_photo) {
            // console.log(`🔍 urlReplaser: sticker=${hasSticker}, photo=${hasPhoto}, file_id=${file_id ? 'YES' : 'NO'}, token=${token ? 'YES' : 'NO'}`);
        }

        // Check if we have existing url_* field to refresh
        const regex = /\"url_.+?\"/;
        const match = JSON.stringify(obj).match(regex);

        if (match) {
            // Existing url field - refresh it
            if (file_id && token) {
                try {
                    const newUrl = await getFileUrl(token, file_id);
                    const urlKey = match[0].replaceAll('"', '');
                    obj[urlKey] = newUrl;
                } catch (e) {
                    console.warn('Failed to refresh URL:', e.message);
                }
            }
            return obj;
        }

        // No url_* field - try to create one from file_id 🌿
        if (token && file_id) {
            try {
                const newUrl = await getFileUrl(token, file_id);
                // console.log(`✅ Created URL for msg ${obj.message_id}: ${newUrl.substring(0, 50)}...`);
                // Determine which url field to set based on message type
                if (obj.sticker) obj.url_sticker = newUrl;
                else if (obj.photo) obj.url_photo = newUrl;
                else if (obj.video) obj.url_video = newUrl;
                else if (obj.video_note) obj.url_video_note = newUrl;
                else if (obj.voice) obj.url_voice = newUrl;
                else if (obj.audio) obj.url_audio = newUrl;
                else if (obj.animation) obj.url_animation = newUrl;
                else if (obj.document) obj.url_document = newUrl;
            } catch (e) {
                console.warn(`❌ Failed to create URL for msg ${obj.message_id}:`, e.message);
            }
        } else if (!token) {
            console.warn('⚠️ No BOT_TOKEN found for urlReplaser');
        }

        return obj;
    }
    async function getFileUrl(token, fileId) {
        const response = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const json = await response.json();
        if (json.ok && json.result && json.result.file_path) {
            const fileUrl = `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
            return fileUrl;
        } else {
            throw new Error('Failed to get file URL');
        }
    }
    async function getBotTokenFromLink(link) {
        if (link) {
            const [firstPart, secondPart] = link.split('/bot');
            return secondPart.substring(0, secondPart.indexOf('/'));
        }
    }
    async function findFileId(obj) {
        let result = { id: undefined, size: 0 };
        const recursiveFinding = (obj) => {
            if (typeof obj === "object" && obj != null) {
                if (Object.prototype.hasOwnProperty.call(obj, "file_id") && typeof obj["file_id"] !== "undefined") {
                    if (Object.prototype.hasOwnProperty.call(obj, "file_size")) {
                        if (obj.file_size > result.size) {
                            result.id = obj.file_id;
                            result.size = obj.file_size;
                        }
                    } else {
                        result.id = obj.file_id;
                    }
                } else {
                    for (let key in obj) {
                        recursiveFinding(obj[key]);
                    }
                }
            }
        };
        recursiveFinding(obj);
        return result.id;
    }


    function getOSFromUA(userAgent) {
        if (/Windows/.test(userAgent)) {
            return 'Windows';
        }

        if (/Mac OS/.test(userAgent)) {
            return 'macOS';
        }

        if (/Linux/.test(userAgent)) {
            return 'Linux';
        }

        // if no match
        return null;
    }
}