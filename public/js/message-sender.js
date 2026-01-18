// ========== Message Sender Module 🌿 ==========
// Функції глобальні (без ES modules)

/**
 * Send text message to Telegram
 */
async function sendTextMessage(chatId, text, replyToMessageId = null) {
    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                reply_to_message_id: replyToMessageId
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const result = await response.json();
        console.log('✅ Message sent:', result);
        return result;
    } catch (error) {
        console.error('❌ Error sending message:', error);
        throw error;
    }
}

/**
 * Upload file to server
 */
async function uploadFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload file');
        }

        const result = await response.json();
        console.log('✅ File uploaded:', result);
        return result.url;
    } catch (error) {
        console.error('❌ Error uploading file:', error);
        throw error;
    }
}

/**
 * Send photo message
 */
async function sendPhoto(chatId, photoUrl, caption = '') {
    try {
        const response = await fetch('/api/send-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                photo: photoUrl,
                caption: caption
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send photo');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error sending photo:', error);
        throw error;
    }
}

/**
 * Send video message
 */
async function sendVideo(chatId, videoUrl, caption = '') {
    try {
        const response = await fetch('/api/send-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                video: videoUrl,
                caption: caption
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send video');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error sending video:', error);
        throw error;
    }
}

/**
 * Send audio/voice message
 */
async function sendAudio(chatId, audioUrl, isVoice = false) {
    try {
        const endpoint = isVoice ? '/api/send-voice' : '/api/send-audio';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                [isVoice ? 'voice' : 'audio']: audioUrl
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to send ${isVoice ? 'voice' : 'audio'}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`❌ Error sending ${isVoice ? 'voice' : 'audio'}:`, error);
        throw error;
    }
}


/**
 * Insert formatting tag
 */
function insertFormatting(tag) {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    const selectedText = text.substring(start, end);

    let replacement = '';

    switch (tag) {
        case 'bold': replacement = `<b>${selectedText}</b>`; break;
        case 'italic': replacement = `<i>${selectedText}</i>`; break;
        case 'code': replacement = `<code>${selectedText}</code>`; break;
        case 'pre': replacement = `<pre>${selectedText}</pre>`; break;
        case 'link': replacement = `<a href="url">${selectedText || 'link'}</a>`; break;
        case 'spoiler': replacement = `<tg-spoiler>${selectedText}</tg-spoiler>`; break;
    }

    input.value = text.substring(0, start) + replacement + text.substring(end);

    // Restore cursor / focus
    const newCursorPos = start + replacement.length;
    input.focus();
    input.setSelectionRange(newCursorPos, newCursorPos);
}

// Expose to global scope for HTML buttons
window.insertFormatting = insertFormatting;

/**
 * Initialize message input handlers
 */
function initMessageInput() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const attachBtn = document.getElementById('attachBtn');

    if (!sendBtn) {
        console.warn('⚠️ Send button not found');
        return;
    }

    // Send on button click
    sendBtn.addEventListener('click', handleSendMessage);

    // Send on Enter (Legacy Input)
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    // Attach file handler
    if (attachBtn) {
        attachBtn.addEventListener('click', handleAttachFile);
    }

    // Drag and drop
    initDragAndDrop();
}

/**
 * Handle send message - підтримка Quill WYSIWYG 🌿
 */
