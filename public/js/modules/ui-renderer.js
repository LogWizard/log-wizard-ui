import { state } from './state.js';
import { fetchMessages, fetchMessagesForDate, fetchSingleChatUpdate, sendReaction } from './api.js';
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

        // 🌿 Restore Draft
        const savedDraft = localStorage.getItem(`draft_${chatId}`);
        const input = document.getElementById('messageInput');

        if (savedDraft) {
            if (window.quill) {
                // Determine if it's HTML or plain text (legacy drafts might be plain)
                // Quill handles HTML usually.
                window.quill.root.innerHTML = savedDraft;
            }
            if (input) input.value = savedDraft; // Sync legacy input
        } else {
            // Clear input if no draft
            if (window.quill && window.quill.root.innerHTML !== '<p><br></p>') {
                window.quill.root.innerHTML = '<p><br></p>';
            }
            if (input) input.value = '';
        }

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

        // 🌿 Robust Sticky Scroll (New Chat): Force bottom for 1000ms
        // This handles late headers, lazy images, and layout reflows without locking user too long.
        if (isNewChat) {
            const start = Date.now();
            const loop = () => {
                if (container) container.scrollTop = container.scrollHeight;
                if (Date.now() - start < 1000) requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        } else {
            // Standard backup for new messages
            setTimeout(() => {
                if (container) container.scrollTop = container.scrollHeight;
            }, 150);
        }

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
    const msgDate = safeParseDate(msg.time).toLocaleDateString('uk-UA'); // 🌿 Move Up for Badge Logic

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

        if (activeAudio && !activeAudio.paused) { setLastDate(msgDate); return; } // Audio playing - SKIP
        if (activeVideo && !activeVideo.paused && !activeVideo.muted) { setLastDate(msgDate); return; } // Video playing - SKIP

        // 🌿 SMART HASH: Update only if content changed
        const contentHash = getMessageHash(msg);
        if (existingEl.dataset.hash === contentHash) {
            setLastDate(msgDate); // 🌿 CRITICAL FIX: Update date even if skipped
            return; // No changes - SKIP
        }

        // Update content (replace element to be safe and simple)
        const newBubble = createMessageBubble(msg, type);
        newBubble.dataset.hash = contentHash;
        existingEl.replaceWith(newBubble);
        setLastDate(msgDate);
        return;
    }

    // 🌿 DOUBLE CHECK: If we are here, element SHOULD NOT exist. 
    // If renderedMessageIds has it but DOM doesn't, it's fine (re-render).
    // If DOM has it (query selector lookup), we caught it above.

    // Calculate Hash
    const contentHash = getMessageHash(msg);

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



    // 🕵️‍♂️ GHOST BUSTER: OKAK TRAP 🌿
    if ((msg.text && msg.text.includes('OKAK')) || (msg.caption && msg.caption.includes('OKAK'))) {
        console.error('👻 GHOST FOUND: "OKAK" detected in message!', msg);
        // Highlight it visibly in UI
        div.style.border = '2px solid red';
    }

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

    const msgId = msg.message_id;
    const chatId = msg.chat?.id || msg.chat_id || window.selectedChatId;



    // Handle object format { "👍": 1 } or specific Bot API structures
    if (!Array.isArray(reactionsList) && typeof rawReactions === 'object' && Object.keys(rawReactions).length > 0) {
        reactionsList = Object.entries(rawReactions).map(([emoji, data]) => ({
            emoji,
            count: typeof data === 'number' ? data : (data.count || data.total_count || 1),
            is_own: data.is_own || (typeof data === 'object' && data.is_own) || false
        }));
    }

    if (reactionsList && reactionsList.length > 0) {
        // 🌿 Filter out reactions with 0 count unless they are 'own' (pending update)
        const visibleReactions = reactionsList.filter(r => (r.total_count || r.count || 0) > 0 || r.is_own);

        const reactionItems = visibleReactions.map(r => {
            const emoji = r.type?.emoji || r.emoji || '❤️';
            const count = r.total_count || r.count || 1;
            const isOwn = r.is_own === true || r.is_own === 1 || String(r.is_own) === 'true'; // Robust check ✨

            // 🌿 Unified Reaction Styles (Standard pills for all types)
            const chipStyle = 'padding: 4px 10px; border-radius: 16px; margin-right: 4px; backdrop-filter: blur(4px); box-shadow: 0 2px 4px rgba(0,0,0,0.2); ' + (isOwn
                ? 'background: rgba(59, 130, 246, 0.75); border: 1px solid rgba(100, 181, 246, 0.5); color: white;'
                : 'background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #e0e0e0; pointer-events: none; opacity: 0.8;');

            return `<span class="reaction-chip ${isOwn ? 'own' : 'inert'}" data-emoji="${emoji}" style="${chipStyle} ${isOwn ? 'cursor: pointer;' : 'cursor: default;'}" ${isOwn ? `onclick="event.stopPropagation(); window.handleReaction('${chatId}', '${msgId}', '${emoji}')"` : ''}>${emoji}${count > 1 ? `<span class="reaction-count" style="margin-left:4px; font-size: 0.9em; opacity: 0.9;">${count}</span>` : ''}</span>`;
        }).join('');

        if (reactionItems) {
            const reactionsContainerStyle = 'margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; position: relative; z-index: 5; pointer-events: auto;';
            reactionsHtml = `<div class="message-reactions" style="${reactionsContainerStyle}">${reactionItems}</div>`;
        }
    }

    // Reaction button (add reaction) 🌿
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

    div.innerHTML = `
        ${avatarHtml}
        <div class="bubble-content">
            ${isStickerOnly ? '' : senderNameHtm}
            ${mediaHtml}
            ${formattedText ? `<div class="message-text">${formattedText}</div>` : ''}

            ${(() => {
            // 🌿 Edit History Rendering
            if (msg.edit_history && Array.isArray(msg.edit_history) && msg.edit_history.length > 0) {
                const editsList = msg.edit_history.map((edit, idx) => {
                    const editTime = safeParseDate(edit.date).toLocaleString('uk-UA');
                    let text = formatMessageText(edit.text || edit.caption || '<i>[Media Only]</i>');
                    if (window.emojione) text = window.emojione.toImage(text);
                    return `
                            <div class="edit-item" style="margin-bottom:8px; padding:4px; background:rgba(0,0,0,0.2); border-radius:4px;">
                                <div style="font-size:11px; color:#64b5f6; margin-bottom:2px;">v${idx + 1} • ${editTime}</div>
                                <div style="font-size:13px;">${text}</div>
                            </div>`;
                }).join('');

                return `
                        <div class="edit-history-container" style="margin-top: 6px;">
                            <div class="edit-history-toggle" onclick="const c=this.nextElementSibling; c.style.display=c.style.display==='none'?'block':'none'; this.innerText = c.style.display==='none' ? '✏️ Edited (${msg.edit_history.length})' : '🔼 Hide History'" style="font-size:11px; color:#888; cursor:pointer; user-select:none;">✏️ Edited (${msg.edit_history.length})</div>
                            <div class="edit-history-content" style="display:none; margin-top:6px; border-left: 2px solid #64b5f6; padding-left: 8px;">
                                ${editsList}
                            </div>
                        </div>`;
            }
            return '';
        })()}
            
            ${reactionsHtml || ''}
            
            <!-- 🌿 Absolute Time (No more reaction button!) -->
            <div class="message-meta">
                <span class="message-time">${timeStr}</span>
            </div>
        </div>
    `;

    // 🌿 Right-Click Context Menu for Reactions
    div.addEventListener('contextmenu', (e) => {
        console.log(`🖱️ Context Menu requested for Msg ID: ${msg.message_id} in Chat: ${chatId}`);
        if (window.showReactionPicker) {
            e.preventDefault(); // Moved here to ensure we only block if we handle it
            window.showReactionPicker(chatId, msg.message_id, e);
        } else {
            console.warn('⚠️ window.showReactionPicker is missing!');
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
// 🌿 Show Context Menu (Reaction Picker)
window.showReactionPicker = function (chatId, msgId, e) {
    e.preventDefault();
    e.stopPropagation();

    // Close any existing
    document.querySelectorAll('.context-menu').forEach(p => p.remove());

    // 0. 🌿 Force Inject Styles (Failsafe)
    if (!document.getElementById('context-menu-styles')) {
        const style = document.createElement('style');
        style.id = 'context-menu-styles';
        style.textContent = `
            .context-menu {
                position: fixed;
                background: #17212b;
                border: 1px solid #2b5278;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                border-radius: 12px;
                z-index: 99999;
                padding: 8px;
                width: 280px;
                backdrop-filter: blur(10px);
                animation: menuFadeIn 0.15s ease-out;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            @keyframes menuFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .context-menu-toolbar {
                display: flex;
                gap: 8px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(82, 136, 193, 0.2);
                transition: all 0.2s ease-out;
            }
            /* Confirmation State Styling */
            .context-menu-toolbar.confirming {
                border-bottom-color: #e17076;
            }
            .context-action-btn {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px;
                border-radius: 8px;
                background: rgba(43, 82, 120, 0.3);
                color: #e0e0e0;
                cursor: pointer;
                transition: all 0.2s;
            }
            .context-action-btn:hover {
                background: #2b5278;
                color: white;
            }
            .context-action-btn.delete:hover {
                background: #e17076;
            }
            .context-action-btn.confirm-delete {
                background: rgba(229, 57, 53, 0.2);
                color: #e53935;
            }
            .context-action-btn.confirm-delete:hover {
                background: #d32f2f;
                color: white;
            }
            .context-action-btn.cancel-delete {
                background: rgba(255, 255, 255, 0.1);
            }
            .context-action-btn.cancel-delete:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .emoji-grid {
                display: grid;
                grid-template-columns: repeat(8, 1fr);
                gap: 4px;
                max-height: 200px;
                overflow-y: auto;
                padding: 4px 0;
            }
            .emoji-btn {
                font-size: 20px;
                padding: 4px;
                cursor: pointer;
                text-align: center;
                border-radius: 6px;
                transition: background 0.2s;
            }
            .emoji-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                transform: scale(1.2);
            }
        `;
        document.head.appendChild(style);
        console.log('💉 Context Menu CSS injected!');
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // 1. Position Logic
    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 280;
    const menuHeight = 300;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 2. Toolbar Container
    const toolbar = document.createElement('div');
    toolbar.className = 'context-menu-toolbar';
    menu.appendChild(toolbar);

    // Initial Buttons Render Function
    const renderDefaultButtons = () => {
        toolbar.innerHTML = '';
        toolbar.classList.remove('confirming');

        // Edit Button
        const editBtn = document.createElement('div');
        editBtn.className = 'context-action-btn edit';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        editBtn.title = "Редагувати";
        editBtn.onclick = () => {
            if (window.initEditMessage) window.initEditMessage(chatId, msgId);
            menu.remove();
        };

        // Delete Button (Triggers Confirmation)
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'context-action-btn delete';
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        `;
        deleteBtn.title = "Видалити";
        deleteBtn.onclick = () => renderConfirmationButtons(); // Swap to confirm mode

        toolbar.appendChild(editBtn);
        toolbar.appendChild(deleteBtn);
    };

    // Confirmation Buttons Render Function
    const renderConfirmationButtons = () => {
        toolbar.innerHTML = ''; // Clear
        toolbar.classList.add('confirming'); // Add red style hint

        // Confirm (Check)
        const confirmBtn = document.createElement('div');
        confirmBtn.className = 'context-action-btn confirm-delete';
        confirmBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        confirmBtn.title = "Підтвердити видалення";
        confirmBtn.onclick = async () => {
            // Loading State
            confirmBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>`;

            try {
                // Delete Logic (Replicated from message-sender.js logic but inline)
                const msgEl = document.querySelector(`.message-bubble[data-message-id="${msgId}"]`);
                if (msgEl) msgEl.style.opacity = '0.5'; // Optimistic

                const { deleteMessage } = await import('../modules/api.js'); // Assuming relative path correct or mapped
                // If path fails, fallback to window.initDeleteMessage if available, or try absolute.
                // Since this is in `ui-renderer.js` inside `js/modules`, path to `api.js` is just `./api.js`.
                // BUT `api.js` is imported in `main.js`. 
                // Let's rely on global fallback if needed currently or correct path.
                // Path from `public/js/modules/ui-renderer.js` to `public/js/modules/api.js` is `./api.js`.
                const res = await deleteMessage(chatId, msgId);

                if (res.success) {
                    if (msgEl) msgEl.remove();
                    // State cleanup
                    if (state.allMessages) state.allMessages = state.allMessages.filter(m => String(m.message_id) !== String(msgId));
                    console.log('🗑️ Deleted via context menu');
                } else {
                    alert('Error: ' + (res.error || 'Failed'));
                    if (msgEl) msgEl.style.opacity = '1';
                }
            } catch (e) {
                console.error('Context Delete Error:', e);
                // Fallback to global if import fails?
                alert('Delete failed');
            }
            menu.remove();
        };

        // Cancel (Cross)
        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'context-action-btn cancel-delete';
        cancelBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        cancelBtn.title = "Скасувати";
        cancelBtn.onclick = () => renderDefaultButtons(); // Revert

        toolbar.appendChild(confirmBtn);
        toolbar.appendChild(cancelBtn);
    };

    // Initialize Default State
    renderDefaultButtons();


    // 3. Emoji Grid
    const emojiGrid = document.createElement('div');
    emojiGrid.className = 'emoji-grid';

    const emojis = [
        '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
        '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
        '🙏', '👌', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳',
        '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆'
    ];

    emojis.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.className = 'emoji-btn';
        btn.onclick = async () => {
            await window.handleReaction(chatId, msgId, emoji);
            menu.remove();
        };
        emojiGrid.appendChild(btn);
    });

    menu.appendChild(emojiGrid);
    document.body.appendChild(menu);

    // Close Handler
    const closeListener = (evt) => {
        if (!menu.contains(evt.target)) {
            console.log('🖐️ Closing Context Menu (Click Outside)');
            menu.remove();
            document.removeEventListener('click', closeListener);
        }
    };
    // 🌿 Delay slightly to avoid immediate trigger
    setTimeout(() => document.addEventListener('click', closeListener), 100);
};



// Handle Reaction API Call (Toggle Logic) 🌿
window.handleReaction = async function (chatId, msgId, emoji) {
    if (!chatId || !msgId) return;

    // 1. Find Message in State
    const msg = state.chatGroups[chatId]?.messages.find(m => String(m.message_id) === String(msgId))
        || state.allMessages.find(m => String(m.message_id) === String(msgId));

    if (!msg) return;

    // 2. Determine Action
    let reactions = msg.reactions?.results || (Array.isArray(msg.reactions) ? msg.reactions : []);
    if (!Array.isArray(reactions)) reactions = [];

    // Normalize logic
    const existing = reactions.find(r => (r.type?.emoji || r.emoji) === emoji);
    const action = (existing && existing.is_own) ? 'remove' : 'add';

    // 3. Optimistic Update (Visual)
    if (action === 'remove') {
        if (existing) {
            existing.is_own = false;
            if (existing.total_count > 0) existing.total_count--;
            // If count 0, remove from list
            if (existing.total_count <= 0) {
                reactions = reactions.filter(r => r !== existing);
            }
        }
    } else {
        // 🌿 Enforce Single Reaction for Bot (Clear others)
        reactions.forEach(r => {
            const rEmoji = r.type?.emoji || r.emoji;
            if (rEmoji !== emoji && r.is_own) {
                r.is_own = false;
                if (r.total_count > 0) r.total_count--;
            }
        });

        if (existing) {
            if (!existing.is_own) {
                existing.is_own = true;
                existing.total_count++;
            }
        } else {
            reactions.push({ type: { emoji }, emoji, total_count: 1, is_own: true });
        }
    }

    // Save back to msg
    if (msg.reactions?.results) msg.reactions.results = reactions;
    else msg.reactions = reactions;

    // 4. Force UI Refresh (Important for removal sync!) 🌿
    if (state.currentView === 'chat' && state.selectedChatId == chatId) {
        // Clear cached ID to force re-render of this message
        renderedMessageIds.delete(String(msgId));
        renderChatMessages(chatId, false);
    } else if (state.currentView === 'timeline') {
        // Find element and update manually? Too hard.
        // renderTimelineView(); // might be slow.
    }

    // 5. Send Request
    try {
        await sendReaction(chatId, msgId, emoji, action);
    } catch (e) {
        console.error('Reaction toggle failed:', e);
    }
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
    console.log(`🖼️ Header avatar for chat ${chat.id}: photo = ${chat.photo}`);
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

    fetch(`/ api / get - user - photo ? user_id = ${userId} `)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.url) {
                window.userAvatarCache.set(userId, data.url);
                // Live update

                // 1. Message Bubbles
                document.querySelectorAll(`.message - avatar[data - user - id="${userId}"]`).forEach(el => {
                    el.innerHTML = `< img src = "${data.url}" style = "width: 100%; height: 100%; object-fit: cover;" > `;
                });

                // 2. Chat List Avatars
                document.querySelectorAll(`.chat - list - avatar[data - user - id="${userId}"]`).forEach(el => {
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
            console.warn(`Failed to load avatar for ${userId}: `, err);
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
// 🌿 Custom Confirm Modal (Replaces native confirm)
window.showConfirmModal = function (title, text, onConfirm) {
    // 1. Create Overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    // 2. Create Modal Content
    overlay.innerHTML = `
        < div class="custom-modal" >
            <h3>${title}</h3>
            <p>${text}</p>
            <div class="custom-modal-actions">
                <button class="modal-btn cancel" id="modalCancelBtn">Відміна</button>
                <button class="modal-btn danger" id="modalConfirmBtn">Видалити</button>
            </div>
        </div >
        `;

    // 3. Append to body
    document.body.appendChild(overlay);

    // 4. Handlers
    const close = () => {
        overlay.style.opacity = '0'; // Fade out
        setTimeout(() => overlay.remove(), 200);
    };

    const cancelBtn = overlay.querySelector('#modalCancelBtn');
    if (cancelBtn) cancelBtn.onclick = close;

    const confirmBtn = overlay.querySelector('#modalConfirmBtn');
    if (confirmBtn) confirmBtn.onclick = () => {
        close();
        if (typeof onConfirm === 'function') onConfirm();
    };

    // Close on click outside
    overlay.onclick = (e) => {
        if (e.target === overlay) close();
    };
};

