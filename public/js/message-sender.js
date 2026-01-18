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
 * Send sticker 🌿
 */
async function sendSticker(chatId, stickerUrl) {
    try {
        const response = await fetch('/api/send-sticker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                sticker: stickerUrl
            })
        });

        if (!response.ok) throw new Error('Failed to send sticker');
        return await response.json();
    } catch (error) {
        console.error('❌ Error sending sticker:', error);
        throw error;
    }
}

/**
 * Send video note (circle) 🌿
 */
async function sendVideoNote(chatId, videoNoteUrl) {
    try {
        const response = await fetch('/api/send-video-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                video_note: videoNoteUrl
            })
        });

        if (!response.ok) throw new Error('Failed to send video note');
        return await response.json();
    } catch (error) {
        console.error('❌ Error sending video note:', error);
        throw error;
    }
}

/**
 * Send voice note (converted audio) 🌿
 */
async function sendVoiceNote(chatId, voiceNoteUrl) {
    try {
        const response = await fetch('/api/send-voice-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                voice_note: voiceNoteUrl
            })
        });

        if (!response.ok) throw new Error('Failed to send voice note');
        return await response.json();
    } catch (error) {
        console.error('❌ Error sending voice note:', error);
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

    // Paste from Clipboard 🌿
    initPasteHandler();

    // Init Recording 🌿
    initRecordingHandlers();

    // Init Stickers 🌿
    initStickerPicker();
}

/**
 * Initialize Sticker Picker 🌿
 */
