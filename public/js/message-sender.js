// ========== Message Sender Module 🌿 ==========
// Функції глобальні (без ES modules)

// { url, type, file } 🌿
let pendingAttachment = null;
// 🌿 Edit State
let editingMessageId = null;
window.editingMessageId = null;

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
async function sendVoiceNote(chatId, voiceNoteUrl, caption = '') {
    try {
        const response = await fetch('/api/send-voice-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                voice_note: voiceNoteUrl,
                caption: caption
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

    // Init Draft Auto-Save 🌿
    initDraftAutoSave();
}

/**
 * Initialize Draft Auto-Save 🌿
 */
function initDraftAutoSave() {
    const input = document.getElementById('messageInput');

    // 1. Text Input Listener
    if (input) {
        input.addEventListener('input', (e) => {
            const chatId = window.selectedChatId;
            if (chatId) {
                localStorage.setItem(`draft_${chatId}`, e.target.value);
            }
        });
    }

    // 2. Quill Listener (if active)
    if (window.quill) {
        window.quill.on('text-change', () => {
            const chatId = window.selectedChatId;
            if (chatId) {
                const html = window.quill.root.innerHTML;
                // Only save if not empty default
                if (html !== '<p><br></p>') {
                    localStorage.setItem(`draft_${chatId}`, html);
                } else {
                    localStorage.removeItem(`draft_${chatId}`);
                }
            }
        });
    }
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

            // Fallback if DB empty or failed 🌿 (animated first)
            if (!sets || sets.length === 0) {
                console.warn('⚠️ No sets from DB, using fallback defaults.');
                sets = [
                    'VikostVSpack',
                    'CystsDribsAssai_by_fStikBot',
                    'Brilevsky',
                    'horoshok_k_by_fStikBot'
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
            addBtn.onclick = async (e) => {
                e.stopPropagation(); // Prevent panel close
                const name = prompt('Enter Sticker Set Name (e.g., "VikostVSpack"):');
                if (name) {
                    try {
                        const res = await fetch('/api/sticker-sets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setName: name }) });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        alert('Додано! Завантажую...');
                        loadSets();
                    } catch (e) { alert('Помилка: ' + e.message); }
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

        // Update Tabs UI (+1 offset because children[0] is the + button)
        Array.from(tabsHeader.children).forEach((tab, i) => {
            if (i === 0) return; // Skip + button
            const setIdx = i - 1; // Actual set index
            tab.style.color = setIdx === index ? '#64b5f6' : '#8b98a7';
            tab.style.background = setIdx === index ? 'rgba(100, 181, 246, 0.1)' : 'transparent';
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
            item.style.cssText = 'height: 64px; width: 64px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s; position: relative; overflow: hidden;';

            // Determine preview file_id (use thumbnail for animated/video stickers)
            const thumbId = sticker.thumbnail?.file_id || sticker.thumb?.file_id;
            const previewFileId = thumbId || sticker.file_id;
            const isAnimated = sticker.is_video || sticker.is_animated;

            // Create static preview (thumbnail or main file)
            const img = document.createElement('img');
            img.src = `/api/sticker-image/${previewFileId}`;
            img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
            img.loading = 'lazy';
            item.appendChild(img);

            // Badge for animated/video 🌿
            let badge = null;
            if (isAnimated) {
                badge = document.createElement('span');
                badge.innerText = '▶';
                badge.style.cssText = 'position: absolute; bottom: 2px; right: 2px; font-size: 8px; color: white; background: rgba(0,0,0,0.6); padding: 1px 3px; border-radius: 3px; transition: opacity 0.2s;';
                item.appendChild(badge);
            }

            // Hover animation for video stickers 🌿
            let videoEl = null;
            if (sticker.is_video) {
                item.onmouseenter = () => {
                    item.style.transform = 'scale(1.15)';
                    if (badge) badge.style.opacity = '0';

                    // Create video element on hover (or reuse cached)
                    if (!videoEl) {
                        videoEl = document.createElement('video');
                        videoEl.src = `/api/sticker-image/${sticker.file_id}`;
                        videoEl.loop = true;
                        videoEl.muted = true;
                        videoEl.playsInline = true;
                        videoEl.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
                    }
                    img.style.opacity = '0';
                    item.appendChild(videoEl);
                    // Restart video on each hover 🌿
                    videoEl.currentTime = 0;
                    videoEl.play().catch(() => { }); // Ignore autoplay errors
                };

                item.onmouseleave = () => {
                    item.style.transform = 'scale(1)';
                    if (badge) badge.style.opacity = '1';
                    img.style.opacity = '1';
                    if (videoEl && videoEl.parentNode) {
                        videoEl.parentNode.removeChild(videoEl);
                    }
                };
            } else {
                // Non-video: simple scale on hover
                item.onmouseenter = () => item.style.transform = 'scale(1.1)';
                item.onmouseleave = () => item.style.transform = 'scale(1)';
            }

            item.onclick = async (e) => {
                e.stopPropagation();
                const chatId = window.selectedChatId;
                if (!chatId) {
                    alert('Оберіть чат спочатку!');
                    return;
                }

                try {
                    item.style.opacity = '0.5';
                    await sendSticker(chatId, sticker.file_id);
                    item.style.opacity = '1';
                    panel.style.display = 'none';
                } catch (err) {
                    console.error('Sticker send error:', err);
                    alert('Помилка відправки стікера');
                    item.style.opacity = '1';
                }
            };

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
    console.log('🚀 handleSendMessage triggered', { isSending, editingMessageId: window.editingMessageId });
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

    // 🌿 Clear Draft (Local Storage)
    if (selectedChatId) {
        localStorage.removeItem(`draft_${selectedChatId}`);
    }

    // 🌿 CHECK IF EDITING
    if (editingMessageId) {
        try {
            const { editMessage } = await import('./modules/api.js');
            // Determine if it's a caption or text
            const originalMsg = state.allMessages.find(m => String(m.message_id) === String(editingMessageId));
            const isCaption = originalMsg && !originalMsg.text && (originalMsg.caption || originalMsg.photo || originalMsg.video || originalMsg.document);

            // 🌿 Clean HTML for Telegram (Remove <p>, replace with \n)
            const cleanHtml = htmlText
                .replace(/<p>/g, '')
                .replace(/<\/p>/g, '\n')
                .replace(/<br>/g, '\n')
                .replace(/&nbsp;/g, ' ')
                .trim();

            console.log('✏️ Sending Edit (Cleaned):', { editingMessageId, isCaption, cleanHtml });

            const res = await editMessage(selectedChatId, editingMessageId, cleanHtml, !!isCaption);

            if (res.success) {
                console.log('✅ Message edited');
                // Optimistic UI Update 🌿
                const msgBubble = document.querySelector(`.message-bubble[data-message-id="${editingMessageId}"] .message-text`);
                if (msgBubble) msgBubble.innerHTML = cleanHtml.replace(/\n/g, '<br>'); // Display with BRs in UI

                // Close Edit Mode
                cancelEditMode();
            } else {
                alert('Edit Failed: ' + res.error);
            }
        } catch (e) {
            console.error(e);
            alert('Edit Error');
        } finally {
            isSending = false;
        }
        return;
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
                    // Send as Voice Message with caption 🌿
                    response = await sendVoiceNote(selectedChatId, attachmentToSend.url || attachmentToSend.file, finalText);
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

    let overlay = document.querySelector('.drag-drop-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
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

        // Safety: Click to close
        overlay.addEventListener('click', () => overlay.classList.remove('active'));
    }

    // Explicitly export to window for external access 🌿
    window.handleSendMessage = handleSendMessage;
    window.handleAttachFile = handleAttachFile;
    window.updateAttachmentPreview = updateAttachmentPreview;

    let dragCounter = 0;

    // Document-wide drag handlers for reliability
    document.body.addEventListener('dragenter', (e) => {
        // Only trigger if we are dragging files
        if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
            dragCounter++;
            overlay.classList.add('active');
        }
    });

    document.body.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove('active');
        }
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault(); // Essential for drop to work
        if (dragCounter === 0) {
            // Recover if counter got messed up (e.g. initial drag started outside)
            overlay.classList.add('active');
            dragCounter = 1;
        }
    });

    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('active');

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        try {
            // Check if chat is selected
            const selectedChatId = window.selectedChatId;
            if (!selectedChatId) {
                alert('Оберіть чат спочатку!');
                return;
            }

            const url = await uploadFile(file);

            // Use pending attachment flow for consistency
            // (Assuming 'pendingAttachment' global exists in this scope or window)
            // But we should use 'window.pendingAttachment' if defined elsewhere or declare it.
            // Since original code used implicit global, we stick to it, but be careful.

            // We need to define pendingAttachment if not present (it's likely global in main.js or here)
            // Actually it is defined at top of this file usually.

            // Assign to global variable
            window.pendingAttachment = { // Making it explicit window property just in case
                url: url,
                type: file.type,
                file: file
            };
            // Also update local reference if any
            if (typeof pendingAttachment !== 'undefined') {
                pendingAttachment = window.pendingAttachment;
            }

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

                    // Set as pending and update UI
                    pendingAttachment = {
                        url: url,
                        type: file.type,
                        file: file
                    };
                    updateAttachmentPreview();

                } catch (err) {
                    console.error('Paste upload error:', err);
                }
            }
        }
    });
}

// 🌿 Edit Message Init (Global)
window.initEditMessage = function (chatId, messageId) {
    console.log('✏️ initEditMessage called', { chatId, messageId });
    const msg = state.allMessages.find(m => String(m.message_id) === String(messageId));
    if (!msg) return alert('Message not found locally');

    editingMessageId = messageId;
    window.editingMessageId = messageId;

    // Show visual indicator
    // Try to find the wrapper directly
    const wrapper = document.querySelector('.message-input-wrapper') || document.querySelector('.input-wrapper');
    const container = document.querySelector('.message-input-container') || document.body;

    let bar = document.getElementById('edit-bar');

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'edit-bar';
        // 🌿 Enhanced Styling: Blue accent left, dark bg, seamless
        bar.style.cssText = 'background: #1e2c3a; color: #64b5f6; padding: 10px 16px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #64b5f6; width: 100%; box-sizing: border-box; margin-bottom: 1px; animation: slideIn 0.2s ease-out;';

        // Add animation keyframes if needed, but simple insertion is fine.

        if (wrapper && wrapper.parentNode) {
            // Insert BEFORE the input wrapper (so it sits on top)
            wrapper.parentNode.insertBefore(bar, wrapper);
        } else {
            // Fallback: Prepend to container
            container.prepend(bar);
        }
    }

    const displayText = (msg.text || msg.caption || 'Media Attachment').replace(/\n/g, ' ');

    bar.innerHTML = `
        <div style="display:flex; flex-direction:column; overflow: hidden;">
            <span style="font-weight:bold; color: #64b5f6; margin-bottom: 2px;">✏️ Editing Message</span>
            <span style="color: #8b98a7; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;">${displayText}</span>
        </div>
        <span id="cancelEditBtn" style="cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b98a7" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
    `;

    // Bind click immediately
    const cancelBtn = bar.querySelector('#cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.onclick = cancelEditMode;
        cancelBtn.onmouseenter = () => cancelBtn.style.background = 'rgba(255,255,255,0.1)';
        cancelBtn.onmouseleave = () => cancelBtn.style.background = 'transparent';
    }

    // Populate Input
    const textToEdit = msg.text || msg.caption || '';
    if (window.quill) {
        window.quill.clipboard.dangerouslyPasteHTML(textToEdit); // Preserves simple HTML
        // 🌿 Focus the editor!
        setTimeout(() => window.quill.focus(), 50);
    } else {
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = textToEdit;
            input.focus();
        }
    }

    // Change Button Icon (Optional)
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="send-icon" fill="none" stroke="#64b5f6" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `; // Checkmark/Save Icon
};

function cancelEditMode() {
    console.log('❌ cancelEditMode called');
    editingMessageId = null;
    window.editingMessageId = null;
    const bar = document.getElementById('edit-bar');
    if (bar) bar.remove();

    // Reset Input
    if (window.quill) window.quill.setText('');
    else {
        const input = document.getElementById('messageInput');
        if (input) input.value = '';
    }

    // Reset Icon
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="send-icon" fill="non" stroke="currentColor" stroke-width="2">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
    `;
}

