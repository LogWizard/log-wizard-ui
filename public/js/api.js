// ========== API Communication 🌿 ==========

import { state } from './config.js';

/**
 * Fetch messages from server
 */
export async function fetchMessages() {
    try {
        const serverConfig = await getSettingsFromServer();
        // Якщо selectedDate = null, беремо всі дати 🌿
        const dateParam = state.selectedDate || '';

        const response = await fetch(`/messages?since=${state.latestMessageId}&date=${dateParam}&group=allPrivate`);

        if (!response.ok) {
            console.error("Failed to fetch messages");
            return;
        }

        const messages = await response.json();

        console.log(`🌿 Fetched ${messages.length} messages`, { dateParam, messages: messages.slice(0, 3) });

        if (messages.length > 0) {
            state.latestMessageId = messages[0].message_id;

            // Add new messages to allMessages
            messages.reverse().forEach(msg => {
                if (!state.allMessages.find(m => m.message_id === msg.message_id)) {
                    state.allMessages.push(msg);
                }
            });

            // Sort all messages by time
            state.allMessages.sort((a, b) => new Date(a.time) - new Date(b.time));

            return true; // Success
        } else {
            console.warn('📭 No messages received from server');
            return false;
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        return false;
    }
}

/**
 * Get settings from server
 */
export async function getSettingsFromServer() {
    try {
        const response = await fetch('/getSettings');
        return await response.json();
    } catch (error) {
        console.error('Error fetching settings:', error);
        return {};
    }
}

/**
 * Save settings to server
 */
export async function setSettingsToServer(settings) {
    try {
        await fetch('/setSettings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

/**
 * Load previous date messages for infinite scroll
 */
export async function loadPreviousDateMessages() {
    if (state.isLoadingHistory) return;

    state.isLoadingHistory = true;

    // Отримуємо попередню дату
    const currentDate = state.currentDatePointer || new Date(state.selectedDate.split('.').reverse().join('-'));
    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toLocaleDateString('uk-UA');

    // Перевіряємо чи не завантажували вже цю дату
    if (state.allDatesLoaded.includes(previousDateStr)) {
        state.isLoadingHistory = false;
        return;
    }

    console.log(`🌿 Loading history from ${previousDateStr}...`);

    try {
        const response = await fetch(`/messages?since=0&date=${previousDateStr}&group=allPrivate`);

        if (!response.ok) {
            state.isLoadingHistory = false;
            return;
        }

        const messages = await response.json();

        if (messages.length > 0) {
            // Додаємо повідомлення з попередньої дати
            messages.reverse().forEach(msg => {
                if (!state.allMessages.find(m => m.message_id === msg.message_id)) {
                    state.allMessages.push(msg);
                }
            });

            // Сортуємо по часу
            state.allMessages.sort((a, b) => new Date(a.time) - new Date(b.time));

            // Запам'ятовуємо що цю дату завантажили
            state.allDatesLoaded.push(previousDateStr);
            state.currentDatePointer = previousDate;

            console.log(`✅ Loaded ${messages.length} messages from ${previousDateStr}`);
            return true;
        } else {
            console.log(`📭 No messages found for ${previousDateStr}`);
        }
    } catch (error) {
        console.error('Error loading previous date:', error);
    }

    state.isLoadingHistory = false;
    return false;
}
