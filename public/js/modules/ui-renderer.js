import { state } from './state.js';
import { fetchMessages, fetchMessagesForDate, fetchSingleChatUpdate } from './api.js';
import { safeParseDate, isToday as checkIsToday, getColorForUser } from './utils.js';
import { avatarManager } from './avatar-manager.js';

let lastRenderedChatId = null;
let renderedMessageIds = new Set();

// 🌿 Expose globally for Prism/Audio injections to find
window.renderChatMessages = renderChatMessages;
window.renderChatListView = renderChatListView;

window.checkScrollBottom = function (chatId) {
    if (!state.ui.messagesContainer) return;
    const container = state.ui.messagesContainer;

    // Simple check: if we are close to bottom, snap to bottom
    // enhanced for "just loaded" scenario by assuming if it's the active chat and we just rendered, we want bottom
    const fromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    // If we are within 300px of bottom, OR if this is the very first load of images (often scrollHeight grows fast)
    // we force scroll.
    if (fromBottom < 400) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
};

// 🎤 Voice Player Controls 🌿
let currentlyPlayingVoice = null;

window.toggleVoice = function (voiceId) {
    const container = document.getElementById(voiceId);
    if (!container) return;

    const audio = container.querySelector('audio');
    const btn = container.querySelector('.voice-play-btn');
    const progress = container.querySelector('.voice-progress');
    const durationEl = container.querySelector('.voice-duration');

    if (!audio) return;

    // Stop other playing voices
    if (currentlyPlayingVoice && currentlyPlayingVoice !== audio) {
        currentlyPlayingVoice.pause();
        const prevContainer = currentlyPlayingVoice.closest('.voice-player');
        if (prevContainer) {
            prevContainer.querySelector('.voice-play-btn')?.classList.remove('playing');
            const prevProgress = prevContainer.querySelector('.voice-progress');
            if (prevProgress) prevProgress.style.width = '0%';
        }
    }

    if (audio.paused) {
        audio.play();
        btn.classList.add('playing');
        currentlyPlayingVoice = audio;

        // Update progress
        audio.ontimeupdate = () => {
            const pct = (audio.currentTime / audio.duration) * 100;
            progress.style.width = `${pct}%`;

            // Update time display
            const remaining = audio.duration - audio.currentTime;
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60);
            durationEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
        };

        audio.onended = () => {
            btn.classList.remove('playing');
            progress.style.width = '0%';
            currentlyPlayingVoice = null;
            // Reset duration
            const dur = audio.duration || 0;
            durationEl.textContent = `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`;
        };
    } else {
        audio.pause();
        btn.classList.remove('playing');
        currentlyPlayingVoice = null;
    }
};

window.seekVoice = function (event, voiceId) {
    const container = document.getElementById(voiceId);
    if (!container) return;

    const audio = container.querySelector('audio');
    const waveform = container.querySelector('.voice-waveform');

    if (!audio || !waveform || !audio.duration) return;

    const rect = waveform.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * audio.duration;

    // Auto-play if not playing
    if (audio.paused) {
        window.toggleVoice(voiceId);
    }
};

