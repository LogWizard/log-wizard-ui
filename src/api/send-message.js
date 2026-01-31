
import fetch from 'node-fetch';
import { ConfigManager } from '../config-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import FormData from 'form-data'; // 🌿 Added for local file uploads
import { convertVideoToNote, convertAudioToVoice } from '../services/video-processor.js'; // 🌿 Video/Audio service
import { getPool } from '../services/db.js'; // 🌿 DB Access

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

        // 🌿 Save to DB (Unified)
        await logToDB(data.result);

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
        await logToDB(data.result);
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
        await logToDB(data.result);
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
        await logToDB(data.result);
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
        await logToDB(data.result);
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
        await logToDB(data.result);
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
        if (!fs.existsSync(localInputPath)) {
            console.error(`❌ Input file not found: ${localInputPath}`);
            throw new Error(`Input file not found: ${filename}`);
        }

        console.log(`🎬 Processing Video Note: ${localInputPath}...`);

        // 🌿 Check file size before processing
        const stats = fs.statSync(localInputPath);
        if (stats.size < 1000) {
            throw new Error('Recording file is too small or corrupted');
        }

        await convertVideoToNote(localInputPath, localOutputPath);

        // 🌿 Verify output was created
        if (!fs.existsSync(localOutputPath)) {
            throw new Error('FFmpeg failed to create output file');
        }

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

        if (!data.ok) {
            console.error('❌ Telegram API Error:', data);
            throw new Error(data.description || 'Telegram API rejected the video note');
        }

        if (data.result) {
            // Use the NEW processed URL for local storage/UI
            const processedUrl = video_note.replace(filename, `note-${filename}.mp4`);
            data.result.url_video_note = processedUrl;
            if (data.result.date) data.result.time = new Date(data.result.date * 1000).toISOString();
        }

        saveMessageLocally(data, 'VideoNote');
        await logToDB(data.result);
        res.json({ success: true, message: data.result });

    } catch (error) {
        console.error('❌ Error sending video note:', error.message);
        console.error('   Input path:', localInputPath);
        console.error('   Output path:', localOutputPath);
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
        await logToDB(data.result);
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
    const { chat_id, message_id, emoji, is_big, action } = req.body; // action: 'add' | 'remove' (default 'add')

    if (!chat_id || !message_id) {
        return res.status(400).json({ error: 'chat_id and message_id are required' });
    }

    try {
        const shouldRemove = action === 'remove';
        // Build reaction array (single emoji for non-premium bots)
        const reaction = (!shouldRemove && emoji) ? [{ type: 'emoji', emoji }] : [];

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

                    const existingIdx = reactions.findIndex(r => (r.type?.emoji || r.emoji) === emoji);

                    if (existingIdx >= 0) {
                        if (shouldRemove) {
                            reactions[existingIdx].is_own = false;
                            if (reactions[existingIdx].total_count > 0) reactions[existingIdx].total_count--;

                            // 🌿 If count is 0, remove the reaction entry entirely
                            if (reactions[existingIdx].total_count <= 0) {
                                reactions.splice(existingIdx, 1);
                            }
                        } else {
                            // 🌿 Enforce Single Reaction: Unset others
                            reactions.forEach((r, idx) => {
                                if (idx !== existingIdx && r.is_own) {
                                    r.is_own = false;
                                    if (r.total_count > 0) r.total_count--;
                                }
                            });

                            // Remove any that dropped to 0
                            reactions = reactions.filter(r => (r.total_count || 0) > 0 || r.is_own);

                            // Find index again after filter (or use original if still there)
                            const freshIdx = reactions.findIndex(r => (r.type?.emoji || r.emoji) === emoji);
                            if (freshIdx >= 0) {
                                reactions[freshIdx].is_own = true;
                            }
                        }
                    } else if (!shouldRemove) {
                        // 🌿 Enforce Single Reaction: Unset others
                        reactions.forEach(r => {
                            if (r.is_own) {
                                r.is_own = false;
                                if (r.total_count > 0) r.total_count--;
                            }
                        });

                        reactions.push({
                            type: { emoji },
                            total_count: 1,
                            is_own: true,
                            emoji: emoji // fallback
                        });
                    }

                    // Final cleanup: remove any reactions with 0 count that aren't 'own'
                    reactions = reactions.filter(r => (r.total_count || r.count || 0) > 0 || r.is_own);

                    // Save back
                    if (content.reactions?.results) {
                        content.reactions.results = reactions;
                    } else {
                        content.reactions = reactions;
                    }

                    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
                    console.log(`Reaction saved locally to ${filePath}`);

                    // 🌿 Update DB with new reaction data
                    await logToDB(content);

                    fileUpdated = true;
                    break;
                }
            }

            if (!fileUpdated) {
                console.warn(`Could not find local file for message ${message_id} to save reaction. Falling back to DB update...`);
                try {
                    const pool = getPool();
                    if (pool) {
                        const uniqueId = `${chat_id}_${message_id}`;
                        // Fetch current message from DB to get raw_data (Check both main and archive)
                        let [rows] = await pool.query('SELECT raw_data, chat_id, message_id, from_id, date, text, caption, type, media_url FROM messages WHERE unique_id = ?', [uniqueId]);

                        if (rows.length === 0) {
                            [rows] = await pool.query('SELECT raw_data, chat_id, message_id, from_id, date, text, caption, type, media_url FROM messages_archive WHERE unique_id = ?', [uniqueId]);
                        }

                        if (rows.length > 0) {
                            const row = rows[0];
                            let content = row.raw_data;
                            if (typeof content === 'string') content = JSON.parse(content);

                            if (!content) {
                                // Fallback construction if raw_data is empty
                                content = {
                                    message_id: row.message_id,
                                    chat: { id: row.chat_id },
                                    from: { id: row.from_id },
                                    date: new Date(row.date).getTime() / 1000,
                                    text: row.text,
                                    caption: row.caption
                                };
                            }

                            // 🌿 Robust Merge Logic
                            let existingReactions = Array.isArray(content.reactions) ? content.reactions : (content.reactions?.results || []);

                            // 1. Prepare NEW 'own' reaction
                            const newOwnReaction = {
                                type: { emoji },
                                emoji: emoji,
                                total_count: 1,
                                is_own: !shouldRemove
                            };

                            // 2. Clear previous 'own' reactions (Enforce Single Reaction for Bot)
                            if (!shouldRemove) {
                                existingReactions.forEach(r => {
                                    if (r.is_own === true || r.is_own === 1 || String(r.is_own) === 'true') {
                                        r.is_own = false;
                                        if (r.total_count > 0) r.total_count--;
                                    }
                                });
                            }

                            // 3. Merge and Deduplicate by Emoji
                            const merged = [newOwnReaction, ...existingReactions];
                            const uniqueMap = new Map();

                            merged.forEach(r => {
                                const e = r.type?.emoji || r.emoji;
                                if (!e) return;

                                const isCurrentOwn = r.is_own === true || r.is_own === 1 || String(r.is_own) === 'true';

                                if (uniqueMap.has(e)) {
                                    const existing = uniqueMap.get(e);
                                    // Prioritize 'is_own' status
                                    if (isCurrentOwn) existing.is_own = true;
                                    // Sum counts? No, for reactions we usually have 1 per emoji (merged from users)
                                    // In our DB, total_count is the total for that emoji.
                                    if (isCurrentOwn && existing.total_count === 0) existing.total_count = 1;
                                } else {
                                    uniqueMap.set(e, {
                                        type: { emoji: e },
                                        emoji: e,
                                        total_count: r.total_count || r.count || 1,
                                        is_own: isCurrentOwn
                                    });
                                }
                            });

                            let reactions = Array.from(uniqueMap.values())
                                .filter(r => (r.total_count > 0) || r.is_own);

                            if (content.reactions?.results) content.reactions.results = reactions;
                            else content.reactions = reactions;

                            // 🌿 Update DB only
                            await logToDB(content);
                            console.log(`✅ Reaction synced to DB fallback for message ${message_id}`);
                        } else {
                            console.error(`❌ Message ${uniqueId} not found in DB either! Cannot sync reaction.`);
                        }
                    }
                } catch (dbFallbackErr) {
                    console.error('DB Fallback reaction update failed:', dbFallbackErr);
                }
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

/**
 * 🌿 Unified DB Logger for Outgoing Messages
 */
async function logToDB(msg) {
    try {
        const pool = getPool();
        if (!pool) return;

        // 1. Update Chat Timestamp (Important for sorting!)
        await pool.query(`
            UPDATE chats SET last_updated = NOW() WHERE id = ?
        `, [msg.chat.id]);

        // 2. Insert Message
        let type = 'text';
        let mediaUrl = null;
        let text = msg.text || msg.caption || null;

        if (msg.sticker) {
            type = 'sticker';
            // Prefer enriched URL if available, else file_id
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

        await pool.query(`
            INSERT INTO messages (unique_id, message_id, chat_id, from_id, date, text, caption, type, media_url, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                text = VALUES(text),
                caption = VALUES(caption),
                media_url = VALUES(media_url),
                raw_data = CASE 
                    -- 🌿 If NEW has NO reactions key but OLD HAS them, keep OLD
                    WHEN JSON_EXTRACT(VALUES(raw_data), '$.reactions') IS NULL 
                         AND JSON_EXTRACT(messages.raw_data, '$.reactions') IS NOT NULL
                    THEN JSON_SET(VALUES(raw_data), '$.reactions', JSON_EXTRACT(messages.raw_data, '$.reactions'))
                    -- 🌿 Else take NEW
                    ELSE VALUES(raw_data)
                END
        `, [
            uniqueId,
            msg.message_id,
            msg.chat.id,
            msg.from.id,
            new Date(msg.date * 1000),
            text,
            msg.caption || null,
            type,
            mediaUrl,
            JSON.stringify(msg)
        ]);
        // console.log(`✅ Logged ${type} ${msg.message_id} to DB`);
    } catch (e) {
        console.error('DB Log Error:', e);
    }
}

/**
 * POST /api/delete-message 🌿
 */
export async function deleteMessage(req, res) {
    const { chat_id, message_id } = req.body;
    if (!chat_id || !message_id) return res.status(400).json({ error: 'Missing chat_id or message_id' });

    try {
        const response = await fetch(`${TELEGRAM_API}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, message_id })
        });
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // 🌿 Also delete from DB (or mark deleted)
        const pool = getPool();
        if (pool) {
            await pool.query('DELETE FROM messages WHERE chat_id = ? AND message_id = ?', [chat_id, message_id]);
        }

        // Delete local file if exists
        try {
            // Basic file cleanup attempt (optional)
        } catch (e) { }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/edit-message 🌿
 */
export async function editMessage(req, res) {
    const { chat_id, message_id, text, is_caption } = req.body;
    if (!chat_id || !message_id || !text) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const method = is_caption ? 'editMessageCaption' : 'editMessageText';
        const body = {
            chat_id,
            message_id,
            parse_mode: 'HTML'
        };

        if (is_caption) {
            body.caption = text;
        } else {
            body.text = text;
        }

        const response = await fetch(`${TELEGRAM_API}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // 🌿 Update DB
        const pool = getPool();
        if (pool) {
            // Update text and raw_data
            const uniqueId = `${chat_id}_${message_id}`;
            const updateField = is_caption ? 'caption' : 'text';
            const jsonPath = is_caption ? '$.caption' : '$.text';

            await pool.query(`
                UPDATE messages 
                SET ${updateField} = ?, 
                    raw_data = JSON_SET(raw_data, ?, ?) 
                WHERE chat_id = ? AND message_id = ?
            `, [text, jsonPath, text, chat_id, message_id]);
        }

        res.json({ success: true, result: data.result });
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ error: error.message });
    }
}