// 🌿 Delete Message Init
window.initDeleteMessage = async function (chatId, messageId) {
    // alert('DEBUG: Start Delete Function'); 
    console.log('🗑️ initDeleteMessage called', { chatId, messageId });

    if (!chatId) { alert('Error: No Chat ID'); return; }

    // Use window.confirm explicitly and log result
    const isConfirmed = window.confirm('Видалити це повідомлення?');
    // alert('DEBUG: Confirm result: ' + isConfirmed);

    if (!isConfirmed) return;

    // Optimistic UI Removal
    const msgEl = document.querySelector(`.message-bubble[data-message-id="${messageId}"]`);
    if (msgEl) {
        msgEl.style.opacity = '0.5';
    }

    try {
        // alert('Deleting... Pass 1'); // Debug Force
        const { deleteMessage } = await import('./modules/api.js');
        const res = await deleteMessage(chatId, messageId);
        console.log('🗑️ Delete result:', res);

        if (res.success) {
            if (msgEl) msgEl.remove();
            // Remove from state
            if (state.allMessages) state.allMessages = state.allMessages.filter(m => String(m.message_id) !== String(messageId));
            alert('Deleted Successfully! ✅');
        } else {
            alert('Error deleting: ' + (res.error || 'Unknown error'));
            if (msgEl) msgEl.style.opacity = '1';
        }
    } catch (e) {
        console.error('Delete API Error:', e);
        alert('Failed to delete message: ' + e.message);
        if (msgEl) msgEl.style.opacity = '1';
    }
};






// 🌿 Event Bindings (Ensure these are active!)
document.addEventListener('DOMContentLoaded', () => {
    // Send Button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        // Remove old to prevent duplicates if hot-reloaded
        const newBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newBtn, sendBtn);
        newBtn.addEventListener('click', handleSendMessage);
        console.log('✅ Send Button Event Listener Attached');
    }

    // Enter Key (Legacy Input)
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }
});

// 🌿 Make handleSendMessage globally available for inline calls if needed
window.handleSendMessage = handleSendMessage;
console.log('✅ message-sender.js loaded and handleSendMessage exposed');