// 🌿 Telegram/Markdown text formatter
function formatMessageText(text) {
    if (!text && text !== 0) return ''; // Allow 0 to be printed if needed, else strict check

    let result = String(text);

    // Escape HTML first (security)
    result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks ```lang\ncode``` → <pre><code>
    result = result.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'plaintext';
        const highlighted = window.Prism?.highlight?.(code.trim(), window.Prism.languages[language] || window.Prism.languages.plaintext, language) || code;
        return `<pre class="language-${language}"><code>${highlighted}</code></pre>`;
    });

    // Inline code `text` → <code>
    result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold **text** → <strong>
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic *text* (single star, not **) → <em>
    result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Strikethrough ~~text~~ → <del>
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Spoiler ||text|| → <span class="spoiler">
    result = result.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    // Quote >text (at line start)
    result = result.replace(/^&gt;(.+)$/gm, '<blockquote class="quote">$1</blockquote>');

    // Line breaks
    result = result.replace(/\n/g, '<br>');

    return result;
}

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
        const isToday = checkIsToday(time);

        // Check Yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = time.getDate() === yesterday.getDate() &&
            time.getMonth() === yesterday.getMonth() &&
            time.getFullYear() === yesterday.getFullYear();

        if (isToday) {
            timeStr = time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        } else if (isYesterday) {
            const timePart = time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            timeStr = `Вчора ${timePart}`;
        } else {
            // "18 січ" format
            timeStr = time.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }).replace('.', '');
        }
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

    // 🌿 Update Avatar from Cache if available
    const chatIdStr = String(chat.id);
    const userId = !chatIdStr.startsWith('-') ? chat.id : null;
    const initials = getInitials(chat.name);

    // 1. Check API photo first (e.g. updated from server poll)
    console.log(`🖼️ Chat list avatar for ${chat.id}: photo=${chat.photo}`);
    if (chat.photo && chat.photo !== 'none') {
        const avatarContainer = div.querySelector('.chat-item-avatar');
        if (avatarContainer) {
            const img = avatarContainer.querySelector('img');
            if (img && img.src !== chat.photo) img.src = chat.photo;
            else if (!img) avatarContainer.innerHTML = `<img src="${chat.photo}" class="chat-list-avatar" data-user-id="${userId}" alt="${chat.name}" loading="lazy" onerror="this.remove(); this.parentElement ? this.parentElement.innerText = '${initials}' : null;">`;
        }
    } else if (userId) {
        // 2. Check Cache
        avatarManager.getAvatar(userId, (url) => {
            if (url) {
                const avatarContainer = div.querySelector('.chat-item-avatar');
                if (avatarContainer) {
                    const img = avatarContainer.querySelector('img');
                    if (img && img.src !== url) img.src = url;
                    else if (!img) avatarContainer.innerHTML = `<img src="${url}" class="chat-list-avatar" data-user-id="${userId}" alt="${chat.name}" loading="lazy" onerror="this.remove(); this.parentElement ? this.parentElement.innerText = '${initials}' : null;">`;
                }
            }
        });
    }
}

function createChatListItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    if (chat.id === state.selectedChatId) div.classList.add('active');

    const lastMsg = chat.lastMessage;
    let timeStr = '';
    if (lastMsg.time) {
        const time = safeParseDate(lastMsg.time);
        const isToday = checkIsToday(time);

        // Check Yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = time.getDate() === yesterday.getDate() &&
            time.getMonth() === yesterday.getMonth() &&
            time.getFullYear() === yesterday.getFullYear();

        if (isToday) {
            timeStr = time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        } else if (isYesterday) {
            const timePart = time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            timeStr = `Вчора ${timePart}`;
        } else {
            // "18 січ" format
            timeStr = time.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }).replace('.', '');
        }
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
            ${(() => {
            const chatIdStr = String(chat.id);
            const userId = !chatIdStr.startsWith('-') ? chat.id : null;

            // 🌿 AvatarManager Usage
            if (userId) {
                const cached = avatarManager.getAvatar(userId, (url) => {
                    if (url) {
                        const img = document.querySelector(`.chat-item[data-chat-id="${chat.id}"] .chat-item-avatar img`);
                        if (img) img.src = url;
                        else {
                            // If placeholder was there, replace it
                            const container = document.querySelector(`.chat-item[data-chat-id="${chat.id}"] .chat-item-avatar`);
                            if (container) container.innerHTML = `<img src="${url}" class="chat-list-avatar" loading="lazy">`;
                        }
                    }
                });
                if (cached) {
                    return `<img src="${cached}" class="chat-list-avatar" alt="${chat.name}" loading="lazy">`;
                }
            }

            return chat.lastMessage.user_avatar_url
                ? `<img src="${chat.lastMessage.user_avatar_url}" class="chat-list-avatar" alt="${chat.name}" loading="lazy">`
                : `<div class="avatar-placeholder chat-list-avatar" data-user-id="${userId || ''}">${(chat.name || 'U').charAt(0).toUpperCase()}</div>`;
        })()}
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
    // 🌿 Trigger Loading Overlay immediately to mask rendering
    if (typeof window.showChatLoading === 'function') window.showChatLoading();

    try {
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
    } catch (e) {
        console.error('Select Chat Error:', e);
        window.hideChatLoading(); // Force hide on error
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

    // 🌿 Track if this is a NEW chat (for scroll logic)
    const isNewChat = lastRenderedChatId !== chatId;

    if (isNewChat || forceClear) {
        container.innerHTML = '';
        renderedMessageIds.clear();
        lastRenderedChatId = chatId;
    }

    // 🌿 SCROLL FIX: Check position BEFORE render
    const prevScrollTop = container.scrollTop;
    const prevScrollHeight = container.scrollHeight;
    const wasAtBottom = (prevScrollHeight - prevScrollTop) <= (container.clientHeight + 150);

    // Sort messages by time (oldest first)
    const sorted = [...chat.messages].sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));

    // Track lastDate properly from beginning
    let lastDate = null;

    sorted.forEach(msg => appendMessage(msg, container, lastDate, (d) => lastDate = d));

    // 🌿 SCROLL LOGIC (Robust for Images)
    // - New chat: ALWAYS scroll to bottom
    if (isNewChat || shouldMsgScrollBottom || wasAtBottom) {
        container.scrollTop = container.scrollHeight;

        // 🌿 Smart Image Scroll: Only scroll if user is STILL near bottom
        // This prevents "jumping" if user starts scrolling up while images load
        const images = container.querySelectorAll('img');
        images.forEach(img => {
            img.onload = () => {
                const isNearBottom = (container.scrollHeight - container.scrollTop) <= (container.clientHeight + 250);
                if (isNearBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            };
        });
    }

    // 🌿 Hide Loading Overlay after render (if active)
    if (isNewChat) {
        // slightly longer delay to ensure first paint is done
        setTimeout(() => window.hideChatLoading(), 600);
    }

    injectPlugins();
}

