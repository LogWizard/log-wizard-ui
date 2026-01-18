// ========== Read/Unread Logic 🌿 ==========

const STORAGE_KEY = 'gys_read_messages';

/**
 * Отримати прочитані повідомлення з localStorage
 */
export function getReadMessages() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return {};

        const readData = JSON.parse(data);
        const today = new Date().toDateString();

        // Очищаємо старі дати (автоматом прочитані після 00:00)
        Object.keys(readData).forEach(date => {
            if (new Date(date).toDateString() !== today) {
                delete readData[date];
            }
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(readData));
        return readData;
    } catch (error) {
        console.error('Error reading localStorage:', error);
        return {};
    }
}

/**
 * Зберегти прочитані повідомлення
 */
export function markAsRead(chatId) {
    try {
        const readData = getReadMessages();
        const today = new Date().toDateString();

        if (!readData[today]) {
            readData[today] = [];
        }

        if (!readData[today].includes(chatId)) {
            readData[today].push(chatId);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(readData));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Перевірити чи прочитаний чат
 */
export function isRead(chatId, messageDate) {
    const readData = getReadMessages();
    const today = new Date().toDateString();
    const msgDate = new Date(messageDate).toDateString();

    // Якщо повідомлення не сьогоднішнє - автоматом прочитане
    if (msgDate !== today) {
        return true;
    }

    // Перевіряємо чи є в списку прочитаних
    return readData[today]?.includes(chatId) || false;
}

/**
 * Підрахувати кількість непрочитаних
 */
export function getUnreadCount(chatId, messages) {
    const today = new Date().toDateString();

    if (isRead(chatId, messages[messages.length - 1]?.time)) {
        return 0;
    }

    // Рахуємо тільки сьогоднішні непрочитані
    return messages.filter(msg => {
        const msgDate = new Date(msg.time).toDateString();
        return msgDate === today;
    }).length;
}
