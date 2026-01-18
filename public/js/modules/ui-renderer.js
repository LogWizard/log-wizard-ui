import { state } from './state.js';
import { fetchMessages, fetchMessagesForDate, fetchSingleChatUpdate } from './api.js';
import { safeParseDate, isToday as checkIsToday, getColorForUser } from './utils.js';

let lastRenderedChatId = null;
let renderedMessageIds = new Set();

// 🌿 Expose globally for Prism/Audio injections to find
window.renderChatMessages = renderChatMessages;
window.renderChatListView = renderChatListView;

export function showEmptyMessagesState() {
    const container = state.ui.messagesContainer;
    container.innerHTML = `
        <div class="no-chat-selected">
            <div class="chat-icon">💬</div>
            <div class="no-chat-text">Select a chat to view messages</div>
        </div>
    `;
}

export function renderChatListView() {
    const list = state.ui.chatList;
    const sortedChats = Object.values(state.chatGroups).sort((a, b) => {
        return safeParseDate(b.lastMessage.time) - safeParseDate(a.lastMessage.time);
    });

    const query = state.chatSearchQuery;
    const filteredChats = query
        ? sortedChats.filter(chat => chat.name.toLowerCase().includes(query))
        : sortedChats;

    if (filteredChats.length === 0) {
        if (list.children.length === 0 || !list.querySelector('.empty-state')) {
            const emptyText = query ? `Нічого не знайдено для "${query}"` : 'No messages';
            list.innerHTML = `<div class="empty-state" style="padding: 40px 20px;"><div class="empty-state-text">${emptyText}</div></div>`;
            showEmptyMessagesState();
        }
        return;
    }

    // Remove stale empty state
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Incremental List Update
    filteredChats.forEach((chat, index) => {
        let chatItem = list.querySelector(`.chat-item[data-chat-id="${chat.id}"]`);
        if (chatItem) updateChatListItem(chatItem, chat);
        else {
            chatItem = createChatListItem(chat);
            list.appendChild(chatItem);
        }

        // Reordering
        const currentAtIndex = list.children[index];
        if (currentAtIndex && currentAtIndex !== chatItem) {
            list.insertBefore(chatItem, currentAtIndex);
        } else if (!currentAtIndex) {
            list.appendChild(chatItem);
        }
    });

    // Cleanup
    const validIds = new Set(filteredChats.map(c => c.id));
    Array.from(list.children).forEach(child => {
        if (child.dataset.chatId && !validIds.has(child.dataset.chatId)) child.remove();
    });
}

function updateChatListItem(div, chat) {
    if (chat.id === state.selectedChatId) {
        if (!div.classList.contains('active')) div.classList.add('active');
    } else {
        div.classList.remove('active');
    }

    const lastMsg = chat.lastMessage;
    if (!lastMsg) return;

    let timeStr = '';
    if (lastMsg.time) {
        const time = safeParseDate(lastMsg.time);
        const day = time.getDate().toString().padStart(2, '0');
        const month = (time.getMonth() + 1).toString().padStart(2, '0');
        const isToday = checkIsToday(time);

        timeStr = isToday
            ? time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
            : `${day}.${month}`;
    }

    let preview = lastMsg.text || '';
    if (lastMsg.aiAnswer) preview = '🦆 ' + lastMsg.aiAnswer;
    else if (lastMsg.url_photo) preview = '📷 Фото';
    else if (lastMsg.url_voice) preview = '🎤 Голосове';
    else if (lastMsg.url_video) preview = '🎥 Відео';
    else if (lastMsg.url_video_note) preview = '⭕ Кружок';
    else if (lastMsg.url_location) preview = '📍 Локація';

    const nameEl = div.querySelector('.chat-item-name');
    if (nameEl && nameEl.textContent !== chat.name) nameEl.textContent = chat.name;

    const timeEl = div.querySelector('.chat-item-time');
    if (timeEl && timeEl.textContent !== timeStr) timeEl.textContent = timeStr;

    const previewEl = div.querySelector('.chat-item-preview');
    const previewText = `${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}`;
    if (previewEl && previewEl.textContent !== previewText) previewEl.textContent = previewText;
}

function createChatListItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    if (chat.id === state.selectedChatId) div.classList.add('active');

    const lastMsg = chat.lastMessage;
    let timeStr = '';
    if (lastMsg.time) {
        const time = safeParseDate(lastMsg.time);
        const day = time.getDate().toString().padStart(2, '0');
        const month = (time.getMonth() + 1).toString().padStart(2, '0');
        const isToday = checkIsToday(time);

        timeStr = isToday
            ? time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
            : `${day}.${month}`;
    }

    let preview = lastMsg.text || '';
    if (lastMsg.aiAnswer) preview = '🦆 ' + lastMsg.aiAnswer;
    else if (lastMsg.url_photo) preview = '📷 Фото';
    else if (lastMsg.url_voice) preview = '🎤 Голосове';
    else if (lastMsg.url_video) preview = '🎥 Відео';
    else if (lastMsg.url_video_note) preview = '⭕ Кружок';
    else if (lastMsg.url_location) preview = '📍 Локація';

    div.innerHTML = `
        <div class="chat-item-avatar">
            ${chat.lastMessage.user_avatar_url
            ? `<img src="${chat.lastMessage.user_avatar_url}" alt="${chat.name}" loading="lazy">`
            : `<div class="avatar-placeholder">${(chat.name || 'U').charAt(0).toUpperCase()}</div>`
        }
        </div>
        <div class="chat-item-content">
            <div class="chat-item-header">
                <div class="chat-item-name">${chat.name}</div>
                <div class="chat-item-time">${timeStr}</div>
            </div>
            <div class="chat-item-preview">${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}</div>
        </div>
    `;

    div.dataset.chatId = chat.id;
    div.addEventListener('click', () => selectChat(chat.id));
    return div;
}

export async function selectChat(chatId) {
    // 🌿 Auto-switch to chat view if we are on timeline or other views
    if (state.currentView !== 'chat') {
        if (typeof window.switchView === 'function') {
            window.switchView('chat');
        } else {
            console.warn('switchView global not found');
        }
    }

    state.selectedChatId = chatId;
    window.selectedChatId = chatId;

    // 🌿 Update URL for deep linking
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('chat_id', chatId);
    window.history.pushState({}, '', newUrl);

    // Manual State Logic
    if (typeof loadManualModeState === 'function') loadManualModeState(chatId);

    // Update UI active class
    const list = state.ui.chatList;
    if (list) {
        Array.from(list.children).forEach(item => item.classList.remove('active'));
        const item = list.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
        if (item) item.classList.add('active');
    }

    // 🌿 Messenger-like lazy load (Fetch recent context)
    let chat = state.chatGroups[chatId];
    if (chat && chat.messages.length === 0) {
        if (state.ui.activeChatStatus) state.ui.activeChatStatus.textContent = 'Завантажую історію... 🌿';
        // Always try to fetch current context for this chat
        await fetchSingleChatUpdate(chatId);
        chat = state.chatGroups[chatId]; // refresh
    }

    if (chat) {
        if (state.ui.activeChatName) state.ui.activeChatName.textContent = chat.name;
        if (state.ui.activeChatStatus) state.ui.activeChatStatus.textContent = `${chat.messages.length} messages`;
        renderChatMessages(chatId);

        // Scroll to bottom
        const container = state.ui.messagesContainer;
        if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }

    document.body.classList.add('mobile-chat-active');
}

export function renderChatMessages(chatId, shouldMsgScrollBottom = true, forceClear = false) {
    if (!chatId) return;
    const chat = state.chatGroups[chatId];
    if (!chat) return;
    const container = state.ui.messagesContainer;

    // 🌿 Header Update
    if (state.ui.activeChatName) state.ui.activeChatName.textContent = chat.name || 'Chat';
    if (state.ui.activeChatStatus) state.ui.activeChatStatus.textContent = `${chat.messages.length} messages`;
    updateHeaderAvatar(chat);

    if (lastRenderedChatId !== chatId || forceClear) {
        container.innerHTML = '';
        renderedMessageIds.clear();
        lastRenderedChatId = chatId;
    }

    const prevScrollTop = container.scrollTop;
    const prevScrollHeight = container.scrollHeight;
    const isAtBottom = (prevScrollHeight - prevScrollTop) <= (container.clientHeight + 150);

    let lastDate = null;
    const existingSeparators = container.querySelectorAll('.date-badge');
    if (existingSeparators.length > 0) lastDate = existingSeparators[existingSeparators.length - 1].textContent;

    const sorted = chat.messages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));

    sorted.forEach(msg => appendMessage(msg, container, lastDate, (d) => lastDate = d));

    if (shouldMsgScrollBottom || isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }

    injectPlugins();
}

