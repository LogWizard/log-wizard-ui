// ========== Chat List Rendering 🌿 ==========

import { state, elements } from './config.js';

/**
 * Group messages by user
 */
export function groupMessagesByUser() {
    state.chatGroups = {};

    state.allMessages.forEach(msg => {
        const userId = msg.from?.id || msg.chat?.id || 'unknown';
        const userName = msg.from?.first_name || msg.user || 'Unknown User';

        if (!state.chatGroups[userId]) {
            state.chatGroups[userId] = {
                id: userId,
                name: userName,
                messages: [],
                lastMessage: null,
                unreadCount: 0
            };
        }

        state.chatGroups[userId].messages.push(msg);
        state.chatGroups[userId].lastMessage = msg;
    });

    console.log(`🦆 Grouped into ${Object.keys(state.chatGroups).length} chats`);
}

/**
 * Render chat list view
 */
export function renderChatListView() {
    elements.chatList.innerHTML = '';

    const sortedChats = Object.values(state.chatGroups).sort((a, b) => {
        return new Date(b.lastMessage.time) - new Date(a.lastMessage.time);
    });

    // Фільтруємо по пошуку 🌿
    const filteredChats = state.chatSearchQuery
        ? sortedChats.filter(chat => chat.name.toLowerCase().includes(state.chatSearchQuery))
        : sortedChats;

    if (filteredChats.length === 0) {
        const emptyText = state.chatSearchQuery
            ? `Нічого не знайдено для "${state.chatSearchQuery}"`
            : 'No messages for selected date';
        elements.chatList.innerHTML = `<div class="empty-state" style="padding: 40px 20px;"><div class="empty-state-text">${emptyText}</div></div>`;
        showEmptyMessagesState();
        return;
    }

    filteredChats.forEach(chat => {
        const chatItem = createChatListItem(chat);
        elements.chatList.appendChild(chatItem);
    });

    // Select first chat if none selected
    if (!state.selectedChatId && filteredChats.length > 0) {
        selectChat(filteredChats[0].id);
    } else if (state.selectedChatId) {
        renderChatMessages(state.selectedChatId);
    }
}

/**
 * Create chat list item
 */
function createChatListItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    if (chat.id === state.selectedChatId) {
        div.classList.add('active');
    }

    const lastMsg = chat.lastMessage;
    const time = new Date(lastMsg.time);
    const timeStr = time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    let preview = lastMsg.text || lastMsg.caption || '';
    if (lastMsg.photo) preview = '📷 Photo';
    if (lastMsg.video) preview = '🎥 Video';
    if (lastMsg.voice) preview = '🎤 Voice';
    if (lastMsg.sticker) preview = lastMsg.sticker.emoji || '🎨 Sticker';
    if (lastMsg.animation) preview = '🎬 GIF';
    if (lastMsg.document) preview = '📎 ' + (lastMsg.document.file_name || 'Document');

    div.innerHTML = `
        <div class="chat-item-avatar">
            ${lastMsg.user_avatar_url
            ? `<img src="${lastMsg.user_avatar_url}" alt="${chat.name}" loading="lazy">`
            : `<div class="avatar-placeholder">${chat.name.charAt(0).toUpperCase()}</div>`
        }
        </div>
        <div class="chat-item-content">
            <div class="chat-item-header">
                <div class="chat-item-name">${chat.name}</div>
                <div class="chat-item-time">${timeStr}</div>
            </div>
            <div class="chat-item-preview">${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}</div>
        </div>
        ${chat.messages.length > 1 ? `<div class="chat-item-badge">${chat.messages.length}</div>` : ''}
    `;

    div.addEventListener('click', () => selectChat(chat.id));

    return div;
}

/**
 * Select chat
 */
export function selectChat(chatId) {
    state.selectedChatId = chatId;

    // Update active state
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event?.currentTarget?.classList.add('active');

    renderChatMessages(chatId);
}

/**
 * Show empty messages state
 */
function showEmptyMessagesState() {
    elements.messagesContainer.innerHTML = `
        <div class="empty-messages-state">
            <div class="empty-icon">💬</div>
            <div class="empty-text">Select a chat to view messages</div>
        </div>
    `;
    elements.activeChatName.textContent = '';
    elements.activeChatStatus.textContent = '';
}

// Тимчасова заглушка - перенесемо в messages.js
function renderChatMessages(chatId) {
    console.log('Rendering messages for chat:', chatId);
    // TODO: implement in messages.js
}