async function handleSendMessage() {
    // Support both Quill and legacy input
    let text = '';
    let htmlText = '';

    if (window.quill) {
        htmlText = window.quill.root.innerHTML;
        text = window.quill.getText().trim();
    } else {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            text = messageInput.value.trim();
            htmlText = text;
        }
    }

    if (!text) return;

    // Get current chat ID
    const selectedChatId = window.selectedChatId;

    if (!selectedChatId) {
        alert('Оберіть чат спочатку!');
        return;
    }

    // Convert Quill HTML to Telegram HTML
    let telegramHtml = htmlText
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n')
        .replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>')
        .replace(/<em>/g, '<i>').replace(/<\/em>/g, '</i>')
        .replace(/<s>/g, '<s>').replace(/<\/s>/g, '</s>')
        .replace(/<span class="tg-spoiler">/g, '<tg-spoiler>').replace(/<\/span>/g, '</tg-spoiler>')
        .replace(/<pre class="ql-syntax"[^>]*>/g, '<pre>').replace(/<\/pre>/g, '</pre>')
        .replace(/<blockquote>/g, '❝ ').replace(/<\/blockquote>/g, '\n')
        .replace(/<br>/g, '\n')
        .trim();

    // Clean up empty tags
    telegramHtml = telegramHtml.replace(/<[^/>]+><\/[^>]+>/g, '').trim();

    // Use plain text if no HTML formatting
    const finalText = telegramHtml.includes('<') ? telegramHtml : text;

    try {
        // 🌿 Optimistic UI Update
        const tempMsg = {
            message_id: 'temp-' + Date.now(),
            from: { id: 'bot', first_name: 'Gys Bot 🦆', is_bot: true },
            chat: { id: selectedChatId },
            time: new Date().toISOString(),
            text: finalText,
            manual: true
        };

        // Update globals if available
        if (window.allMessages && window.chatGroups && window.renderChatMessages) {
            window.allMessages.push(tempMsg);

            if (window.chatGroups[selectedChatId]) {
                window.chatGroups[selectedChatId].messages.push(tempMsg);
                window.chatGroups[selectedChatId].lastMessage = tempMsg;
                window.renderChatMessages(selectedChatId);

                if (typeof window.renderChatListView === 'function') {
                    window.renderChatListView();
                }

                const container = document.getElementById('messages-container');
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }
        }

        await sendTextMessage(selectedChatId, finalText);

        // Clear editor
        if (window.quill) {
            window.quill.setText('');
        } else {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) messageInput.value = '';
        }

        console.log('📤 Message sent successfully');
    } catch (error) {
        alert('Помилка відправки: ' + error.message);
    }
}

/**
 * Handle attach file
 */
function handleAttachFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            console.log('📎 Uploading file:', file.name);
            const url = await uploadFile(file);

            const selectedChatId = window.selectedChatId;
            if (!selectedChatId) {
                alert('Оберіть чат!');
                return;
            }

            // Determine file type and send accordingly
            if (file.type.startsWith('image/')) {
                await sendPhoto(selectedChatId, url);
            } else if (file.type.startsWith('video/')) {
                await sendVideo(selectedChatId, url);
            } else if (file.type.startsWith('audio/')) {
                await sendAudio(selectedChatId, url, file.type.includes('ogg'));
            }

            console.log('✅ Media sent successfully');
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    };

    input.click();
}

/**
 * Initialize drag and drop
 */
function initDragAndDrop() {
    const messagesPanel = document.querySelector('.messages-panel');
    if (!messagesPanel) return;

    let overlay = document.createElement('div');
    overlay.className = 'drag-drop-overlay';
    overlay.innerHTML = `
        <div class="drag-drop-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p>Перетягніть файл сюди</p>
        </div>
    `;
    document.body.appendChild(overlay);

    messagesPanel.addEventListener('dragover', (e) => {
        e.preventDefault();
        overlay.classList.add('active');
    });

    messagesPanel.addEventListener('dragleave', (e) => {
        if (e.target === messagesPanel) {
            overlay.classList.remove('active');
        }
    });

    messagesPanel.addEventListener('drop', async (e) => {
        e.preventDefault();
        overlay.classList.remove('active');

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        const file = files[0];

        try {
            const url = await uploadFile(file);
            const selectedChatId = window.selectedChatId;

            if (!selectedChatId) {
                alert('Оберіть чат!');
                return;
            }

            if (file.type.startsWith('image/')) {
                await sendPhoto(selectedChatId, url);
            } else if (file.type.startsWith('video/')) {
                await sendVideo(selectedChatId, url);
            } else if (file.type.startsWith('audio/')) {
                await sendAudio(selectedChatId, url);
            }

            console.log('✅ Dropped file sent');
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    });
}