export function renderTimelineView(forceClear = false) {
    // Reset specific chat state
    state.selectedChatId = null;
    const container = state.ui.messagesContainer;

    if (state.ui.activeChatName) state.ui.activeChatName.textContent = 'Timeline View';
    if (state.ui.activeChatStatus) state.ui.activeChatStatus.textContent = `${state.allMessages.length} total messages`;

    if (lastRenderedChatId !== 'timeline' || forceClear) {
        container.innerHTML = '';
        renderedMessageIds.clear();
        lastRenderedChatId = 'timeline';
    }

    const spinner = container.querySelector('.loading-spinner-container');

    if (state.allMessages.length > 0 && spinner) spinner.remove();
    else if (state.allMessages.length === 0 && !spinner) {
        showEmptyMessagesState();
        return;
    }

    // Capture scrolling for smart update
    const prevScrollTop = container.scrollTop;
    const prevScrollHeight = container.scrollHeight;
    const isAtBottom = (prevScrollHeight - prevScrollTop) <= (container.clientHeight + 150);

    let lastDate = null;
    const existingSeparators = container.querySelectorAll('.date-badge');
    if (existingSeparators.length > 0) lastDate = existingSeparators[existingSeparators.length - 1].textContent;

    const sorted = state.allMessages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
    sorted.forEach(msg => appendMessage(msg, container, lastDate, (d) => lastDate = d));

    if (spinner || isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }

    injectPlugins();
}

function appendMessage(msg, container, lastDate, setLastDate) {
    const mid = msg.message_id?.toString();

    // 🌿 Helper to determine type logic (duplicated from below, could be refactored)
    const isBot = msg.from?.is_bot || msg.from?.id === 'bot' || (typeof msg.user === 'string' && msg.user.includes('Bot'));
    const type = isBot ? 'bot' : 'client';

    // Check if element exists in DOM to update it
    const existingEl = document.getElementById(`msg-${mid}`);
    if (existingEl) {
        // Create new bubble and replace old one to show updates (reactions etc)
        const newBubble = createMessageBubble(msg, type);
        existingEl.replaceWith(newBubble);
        return;
    }

    if (renderedMessageIds.has(mid)) return;

    const msgDate = safeParseDate(msg.time).toLocaleDateString('uk-UA');
    if (msgDate !== lastDate) {
        const separator = document.createElement('div');
        separator.className = 'message-date-separator';
        separator.innerHTML = `<span class="date-badge">${msgDate}</span>`;
        container.appendChild(separator);
        setLastDate(msgDate);
    }

    // const isBot = ... (Moved to top)
    // const type = ... (Moved to top)

    const bubble = createMessageBubble(msg, type);
    container.appendChild(bubble);
    renderedMessageIds.add(mid);

    if (msg.aiAnswer) {
        const aiId = mid + '_ai';
        if (!renderedMessageIds.has(aiId)) {
            const botMsg = { ...msg, text: msg.aiAnswer, from: { first_name: 'Gys Bot 🦆', id: 'bot' }, isBot: true };
            const botBubble = createMessageBubble(botMsg, 'bot');
            botBubble.classList.add('ai-response');
            container.appendChild(botBubble);
            renderedMessageIds.add(aiId);
        }
    }
}

