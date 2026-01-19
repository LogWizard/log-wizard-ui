import { state, setState } from './state.js';
import { renderChatListView, renderChatMessages, renderTimelineView, showEmptyMessagesState } from './ui-renderer.js';
import { safeParseDate } from './utils.js';
import { avatarManager } from './avatar-manager.js'; // 🌿 API module also needs this 

// 🌿 API Interaction Module

export async function getSettingsFromServer() {
    try {
        const response = await fetch('/getSettings');
        if (response.ok) {
            const settings = await response.json();
            // Assuming server returns date in specific format
            if (settings.Date) {
                // Check if it's "today" or specific
                // Not strictly updating state.selectedDate here unless needed 
            }
            return settings;
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
    }
    return {};
}

export async function setSettingsToServer(data) {
    try {
        await fetch('/saveSettings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

export async function fetchMessages() {
    try {
        let dateParam = state.selectedDate || '';

        // 🌿 CHAT LIST UPDATE (Throttled: Fetch list max once every 15s unless no chats loaded)
        const now = Date.now();
        if ((state.currentView === 'chat' || dateParam === '') &&
            (Object.keys(state.chatGroups).length === 0 || now - (state.lastChatListUpdate || 0) > 15000)) {

            state.lastChatListUpdate = now;
            // 🌿 Archive flag to filter chats
            const archiveParam = state.showArchive ? '?include_archive=true' : '?include_archive=false';
            const response = await fetch(`/api/get-all-chats${archiveParam}`);
            if (response.ok) {
                const chats = await response.json();

                // 🌿 Optimized Chat List Update: Only render if data changed
                const chatsHash = JSON.stringify(chats.map(c => ({ id: c.id, last: c.lastMessage?.time })));
                if (state._lastChatsHash !== chatsHash) {
                    const groups = { ...state.chatGroups };
                    chats.forEach(c => {
                        if (groups[c.id]) {
                            groups[c.id].name = c.name || groups[c.id].name;
                            groups[c.id].photo = c.photo; // 🌿 Update photo

                            if (c.lastMessage && (!groups[c.id].lastMessage || safeParseDate(c.lastMessage.time) > safeParseDate(groups[c.id].lastMessage.time))) {
                                groups[c.id].lastMessage = c.lastMessage;
                            }
                        } else {
                            groups[c.id] = {
                                id: c.id,
                                name: c.name || c.id,
                                messages: [],
                                lastDate: c.lastDate || null,
                                lastMessage: c.lastMessage || { time: null, text: 'History' },
                                photo: c.photo, // 🌿 Save photo
                                avatar: null
                            };
                        }
                    });
                    state.chatGroups = groups;
                    state._lastChatsHash = chatsHash;
                    renderChatListView();
                    avatarManager.preloadAvatars(chats);
                }

                // 🌿 AUTO-UPDATE ACTIVE CHAT (Conditional)
                if (state.selectedChatId && state.chatGroups[state.selectedChatId] && state.currentView === 'chat') {
                    await fetchSingleChatUpdate(state.selectedChatId);
                }
            }
        }

        // If we still have no date and no chat, do NOT force "Today". Default to "Latest" via Limit.
        // if (!dateParam && !state.selectedChatId) {
        //     dateParam = new Date().toLocaleDateString('uk-UA');
        // }

        // Fetch Messages 🌿 include_archive flag
        const archiveParam = state.showArchive ? '&include_archive=true' : '';

        // 🌿 Logic: If date is set, use it. If not, fetch latest 200 messages (Limit).
        // using 'limit' param instructs server to sort DESC, take N, then reverse to ASC.
        const limitParam = dateParam ? '' : '&limit=200';
        const dateQuery = dateParam ? `&date=${dateParam}` : '';

        // If we have latestMessageId, we could use it as 'since'.
        // But if we want initial load to be "Latest", we start with since=0 (or whatever state has).
        // If state.latestMessageId > 0, we are updating. Limit might restrict "how many new ones" or "context".
        // Actually, if simply polling for new, 'since' is better without limit if we expect few.
        // But to be safe vs flood, Limit is good.

        const dateResponse = await fetch(`/messages?since=${state.latestMessageId}${dateQuery}${limitParam}&group=allPrivate${archiveParam}`).catch(() => null);

        if (dateResponse && dateResponse.ok) {
            const messages = await dateResponse.json();

            if (messages.length > 0) {
                // Update latest ID with the maximum found
                const ids = messages.map(m => parseInt(m.message_id)).filter(id => !isNaN(id));
                if (ids.length > 0) {
                    state.latestMessageId = Math.max(...ids, state.latestMessageId);
                }

                const newAllMessages = [...state.allMessages];
                messages.forEach(msg => {
                    const mid = msg.message_id?.toString();
                    const existingIndex = newAllMessages.findIndex(m => m.message_id?.toString() === mid);
                    if (existingIndex !== -1) {
                        // Update existing message (legacy merge or replace? Replace is safer for reactions)
                        newAllMessages[existingIndex] = msg;
                    } else {
                        newAllMessages.push(msg);
                    }
                });

                // Sort robustly
                newAllMessages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
                setState('allMessages', newAllMessages);

                // Re-Distribute to Groups
                distributeMessagesToGroups();

                // UI Update
                if (state.currentView === 'chat') {
                    renderChatListView();
                    // 🌿 Fix: Only scroll on first load or if near bottom
                    const shouldScroll = messages.length > 0 && !state.hasInitialScroll; // Simplified assumption
                    if (state.selectedChatId) renderChatMessages(state.selectedChatId, false);
                } else {
                    renderTimelineView();
                }
            } else if (state.currentView === 'timeline' && state.allMessages.length === 0) {
                showEmptyMessagesState();
            }
        }
    } catch (error) {
        // 🌿 Silent fail for network jitters - don't spam the console unless it's a real crash
        if (error.name !== 'TypeError') {
            console.error('API Error:', error);
        }
    }
}

export async function fetchSingleChatUpdate(chatId) {
    try {
        // 🌿 FIX: Fetch LATEST 50 messages to ensure we get updates, not oldest 500
        const chatRes = await fetch(`/messages?group=${chatId}&limit=50`);
        if (chatRes.ok) {
            const newMsgs = await chatRes.json();
            if (newMsgs.length > 0) {
                const currentMsgs = state.chatGroups[chatId].messages;
                let updated = false;

                newMsgs.forEach(msg => {
                    // Ensure ID is string for robust finding 🌿
                    const mid = msg.message_id?.toString();
                    const existingIndex = currentMsgs.findIndex(m => m.message_id?.toString() === mid);

                    if (existingIndex !== -1) {
                        currentMsgs[existingIndex] = msg;
                        // Sync global
                        const globalIndex = state.allMessages.findIndex(m => m.message_id?.toString() === mid);
                        if (globalIndex !== -1) state.allMessages[globalIndex] = msg;
                        updated = true;
                    } else {
                        currentMsgs.push(msg);
                        // Sync global
                        if (!state.allMessages.find(m => m.message_id?.toString() === mid)) {
                            state.allMessages.push(msg);
                        }
                        updated = true;
                    }
                });

                // 🌿 Sort to ensure chronological order (Fixes duplicate date badges)
                currentMsgs.sort((a, b) => {
                    const tA = a.date instanceof Date ? a.date.getTime() / 1000 : a.date;
                    const tB = b.date instanceof Date ? b.date.getTime() / 1000 : b.date;
                    return tA - tB;
                });

                // Also sort global if we modified it
                state.allMessages.sort((a, b) => {
                    const tA = a.date instanceof Date ? a.date.getTime() / 1000 : a.date;
                    const tB = b.date instanceof Date ? b.date.getTime() / 1000 : b.date;
                    return tA - tB;
                });

                if (updated) {
                    distributeMessagesToGroups(); // Optional but safer for other views
                    if (state.currentView === 'chat' && state.selectedChatId === chatId) {
                        try {
                            renderChatMessages(chatId, false);
                        } catch (e) { console.warn('Render error:', e); }
                    } else if (state.currentView === 'timeline') {
                        renderTimelineView();
                    }
                    renderChatListView();
                }
            }
        }
    } catch (error) {
        console.error('Chat Update Error:', error);
    }
}

export function distributeMessagesToGroups() {
    const groups = state.chatGroups;

    // Clear previous message arrays to rebuild from state.allMessages truth
    Object.values(groups).forEach(g => { g.messages = []; });

    // Pass 1: Categorize
    state.allMessages.forEach(msg => {
        // 🌿 FIX: Consistent Grouping Logic
        // We want to group by "Conversation ID" (Chat ID). 
        // 1. Try DB field `chat_id` (most reliable)
        // 2. Try nested `chat.id` (Telegram object)
        // 3. Fallback to `user_id` / `from.id` only if private and chat_id missing

        let conversationId = msg.chat_id || msg.chat?.id;

        if (!conversationId) {
            // Fallbacks for edge cases
            if (msg.isBot || msg.from?.is_bot) {
                conversationId = msg.chat_id || msg.chat?.id || msg.from?.id; // Bot msg -> Chat
            } else {
                conversationId = msg.from?.id || msg.user_id; // User msg -> User is the chat
            }
        }

        // Ensure string for consistent keys
        const groupId = String(conversationId || 'unknown');

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                name: (msg.chat?.title || msg.chat?.first_name || (msg.from?.first_name ? `${msg.from.first_name} ${msg.from.last_name || ''}` : msg.user) || 'Chat').trim(),
                messages: [],
                lastMessage: msg,
                avatar: null
            };
        }
        groups[groupId].messages.push(msg);
    });

    // Pass 2: Sort each group once
    Object.values(groups).forEach(g => {
        if (g.messages.length > 0) {
            g.messages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
            g.lastMessage = g.messages[g.messages.length - 1];
        }
    });
}

export async function fetchMessagesForDate(dateParam) {
    if (!dateParam) return;
    try {
        console.log(`🌿 Lazy loading messages for ${dateParam}...`);
        const response = await fetch(`/messages?since=0&date=${dateParam}&group=allPrivate`);
        if (response.ok) {
            const messages = await response.json();
            if (messages.length > 0) {
                const newAllMessages = [...state.allMessages];
                messages.reverse().forEach(msg => {
                    if (!newAllMessages.find(m => m.message_id === msg.message_id)) {
                        newAllMessages.push(msg);
                    }
                });
                newAllMessages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
                setState('allMessages', newAllMessages);
                distributeMessagesToGroups();
                renderChatListView();
            }
        }
    } catch (e) { console.error('Lazy load error:', e); }
}



export async function loadPreviousDateMessages() {
    const now = Date.now();
    if (state.isLoadingHistory || (now - state.lastHistoryLoadTime < 1000)) return;
    state.isLoadingHistory = true;
    state.lastHistoryLoadTime = now;

    // Date Logic
    let dateBasis;
    if (state.currentDatePointer) {
        dateBasis = state.currentDatePointer;
    } else if (state.selectedDate) {
        const parts = state.selectedDate.split('.');
        if (parts.length === 3) dateBasis = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else if (state.allMessages.length > 0) {
        dateBasis = safeParseDate(state.allMessages[0].time);
    }

    if (!dateBasis || isNaN(dateBasis.getTime())) dateBasis = new Date();

    const previousDate = new Date(dateBasis);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toLocaleDateString('uk-UA');

    if (state.allDatesLoaded.includes(previousDateStr)) {
        state.isLoadingHistory = false;
        return;
    }

    console.log(`🌿 Loading history from ${previousDateStr}...`);

    try {
        const response = await fetch(`/messages?since=0&date=${previousDateStr}&group=allPrivate`);
        if (!response.ok) {
            state.isLoadingHistory = false;
            // Mark as loaded to avoid immediate retry loop if server errors
            state.allDatesLoaded.push(previousDateStr);
            return;
        }

        const messages = await response.json();

        if (messages.length > 0) {
            const scrollHeight = state.ui.messagesContainer.scrollHeight;

            messages.reverse().forEach(msg => {
                if (!state.allMessages.find(m => m.message_id === msg.message_id)) {
                    state.allMessages.push(msg);
                }
            });

            state.allMessages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
            distributeMessagesToGroups();
            renderChatListView();

            // Render & Restore Scroll (Force clear to fix chronology)
            if (state.currentView === 'chat' && state.selectedChatId) {
                renderChatMessages(state.selectedChatId, false, true);
                state.ui.messagesContainer.scrollTop = state.ui.messagesContainer.scrollHeight - scrollHeight;
            } else if (state.currentView === 'timeline') {
                renderTimelineView(true);
                const newScrollHeight = state.ui.messagesContainer.scrollHeight;
                state.ui.messagesContainer.scrollTop = newScrollHeight - scrollHeight;
            }
        } else {
            console.log(`📭 No messages found for ${previousDateStr}`);
        }

        // Track the pointer and loaded status
        state.allDatesLoaded.push(previousDateStr);
        state.currentDatePointer = previousDate;

    } catch (error) {
        console.error('Error loading previous date:', error);
    }

    // Add small delay before allowing next load to let DOM settle
    setTimeout(() => {
        state.isLoadingHistory = false;
    }, 300);
}

export async function sendReaction(chatId, messageId, emoji, action = 'add') {
    try {
        const response = await fetch('/api/set-reaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, emoji, action })
        });
        return await response.json();
    } catch (error) {
        console.error('Error sending reaction:', error);
        return { success: false, error: error.message };
    }
}
