
import fetch from 'node-fetch';
import { ConfigManager } from '../config-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import FormData from 'form-data'; // 🌿 Added for local file uploads
import { convertVideoToNote, convertAudioToVoice } from '../services/video-processor.js'; // 🌿 Video/Audio service

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

        // 🌿 Preserve HTML formatting for local history UI
        if (data.result) {
            if (text) data.result.text = text;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'Message');

        // 🌿 CRITICAL FIX: Save to DB immediately (bot will sync later anyway)
        try {
            const { getPool } = await import('../services/db.js');
            const pool = getPool();
            if (pool) {
                const msg = data.result;
                await pool.query(`
                    INSERT INTO messages (message_id, chat_id, from_id, date, text, type, raw_data)
                    VALUES (?, ?, ?, ?, ?, 'text', ?)
                    ON DUPLICATE KEY UPDATE text = VALUES(text), raw_data = VALUES(raw_data)
                `, [msg.message_id, msg.chat.id, msg.from.id, msg.date, text, JSON.stringify(msg)]);
                console.log(`✅ Message ${msg.message_id} saved to DB`);
            }
        } catch (dbErr) {
            console.error('DB save error (non-critical):', dbErr);
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
        const payload = { chat_id, photo, caption, parse_mode: 'HTML' };
        const response = await sendMediaRequest('sendPhoto', payload, 'photo', photo);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // 🌿 Preserve HTML and Media URL for local history
        if (data.result) {
            if (caption) data.result.caption = caption;
            if (photo && typeof photo === 'string') data.result.url_photo = photo;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

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

        // 🌿 Preserve HTML and Media URL for local history
        if (data.result) {
            if (caption) data.result.caption = caption;
            if (video && typeof video === 'string') data.result.url_video = video;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

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

        // 🌿 Preserve Media URL for local history
        if (data.result) {
            if (audio && typeof audio === 'string') data.result.url_audio = audio;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

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

        if (data.result) {
            if (voice && typeof voice === 'string') data.result.url_voice = voice;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'Voice');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending voice:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-sticker 🌿
 */
export async function sendSticker(req, res) {
    const { chat_id, sticker } = req.body;

    if (!chat_id || !sticker) {
        return res.status(400).json({ error: 'chat_id and sticker are required' });
    }

    try {
        const payload = { chat_id, sticker };
        const response = await sendMediaRequest('sendSticker', payload, 'sticker', sticker);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        if (data.result) {
            // Store full URL for rendering 🌿
            if (sticker && typeof sticker === 'string') {
                data.result.url_sticker = `/api/sticker-image/${sticker}`;
                // Also check if it's animated/video
                if (data.result.sticker?.is_video) {
                    data.result.is_video_sticker = true;
                }
            }
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'Sticker');
        res.json({ success: true, message: data.result });
    } catch (error) {
        console.error('Error sending sticker:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-video-note 🌿
 */
export async function sendVideoNote(req, res) {
    const { chat_id, video_note } = req.body; // video_note should be URL to upload

    if (!chat_id || !video_note) {
        return res.status(400).json({ error: 'chat_id and video_note are required' });
    }

    // Must be local file to process
    if (!video_note.includes('/uploads/')) {
        return res.status(400).json({ error: 'Video note must be a locally uploaded file' });
    }

    const filename = video_note.split('/uploads/').pop();
    const localInputPath = path.join(appDirectory, 'public', 'uploads', filename);
    const localOutputPath = path.join(appDirectory, 'public', 'uploads', `note-${filename}.mp4`); // Ensure .mp4

    try {
        if (!fs.existsSync(localInputPath)) throw new Error('Input file not found');

        console.log(`🎬 Processing Video Note: ${localInputPath}...`);
        await convertVideoToNote(localInputPath, localOutputPath);
        console.log(`✅ Video Note Ready: ${localOutputPath}`);

        // Send processed file
        const form = new FormData();
        form.append('chat_id', chat_id);
        form.append('video_note', fs.createReadStream(localOutputPath));

        const response = await fetch(`${TELEGRAM_API}/sendVideoNote`, {
            method: 'POST',
            headers: form.getHeaders(),
            body: form
        });

        const data = await response.json();

        // Cleanup processed input file (optional) but keep note output
        // fs.unlinkSync(localInputPath); 

        if (!data.ok) throw new Error(data.description);

        if (data.result) {
            // Use the NEW processed URL for local storage/UI
            // The file is physically at localOutputPath, which corresponds to uploads/note-filename.mp4
            const processedUrl = video_note.replace(filename, `note-${filename}.mp4`);
            data.result.url_video_note = processedUrl;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'VideoNote');
        res.json({ success: true, message: data.result });

    } catch (error) {
        console.error('Error sending video note:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/send-voice-note 🌿
 */
export async function sendVoiceNote(req, res) {
    const { chat_id, voice_note, caption } = req.body; // voice_note should be URL to upload

    if (!chat_id || !voice_note) {
        return res.status(400).json({ error: 'chat_id and voice_note are required' });
    }

    // Must be local file to process
    if (!voice_note.includes('/uploads/')) {
        return res.status(400).json({ error: 'Voice note must be a locally uploaded file' });
    }

    const filename = voice_note.split('/uploads/').pop();
    const localInputPath = path.join(appDirectory, 'public', 'uploads', filename);
    const localOutputPath = path.join(appDirectory, 'public', 'uploads', `voice-${filename.split('.')[0]}.ogg`); // Ensure .ogg

    try {
        if (!fs.existsSync(localInputPath)) throw new Error('Input file not found');

        console.log(`🎤 Processing Voice Note: ${localInputPath}...`);
        await convertAudioToVoice(localInputPath, localOutputPath);
        console.log(`✅ Voice Note Ready: ${localOutputPath}`);

        // Send processed file
        const form = new FormData();
        form.append('chat_id', chat_id);
        form.append('voice', fs.createReadStream(localOutputPath));
        if (caption) form.append('caption', caption); // 🌿 Caption support

        const response = await fetch(`${TELEGRAM_API}/sendVoice`, {
            method: 'POST',
            headers: form.getHeaders(),
            body: form
        });

        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        if (data.result) {
            const processedUrl = voice_note.replace(filename, `voice-${filename.split('.')[0]}.ogg`);
            data.result.url_voice = processedUrl;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'Voice');
        res.json({ success: true, message: data.result });

    } catch (error) {
        console.error('Error sending voice note:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/set-reaction 🌿
 * Set reaction on a message
 */
export async function setReaction(req, res) {
    const { chat_id, message_id, emoji, is_big } = req.body;

    if (!chat_id || !message_id) {
        return res.status(400).json({ error: 'chat_id and message_id are required' });
    }

    try {
        // Build reaction array (single emoji for non-premium bots)
        const reaction = emoji ? [{ type: 'emoji', emoji }] : [];

        const payload = {
            chat_id,
            message_id,
            reaction,
            is_big: is_big || false
        };

        const response = await fetch(`${TELEGRAM_API}/setMessageReaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // 🌿 Update local JSON file with our reaction
        try {
            const currentConfig = await configManager.read();
            const msgPathBase = currentConfig['Listening Path'] || 'messages';
            const chatIdStr = String(chat_id);
            const msgIdStr = String(message_id);

            // Find message file by ID (search recent dates)
            const today = new Date();
            let fileUpdated = false;

            for (let i = 0; i < 31; i++) { // Search last 31 days
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const dateStr = d.toLocaleDateString('uk-UA');

                let filePath;
                // Match Bot's file saving logic: ChatID + MessageID
                if (chatIdStr.includes('-')) {
                    filePath = path.join(msgPathBase, dateStr, chatIdStr, `${chatIdStr}${msgIdStr}.json`);
                } else {
                    filePath = path.join(msgPathBase, dateStr, `${chatIdStr}${msgIdStr}.json`);
                }

                if (fs.existsSync(filePath)) {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    // Prepare reactions array
                    let reactions = content.reactions?.results || (Array.isArray(content.reactions) ? content.reactions : []);
                    if (!Array.isArray(reactions)) reactions = []; // Safety check

                    // Logic: We are setting OUR reaction.
                    // 1. If we are changing reaction, old reaction should be removed?
                    //    Telegram's setMessageReaction REPLACES the user's reaction.
                    //    So we should likely clear 'is_own' from others?
                    //    But since we don't track WHO set other reactions, let's just mark the new one.

                    const existingIdx = reactions.findIndex(r => (r.type?.emoji || r.emoji) === emoji);

                    if (existingIdx >= 0) {
                        reactions[existingIdx].is_own = true;
                        // Assuming count is at least 1
                    } else {
                        reactions.push({
                            type: { emoji },
                            total_count: 1,
                            is_own: true,
                            emoji: emoji // fallback
                        });
                    }

                    // Save back
                    if (content.reactions?.results) {
                        content.reactions.results = reactions;
                    } else {
                        content.reactions = reactions;
                    }

                    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
                    console.log(`Reaction saved locally to ${filePath}`);
                    fileUpdated = true;
                    break;
                }
            }

            if (!fileUpdated) {
                console.warn(`Could not find local file for message ${message_id} to save reaction.`);
            }

        } catch (localErr) {
            console.error('Failed to save reaction locally:', localErr);
        }

        res.json({ success: true, result: true });

    } catch (error) {
        console.error('Error in setReaction:', error);
        res.status(500).json({ error: error.message });
    }
}
