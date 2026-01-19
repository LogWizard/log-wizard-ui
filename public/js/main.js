import { state, setState, loadState, saveState } from './modules/state.js';
import { fetchMessages, loadPreviousDateMessages, setSettingsToServer } from './modules/api.js';
import { renderChatListView, renderChatMessages, renderTimelineView, showEmptyMessagesState } from './modules/ui-renderer.js';
import { StatsDashboard } from './modules/stats-dashboard.js'; // 🌿 Stats
import { formatDate } from './modules/utils.js';

// ========== Telegram-Style Chat Interface 🌿🦆 ==========

emojione.ascii = true;

// Initialize
init();

function init() {
    initUIRefs();

    // Load Cache first for instant feel 🌿
    if (loadState()) {
        // Deep Linking Override 🌿
        const params = new URLSearchParams(window.location.search);
        const urlChatId = params.get('chat_id');
        if (urlChatId) {
            state.selectedChatId = urlChatId; // Force URL override
            window.selectedChatId = urlChatId;
        }

        renderChatListView();
        if (state.selectedChatId) renderChatMessages(state.selectedChatId);
    }

    setupEventListeners();
    // Smart Polling Loop (Prevents overlap) 🌿
    let isPolling = false;
    const pollingLoop = async () => {
        if (isPolling) return; // 🌿 Skip if previous request is still running
        isPolling = true;

        try {
            await fetchMessages();
            // 🌿 Force re-render for Timeline if active
            if (state.currentView === 'timeline') {
                renderTimelineView(false); // false = no clear, incremental
            } else if (state.currentView === 'chat' && state.selectedChatId) {
                // For chat view, we usually rely on renderChatMessages being called inside fetchMessages triggers
                // OR we can explicitly call it here if fetchMessages just updates state
                renderChatMessages(state.selectedChatId, false, false);
            }
        } catch (e) {
            console.error('Polling error:', e);
        } finally {
            isPolling = false;
            setTimeout(pollingLoop, 4000); // 🌿 Wait 4s AFTER completion
        }
    };
    pollingLoop();

    if (typeof initMessageInput === 'function') initMessageInput();

    // Scroll To Bottom Button
    const btn = document.getElementById('scrollToBottomBtn');
    if (state.ui.messagesContainer && btn) {
        state.ui.messagesContainer.addEventListener('scroll', () => {
            const isScrolledUp = state.ui.messagesContainer.scrollTop < (state.ui.messagesContainer.scrollHeight - state.ui.messagesContainer.clientHeight - 300);
            if (isScrolledUp) btn.classList.add('visible');
            else btn.classList.remove('visible');
        });
        btn.addEventListener('click', () => {
            state.ui.messagesContainer.scrollTo({ top: state.ui.messagesContainer.scrollHeight, behavior: 'smooth' });
        });
    }

    if (state.ui.manualModeToggle) {
        state.ui.manualModeToggle.addEventListener('change', window.handleManualModeToggle);
    }

    // 🌿 Archive Toggle Listener
    const archiveToggle = document.getElementById('archiveToggleBtn');
    if (archiveToggle) {
        // Init from state
        archiveToggle.checked = state.showArchive || false;

        archiveToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            setState('showArchive', isChecked);
            console.log('🌿 Archive Mode:', isChecked);

            // Reload with reset
            state.allMessages = [];
            state.latestMessageId = 0;
            state.chatGroups = {};
            await fetchMessages();
            // Save state to persist preference
            saveState();
        });
    }
}

function initUIRefs() {
    state.ui.chatList = document.getElementById('chat-list');
    state.ui.messagesContainer = document.getElementById('messages-container');
    state.ui.activeChatName = document.getElementById('activeChatName');
    state.ui.activeChatStatus = document.getElementById('activeChatStatus');
    state.ui.chatViewBtn = document.getElementById('chatViewBtn');
    state.ui.timelineViewBtn = document.getElementById('timelineViewBtn');
    state.ui.statsViewBtn = document.getElementById('statsViewBtn');
    state.ui.chatSearchInput = document.getElementById('chatSearch');
    state.ui.calendarToggle = document.getElementById('calendarToggle');
    state.ui.calendarPopup = document.getElementById('calendarPopup');
    state.ui.manualModeToggle = document.getElementById('manualModeToggle');
    state.ui.toggleLabel = document.getElementById('toggleLabel');
}

function setupEventListeners() {
    // Mobile Back
    const backBtn = document.getElementById('mobileBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.body.classList.remove('mobile-chat-active');
            setState('selectedChatId', null);
        });
    }

    // Views
    state.ui.chatViewBtn.addEventListener('click', () => switchView('chat'));
    state.ui.timelineViewBtn.addEventListener('click', () => switchView('timeline'));
    // Stats button handled by StatsDashboard class 🌿

    // Init UI Renderer
    // Removed invalid init call

    // 🌿 Init Stats Dashboard
    const statsDashboard = new StatsDashboard();

    // Search
    if (state.ui.chatSearchInput) {
        state.ui.chatSearchInput.addEventListener('input', (e) => {
            setState('chatSearchQuery', e.target.value.toLowerCase());
            renderChatListView();
        });
    }

    // Calendar
    if (state.ui.calendarToggle && state.ui.calendarPopup) {
        initCalendar();
    }

    // Infinite Scroll
    state.ui.messagesContainer.addEventListener('scroll', handleInfiniteScroll);

    // Settings Dialog (Vanilla JS 🌿)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Ensure function exists globally or locally
            if (typeof openSettings === 'function') openSettings();
            else console.error('openSettings function missing');
        });
    }

    // Initialize Modal Logic (Close buttons etc)
    if (typeof initSettingsDialog === 'function') initSettingsDialog();
}