function createMessageBubble(msg, type) {
    // console.log('DEBUG: Rendering message:', msg); 
    const div = document.createElement('div');
    if (msg.message_id) div.id = `msg-${msg.message_id}`; // 🌿 Add ID for updates

    // 🎨 Sticker-only Logic 🌿
    const stickerSrc = msg.url_sticker || msg.url_animated_sticker || msg.sticker?.url || (typeof msg.sticker === 'string' ? msg.sticker : null);
    const animSrc = msg.url_animation || msg.animation?.url || (typeof msg.animation === 'string' ? msg.animation : null);
    const hasText = !!msg.text || !!msg.caption;

    // If it's pure media (sticker/animation) without text, mark as sticker-only
    const isStickerOnly = (stickerSrc || animSrc) && !hasText;

    div.className = `message-bubble ${type} ${isStickerOnly ? 'sticker-only' : ''}`;

    const time = safeParseDate(msg.time);
    const timeStr = time.getTime() === 0 ? '' : time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    let mediaHtml = '';

    // 📷 Photo (Improved detection)
    const photoSrc = msg.url_photo || msg.photo_url || (Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1].url : (msg.photo?.url || msg.photo));
    if (photoSrc && typeof photoSrc === 'string') {
        mediaHtml += `<div class="message-photo message-media"><img src="${photoSrc}" loading="lazy" onclick="expandImage(this.src)"></div>`;
    }

    // 🎥 Video
    const videoSrc = msg.url_video || msg.video_url || msg.video?.url || (typeof msg.video === 'string' ? msg.video : null);
    if (videoSrc) {
        mediaHtml += `<div class="message-video message-media"><video src="${videoSrc}" controls loading="lazy"></video></div>`;
    }

    // ⭕ Video Note (Circular)
    const vNoteSrc = msg.url_video_note || msg.video_note?.url || (typeof msg.video_note === 'string' ? msg.video_note : null);
    if (vNoteSrc) {
        mediaHtml += `
            <div class="message-media circular-progress">
                <video class="video_note" src="${vNoteSrc}" autoplay loop muted playsinline onclick="this.paused ? this.play() : this.pause()"></video>
            </div>
        `;
    }

    // 🎤 Voice / Audio
    const voiceSrc = msg.url_voice || msg.voice_url || msg.voice?.url || msg.audio?.url || (typeof msg.voice === 'string' ? msg.voice : null) || (typeof msg.audio === 'string' ? msg.audio : null);
    if (voiceSrc) {
        mediaHtml += `
            <div class="audio-player message-media">
                <audio src="${voiceSrc}"></audio>
                <button class="play-pause-button">▶</button>
                <div class="progress-bar-container">
                    <div class="progress" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    // 🎨 Sticker (static and animated)
    if (stickerSrc) {
        // Check if it's animated (TGS or WEBM)
        if (stickerSrc.includes('.tgs') || msg.sticker?.is_animated) {
            // TGS Lottie sticker - use tgs-player (requires CORS proxy)
            mediaHtml += `<div class="message-sticker message-media animated-sticker"><tgs-player src="${stickerSrc}" autoplay loop mode="normal" class="sticker-tgs"></tgs-player></div>`;
        } else if (stickerSrc.includes('.webm') || msg.sticker?.is_video) {
            // WEBM video sticker
            mediaHtml += `<div class="message-sticker message-media"><video src="${stickerSrc}" class="sticker" autoplay loop muted playsinline></video></div>`;
        } else {
            // Static sticker (WebP/PNG)
            mediaHtml += `<div class="message-sticker message-media"><img src="${stickerSrc}" class="sticker" loading="lazy"></div>`;
        }
    }

    // 🎬 Animation (GIF)
    if (animSrc) {
        mediaHtml += `<div class="message-animation message-media"><video src="${animSrc}" class="animation" autoplay loop muted playsinline></video></div>`;
    }

    // 📎 Document
    const docSrc = msg.url_document || msg.document?.url || (typeof msg.document === 'string' ? msg.document : null);
    if (docSrc) {
        const fileName = msg.document?.file_name || 'Файл 📎';
        mediaHtml += `
            <div class="message-document message-media">
                <a href="${docSrc}" target="_blank" class="document-link">
                    <div class="document-icon">📎</div>
                    <div class="document-info">
                        <div class="document-name">${fileName}</div>
                    </div>
                </a>
            </div>
        `;
    }

    // 📍 Location (R.I.P. Yandex 🌿)
    const lat = msg.latitude || msg.location?.latitude;
    const lon = msg.longitude || msg.location?.longitude;
    if (lat && lon) {
        // Use a generic beautiful location placeholder instead of Yandex
        const mapPlaceholder = `https://via.placeholder.com/600x400/2b5278/ffffff?text=📍+Location+at+${lat},${lon}`;
        mediaHtml += `
            <div class="location-message message-media">
                <div class="location-card" onclick="window.open('https://www.google.com/maps?q=${lat},${lon}', '_blank')">
                    <div class="location-map-stub" style="background: #17212b; border-radius: 8px; padding: 20px; text-align: center; border: 1px solid #2b5278;">
                         <div style="font-size: 40px; margin-bottom: 10px;">📍</div>
                         <div style="color: #5288c1; font-weight: 600;">Відкрити в Google Maps</div>
                         <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // 📊 Poll
    if (msg.poll || msg.quiz) {
        const poll = msg.poll || msg.quiz;
        const totalVotes = poll.total_voter_count || (poll.options || []).reduce((sum, opt) => sum + (opt.voter_count || 0), 0) || 1;
        const optionsHtml = (poll.options || []).map(opt => {
            const percent = Math.round(((opt.voter_count || 0) / totalVotes) * 100);
            return `
                <div class="poll-option">
                    <div class="poll-option-bar" style="width: ${percent}%"></div>
                    <span class="poll-option-text">${opt.text}</span>
                    <span class="poll-option-percent">${percent}%</span>
                </div>
            `;
        }).join('');
        mediaHtml += `
            <div class="poll-message message-media">
                <div class="poll-question">📊 ${poll.question}</div>
                <div class="poll-options">${optionsHtml}</div>
                <div class="poll-footer">${totalVotes} голосів</div>
            </div>
        `;
    }

    // 📋 Task List
    if (msg.task_list || msg.tasks) {
        const tasks = msg.task_list || msg.tasks;
        const itemsHtml = Array.isArray(tasks)
            ? tasks.map(t => `<div class="task-item">▫️ ${t.text || t}</div>`).join('')
            : `<div class="task-item">▫️ ${tasks}</div>`;
        mediaHtml += `
            <div class="task-list-message message-media">
                <div class="task-header">📋 Список задач</div>
                <div class="task-items">${itemsHtml}</div>
            </div>
        `;
    }

    // 👤 Contact
    if (msg.contact) {
        const fullName = `${msg.contact.first_name || ''} ${msg.contact.last_name || ''}`.trim() || 'Контакт';
        const phone = msg.contact.phone_number || '';
        mediaHtml += `
            <div class="contact-message message-media">
                <div class="contact-icon">👤</div>
                <div class="contact-info">
                    <div class="contact-name">${fullName}</div>
                    <div class="contact-phone">${phone}</div>
                </div>
            </div>
        `;
    }

    // 🎲 Dice
    if (msg.dice) {
        mediaHtml += `
            <div class="dice-message message-media">
                <span class="dice-emoji" style="font-size: 48px;">${msg.dice.emoji}</span>
                <span class="dice-value" style="font-size: 24px; font-weight: bold; margin-left: 10px;">${msg.dice.value}</span>
            </div>
        `;
    }

    // 📍 Venue
    if (msg.venue) {
        const mapUrl = msg.url_location || `https://www.google.com/maps?q=${msg.venue.latitude},${msg.venue.longitude}`;
        mediaHtml += `
            <div class="venue-message message-media" onclick="window.open('${mapUrl}', '_blank')" style="cursor: pointer;">
                <div class="venue-icon">📍</div>
                <div class="venue-info">
                    <div class="venue-title" style="font-weight: 600; color: #5288c1;">${msg.venue.title || 'Venue'}</div>
                    <div class="venue-address" style="font-size: 12px; opacity: 0.7;">${msg.venue.address || ''}</div>
                </div>
            </div>
        `;
    }

    // Formatting text (preserve line breaks and basic HTML)
    let formattedText = (msg.text || msg.caption || '').replace(/\n/g, '<br>');
    if (window.emojione) {
        formattedText = window.emojione.toImage(formattedText);
    }


    // Determine sender name and label
    let senderNameHtm = '';
    if (msg.isBot || type === 'bot') {
        senderNameHtm = '<span class="ai-label">Gys Bot 🦆</span>';
    } else {
        const name = `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim() || msg.user || 'Unknown';
        if (name) senderNameHtm = `<div class="message-sender" style="color: #5288c1; font-weight: 600; font-size: 13px; margin-bottom: 4px;">${name}</div>`;
    }

    // 💬 Reactions HTML 🌿
    let reactionsHtml = '';
    // Telegram format / Simple array / Local Update format
    const reactionsList = msg.reactions?.results || (Array.isArray(msg.reactions) ? msg.reactions : []);

    if (reactionsList.length > 0) {
        const reactionItems = reactionsList.map(r => {
            const emoji = r.type?.emoji || r.emoji || '❤️';
            const count = r.total_count || r.count || 1;
            const isOwn = r.is_own || false; // Check local flag
            // 🌿 Brighter styling for visibility
            const bgStyle = isOwn
                ? 'background: rgba(59, 130, 246, 0.4); border: 1px solid rgba(100, 181, 246, 0.6); color: white;'
                : 'background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.1); color: #e0e0e0;';

            return `<span class="reaction-chip ${isOwn ? 'own' : ''}" data-emoji="${emoji}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; font-size: 14px; font-weight: 500; margin-right: 4px; ${bgStyle} cursor: pointer; transition: all 0.2s;">${emoji}${count > 1 ? `<span style="font-size: 12px; margin-left: 2px;">${count}</span>` : ''}</span>`;
        }).join('');
        reactionsHtml = `<div class="message-reactions" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; position: relative; z-index: 5;">${reactionItems}</div>`;
    }

    // Reaction button (add reaction) 🌿
    const msgId = msg.message_id;
    const chatId = msg.chat?.id || window.selectedChatId;
    const reactionBtn = `<span class="add-reaction-btn" data-msg-id="${msgId}" data-chat-id="${chatId}" style="cursor: pointer; opacity: 0.6; margin-left: 8px; font-size: 14px; transition: opacity 0.2s;" title="Add Reaction" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">➕</span>`;

    // 👤 Avatar HTML 🌿
    let avatarHtml = '';
    if (type !== 'bot' && !msg.isBot) {
        // Use placeholder initially, load async
        const userId = msg.from?.id;
        const userInitials = name ? name[0] : '?';
        const colorIndex = (userId || 0) % 7;
        const colors = ['#e17076', '#eda86c', '#a695e7', '#6ec9cb', '#65aadd', '#ee7aae', '#6bc18e']; // Telegram colors
        const userColor = colors[colorIndex];

        avatarHtml = `
            <div class="message-avatar" data-user-id="${userId}" style="width: 38px; height: 38px; border-radius: 50%; background: ${userColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; margin-right: 10px; flex-shrink: 0; overflow: hidden; position: absolute; bottom: 0; left: -45px;">
                ${userInitials}
            </div>
        `;

        // Async load avatar with spam protection 🌿
        if (userId) {
            const currentUserId = userId; // Closure capture
            setTimeout(async () => {
                try {
                    // Check if already failed previously to avoid re-fetching
                    if (window.failedAvatars && window.failedAvatars.has(currentUserId)) return;

                    const res = await fetch(`/api/get-user-photo?user_id=${currentUserId}`);

                    if (res.ok) {
                        const data = await res.json();
                        if (data.url) {
                            const avatarEl = div.querySelector(`.message-avatar[data-user-id="${currentUserId}"]`);
                            if (avatarEl) {
                                avatarEl.innerHTML = `<img src="${data.url}" style="width: 100%; height: 100%; object-fit: cover;">`;
                            }
                        } else {
                            // 200 OK but no URL (server suppressed 404) 🌿
                            if (!window.failedAvatars) window.failedAvatars = new Set();
                            window.failedAvatars.add(currentUserId);
                            reportAvatarErrors();
                        }
                    } else {
                        // Real network error or 500
                        if (!window.failedAvatars) window.failedAvatars = new Set();
                        window.failedAvatars.add(currentUserId);
                        reportAvatarErrors();
                    }
                } catch (e) {
                    // Network error or other - collect too
                    if (!window.failedAvatars) window.failedAvatars = new Set();
                    window.failedAvatars.add(currentUserId);
                    reportAvatarErrors();
                }
            }, 0);
        }
    }

    // Adjust container style for avatar
    const containerStyle = type !== 'sent' ? 'margin-left: 45px; position: relative;' : '';

    div.innerHTML = `
        <div class="bubble-content" style="${containerStyle}">
            ${type !== 'sent' ? avatarHtml : ''}
            ${senderNameHtm}
            ${mediaHtml}
            ${formattedText ? `<div class="message-text">${formattedText}</div>` : ''}
            ${reactionsHtml}
            <div class="message-footer">
                <span class="message-time">${timeStr}</span>
                ${reactionBtn}
            </div>
        </div>
    `;
    return div;
}

