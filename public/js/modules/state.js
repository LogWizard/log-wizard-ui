
// 🌿 State Management Module
export const state = {
    currentView: 'chat', // 'chat' or 'timeline'
    selectedChatId: null,
    allMessages: [],
    chatGroups: {},
    selectedDate: '',
    latestMessageId: 0,
    isLoadingHistory: false,
    lastHistoryLoadTime: 0,
    allDatesLoaded: [],
    currentDatePointer: null,
    chatSearchQuery: '',
    showArchive: false, // 🌿 Archive Toggle

    // UI Refs (will be set on init)
    ui: {
        chatList: null,
        messagesContainer: null,
        activeChatName: null,
        activeChatStatus: null,
        chatViewBtn: null,
        timelineViewBtn: null,
        statsViewBtn: null,
        chatSearchInput: null,
        calendarToggle: null,
        calendarPopup: null,
        manualModeToggle: null,
        toggleLabel: null
    }
};

// Global Exposure for legacy/inline scripts compatibility
window.state = state;
window.chatGroups = state.chatGroups;
window.allMessages = state.allMessages;
window.selectedChatId = state.selectedChatId;

export function setState(key, value) {
    state[key] = value;
    // Sync globals
    if (key === 'chatGroups') window.chatGroups = value;
    if (key === 'allMessages') window.allMessages = value;
    if (key === 'selectedChatId') window.selectedChatId = value;

    // Auto-save important state
    if (['chatGroups', 'allMessages', 'selectedChatId'].includes(key)) {
        saveState();
    }
}

export function saveState() {
    // 🌿 Cache disabled by user request to prevent stale data issues
    // try {
    //     const dataToSave = {
    //         chatGroups: state.chatGroups,
    //         allMessages: state.allMessages,
    //         selectedChatId: state.selectedChatId,
    //         latestMessageId: state.latestMessageId
    //     };
    //     localStorage.setItem('gys_chat_state', JSON.stringify(dataToSave));
    // } catch (e) { console.error('Cache save failed', e); }
}

export function loadState() {
    try {
        const saved = localStorage.getItem('gys_chat_state');
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(state, data);
            // Sync globals after load
            window.chatGroups = state.chatGroups;
            window.allMessages = state.allMessages;
            window.selectedChatId = state.selectedChatId;
            return true;
        }
    } catch (e) { console.error('Cache load failed', e); }
    return false;
}