function switchView(view) {
    setState('currentView', view);
    if (view === 'chat') {
        state.ui.chatViewBtn.classList.add('active');
        state.ui.timelineViewBtn.classList.remove('active');
        if (state.ui.manualModeToggle) state.ui.manualModeToggle.style.display = 'inline-block';
        if (state.ui.toggleLabel) state.ui.toggleLabel.style.display = 'inline-block';
        renderChatListView();
        if (!state.selectedChatId) document.body.classList.remove('mobile-chat-active');
    } else {
        state.ui.chatViewBtn.classList.remove('active');
        state.ui.timelineViewBtn.classList.add('active');
        if (state.ui.manualModeToggle) state.ui.manualModeToggle.style.display = 'none';
        if (state.ui.toggleLabel) state.ui.toggleLabel.style.display = 'none';
        document.body.classList.add('mobile-chat-active');

        // 🌿 FIX: Якщо повідомлення вже є - рендеримо одразу!
        if (state.allMessages.length > 0) {
            renderTimelineView(true);
        } else {
            // Spinner тільки якщо нема повідомлень
            state.ui.messagesContainer.innerHTML = `
    < div class="loading-spinner-container" style = "display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888;" >
                    <div class="spinner" style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #4ade80; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
                    <div class="loading-text">Завантажую Timeline... 🌿</div>
                </div >
    <style>@keyframes spin {0 % { transform: rotate(0deg); } 100% {transform: rotate(360deg); } }</style>
`;

            // Fetch і потім рендер
            fetchMessages().then(() => {
                if (state.allMessages.length > 0) {
                    renderTimelineView(true);
                }
            });
        }
    }
}

function handleInfiniteScroll() {
    if (state.ui.messagesContainer.scrollTop < 500 && !state.isLoadingHistory) {
        // Logic to determine if we load per chat or timeline is slightly handled inside loadPreviousDateMessages via state.currentView, 
        // BUT we need to make sure we have a selected chat if in chat mode.
        if (state.currentView === 'chat' && !state.selectedChatId) return;
        loadPreviousDateMessages();
    }
}

function initCalendar() {
    // Basic setup from original code
    const calendar = new VanillaCalendar(state.ui.calendarPopup, {
        settings: { lang: 'uk', iso8601: false },
        actions: {
            clickDay(e, dates) {
                if (dates[0]) {
                    setState('selectedDate', dates[0]);
                    const badge = document.getElementById('selectedDateBadge');
                    const text = document.getElementById('selectedDateText');
                    if (text) text.textContent = `📅 ${dates[0]} `;
                    if (badge) badge.style.display = 'flex';
                    calendar.hide();
                    state.ui.calendarPopup.style.display = 'none';

                    // Reset
                    setState('allMessages', []);
                    setState('latestMessageId', 0);
                    setState('allDatesLoaded', []);
                    setSettingsToServer({ 'Date': dates[0] });
                    fetchMessages();
                }
            }
        }
    });
    calendar.init();

    state.ui.calendarToggle.addEventListener('click', () => {
        if (state.ui.calendarPopup.style.display === 'none') {
            state.ui.calendarPopup.style.display = 'block';
            calendar.show();
        } else {
            state.ui.calendarPopup.style.display = 'none';
            calendar.hide();
        }
    });

    // Clear Filter
    const clearBtn = document.getElementById('clearDateFilter');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            setState('selectedDate', null);
            const badge = document.getElementById('selectedDateBadge');
            if (badge) badge.style.display = 'none';
            setState('allMessages', []);
            setState('latestMessageId', 0);
            setState('allDatesLoaded', []);
            setSettingsToServer({ 'Date': '' });
            fetchMessages();
        });
    }
}

function initSettingsDialog() {
    // 🌿 Settings Modal Logic (Vanilla JS)

    // Close Button
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    // Close on Outside Click
    const modal = document.getElementById('settings-modal');
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    // Reset Cache Logic
    const resetBtn = document.getElementById('resetCacheBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Confirm with a nicer interaction if possible, but browser confirm is safe
            if (confirm('Це видалить весь локальний кеш і виправить "повідомлення-примари". Продовжити?')) {
                console.log('🧹 Clearing application cache...');
                localStorage.removeItem('gys_chat_state');
                localStorage.removeItem('avatarbox_cache');
                // Optional: clear other keys?
                location.reload();
            }
        });
    }
}

// Global Wrappers (exposed for HTML inline handlers)
window.openSettings = openSettings;
window.switchView = switchView;

function openSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('hidden');
}
