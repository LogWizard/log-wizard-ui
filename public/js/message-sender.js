// ========== Message Sender Module 🌿 ==========
// Функції глобальні (без ES modules)

let pendingAttachment = null; // { url, type, file } 🌿

/**
 * Update Preview UI
 */
function updateAttachmentPreview() {
    const previewContainer = document.getElementById('attachmentPreview');
    if (!previewContainer) return;

    if (!pendingAttachment) {
        previewContainer.style.display = 'none';
        return;
    }

    previewContainer.style.display = 'flex';
    document.getElementById('previewFilename').textContent = pendingAttachment.file.name;
    document.getElementById('previewType').textContent = pendingAttachment.type;

    // Bind remove button
    const removeBtn = document.getElementById('removeAttachmentBtn');
    if (removeBtn) {
        removeBtn.onclick = () => {
            pendingAttachment = null;
            updateAttachmentPreview();
        };
    }
}

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
let isSending = false; // 🌿 Module-level lock

/**
 * Handle send message - підтримка Quill WYSIWYG 🌿
 */
async function handleSendMessage() {
    if (isSending) return; // 🛡️ Prevent double submit

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

    if (!text && !pendingAttachment) return; // Allow empty text if attachment exists 🌿

    // Get current chat ID
    const selectedChatId = window.selectedChatId;

    if (!selectedChatId) {
        alert('Оберіть чат спочатку!');
        return;
    }

    // 🛡️ Lock UI
    isSending = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.style.opacity = '0.5';

    // Capture Attachment & Clear State IMMEDIATELY 🌿
    const attachmentToSend = pendingAttachment;
    if (attachmentToSend) {
        pendingAttachment = null;
        updateAttachmentPreview();
    }

    // Convert Quill HTML to Telegram HTML using DOM 🌿
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlText;

    // 1. Handle Spoilers (Convert <span class="tg-spoiler"> to <tg-spoiler>)
    tempDiv.querySelectorAll('.tg-spoiler').forEach(el => {
        const spoiler = document.createElement('tg-spoiler');
        spoiler.innerHTML = el.innerHTML;
        el.replaceWith(spoiler);
    });

    // 2. Handle Highlights (Convert to Bold with Emoji 🖍️) - Left for compatibility if old posts exist
    tempDiv.querySelectorAll('.tg-highlight').forEach(el => {
        const b = document.createElement('b');
        b.innerHTML = '🖍️ ' + el.innerHTML;
        el.replaceWith(b);
    });

    // 3. Unwrap ALL other SPANS (Telegram hates spans) 🚫
    tempDiv.querySelectorAll('span').forEach(el => {
        el.replaceWith(...el.childNodes);
    });

    // 4. Clean attributes from standard tags (except A href)
    const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'tg-spoiler'];
    tempDiv.querySelectorAll('*').forEach(el => {
        const tag = el.tagName.toLowerCase();

        if (!allowedTags.includes(tag) && tag !== 'br' && tag !== 'p') {
            el.replaceWith(...el.childNodes);
        } else {
            if (tag === 'a') {
                const href = el.getAttribute('href');
                while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
                if (href) el.setAttribute('href', href);
            } else {
                while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
            }
        }
    });

    // 5. Final String Cleanup
    let telegramHtml = tempDiv.innerHTML
        .replace(/&nbsp;/g, ' ') // 🌿 Fix NBSP rendering issue
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n')
        .replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>')
        .replace(/<em>/g, '<i>').replace(/<\/em>/g, '</i>')
        .replace(/<s>/g, '<s>').replace(/<\/s>/g, '</s>')
        .replace(/<pre class="ql-syntax"[^>]*>/g, '<pre>').replace(/<\/pre>/g, '</pre>')
        .replace(/<blockquote>/g, '❝ ').replace(/<\/blockquote>/g, '\n')
        .replace(/<br>/g, '\n')
        .trim();

    // Clean up empty tags and excessive newlines
    telegramHtml = telegramHtml.replace(/\n\n+/g, '\n\n').trim();

    // Use plain text if no HTML formatting
    const finalText = telegramHtml.includes('<') ? telegramHtml : telegramHtml; // Always use what we prepared (HTML)

    try {
        if (attachmentToSend) {
            // Send attachment with caption
            if (attachmentToSend.type.startsWith('image/')) {
                await sendPhoto(selectedChatId, attachmentToSend.url, finalText);
            } else if (attachmentToSend.type.startsWith('video/')) {
                await sendVideo(selectedChatId, attachmentToSend.url, finalText);
            } else if (attachmentToSend.type.startsWith('audio/')) {
                await sendAudio(selectedChatId, attachmentToSend.url, attachmentToSend.type.includes('ogg'));
            }
        } else {
            // Send text only
            await sendTextMessage(selectedChatId, finalText);
        }

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
        // Restore attachment on error?
        if (attachmentToSend) {
            pendingAttachment = attachmentToSend;
            updateAttachmentPreview();
        }
    } finally {
        isSending = false;
        if (sendBtn) sendBtn.style.opacity = '1';
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
            if (!selectedChatId) {
                alert('Оберіть чат!');
                return;
            }

            // Store pending attachment 🌿
            pendingAttachment = {
                url: url,
                type: file.type,
                file: file
            };
            updateAttachmentPreview();

            console.log('✅ File ready to send');
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
        </div>
    `;
    document.body.appendChild(overlay);

    // Explicitly export to window for external access 🌿
    window.handleSendMessage = handleSendMessage;
    window.handleAttachFile = handleAttachFile;
    window.updateAttachmentPreview = updateAttachmentPreview;

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
