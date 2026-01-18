// Підключаємо необхідні модулі
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import cors_proxy from 'cors-anywhere';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { ConfigManager } from './config-manager.js';
import { sendMessage, sendPhoto, sendVideo, sendAudio, sendVoice, sendSticker, sendVideoNote, sendVoiceNote, setReaction } from './api/send-message.js';
import { upload, uploadFile } from './api/upload.js';
import { getManualMode, setManualMode, getAllManualModes } from './api/manual-mode.js';
import { ChatsScanner } from './services/chats-scanner.js';
import { initDB, getStickerSets, addStickerSet } from './services/db.js'; // 🌿 DB Service
import fetch from 'node-fetch'; // Ensure fetch is available

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '..');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

const options = {
    key: fs.readFileSync('src/privatekey.pem'),
    cert: fs.readFileSync('src/certificate.pem')
};

const app = express();
const server = https.createServer(options, app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes 🌿
app.post('/api/send-message', sendMessage);
app.post('/api/send-photo', sendPhoto);
app.post('/api/send-video', sendVideo);
app.post('/api/send-audio', sendAudio);
app.post('/api/send-voice', sendVoice);
app.post('/api/send-sticker', sendSticker);
app.post('/api/send-video-note', sendVideoNote);
app.post('/api/send-voice-note', sendVoiceNote);
app.post('/api/set-reaction', setReaction); // 🌿 Reactions
app.post('/api/upload', upload.single('file'), uploadFile);

// Manual Mode Routes 🔀
app.get('/api/get-manual-mode', getManualMode);
app.post('/api/set-manual-mode', setManualMode);
app.get('/api/get-all-manual-modes', getAllManualModes);


const fileTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.woff2': 'font/woff2',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};
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
let paramsKeys = Object.keys(params);
if (paramsKeys.length !== 0) {
    MSG_PATH = params['path'] ? params['path'] : `D:/OSPanel/domains/kyivstar-nelegal-it-community.com.ua/Node_Home/GitHub/ks_gys_bot/messages`;
    port = params['port'] ? params['port'] : `3003`;
    corsServerPort = params['corsServerPort'] ? params['corsServerPort'] : '3004';
    console.log(params);
} else {
    const paramsOnConfig = await readConfigPrams();
    port = paramsOnConfig['Listening Port'];
    MSG_PATH = paramsOnConfig['Listening Path'];
    corsServerPort = paramsOnConfig['Cors Server Port'];
    corsServerPort = paramsOnConfig['Cors Server Port'];
}

// 🌿 Initialize Database
await initDB();

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
export function createMessageServer() {
    /* Цей сервер необхідний для обходу CORS */
    cors_proxy.createServer({
        originWhitelist: [], // Allow all origins
        requireHeader: ['origin', 'x-requested-with'],
        removeHeaders: ['cookie', 'cookie2']
    }).listen(corsServerPort, function () {
        console.log(`Server CORS Anywhere started on port ${corsServerPort}`);
    });
    /* Цей сервер необхідний для обходу CORS */
    let folderPath = path.join(MSG_PATH, new Date().toLocaleDateString('uk-UA'), '/');

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
        console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} || ${ipAddress} POST\nbody:\n${JSON.stringify(data, null, 2)}`);
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

    /* Цей роутер відповідає за get запитів /message */
    app.get('/messages', async (req, res) => {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const sinceParam = Number.parseInt(urlObj.searchParams.get('since'));
            const date = urlObj.searchParams.get('date');
            const group = urlObj.searchParams.get('group');
            const ipAddress = getIPv4FromIPV6(req.header('x-forwarded-for') || req.socket.remoteAddress);
            console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} || ${ipAddress} GET`);

            const messages = [];

            // Якщо date пустий - сканувати останні 3 дні 🌿 (PERFORMANCE FIX!)
            let dateFolders = [];
            if (!date || date === '') {
                // 🚀 Оптимізація: читаємо тільки останні 3 дні замість всіх 129k+ файлів
                const today = new Date();
                for (let i = 0; i < 3; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    dateFolders.push(d.toLocaleDateString('uk-UA'));
                }
            } else {
                dateFolders = [date];
            }

            for (const dateFolder of dateFolders) {
                let folderPath = path.join(MSG_PATH, dateFolder);
                if (group && group !== 'allPrivate') {
                    folderPath = path.join(folderPath, group);
                }

                try {
                    fs.accessSync(folderPath, fs.constants.R_OK);
                } catch {
                    continue; // Папка не існує - пропускаємо
                }

                const files = fs.readdirSync(folderPath);
                for (let file of files) {
                    const filePath = path.join(folderPath, file);
                    // check if file has .json extension
                    if (path.extname(file) !== '.json') {
                        continue;
                    }

                    try {
                        const stats = fs.statSync(filePath);
                        if (stats.size === 0) continue; // Пропускаємо пусті файли 🌿

                        const data = fs.readFileSync(filePath);
                        if (!data || data.length === 0) continue; // Skip empty/corrupted files

                        let message = JSON.parse(data);
                        message = await urlReplaser(message);
                        if (sinceParam && message.message_id <= sinceParam) {
                            continue;
                        }

                        // 🌿 Filter by chat.id for private chats (group param without '-')
                        if (group && group !== 'allPrivate' && !group.includes('-')) {
                            const msgChatId = String(message.chat?.id || message.from?.id || '');
                            if (msgChatId !== group) {
                                continue; // Skip messages not belonging to this chat
                            }
                        }

                        const chatMessage = {
                            user: message.from?.first_name,
                            text: message.text,
                            time: new Date(message.date * 1000),
                        };

                        // add additional properties to chatMessage
                        const fields = Object.keys(message).filter(
                            (key) => !['text', 'date'].includes(key)
                        );
                        for (let key of fields) {
                            chatMessage[key] = message[key];
                        }
                        messages.push(chatMessage);
                    } catch (error) {
                        // Silently skip corrupted/broken files 🌿
                        continue;
                    }
                }
            } // end for dateFolder

            messages.sort((a, b) => b.time - a.time);

            res.status(200).json(messages);
        } catch (err) {
            console.error(`Error accessing directory: ${err}`);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    });
    /* Цей роутер відповідає за get запитів /message */

    // 🌿 ALL CHATS API
    // Scanner initialized below

    app.get('/api/get-all-chats', async (req, res) => {
        // Dynamic import or use global class
        // Since we cannot use import inside function effectively without dynamic import()
        // We will assume ChatsScanner is imported at top

        // Initialize scanner if not exists (using current MSG_PATH)
        // We can attach it to app or global scope
        const scanner = new ChatsScanner(MSG_PATH);

        const force = req.query.force === 'true';
        if (force) {
            const chats = await scanner.scan();
            res.json(Object.values(chats));
        } else {
            let chats = scanner.getCached();
            if (Object.keys(chats).length === 0) {
                chats = await scanner.scan();
            }
            res.json(Object.values(chats));
        }
    });

    /* Цей роутер відповідає за обробку запиту /chat */
    app.get('/chat', async (req, res) => {
        console.log(__dirname);
        const filePath = path.join(appDirectory, '/public/index.html');
        console.log(filePath);
        try {
            const data = await fs.promises.readFile(filePath);
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

    /* from use http server */
    // app.listen(port, () => {
    //     logStr = 'http://';
    //     console.log(`Express server started on port ${port}`);
    // });
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
            console.log(`🔍 urlReplaser: sticker=${hasSticker}, photo=${hasPhoto}, file_id=${file_id ? 'YES' : 'NO'}, token=${token ? 'YES' : 'NO'}`);
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
                console.log(`✅ Created URL for msg ${obj.message_id}: ${newUrl.substring(0, 50)}...`);
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