// 🌿 Global Loading Overlay Controls
window.showChatLoading = function () {
    const overlay = document.getElementById('chat-loading-overlay');
    if (overlay) overlay.classList.add('visible');
    // Also scroll bottom immediately to prepare
    const container = state.ui.messagesContainer;
    if (container) {
        container.scrollTop = container.scrollHeight;
        // Double tap for layout shifts
        requestAnimationFrame(() => {
            if (container) container.scrollTop = container.scrollHeight;
        });
    }

    // 🌿 SAFETY FALLBACK: Force hide after 5s just in case
    clearTimeout(window.chatLoaderSafety);
    window.chatLoaderSafety = setTimeout(() => {
        window.hideChatLoading();
    }, 5000);
};

window.hideChatLoading = function () {
    clearTimeout(window.chatLoaderSafety);
    const overlay = document.getElementById('chat-loading-overlay');
    if (overlay) overlay.classList.remove('visible');
};

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

    // Sort messages by time (oldest first)
    const sorted = [...state.allMessages].sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));

    // 🌿 FIX CHRONOLOGY: Check if we need full re-render
    const existingSeparators = container.querySelectorAll('.date-badge');
    if (existingSeparators.length > 0 && sorted.length > 0) {
        const firstMsgDate = safeParseDate(sorted[0].time).toLocaleDateString('uk-UA');
        const firstDomDate = existingSeparators[0].textContent;

        if (firstMsgDate !== firstDomDate) {
            console.log('📅 Chronology mismatch, full re-render');
            container.innerHTML = '';
            renderedMessageIds.clear();
            lastRenderedChatId = null; // Force reset logic
        }
    }

    // 🌿 If we cleared above, lastRenderedChatId is null, so loop below works fine.

    let lastDate = null;
    sorted.forEach(msg => appendMessage(msg, container, lastDate, (d) => lastDate = d));

    if (spinner || isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }

    injectPlugins();
}

