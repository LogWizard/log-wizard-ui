
import fetch from 'node-fetch';
import { ConfigManager } from '../config-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '../../');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

// Get token from config or env
const config = configManager.read();
const BOT_TOKEN = process.env.BOT_TOKEN || config['Bot Token'] || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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

        // 🌿 SAVE TO LOCAL FILE (PERSISTENCE)
        try {
            const msg = data.result;
            const dateObj = new Date(msg.date * 1000);
            const dateStr = dateObj.toLocaleDateString('uk-UA'); // DD.MM.YYYY

            // Determine path: MSG_PATH/DD.MM.YYYY/
            // Note: We need MSG_PATH. configManager might need to be re-read or passed.
            // Assuming config has 'Listening Path' or using default from server.js logic is hard here without import.
            // Let's rely on configManager which we have.
            const currentConfig = configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages'; // Fallback

            const folderPath = path.join(msgPathBase, dateStr);

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            // Save as JSON: ID.json (like existing structure) or Timestamp_ID.json?
            // Existing structure seems to be 1 file per message? 
            // Looking at server.js: fs.readdirSync(datePath)... JSON.parse(content)...
            // So yes, one file per message.
            const fileName = `${msg.message_id}.json`;
            const filePath = path.join(folderPath, fileName);

            // Add our "user" field for UI to know it's us (Bot) if needed, 
            // but Telegram response has "from" field which is the Bot.
            // UI treats "from.id" == "bot" or "isBot" flag.

            fs.writeFileSync(filePath, JSON.stringify(msg, null, 2));
            console.log(`✅ Message saved to ${filePath}`);

        } catch (saveError) {
            console.error('⚠️ Failed to save message locally:', saveError);
            // Don't fail the request, just log
        }

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
        const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, photo, caption })
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description);
        }

        // 🌿 SAVE TO LOCAL FILE (PERSISTENCE)
        try {
            const msg = data.result;
            const dateObj = new Date(msg.date * 1000);
            const dateStr = dateObj.toLocaleDateString('uk-UA');
            const currentConfig = configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages';
            const folderPath = path.join(msgPathBase, dateStr);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            fs.writeFileSync(path.join(folderPath, `${msg.message_id}.json`), JSON.stringify(msg, null, 2));
            console.log(`✅ Photo message saved`);
        } catch (e) { console.error('⚠️ Save error:', e); }

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
        const response = await fetch(`${TELEGRAM_API}/sendVideo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, video, caption })
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description);
        }

        // 🌿 SAVE TO LOCAL FILE (PERSISTENCE)
        try {
            const msg = data.result;
            const dateObj = new Date(msg.date * 1000);
            const dateStr = dateObj.toLocaleDateString('uk-UA');
            const currentConfig = configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages';
            const folderPath = path.join(msgPathBase, dateStr);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            fs.writeFileSync(path.join(folderPath, `${msg.message_id}.json`), JSON.stringify(msg, null, 2));
            console.log(`✅ Video message saved`);
        } catch (e) { console.error('⚠️ Save error:', e); }

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
        const response = await fetch(`${TELEGRAM_API}/sendAudio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, audio })
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description);
        }

        // 🌿 SAVE TO LOCAL FILE (PERSISTENCE)
        try {
            const msg = data.result;
            const dateObj = new Date(msg.date * 1000);
            const dateStr = dateObj.toLocaleDateString('uk-UA');
            const currentConfig = configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages';
            const folderPath = path.join(msgPathBase, dateStr);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            // Fix: sendAudio might not return duration in response immediately or differently
            fs.writeFileSync(path.join(folderPath, `${msg.message_id}.json`), JSON.stringify(msg, null, 2));
            console.log(`✅ Audio message saved`);
        } catch (e) { console.error('⚠️ Save error:', e); }

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
        const response = await fetch(`${TELEGRAM_API}/sendVoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, voice })
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description);
        }

        // 🌿 SAVE TO LOCAL FILE (PERSISTENCE)
        try {
            const msg = data.result;
            const dateObj = new Date(msg.date * 1000);
            const dateStr = dateObj.toLocaleDateString('uk-UA');
            const currentConfig = configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages';
            const folderPath = path.join(msgPathBase, dateStr);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            fs.writeFileSync(path.join(folderPath, `${msg.message_id}.json`), JSON.stringify(msg, null, 2));
            console.log(`✅ Voice message saved`);
        } catch (e) { console.error('⚠️ Save error:', e); }

        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending voice:', error);
        res.status(500).json({ error: error.message });
    }
}
