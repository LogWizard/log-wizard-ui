import { state, setState } from './state.js';
import { renderChatListView, renderChatMessages, renderTimelineView, showEmptyMessagesState } from './ui-renderer.js';
import { safeParseDate } from './utils.js';

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

        // 🌿 CHAT LIST UPDATE (Always fetch global list if in chat view)
        if (state.currentView === 'chat' || dateParam === '') {
            const response = await fetch('/api/get-all-chats');
            if (response.ok) {
                const chats = await response.json();
                const groups = { ...state.chatGroups };
                chats.forEach(c => {
                    if (groups[c.id]) {
                        groups[c.id].name = c.name || groups[c.id].name;
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
                            avatar: null
                        };
                    }
                });
                setState('chatGroups', groups);
                renderChatListView();

                // 🌿 AUTO-UPDATE ACTIVE CHAT
                if (state.selectedChatId && state.chatGroups[state.selectedChatId] && state.currentView === 'chat') {
                    await fetchSingleChatUpdate(state.selectedChatId);
                }
            }
        }

        // 🌿 TIMELINE / DATE / GLOBAL MESSAGES (Sync)
        // Defaults to 'today' if we are in timeline and no date is set
        if (state.currentView === 'timeline' && !dateParam) {
            dateParam = new Date().toLocaleDateString('uk-UA');
        }

        // If we still have no date and no chat, and it's not a global sync attempt, we might return
        // BUT for a "normal messenger" feel, we SHOULD fetch today's global activity on start
        if (!dateParam && !state.selectedChatId) {
            dateParam = new Date().toLocaleDateString('uk-UA');
        }

        // Fetch Messages
        const dateResponse = await fetch(`/messages?since=${state.latestMessageId}&date=${dateParam || ''}&group=allPrivate`).catch(() => null);

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
                    if (!newAllMessages.find(m => m.message_id?.toString() === mid)) {
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
        const chatRes = await fetch(`/messages?group=${chatId}`);
        if (chatRes.ok) {
            const newMsgs = await chatRes.json();
            if (newMsgs.length > 0) {
                const currentMsgs = state.chatGroups[chatId].messages;
                let updated = false;

                newMsgs.forEach(msg => {
                    // Ensure ID is string for robust finding 🌿
                    const mid = msg.message_id?.toString();
                    if (!currentMsgs.find(m => m.message_id?.toString() === mid)) {
                        currentMsgs.push(msg);
                        // Sync global
                        if (!state.allMessages.find(m => m.message_id?.toString() === mid)) {
                            state.allMessages.push(msg);
                        }
                        updated = true;
                    }
                });

                if (updated) {
                    state.allMessages.sort((a, b) => safeParseDate(a.time) - safeParseDate(b.time));
                    distributeMessagesToGroups();
                    // renderChatMessages(chatId, false, true); // Avoid full clear on auto-sync!
                    renderChatMessages(chatId, false, false);
                    renderChatListView();
                }
            }
        }
    } catch (e) { console.error('Auto-update chat failed', e); }
}

export function distributeMessagesToGroups() {
    const groups = state.chatGroups;

    // Clear previous message arrays to rebuild from state.allMessages truth
    Object.values(groups).forEach(g => { g.messages = []; });

    // Pass 1: Categorize
    state.allMessages.forEach(msg => {
        // 🌿 FIX: Для повідомлень бота використовуємо chat.id замість from.id
        // Щоб відповіді бота йшли в чат користувача, а не в окрему групу
        const isBot = msg.from?.is_bot === true;
        const userId = isBot
            ? (msg.chat?.id || msg.from?.id || 'unknown')  // Bot messages go to chat
            : (msg.from?.id || msg.chat?.id || msg.user_id || 'unknown');  // User messages

        if (!groups[userId]) {
            groups[userId] = {
                id: userId,
                name: isBot
                    ? (state.chatGroups[msg.chat?.id]?.name || msg.chat?.first_name || 'Chat')
                    : (msg.from?.first_name ? `${msg.from.first_name} ${msg.from.last_name || ''}` : msg.user || userId).trim(),
                messages: [],
                lastMessage: msg,
                avatar: null
            };
        }
        groups[userId].messages.push(msg);
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