function appendMessage(msg, container, lastDate, setLastDate) {
    const mid = msg.message_id?.toString();

    // 🌿 Robust Bot Search
    const isBot = msg.isBot === true ||
        msg.from?.is_bot === true ||
        msg.from?.id === 'bot' ||
        String(msg.from?.id || '').startsWith('-') === false && (msg.from?.username?.toLowerCase().includes('bot') || msg.from?.first_name?.toLowerCase().includes('bot')) ||
        (typeof msg.user === 'string' && msg.user.toLowerCase().includes('bot'));

    const type = isBot ? 'bot' : 'client';

    // 🌿 ANTI-GHOST CHECK: Check actual DOM existence first
    const existingEl = document.getElementById(`msg-${mid}`);

    if (existingEl) {
        // 🌿 CRITICAL: Don't touch messages with active media playback!
        const activeAudio = existingEl.querySelector('audio');
        const activeVideo = existingEl.querySelector('video');

        if (activeAudio && !activeAudio.paused) return; // Audio playing - SKIP
        if (activeVideo && !activeVideo.paused && !activeVideo.muted) return; // Video playing - SKIP

        // 🌿 SMART HASH: Update only if content changed
        const contentHash = getMessageHash(msg);
        if (existingEl.dataset.hash === contentHash) {
            return; // No changes - SKIP
        }

        // Update content (replace element to be safe and simple)
        const newBubble = createMessageBubble(msg, type);
        newBubble.dataset.hash = contentHash;
        existingEl.replaceWith(newBubble);
        return;
    }

    // 🌿 DOUBLE CHECK: If we are here, element SHOULD NOT exist. 
    // If renderedMessageIds has it but DOM doesn't, it's fine (re-render).
    // If DOM has it (query selector lookup), we caught it above.

    // Calculate Hash
    const contentHash = getMessageHash(msg);

    const msgDate = safeParseDate(msg.time).toLocaleDateString('uk-UA');
    if (msgDate !== lastDate) {
        // Check if separator already exists for this date to avoid duplicates
        // (Simplified check - usually appended sequentially)
        const separator = document.createElement('div');
        separator.className = 'message-date-separator';
        separator.innerHTML = `<span class="date-badge">${msgDate}</span>`;
        container.appendChild(separator);
        setLastDate(msgDate);
    }

    const bubble = createMessageBubble(msg, type);
    bubble.dataset.hash = contentHash; // Set initial hash
    container.appendChild(bubble);
    renderedMessageIds.add(mid);

    if (msg.aiAnswer) {
        const aiId = mid + '_ai';
        const aiExisting = document.getElementById(`msg-${aiId}`);
        if (!aiExisting && !renderedMessageIds.has(aiId)) {
            const botMsg = { ...msg, message_id: aiId, text: msg.aiAnswer, from: { first_name: 'Gys Bot 🦆', id: 'bot' }, isBot: true };
            const botBubble = createMessageBubble(botMsg, 'bot');
            botBubble.classList.add('ai-response');
            botBubble.id = `msg-${aiId}`; // Ensure ID
            container.appendChild(botBubble);
            renderedMessageIds.add(aiId);
        }
    }
}

// 🌿 Helper for Smart Diffing
function getMessageHash(msg) {
    const parts = [
        msg.message_id,
        msg.text || '',
        JSON.stringify(msg.reactions || []),
        msg.url_photo || msg.url_voice || msg.url_video || '',
        msg.edit_date || '',
        msg.aiAnswer || '' // Include AI answer in hash
    ];
    // Simple fast hash
    return parts.join('|').split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0).toString(36);
}

