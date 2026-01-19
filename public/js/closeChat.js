// 🌿 Close Chat Function - Navigate back to chat list
window.closeChat = function () {
    setState('selectedChatId', null);
    state.selectedChatId = null;
    window.selectedChatId = null;

    // Update URL to home
    history.pushState({}, '', '/chat');

    // Re-render chat list view
    renderChatListView();

    console.log('🏠 Closed chat, back to list');
};

// 🌿 Escape key listener - Close chat
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selectedChatId) {
        window.closeChat();
    }
});
