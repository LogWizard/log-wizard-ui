// ========== Manual Mode API 🌿 ==========

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '../../config/manual_mode.json');

/**
 * Load manual mode config
 */
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * Save manual mode config
 */
async function saveConfig(config) {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * GET /api/get-manual-mode?chat_id=123
 */
export async function getManualMode(req, res) {
    const chat_id = req.query?.chat_id;

    if (!chat_id) {
        return res.status(400).json({ error: 'chat_id required' });
    }

    const config = await loadConfig();
    res.json({
        chat_id,
        enabled: config[String(chat_id)] === true
    });
}

/**
 * POST /api/set-manual-mode
 * Body: { chat_id, enabled }
 */
export async function setManualMode(req, res) {
    const { chat_id, enabled } = req.body;

    if (!chat_id) {
        return res.status(400).json({ error: 'chat_id required' });
    }

    const config = await loadConfig();
    config[String(chat_id)] = Boolean(enabled);
    await saveConfig(config);

    console.log(`🔀 Manual mode for ${chat_id}: ${enabled ? 'ON' : 'OFF'}`);

    res.json({
        success: true,
        chat_id,
        enabled: config[String(chat_id)]
    });
}

/**
 * GET /api/get-all-manual-modes
 * Returns all chats in manual mode
 */
export async function getAllManualModes(req, res) {
    const config = await loadConfig();
    res.json(config);
}