function createMessageBubble(msg, type) {
    // console.log('DEBUG: Rendering message:', msg); 
    const div = document.createElement('div');
    if (msg.message_id) div.id = `msg-${msg.message_id}`; // 🌿 Add ID for updates

    // 🎨 Media-only (Transparent/Premium) Logic 🌿
    const stickerSrc = msg.url_sticker || msg.url_animated_sticker || msg.sticker?.url || (typeof msg.sticker === 'string' ? msg.sticker : null);
    const animSrc = msg.url_animation || msg.animation?.url || (typeof msg.animation === 'string' ? msg.animation : null);
    const photoSrc = msg.url_photo || msg.photo_url || (Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1].url : (msg.photo?.url || msg.photo));
    const vNoteSrc = msg.url_video_note || msg.video_note?.url || (typeof msg.video_note === 'string' ? msg.video_note : null);

    const hasText = !!msg.text || !!msg.caption;

    // If it's pure media without text, mark as sticker-only (uses transparent theme)
    const isStickerOnly = (stickerSrc || animSrc || photoSrc || vNoteSrc) && !hasText;

    // Force alignment style for bot messages to override any CSS conflicts 🌿
    const alignmentStyle = type === 'bot' ? 'justify-content: flex-end;' : 'justify-content: flex-start;';
    div.className = `message-bubble ${type} ${isStickerOnly ? 'sticker-only' : ''}`;
    div.style.cssText = alignmentStyle;

    const time = safeParseDate(msg.time);
    const timeStr = time.getTime() === 0 ? '' : time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let mediaHtml = '';

    // 📷 Photo (Improved detection)
    if (photoSrc && typeof photoSrc === 'string') {
        const imgId = `img-${msg.message_id}`;
        // 🌿 Add onload handler to fix scroll after image loads
        mediaHtml += `
            <div class="message-photo message-media loading-media">
                <img id="${imgId}" src="${photoSrc}" loading="lazy" 
                     onload="this.parentElement.classList.remove('loading-media'); checkScrollBottom('${msg.chat?.id || window.selectedChatId}')"
                     onclick="expandImage(this.src)">
            </div>`;
    }

    // 🎥 Video
    const videoSrc = msg.url_video || msg.video_url || msg.video?.url || (typeof msg.video === 'string' ? msg.video : null);
    if (videoSrc) {
        mediaHtml += `<div class="message-video message-media loading-media"><video src="${videoSrc}" controls loading="lazy" onloadeddata="this.parentElement.classList.remove('loading-media'); checkScrollBottom('${msg.chat?.id || window.selectedChatId}')"></video></div>`;
    }

    // ⭕ Video Note (Circular)
    if (vNoteSrc) {
        mediaHtml += `
            <div class="message-media circular-progress">
                <video class="video_note" src="${vNoteSrc}" autoplay loop muted playsinline onclick="this.paused ? this.play() : this.pause()"></video>
            </div>
        `;
    }

    // 🎤 Voice / Audio — Telegram-style waveform player 🌿
    const voiceSrc = msg.url_voice || msg.voice_url || msg.voice?.url || msg.audio?.url || (typeof msg.voice === 'string' ? msg.voice : null) || (typeof msg.audio === 'string' ? msg.audio : null);
    if (voiceSrc) {
        const voiceId = `voice-${msg.message_id}`;
        const duration = msg.voice?.duration || msg.audio?.duration || 0;
        const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '0:00';

        // Generate DETERMINISTIC waveform bars based on message_id (no random!) 🌿
        const seed = parseInt(msg.message_id) || 12345;
        const bars = Array.from({ length: 40 }, (_, i) => {
            // Deterministic pseudo-random: sin-based hash
            const hash = Math.sin(seed * 0.0001 + i * 0.7) * 10000;
            const h = 8 + Math.abs((hash % 20)) + Math.abs(Math.sin(seed + i * 0.3) * 8);
            return Math.min(28, Math.max(4, Math.round(h)));
        });
        const waveformPath = bars.map((h, i) =>
            `<rect x="${i * 4}" y="${30 - h}" width="2.5" height="${h}" rx="1" fill="currentColor" opacity="0.5"/>`
        ).join('');

        mediaHtml += `
            <div class="voice-player message-media" id="${voiceId}" data-src="${voiceSrc}">
                <audio src="${voiceSrc}" preload="metadata"></audio>
                <button class="voice-play-btn" onclick="window.toggleVoice('${voiceId}')">
                    <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <div class="voice-waveform" onclick="window.seekVoice(event, '${voiceId}')">
                    <svg class="waveform-svg" viewBox="0 0 160 30" preserveAspectRatio="none">
                        ${waveformPath}
                    </svg>
                    <div class="voice-progress"></div>
                </div>
                <span class="voice-duration">${durationStr}</span>
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

    // 🌿 Format text with Telegram-style markup: **bold**, *italic*, `code`, ~~strike~~, ||spoiler||
    let formattedText = formatMessageText(msg.text || msg.caption || '');
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

    // 💬 Reactions HTML 🌿 (Robust parsing ✨)
    let reactionsHtml = '';
    const rawReactions = msg.reactions || [];
    let reactionsList = Array.isArray(rawReactions) ? rawReactions : (rawReactions.results || []);

    // Handle object format { "👍": 1 } or specific Bot API structures
    if (!Array.isArray(reactionsList) && typeof rawReactions === 'object' && Object.keys(rawReactions).length > 0) {
        reactionsList = Object.entries(rawReactions).map(([emoji, data]) => ({
            emoji,
            count: typeof data === 'number' ? data : (data.count || data.total_count || 1),
            is_own: data.is_own || (typeof data === 'object' && data.is_own) || false
        }));
    }

    if (reactionsList && reactionsList.length > 0) {
        const reactionItems = reactionsList.map(r => {
            const emoji = r.type?.emoji || r.emoji || '❤️';
            const count = r.total_count || r.count || 1;
            const isOwn = r.is_own || false;

            // 🌿 Unified Reaction Styles (Standard pills for all types)
            const chipStyle = 'padding: 4px 10px; border-radius: 16px; margin-right: 4px; backdrop-filter: blur(4px); box-shadow: 0 2px 4px rgba(0,0,0,0.2); ' + (isOwn
                ? 'background: rgba(59, 130, 246, 0.75); border: 1px solid rgba(100, 181, 246, 0.5); color: white;'
                : 'background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #e0e0e0;');

            return `<span class="reaction-chip ${isOwn ? 'own' : ''}" data-emoji="${emoji}" style="${chipStyle}">${emoji}${count > 1 ? `<span class="reaction-count" style="margin-left:4px; font-size: 0.9em; opacity: 0.9;">${count}</span>` : ''}</span>`;
        }).join('');

        // 🌿 Consistent container for all types
        const reactionsContainerStyle = 'margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; position: relative; z-index: 5; pointer-events: auto;';

        reactionsHtml = `<div class="message-reactions" style="${reactionsContainerStyle}">${reactionItems}</div>`;
    }

    // Reaction button (add reaction) 🌿
    const msgId = msg.message_id;
    const chatId = msg.chat?.id || window.selectedChatId;
    const reactionBtn = `<span class="add-reaction-btn" data-msg-id="${msgId}" data-chat-id="${chatId}" style="cursor: pointer; opacity: 0; margin-left: 6px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%;" title="Add Reaction">
        <svg class="replace-emoji-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    </span>`;

    // 👤 Avatar HTML 🌿
    let avatarHtml = '';
    const isReceived = type === 'client';

    if (isReceived) {
        const userId = msg.from?.id;
        const userInitials = name ? name[0] : '?';
        const colorIndex = (userId || 0) % 7;
        const colors = ['#e17076', '#eda86c', '#a695e7', '#6ec9cb', '#65aadd', '#ee7aae', '#6bc18e'];
        const userColor = colors[colorIndex];

        // 🌿 Backend-Provided Avatar (Fast!)
        let avatarImg = userInitials;
        if (msg.from?.photo_url && msg.from.photo_url !== 'none') {
            // Will try to load, onerror shows initials if fails
            avatarImg = `<img src="${msg.from.photo_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerText = '${userInitials}';">`;
        }

        // 🌿 Using standard flex item instead of absolute positioning
        avatarHtml = `
            <div class="message-avatar" data-user-id="${userId}" 
                 style="width: 35px; height: 35px; border-radius: 50%; background: ${userColor}; color: white; 
                        display: flex; align-items: center; justify-content: center; font-weight: bold; 
                        font-size: 14px; flex-shrink: 0; overflow: hidden; margin-right: 10px; align-self: flex-end; 
                        margin-bottom: 2px;">
                ${avatarImg}
            </div>
        `;
    }

    // 🌿 Telegram-style: reactions LEFT, time RIGHT (same row)
    let metaReactionsHtml = '';
    if (reactionsList && reactionsList.length > 0) {
        metaReactionsHtml = reactionsList.map(r => {
            const emoji = r.type?.emoji || r.emoji || '❤️';
            const count = r.total_count || r.count || 1;
            return `<span class="reaction-chip">${emoji}${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}</span>`;
        }).join('');
    }

    div.innerHTML = `
        ${avatarHtml}
        <div class="bubble-content">
            ${isStickerOnly ? '' : senderNameHtm}
            ${mediaHtml}
            ${formattedText ? `<div class="message-text">${formattedText}</div>` : ''}
            
            ${metaReactionsHtml ? `<div class="message-reactions">${metaReactionsHtml}</div>` : ''}
            
            <!-- 🌿 Absolute Time (No more reaction button!) -->
            <div class="message-meta">
                <span class="message-time">${timeStr}</span>
            </div>
        </div>
    `;

    // 🌿 Right-Click Context Menu for Reactions
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (window.showReactionPicker) {
            window.showReactionPicker(e, msg.message_id, state.selectedChatId);
        }
    });

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