// 🌿 Debounced Error Reporter
let reportTimeout;
function reportAvatarErrors() {
    clearTimeout(reportTimeout);
    reportTimeout = setTimeout(() => {
        if (window.failedAvatars && window.failedAvatars.size > 0) {
            console.groupCollapsed(`⚠️ Avatar Load Report: ${window.failedAvatars.size} failed`);
            console.log('User IDs with no public photo/failed loading:', Array.from(window.failedAvatars));
            console.log('These errors are suppressed to keep console clean.');
            console.groupEnd();
        }
    }, 2000); // Report after 2 seconds of silence
}

function injectPlugins() {
    if (typeof injectVoicePlayer === 'function') injectVoicePlayer();
    if (typeof injectMusicPlayer === 'function') injectMusicPlayer();
    if (window.Prism) window.Prism.highlightAll();
}

// 🌿 Global UI Actions (Restored)
window.expandImage = function (src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.innerHTML = `<img src="${src}" style="max-width:90%;max-height:90%;border-radius:8px;">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
};

window.insertFormatting = function (tag) {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    let insertion = '';

    switch (tag) {
        case 'bold': insertion = `<b>${text.substring(start, end) || 'bold'}</b>`; break;
        case 'italic': insertion = `<i>${text.substring(start, end) || 'italic'}</i>`; break;
        case 'code': insertion = `<code>${text.substring(start, end) || 'code'}</code>`; break;
        case 'pre': insertion = `<pre>${text.substring(start, end) || 'pre'}</pre>`; break;
        case 'link': insertion = `<a href="">${text.substring(start, end) || 'link'}</a>`; break;
        case 'spoiler': insertion = `<span class="tg-spoiler">${text.substring(start, end) || 'spoiler'}</span>`; break;
    }
    input.value = text.substring(0, start) + insertion + text.substring(end);
    input.focus();
};

window.handleManualModeToggle = function (e) {
    console.log('Manual mode toggled:', e.target.checked);
};

// 💬 Reaction Picker Handler 🌿
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('add-reaction-btn')) {
        e.stopPropagation();
        const btn = e.target;
        const msgId = btn.dataset.msgId;
        const chatId = btn.dataset.chatId;

        if (!msgId || !chatId) return;

        // Remove existing picker if any
        document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

        // Create emoji picker with nice grid layout
        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        picker.style.cssText = `
            position: fixed;
            background: linear-gradient(135deg, #1e2c3a 0%, #17212b 100%);
            border: 1px solid #2b5278;
            border-radius: 16px;
            padding: 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            max-width: 280px;
            z-index: 10000;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            animation: fadeIn 0.15s ease-out;
        `;

        // Extended emoji list (Telegram allowed + popular) 🌿
        const emojis = [
            // Row 1: Classic
            '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
            // Row 2: Emotions
            '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
            // Row 3: More
            '🙏', '👌', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳',
            // Row 4: Special
            '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆',
            // Row 5: Fun
            '💔', '🖕', '😐', '🍓', '🍾', '💋', '😴', '👀'
        ];

        emojis.forEach(emoji => {
            const btn = document.createElement('span');
            btn.textContent = emoji;
            btn.style.cssText = `
                cursor: pointer;
                font-size: 22px;
                padding: 6px;
                border-radius: 8px;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
            `;
            btn.onmouseenter = () => {
                btn.style.background = 'rgba(100,181,246,0.25)';
                btn.style.transform = 'scale(1.2)';
            };
            btn.onmouseleave = () => {
                btn.style.background = 'transparent';
                btn.style.transform = 'scale(1)';
            };
            btn.onclick = async () => {
                btn.style.background = 'rgba(100,181,246,0.5)';
                btn.textContent = '⏳';
                try {
                    const res = await fetch('/api/set-reaction', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, message_id: parseInt(msgId), emoji })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    btn.textContent = '✓';

                    // 🌿 Instant UI update - add reaction to message bubble
                    const msgBubble = document.querySelector(`.message-bubble [data-msg-id="${msgId}"]`)?.closest('.message-bubble');
                    if (msgBubble) {
                        let reactionsDiv = msgBubble.querySelector('.message-reactions');
                        if (!reactionsDiv) {
                            reactionsDiv = document.createElement('div');
                            reactionsDiv.className = 'message-reactions';
                            reactionsDiv.style.cssText = 'margin-top: 4px;';
                            const footer = msgBubble.querySelector('.message-footer');
                            if (footer) footer.parentNode.insertBefore(reactionsDiv, footer);
                        }
                        // Remove old own reaction and add new
                        const oldOwn = reactionsDiv.querySelector('.reaction-chip.own');
                        if (oldOwn) oldOwn.remove();
                        const chip = document.createElement('span');
                        chip.className = 'reaction-chip own';
                        chip.style.cssText = 'display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; background: rgba(100, 181, 246, 0.25); border-radius: 12px; font-size: 13px; margin-right: 4px; border: 1px solid rgba(100, 181, 246, 0.4);';
                        chip.textContent = emoji;
                        reactionsDiv.appendChild(chip);
                    }

                    setTimeout(() => picker.remove(), 300);
                    console.log('✅ Reaction set:', emoji);
                } catch (err) {
                    console.error('Failed to set reaction:', err);
                    btn.textContent = '❌';
                    setTimeout(() => { btn.textContent = emoji; }, 1000);
                }
            };
            picker.appendChild(btn);
        });

        // Position picker near button (with viewport bounds check)
        const rect = e.target.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;

        // Adjust if goes off screen
        if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
        if (top + 200 > window.innerHeight) top = rect.top - 200;

        picker.style.left = `${Math.max(10, left)}px`;
        picker.style.top = `${Math.max(10, top)}px`;
        document.body.appendChild(picker);

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = '@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }';
        picker.appendChild(style);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closePicker(evt) {
                if (!picker.contains(evt.target)) {
                    picker.remove();
                    document.removeEventListener('click', closePicker);
                }
            });
        }, 100);
    }
});

// 🌿 Header Avatar Update
function updateHeaderAvatar(chat) {
    const avatarEl = document.getElementById('activeChatAvatar');
    if (!avatarEl) return;

    // Determine ID and Type
    const chatId = String(chat.id);
    const isGroup = chatId.startsWith('-'); // Simple heuristic

    // Initial Placeholder
    const color = getColorForUser(chatId); // Use helper
    const letter = (chat.name || 'C').charAt(0).toUpperCase();

    // Reset classes/style to Ensure circular shape from CSS or inline
    avatarEl.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${color}; border-radius: 50%; color: white; font-weight: bold;">${letter}</div>`;

    // Try Asynchronous Load (Only for private chats primarily, unless we add getChat for groups)
    if (!isGroup) {
        // Use timeout to not block rendering
        setTimeout(async () => {
            try {
                const res = await fetch(`/api/get-user-photo?user_id=${chatId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.url) {
                        avatarEl.innerHTML = `<img src="${data.url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                    }
                }
            } catch (e) { /* Silent fail */ }
        }, 0);
    }
}
