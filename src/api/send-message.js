
import fetch from 'node-fetch';
import { ConfigManager } from '../config-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import FormData from 'form-data'; // 🌿 Added for local file uploads

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '../../');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

// Get token from config or env
const config = configManager.read();
const BOT_TOKEN = process.env.BOT_TOKEN || config['Bot Token'] || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * 🌿 Helper to send media (Handling Local Files Stream)
 */
async function sendMediaRequest(endpoint, payload, mediaKey, mediaUrl) {
    // Check if mediaUrl is a local upload path
    if (mediaUrl && typeof mediaUrl === 'string' && mediaUrl.includes('/uploads/')) {
        try {
            // Extract filename from URL (e.g., https://host/uploads/file.png -> file.png)
            const filename = mediaUrl.split('/uploads/').pop();
            const localPath = path.join(appDirectory, 'public', 'uploads', filename);

            if (fs.existsSync(localPath)) {
                console.log(`🌿 Found local file: ${localPath}, sending as Stream...`);
                const form = new FormData();
                form.append(mediaKey, fs.createReadStream(localPath));

                // Append other payload fields
                for (const [key, value] of Object.entries(payload)) {
                    if (key !== mediaKey && value !== undefined && value !== null) {
                        form.append(key, value);
                    }
                }

                return await fetch(`${TELEGRAM_API}/${endpoint}`, {
                    method: 'POST',
                    headers: form.getHeaders(),
                    body: form
                });
            } else {
                console.warn(`⚠️ Local file not found: ${localPath}, falling back to URL`);
            }
        } catch (err) {
            console.error('⚠️ Error preparing local file stream:', err);
        }
    }

    // Default: Send as URL (JSON)
    return await fetch(`${TELEGRAM_API}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * 🌿 Helper to Save Message Locally (Persistence)
 */
function saveMessageLocally(data, type = 'message') {
    try {
        const msg = data.result;
        const dateObj = new Date(msg.date * 1000);
        const dateStr = dateObj.toLocaleDateString('uk-UA'); // DD.MM.YYYY
        const currentConfig = configManager.read();
        const msgPathBase = currentConfig['Listening Path'] || 'messages';
        const folderPath = path.join(msgPathBase, dateStr);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const fileName = `${msg.message_id}.json`;
        const filePath = path.join(folderPath, fileName);
        fs.writeFileSync(filePath, JSON.stringify(msg, null, 2));
        console.log(`✅ ${type} saved to ${filePath}`);
    } catch (saveError) {
        console.error(`⚠️ Failed to save ${type} locally:`, saveError);
    }
}


/**
 * POST /api/send-message
 * Send text message via Telegram Bot API
 */
export async function sendMessage(req, res) {
    const { chat_id, text, reply_to_message_id } = req.body;

    if (!chat_id || !text) {
        return res.status(400).json({ error: 'chat_id and text are required' });
    }

    try {
        const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id,
                text,
                parse_mode: 'HTML', // 🌿 TG Formatting
                reply_to_message_id
            })
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error');
        }

        saveMessageLocally(data, 'Message');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-photo
 */
export async function sendPhoto(req, res) {
    const { chat_id, photo, caption } = req.body;

    if (!chat_id || !photo) {
        return res.status(400).json({ error: 'chat_id and photo are required' });
    }

    try {
        const payload = { chat_id, photo, caption, parse_mode: 'HTML' };
        const response = await sendMediaRequest('sendPhoto', payload, 'photo', photo);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        saveMessageLocally(data, 'Photo');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending photo:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-video
 */
export async function sendVideo(req, res) {
    const { chat_id, video, caption } = req.body;

    if (!chat_id || !video) {
        return res.status(400).json({ error: 'chat_id and video are required' });
    }

    try {
        const payload = { chat_id, video, caption, parse_mode: 'HTML' };
        const response = await sendMediaRequest('sendVideo', payload, 'video', video);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        saveMessageLocally(data, 'Video');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending video:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-audio
 */
export async function sendAudio(req, res) {
    const { chat_id, audio } = req.body;

    if (!chat_id || !audio) {
        return res.status(400).json({ error: 'chat_id and audio are required' });
    }

    try {
        const payload = { chat_id, audio };
        const response = await sendMediaRequest('sendAudio', payload, 'audio', audio);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        saveMessageLocally(data, 'Audio');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending audio:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-voice
 */
export async function sendVoice(req, res) {
    const { chat_id, voice } = req.body;

    if (!chat_id || !voice) {
        return res.status(400).json({ error: 'chat_id and voice are required' });
    }

    try {
        const payload = { chat_id, voice };
        const response = await sendMediaRequest('sendVoice', payload, 'voice', voice);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        saveMessageLocally(data, 'Voice');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending voice:', error);
        res.status(500).json({ error: error.message });
    }
}