// 💬 Reaction Picker Logic 🌿
window.showReactionPicker = function (e, msgId, chatId) {
    // Remove existing
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

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

    // Position near mouse
    const x = Math.min(e.clientX, window.innerWidth - 300);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    picker.style.left = `${x}px`;
    picker.style.top = `${y}px`;

    const emojis = [
        '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
        '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
        '🙏', '👌', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳',
        '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆',
        '💔', '🖕', '😐', '🍓', '🍾', '💋', '😴', '👀'
    ];

    emojis.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `cursor: pointer; font-size: 22px; padding: 6px; border-radius: 8px; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;`;

        btn.onmouseenter = () => { btn.style.background = 'rgba(100,181,246,0.25)'; btn.style.transform = 'scale(1.2)'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.transform = 'scale(1)'; };

        btn.onclick = async () => {
            await window.handleReaction(chatId, msgId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Close on outside click
    const closeListener = (evt) => {
        if (!picker.contains(evt.target)) {
            picker.remove();
            document.removeEventListener('click', closeListener);
        }
    };
    // Delay slightly to avoid immediate close from the triggering click
    setTimeout(() => document.addEventListener('click', closeListener), 10);
};

// Handle Reaction API Call
window.handleReaction = async function (chatId, msgId, emoji) {
    // ... existing logic needed? Or just import `setReaction` from api.js if available? 
    // UI Renderer usually doesn't do direct API calls unless imported.
    // Let's assume we use fetch directly or global.
    try {
        const response = await fetch('/api/set-reaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: msgId, emoji: emoji })
        });
        const data = await response.json();
        if (data.success) {
            console.log(`✅ Reacted ${emoji} to ${msgId}`);
        } else {
            console.error('Reaction failed:', data.error);
        }
        // Optimistic update handled by socket/polling usually
    } catch (e) { console.error(e); }
};

// 💬 Reaction Picker Logic 🌿
window.showReactionPicker = function (e, msgId, chatId) {
    // Remove existing
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

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

    // Position near mouse
    const x = Math.min(e.clientX, window.innerWidth - 300);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    picker.style.left = `${Math.max(10, x)}px`;
    picker.style.top = `${Math.max(10, y)}px`;

    // Extended emoji list (Telegram allowed + popular) 🌿
    const emojis = [
        '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
        '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
        '🙏', '👌', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳',
        '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆',
        '💔', '🖕', '😐', '🍓', '🍾', '💋', '😴', '👀'
    ];

    emojis.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `cursor: pointer; font-size: 22px; padding: 6px; border-radius: 8px; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;`;

        btn.onmouseenter = () => { btn.style.background = 'rgba(100,181,246,0.25)'; btn.style.transform = 'scale(1.2)'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.transform = 'scale(1)'; };

        btn.onclick = async () => {
            btn.textContent = '⏳';
            try {
                // Call API directly or via helper
                await fetch('/api/set-reaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: msgId, reaction: emoji })
                });

                // Optimistic UI Update within state
                if (window.state && window.state.chatGroups) {
                    const chat = window.state.chatGroups[chatId];
                    if (chat && chat.messages) {
                        const m = chat.messages.find(msg => msg.message_id?.toString() === msgId.toString());
                        if (m) {
                            if (!m.reactions || Array.isArray(m.reactions)) m.reactions = { results: [] };
                            m.reactions.results = (m.reactions.results || []).filter(r => !r.is_own);
                            m.reactions.results.push({ emoji: emoji, count: 1, total_count: 1, is_own: true });
                        }
                    }
                }

                // Re-render
                if (typeof renderChatMessages === 'function') renderChatMessages(chatId, false);
                picker.remove();
                console.log(`Reacted ${emoji} to ${msgId}`);

            } catch (e) {
                console.error(e);
                btn.textContent = '❌';
                setTimeout(() => btn.textContent = emoji, 1000);
            }
        };
        picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Close on outside click
    setTimeout(() => {
        const closeListener = (evt) => {
            if (!picker.contains(evt.target)) {
                picker.remove();
                document.removeEventListener('click', closeListener);
            }
        };
        document.addEventListener('click', closeListener);
    }, 100);
};

