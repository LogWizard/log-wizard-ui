// ========== Configuration & Global State 🌿🦆 ==========

emojione.ascii = true;

// Global state
export const state = {
    currentView: 'chat', // 'chat', 'timeline', or 'stats'
    selectedChatId: null,
    allMessages: [],
    chatGroups: {},
    selectedDate: new Date().toLocaleDateString('uk-UA'),
    latestMessageId: 0,
    isLoadingHistory: false,
    allDatesLoaded: [],
    currentDatePointer: null,
    chatSearchQuery: ''
};

// DOM elements cache
export const elements = {
    chatList: document.getElementById('chat-list'),
    messagesContainer: document.getElementById('messages-container'),
    activeChatName: document.getElementById('activeChatName'),
    activeChatStatus: document.getElementById('activeChatStatus'),
    chatViewBtn: document.getElementById('chatViewBtn'),
    timelineViewBtn: document.getElementById('timelineViewBtn'),
    statsViewBtn: document.getElementById('statsViewBtn'),
    chatSearchInput: document.getElementById('chatSearch'),
    calendarToggle: document.getElementById('calendarToggle'),
    selectedDateBadge: document.getElementById('selectedDateBadge'),
    selectedDateText: document.getElementById('selectedDateText'),
    clearDateFilter: document.getElementById('clearDateFilter')
};