function initStickerPicker() {
    const btn = document.getElementById('stickersBtn');
    const panel = document.getElementById('stickerPicker');
    if (!btn || !panel) return;

    // Load Sets from DB 🌿
    let stickerSets = [];
    let currentSetIndex = 0;
    let loadedSets = {}; // Cache

    // UI Elements
    const container = document.getElementById('stickersContainer');

    // Add Tabs Header if not exists
    let tabsHeader = panel.querySelector('.sticker-tabs');
    if (!tabsHeader) {
        tabsHeader = document.createElement('div');
        tabsHeader.className = 'sticker-tabs';
        tabsHeader.style.cssText = 'display: flex; align-items: center; overflow-x: auto; padding: 5px; background: #0e1621; border-bottom: 1px solid #2b5278; gap: 5px; scrollbar-width: none;';

        // Add Import Button (+)
        const addBtn = document.createElement('div');
        addBtn.textContent = '+';
        addBtn.title = 'Add Sticker Set';
        addBtn.style.cssText = 'padding: 5px 10px; cursor: pointer; font-weight: bold; color: #4caf50; background: rgba(76, 175, 80, 0.1); border-radius: 10px;';
        addBtn.onclick = async () => {
            const name = prompt('Enter Sticker Set Name (e.g. "UaPusheen"):'); // Simple prompt for now
            if (name) {
                try {
                    const res = await fetch('/api/sticker-sets/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ setName: name })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    alert('Set Added! Reloading...');
                    loadSets(); // Reload
                } catch (e) {
                    alert('Error: ' + e.message);
                }
            }
        };
        tabsHeader.appendChild(addBtn);

        panel.insertBefore(tabsHeader, container);
    }

    // Fetch Sets Function
    async function loadSets() {
        try {
            let sets = [];
            try {
                const res = await fetch('/api/sticker-sets');
                if (res.ok) {
                    const data = await res.json();
                    sets = data.map(s => s.name);
                }
            } catch (e) {
                console.error('API Error, using fallback', e);
            }

            // Fallback if DB empty or failed 🌿
            if (!sets || sets.length === 0) {
                console.warn('⚠️ No sets from DB, using fallback defaults.');
                sets = [
                    'Brilevsky',
                    'VikostVSpack',
                    'horoshok_k_by_fStikBot',
                    'CystsDribsAssai_by_fStikBot'
                ];
            }

            stickerSets = sets;

            // Clear old tabs (keep + logic separate if needed, but rebuilding is safer)
            tabsHeader.innerHTML = '';

            // Re-add import button (+)
            const addBtn = document.createElement('div');
            addBtn.textContent = '+';
            addBtn.title = 'Add Sticker Set';
            addBtn.style.cssText = 'padding: 5px 10px; cursor: pointer; font-weight: bold; color: #4caf50; background: rgba(76, 175, 80, 0.1); border-radius: 10px; margin-right: 5px; min-width: 24px; text-align: center;';
            addBtn.onclick = async () => {
                const name = prompt('Enter Sticker Set Name (e.g., "VikostVSpack"):');
                if (name) {
                    try {
                        const res = await fetch('/api/sticker-sets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setName: name }) });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        loadSets();
                    } catch (e) { alert(e.message); }
                }
            };
            tabsHeader.appendChild(addBtn);

            stickerSets.forEach((set, index) => {
                const tab = document.createElement('div');
                tab.textContent = set.length > 10 ? set.substring(0, 10) + '...' : set;
                tab.title = set;
                tab.style.cssText = 'padding: 5px 10px; cursor: pointer; font-size: 12px; color: #8b98a7; white-space: nowrap; border-radius: 10px; transition: all 0.2s;';

                // Active state logic - only highlight the active set tab, not the + button
                if (index === currentSetIndex) {
                    tab.style.color = '#64b5f6';
                    tab.style.background = 'rgba(100, 181, 246, 0.1)';
                }

                tab.onclick = () => loadStickerSet(index);
                tabsHeader.appendChild(tab);
            });

            // Auto-load first set if none loaded
            if (stickerSets.length > 0 && !loadedSets[stickerSets[currentSetIndex]]) {
                loadStickerSet(currentSetIndex);
            }
        } catch (e) {
            console.error('Failed to load sets', e);
        }
    }

    // Toggle Panel
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'flex';
        panel.style.display = isVisible ? 'none' : 'flex';

        if (!isVisible) {
            if (stickerSets.length === 0) loadSets();
        }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (panel.style.display === 'flex' && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    async function loadStickerSet(index) {
        currentSetIndex = index;
        const setName = stickerSets[index];

        // Update Tabs UI
        Array.from(tabsHeader.children).forEach((tab, i) => {
            tab.style.color = i === index ? '#64b5f6' : '#8b98a7';
            tab.style.background = i === index ? 'rgba(100, 181, 246, 0.1)' : 'transparent';
        });

        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #8b98a7; padding-top: 50px;">Loading...</div>';

        try {
            // Check cache (memory)
            if (loadedSets[setName]) {
                renderStickers(loadedSets[setName]);
                return;
            }

            const res = await fetch(`/api/stickers/${setName}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            loadedSets[setName] = data.stickers; // Cache it
            renderStickers(data.stickers);

        } catch (err) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding-top: 20px;">Error: ${err.message}</div>`;
        }
    }

    function renderStickers(stickers) {
        container.innerHTML = '';
        if (!stickers || stickers.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #8b98a7;">Empty Set</div>';
            return;
        }

        stickers.forEach(sticker => {
            const item = document.createElement('div');
            item.style.cssText = 'height: 64px; width: 64px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s;';
            item.onmouseover = () => item.style.transform = 'scale(1.1)';
            item.onmouseout = () => item.style.transform = 'scale(1)';

            const img = document.createElement('img');
            img.src = `/api/sticker-image/${sticker.file_id}`;
            img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
            img.loading = 'lazy';

            item.onclick = async () => {
                // Send Sticker
                try {
                    // Visual feedback
                    item.style.opacity = '0.5';
                    await sendSticker(null, sticker.file_id);
                    item.style.opacity = '1';
                    panel.style.display = 'none'; // Close on send

                    // Add message to UI immediately? (handled by event or reload)
                    alert(`Sticker sent!`);
                } catch (e) {
                    alert('Error sending sticker');
                    item.style.opacity = '1';
                }
            };

            item.appendChild(img);
            container.appendChild(item);
        });
    }
}

/**
 * Initialize Recording Handlers (Audio/Video) 🌿
 */
function initRecordingHandlers() {
    const recordAudioBtn = document.getElementById('recordAudioBtn');
    const recordVideoBtn = document.getElementById('recordVideoBtn');
    const overlay = document.getElementById('recordingOverlay');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const cancelBtn = document.getElementById('cancelRecordingBtn');
    const timerEl = document.getElementById('recordingTimer');
    const previewVideo = document.getElementById('recordingPreview');
    const previewContainer = document.getElementById('videoPreviewContainer');
    const audioVisualizer = document.getElementById('audioVisualizer');

    let mediaRecorder = null;
    let chunks = [];
    let recordStartTime = 0;
    let timerInterval = null;
    let stream = null;
    let recordingType = null; // 'audio' or 'video'
    let isCancelled = false; // 🌿 Cancel Flag

    if (!recordAudioBtn || !recordVideoBtn) return;

    async function startRecording(type) {
        recordingType = type;
        chunks = [];
        isCancelled = false; // Reset flag
        try {
            const constraints = type === 'video'
                ? { video: { aspectRatio: 1, facingMode: 'user' }, audio: true }
                : { audio: true };

            stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (type === 'video') {
                previewVideo.srcObject = stream;
                previewContainer.style.display = 'block';
                audioVisualizer.style.display = 'none';
            } else {
                previewContainer.style.display = 'none';
                audioVisualizer.style.display = 'block';
            }

            overlay.style.display = 'flex';

            // Chrome records audio as video/webm usually or audio/webm
            const mimeType = type === 'video' ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';

            // Check if supported
            let options = { mimeType };
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                console.warn(`${mimeType} not supported, trying default`);
                options = {}; // Use default browser format
            }

            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                // Stop tracks immediately
                stream.getTracks().forEach(track => track.stop());
                clearInterval(timerInterval);
                overlay.style.display = 'none';

                if (isCancelled || chunks.length === 0) {
                    console.log('🛑 Recording cancelled set, ignoring chunks.');
                    return;
                }

                const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType });
                const ext = 'webm'; // Most browsers produce webm containers
                const filename = `recording_${Date.now()}.${ext}`;
                const file = new File([blob], filename, { type: blob.type });

                // Auto Send Flow
                await handleRecordedFile(file, type);
            };

            mediaRecorder.start();
            recordStartTime = Date.now();
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);

        } catch (err) {
            console.error('Error starting recording:', err);
            alert('Cannot access microphone/camera: ' + err.message);
            overlay.style.display = 'none';
        }
    }

    function updateTimer() {
        const diff = Math.floor((Date.now() - recordStartTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
    }

    function stopRecording(send = true) {
        if (!send) isCancelled = true; // 🌿 Set cancel flag BEFORE stopping

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        } else {
            // Cleanup if not recording state
            if (stream) stream.getTracks().forEach(track => track.stop());
            overlay.style.display = 'none';
            clearInterval(timerInterval);
        }
    }

    async function handleRecordedFile(file, type) {
        try {
            console.log(`🎤 Uploading recorded ${type}...`);
            const url = await uploadFile(file);

            // Set as pending attachment
            pendingAttachment = {
                url: url,
                type: file.type,
                file: file,
                isRecordedNote: true, // 🌿 Flag to force Note Mode send
                recordingType: type   // 'audio' or 'video'
            };

            // Force Toggle visually for user feedback
            const toggle = document.getElementById('videoNoteToggle');
            if (toggle) {
                toggle.checked = true;
                toggle.dispatchEvent(new Event('change'));
            }

            // Immediately Send
            await handleSendMessage();

        } catch (error) {
            console.error('Upload Error Details:', error);
            alert('Error sending recording: ' + error.message);
        }
    }

    recordAudioBtn.addEventListener('click', () => startRecording('audio'));
    recordVideoBtn.addEventListener('click', () => startRecording('video'));

    stopBtn.addEventListener('click', () => stopRecording(true));
    cancelBtn.addEventListener('click', () => stopRecording(false));
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
        let sentMessage = null; // 🌿 To capture server response

        if (attachmentToSend) {
            // Send attachment with caption
            let response;
            const isWebm = attachmentToSend.url.endsWith('.webm') || attachmentToSend.type.includes('webm');

            // 🌿 Note Mode is Active IF Toggle is ON OR File was Recorded Live
            const isNoteMode = document.getElementById('videoNoteToggle')?.checked || attachmentToSend.isRecordedNote;

            if (isNoteMode) {
                // 🌿 Handle Round Video / Voice Note
                const isAudio = attachmentToSend.recordingType === 'audio' || attachmentToSend.type.includes('audio');

                if (isAudio) {
                    // Send as Voice Message
                    response = await sendVoiceNote(selectedChatId, attachmentToSend.url || attachmentToSend.file);
                } else {
                    // Send as Video Note (Circle)
                    response = await sendVideoNote(selectedChatId, attachmentToSend.url || attachmentToSend.file);
                }
            } else if (isWebm) {
                // 🌿 Auto-send .webm as Sticker (ONLY if not Note Mode)
                response = await sendSticker(selectedChatId, attachmentToSend.url || attachmentToSend.file);
            } else if (attachmentToSend.type.startsWith('image/')) {
                response = await sendPhoto(selectedChatId, attachmentToSend.url, finalText);
            } else if (attachmentToSend.type.startsWith('video/')) {
                response = await sendVideo(selectedChatId, attachmentToSend.url, finalText);
            } else if (attachmentToSend.type.startsWith('audio/')) {
                response = await sendAudio(selectedChatId, attachmentToSend.url, attachmentToSend.type.includes('ogg'));
            }
            if (response && response.success) sentMessage = response.message;
        } else {
            // Send text only
            const response = await sendTextMessage(selectedChatId, finalText);
            if (response && response.success) sentMessage = response.message;
        }

        // 🌿 Instant UI Update (CRITICAL for Bot Messages)
        if (sentMessage && window.chatGroups && window.chatGroups[selectedChatId]) {
            console.log('🌿 Adding sent message to UI immediately:', sentMessage);

            // Add to chat history
            window.chatGroups[selectedChatId].messages.push(sentMessage);
            window.chatGroups[selectedChatId].lastMessage = sentMessage; // Update last message for list sorting

            // If in active chat, render it
            if (window.selectedChatId === selectedChatId && typeof window.renderChatMessages === 'function') {
                window.renderChatMessages(selectedChatId);

                // Scroll to bottom
                const container = document.getElementById('messages-container');
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }

            // Update chat list ranking/preview if possible
            if (typeof window.renderChatListView === 'function') {
                window.renderChatListView();
            }
        }

        // Clear editor
        if (window.quill) {
            window.quill.setText('');
        } else {
            const messageInput = document.getElementById('messageInput');
        }

        // 🌿 Instant UI Update (CRITICAL for Bot Messages)
        if (sentMessage && window.chatGroups && window.chatGroups[selectedChatId]) {
            console.log('🌿 Adding sent message to UI immediately:', sentMessage);

            // Add to chat history
            window.chatGroups[selectedChatId].messages.push(sentMessage);
            window.chatGroups[selectedChatId].lastMessage = sentMessage; // Update last message for list sorting

            // If in active chat, render it
            if (window.selectedChatId === selectedChatId && typeof window.renderChatMessages === 'function') {
                window.renderChatMessages(selectedChatId);

                // Scroll to bottom
                const container = document.getElementById('messages-container');
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }

            // Update chat list ranking/preview if possible
            if (typeof window.renderChatListView === 'function') {
                window.renderChatListView();
            }
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
        // Restore attachment on error
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

            // Use pending attachment flow for consistency
            pendingAttachment = {
                url: url,
                type: file.type,
                file: file
            };
            updateAttachmentPreview();

            console.log('✅ Dropped file ready to send');
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    });
}

/**
 * Initialize Paste Handler (Ctrl+V) 🌿
 */
function initPasteHandler() {
    document.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (!file) continue;

                // Only allow supported types if needed, but uploadFile handles it
                console.log('📋 Paste detected:', file.type);

                e.preventDefault(); // Prevent default paste (e.g. img tag in editor)

                try {
                    const url = await uploadFile(file);
                    const selectedChatId = window.selectedChatId;

                    if (!selectedChatId) {
                        alert('Оберіть чат!');
                        return;
                    }

                    pendingAttachment = {
                        url: url,
                        type: file.type,
                        file: file
                    };
                    updateAttachmentPreview();
                    console.log('✅ Pasted file ready');

                } catch (error) {
                    console.error('Paste upload error:', error);
                    alert('Error pasting file: ' + error.message);
                }

                // Only handle the first file
                return;
            }
        }
    });
}
