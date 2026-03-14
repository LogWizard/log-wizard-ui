
export const fetchChats = async (includeArchive = false) => {
    const response = await fetch(`./api/get-all-chats?include_archive=${includeArchive ? 'true' : 'false'}`);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};

export const fetchMessages = async (chatId, limit = 50, includeArchive = false) => {
    if (!chatId) return [];
    const response = await fetch(`./messages?group=${chatId}&limit=${limit}&include_archive=${includeArchive ? 'true' : 'false'}`);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};

export const sendMessage = async (chatId, text) => {
    const response = await fetch('./api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
    if (!response.ok) {
        throw new Error('Failed to send message');
    }
    return response.json();
    return response.json();
};

export const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('./api/upload', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Failed to upload file');
    }

    return response.json();
};

export const sendPhoto = async (chatId, photoUrl, caption = '') => {
    const response = await fetch('./api/send-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
    });
    if (!response.ok) throw new Error('Failed to send photo');
    return response.json();
};

export const sendVideo = async (chatId, videoUrl, caption = '') => {
    const response = await fetch('./api/send-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, video: videoUrl, caption })
    });
    if (!response.ok) throw new Error('Failed to send video');
    return response.json();
};

export const sendAudio = async (chatId, audioUrl, isVoice = false) => {
    const endpoint = isVoice ? './api/send-voice' : './api/send-audio';
    const payload = isVoice ? { chat_id: chatId, voice: audioUrl } : { chat_id: chatId, audio: audioUrl };
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Failed to send audio');
    return response.json();
};

export const sendSticker = async (chatId, stickerUrl) => {
    const response = await fetch('./api/send-sticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker: stickerUrl })
    });
    if (!response.ok) throw new Error('Failed to send sticker');
    return response.json();
};

export const fetchStickerSets = async () => {
    const response = await fetch('./api/sticker-sets');
    if (!response.ok) throw new Error('Failed to load sticker sets');
    return response.json();
};

export const fetchStickerSet = async (name) => {
    const response = await fetch(`./api/sticker-sets/${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error('Failed to load sticker set');
    return response.json();
};

export const sendVoiceNote = async (chatId, voiceNoteUrl, caption = '') => {
    const response = await fetch('./api/send-voice-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, voice_note: voiceNoteUrl, caption })
    });
    if (!response.ok) throw new Error('Failed to send voice note');
    return response.json();
};

export const sendVideoNote = async (chatId, videoNoteUrl) => {
    const response = await fetch('./api/send-video-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, video_note: videoNoteUrl })
    });
    if (!response.ok) throw new Error('Failed to send video note');
    return response.json();
};

export const getManualMode = async (chatId) => {
    const response = await fetch(`./api/get-manual-mode?chat_id=${chatId}`);
    if (!response.ok) throw new Error('Failed to load manual mode');
    return response.json();
};

export const setManualMode = async (chatId, enabled) => {
    const response = await fetch('./api/set-manual-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, enabled })
    });
    if (!response.ok) throw new Error('Failed to set manual mode');
    return response.json();
};

export const setReaction = async (chatId, messageId, emoji, action = 'add') => {
    const response = await fetch('./api/set-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, emoji, action })
    });
    if (!response.ok) throw new Error('Failed to set reaction');
    return response.json();
};

export const deleteMessage = async (chatId, messageId) => {
    const response = await fetch('./api/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    if (!response.ok) throw new Error('Failed to delete message');
    return response.json();
};

export const editMessage = async (chatId, messageId, text, isCaption = false) => {
    const response = await fetch('./api/edit-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, is_caption: isCaption })
    });
    if (!response.ok) throw new Error('Failed to edit message');
    return response.json();
};

export const refreshMediaUrl = async (fileId) => {
    // 🌿 Auto-refresh media link logic (hypothetical endpoint based on user request)
    try {
        const response = await fetch(`./api/refresh-file-url?file_id=${fileId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.url; // Assuming backend returns { url: "..." }
    } catch (e) {
        console.error("Failed to refresh media:", e);
        return null;
    }
};

export const fetchUserProfile = async (userId) => {
    if (!userId) return null;
    const response = await fetch(`./api/user/${encodeURIComponent(userId)}`);
    if (!response.ok) throw new Error('Failed to load user profile');
    return response.json();
};
