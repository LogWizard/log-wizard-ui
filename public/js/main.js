// 🌿 Auto-clear stale localStorage on version change
const APP_VERSION = '1.0.1'; // Bump this on breaking changes
const storedVersion = localStorage.getItem('app_version');
if (storedVersion !== APP_VERSION) {
    console.log(`🔄 App updated (${storedVersion} → ${APP_VERSION}), clearing localStorage...`);
    localStorage.clear();
    localStorage.setItem('app_version', APP_VERSION);
}

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
            // 🌿 URL Fix: Clear query params
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('chat_id');
            window.history.pushState({}, '', newUrl);
        });
    }

    // 🌿 Browser Back Button Support (History API)
    window.addEventListener('popstate', (event) => {
        const params = new URLSearchParams(window.location.search);
        const chatId = params.get('chat_id');

        if (chatId) {
            // Restore chat
            setState('selectedChatId', chatId);
            window.selectedChatId = chatId;
            // Trigger render (assuming chat data exists or will load)
            if (typeof state.chatGroups[chatId] !== 'undefined') {
                import('./modules/ui-renderer.js').then(m => {
                    m.selectChat(chatId); // Re-select
                });
            } else {
                // If not loaded, reload or let polling handle it.
                // Better to set state and let polling/render catch it.
                document.body.classList.add('mobile-chat-active');
            }
        } else {
            // Back to list
            document.body.classList.remove('mobile-chat-active');
            setState('selectedChatId', null);
            window.selectedChatId = null;
        }
    });

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
    // 🌿 Header Click to Close (Mobile Only-ish behavior but safe for all)
    const chatInfo = document.querySelector('.chat-info');
    if (chatInfo) {
        chatInfo.style.cursor = 'pointer';
        chatInfo.addEventListener('click', () => {
            if (state.selectedChatId) window.closeChat();
        });
    }

    // 🌿 "Chats" Header Hard Reload
    const chatsHeader = document.querySelector('.chat-list-header h2');
    if (chatsHeader) {
        chatsHeader.style.cursor = 'pointer';
        chatsHeader.title = 'Reload App';
        chatsHeader.addEventListener('click', () => {
            console.log('🔄 Hard Reload triggered by header');
            window.location.href = '/';
        });
    }

    // 🌿 Swipe-to-Back Gesture (Interactive 1:1 Animation)
    initSwipeGesture();
}

function initSwipeGesture() {
    const messagesPanel = document.querySelector('.messages-panel');
    const chatListPanel = document.querySelector('.chat-list-panel');
    if (!messagesPanel || !chatListPanel) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    const threshold = window.innerWidth * 0.25; // 25% to trigger close

    const onTouchStart = (e) => {
        // Only active if chat is open (mobile-chat-active class)
        if (!document.body.classList.contains('mobile-chat-active')) return;

        // Ignore if starting from right edge (scrolling?) or handled by other elements
        // But for "back", we usually swipe from left to right.
        startX = e.touches[0].clientX;
        isDragging = true;

        // Disable transition during drag for 1:1 feel
        messagesPanel.style.transition = 'none';
        chatListPanel.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;

        // Calculate delta (only positive i.e., swiping right)
        let deltaX = currentX - startX;

        if (deltaX < 0) deltaX = 0; // Prevent swiping left (further into chat)

        // Apply transform
        // Messages panel slides OUT to Right (0 -> 100vw)
        messagesPanel.style.transform = `translateX(${deltaX}px)`;

        // Chat list slides IN from Left (-30% -> 0)
        // Ratio: deltaX / screenWidth
        // Start: -30%, End: 0%
        const screenW = window.innerWidth;
        const progress = Math.min(deltaX / screenW, 1);
        const listOffset = -30 + (progress * 30);
        chatListPanel.style.transform = `translateX(${listOffset}%)`;
    };

    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;

        // Restore transition
        messagesPanel.style.transition = 'transform 0.3s ease';
        chatListPanel.style.transition = 'transform 0.3s ease';

        // 🌿 FIX: Use changedTouches for correct lifting position
        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;

        // 🌿 FIX: Lower threshold (15% instead of 25%)
        const threshold = window.innerWidth * 0.15;

        // Check threshold
        if (deltaX > threshold) {
            // Close Chat
            window.closeChat();
            // Clear inline styles after transition (let CSS take over)
            setTimeout(() => {
                messagesPanel.style.transform = '';
                chatListPanel.style.transform = '';
            }, 300);
        } else {
            // Snap Back (Keep Chat Open)
            messagesPanel.style.transform = 'translateX(0)';
            chatListPanel.style.transform = 'translateX(-30%)';
            // Clear styles after snap
            setTimeout(() => {
                messagesPanel.style.transform = '';
                chatListPanel.style.transform = '';
            }, 300);
        }
    };

    // Attach to message panel (or body/overlay)
    // using passive: true for better scrolling performance, but we might need to block scroll if dragging horizontal?
    // Let's rely on standard behavior: vertical scroll works, horizontal triggers this?
    // Simple check: if deltaY > deltaX, ignore? 
    // For now, let's attach to the panel edge (optional) or full panel. 
    // Full panel might conflict with message horizontal scroll (code blocks).
    // Let's attach to a "drag strip" or checks inside move.

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
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

// 🌿 Close Chat Navigation
window.closeChat = function () {
    setState('selectedChatId', null);
    state.selectedChatId = null;
    window.selectedChatId = null;

    // Update URL to home
    history.pushState({}, '', '/chat');

    // 🌿 Close Mobile View (Fix for swipe)
    document.body.classList.remove('mobile-chat-active');

    // Re-render chat list view
    renderChatListView();

    console.log('🏠 Closed chat, back to list');
};

// 🌿 Mobile Back Button
const mobileBackBtn = document.getElementById('mobileBackBtn');
if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
        if (state.selectedChatId) window.closeChat();
    });
}

// 🌿 Escape Key - Close Chat
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selectedChatId) {
        window.closeChat();
    }
});

// 🌿 Click "Chat" tab to close active chat
const chatViewBtn = document.getElementById('chatViewBtn');
if (chatViewBtn) {
    chatViewBtn.addEventListener('click', () => {
        if (state.selectedChatId) {
            window.closeChat();
        }
    });
}