// 🌿 Header Avatar Update
function updateHeaderAvatar(chat) {
    const avatarEl = document.getElementById('activeChatAvatar');
    if (!avatarEl) return;

    // 🌿 Cache Check: Don't re-render if it's the same chat already displayed
    if (avatarEl.getAttribute('data-chat-id') === String(chat.id)) {
        return;
    }
    avatarEl.setAttribute('data-chat-id', chat.id);

    // Determine ID and Type
    const chatId = String(chat.id);
    const isGroup = chatId.startsWith('-'); // Simple heuristic

    // Initial Placeholder
    const color = getColorForUser(chatId); // Use helper
    const letter = (chat.name || 'C').charAt(0).toUpperCase();

    // Reset classes/style to Ensure circular shape from CSS or inline
    avatarEl.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${color}; border-radius: 50%; color: white; font-weight: bold;">${letter}</div>`;

    // 🌿 Use Backend-Provided Info
    console.log(`🖼️ Header avatar for chat ${chat.id}: photo=${chat.photo}`);
    if (chat.photo && chat.photo !== 'none') {
        avatarEl.innerHTML = `<img src="${chat.photo}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" onerror="this.remove(); this.parentElement ? this.parentElement.innerText = '${letter}' : null;">`;
    } else {
        // Initials fallback (Already set above)
        // No client-side fetch!
    }
}

// 🌿 Centralized Avatar Loader Helper
function requestAvatarLoad(userId) {
    if (!userId) return;

    // Initialize caches
    if (!window.userAvatarCache) window.userAvatarCache = new Map();
    if (!window.pendingAvatarRequests) window.pendingAvatarRequests = new Set();
    if (!window.failedAvatars) window.failedAvatars = new Set();

    // Check fast paths
    if (window.userAvatarCache.has(userId)) return; // Already cached
    if (window.pendingAvatarRequests.has(userId)) return; // Already loading
    if (window.failedAvatars.has(userId)) return; // Already failed

    window.pendingAvatarRequests.add(userId);

    fetch(`/api/get-user-photo?user_id=${userId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.url) {
                window.userAvatarCache.set(userId, data.url);
                // Live update

                // 1. Message Bubbles
                document.querySelectorAll(`.message-avatar[data-user-id="${userId}"]`).forEach(el => {
                    el.innerHTML = `<img src="${data.url}" style="width: 100%; height: 100%; object-fit: cover;">`;
                });

                // 2. Chat List Avatars
                document.querySelectorAll(`.chat-list-avatar[data-user-id="${userId}"]`).forEach(el => {
                    if (el.tagName !== 'IMG') {
                        const img = document.createElement('img');
                        img.src = data.url;
                        img.className = 'chat-list-avatar';
                        img.setAttribute('data-user-id', userId);
                        img.setAttribute('alt', 'Avatar');
                        img.loading = 'lazy';
                        el.replaceWith(img);
                    } else if (el.src !== data.url) {
                        el.src = data.url;
                    }
                });
            } else {
                window.failedAvatars.add(userId);
            }
        })
        .catch(err => {
            console.warn(`Failed to load avatar for ${userId}:`, err);
            window.failedAvatars.add(userId);
        })
        .finally(() => {
            window.pendingAvatarRequests.delete(userId);
        });
}

// 🌿 Helper for Initials (Restored)
export function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
}
