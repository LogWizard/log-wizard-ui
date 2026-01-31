import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchMessages,
    sendMessage,
    fetchChats,
    uploadFile,
    sendPhoto,
    sendVideo,
    sendAudio,
    sendVoiceNote,
    sendVideoNote,
    sendSticker,
    fetchStickerSets,
    fetchStickerSet,
    fetchUserProfile,
    getManualMode,
    setManualMode,
    setReaction,
    deleteMessage,
    editMessage
} from '../../api/chatApi';
import MessageBubble from './MessageBubble';
import { Loader2, Send, ArrowLeft, Paperclip, Mic, CircleDot, Sparkles, Zap, Settings, Smile, Sticker } from 'lucide-react';
import { ActionIcon, Avatar, Group, Paper, Stack, Text, Textarea, Switch, Tooltip, Modal, Button } from '@mantine/core';

const ChatWindow = ({ chatId, onBack }) => {
    const bottomRef = useRef(null);
    const scrollRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordChunksRef = useRef([]);
    const videoRecorderRef = useRef(null);
    const videoChunksRef = useRef([]);
    const videoStreamRef = useRef(null);
    const menuRef = useRef(null);
    const scrollHeightRef = useRef(0);
    const loadingMoreRef = useRef(false);
    const touchStartXRef = useRef(0);
    const isNearBottomRef = useRef(true);
    const prevChatIdRef = useRef(null);
    const [inputValue, setInputValue] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isRecordingVideo, setIsRecordingVideo] = useState(false);
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    const [isProcessingVideo, setIsProcessingVideo] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [videoSeconds, setVideoSeconds] = useState(0);
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [pendingRecording, setPendingRecording] = useState(null);
    const [noteMode, setNoteMode] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [menuPos, setMenuPos] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [profileData, setProfileData] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [messageLimit, setMessageLimit] = useState(50);
    const [includeArchive, setIncludeArchive] = useState(() => {
        const saved = localStorage.getItem('includeArchive');
        return saved === 'true';
    });
    const [profileImageOpen, setProfileImageOpen] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTab, setPickerTab] = useState('emoji');
    const [stickerSets, setStickerSets] = useState([]);
    const [activeStickerSet, setActiveStickerSet] = useState(null);
    const [stickers, setStickers] = useState([]);
    const [isLoadingStickers, setIsLoadingStickers] = useState(false);
    const queryClient = useQueryClient();

    const { data: chats } = useQuery({
        queryKey: ['chats', includeArchive],
        queryFn: () => fetchChats(includeArchive),
        staleTime: 60000
    });

    const { data: messages, isLoading, error } = useQuery({
        queryKey: ['messages', chatId, messageLimit, includeArchive],
        queryFn: () => fetchMessages(chatId, messageLimit, includeArchive),
        enabled: !!chatId,
        keepPreviousData: true,
    });

    const { data: manualMode } = useQuery({
        queryKey: ['manual-mode', chatId],
        queryFn: () => getManualMode(chatId),
        enabled: !!chatId
    });

    const mutation = useMutation({
        mutationFn: (text) => sendMessage(chatId, text),
        onMutate: async (text) => {
            await queryClient.cancelQueries(['messages', chatId]);
            const previousMessages = queryClient.getQueryData(['messages', chatId]);

            const optimisticMsg = {
                message_id: 'temp-' + Date.now(),
                text,
                time: new Date().toISOString(),
                from: { id: 'bot', first_name: 'Me', is_bot: true },
                isBot: true
            };

            queryClient.setQueryData(['messages', chatId], (old) => [...(old || []), optimisticMsg]);
            return { previousMessages };
        },
        onError: (err, newTodo, context) => {
            queryClient.setQueryData(['messages', chatId], context.previousMessages);
            alert('Failed to send message: ' + err.message);
        },
        onSettled: () => {
            queryClient.invalidateQueries(['messages', chatId]);
        }
    });

    const openProfile = (base) => {
        setProfileData(base);
        if (base?.id) {
            setProfileLoading(true);
            fetchUserProfile(base.id)
                .then((data) => {
                    setProfileData((prev) => ({
                        ...prev,
                        ...data,
                        id: data.id || prev?.id,
                        name: data.first_name || prev?.name,
                        lastName: data.last_name || prev?.lastName,
                        username: data.username || prev?.username,
                        photo: data.photo_url || prev?.photo,
                        phone: data.phone || data.phone_number || prev?.phone
                    }));
                })
                .finally(() => setProfileLoading(false));
        }
    };

    const emojiList = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '😇', '😉', '😜', '🤪', '🤩', '🥳', '😤', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '🔥', '✨', '💯', '🎉', '❤️', '💙', '💚', '💛', '💜'];

    useEffect(() => {
        if (!isPickerOpen || pickerTab !== 'stickers') return;
        let isMounted = true;
        const cachedSets = localStorage.getItem('sticker_sets_cache');
        const cachedAt = Number(localStorage.getItem('sticker_sets_cache_at') || 0);
        if (cachedSets && Date.now() - cachedAt < 6 * 60 * 60 * 1000) {
            const parsed = JSON.parse(cachedSets);
            setStickerSets(parsed || []);
            if (!activeStickerSet && parsed?.length) {
                setActiveStickerSet(parsed[0].name);
            }
        }

        fetchStickerSets()
            .then((sets) => {
                if (!isMounted) return;
                setStickerSets(sets || []);
                localStorage.setItem('sticker_sets_cache', JSON.stringify(sets || []));
                localStorage.setItem('sticker_sets_cache_at', String(Date.now()));
                if (!activeStickerSet && sets?.length) {
                    setActiveStickerSet(sets[0].name);
                }
            })
            .catch(() => {
                if (!isMounted) return;
                setStickerSets((prev) => prev || []);
            });
        return () => { isMounted = false; };
    }, [isPickerOpen, pickerTab, activeStickerSet]);

    useEffect(() => {
        if (!activeStickerSet || !isPickerOpen || pickerTab !== 'stickers') return;
        let isMounted = true;
        const cacheKey = `sticker_set_${activeStickerSet}`;
        const cachedSet = localStorage.getItem(cacheKey);
        const cachedAt = Number(localStorage.getItem(`${cacheKey}_at`) || 0);
        if (cachedSet && Date.now() - cachedAt < 6 * 60 * 60 * 1000) {
            setStickers(JSON.parse(cachedSet) || []);
            setIsLoadingStickers(false);
        } else {
            setIsLoadingStickers(true);
        }

        fetchStickerSet(activeStickerSet)
            .then((data) => {
                if (!isMounted) return;
                const list = data?.stickers || [];
                setStickers(list);
                localStorage.setItem(cacheKey, JSON.stringify(list));
                localStorage.setItem(`${cacheKey}_at`, String(Date.now()));
            })
            .catch(() => {
                if (!isMounted) return;
                setStickers((prev) => prev || []);
            })
            .finally(() => {
                if (!isMounted) return;
                setIsLoadingStickers(false);
            });
        return () => { isMounted = false; };
    }, [activeStickerSet, isPickerOpen, pickerTab]);

    const handleSendRecording = async () => {
        if (!pendingRecording) return;
        try {
            if (pendingRecording.kind === 'voice') {
                await sendVoiceNote(chatId, pendingRecording.url);
            } else if (pendingRecording.kind === 'video-note') {
                await sendVideoNote(chatId, pendingRecording.url);
            }
            setPendingRecording(null);
            queryClient.invalidateQueries(['messages', chatId]);
        } catch (err) {
            alert('Failed to send recording: ' + err.message);
        }
    };

    const handleCancelRecording = () => {
        setPendingRecording(null);
    };

    const handleEmojiPick = (emoji) => {
        setInputValue((prev) => `${prev || ''}${emoji}`);
    };

    const handleStickerPick = async (sticker) => {
        if (!chatId) return;
        try {
            await sendSticker(chatId, sticker.file_id || sticker.url);
            queryClient.invalidateQueries(['messages', chatId]);
        } catch (err) {
            alert('Failed to send sticker: ' + err.message);
        }
    };

    const handleSend = async () => {
        if (pendingAttachment) {
            const type = pendingAttachment.type || '';
            const url = pendingAttachment.url;
            const caption = inputValue.trim();

            try {
                if (noteMode && type.startsWith('video/')) {
                    await sendVideoNote(chatId, url);
                } else if (noteMode && type.startsWith('audio/')) {
                    await sendVoiceNote(chatId, url, caption);
                } else if (type.startsWith('image/')) {
                    await sendPhoto(chatId, url, caption);
                } else if (type.startsWith('video/')) {
                    await sendVideo(chatId, url, caption);
                } else if (type.startsWith('audio/')) {
                    await sendAudio(chatId, url, false);
                } else {
                    alert('Unsupported file type');
                    return;
                }

                setPendingAttachment(null);
                setInputValue('');
                queryClient.invalidateQueries(['messages', chatId]);
                return;
            } catch (err) {
                alert('Failed to send attachment: ' + err.message);
                return;
            }
        }

        if (!inputValue.trim()) return;
        mutation.mutate(inputValue);
        setInputValue('');
    };

    const startRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            recordChunksRef.current = [];
            setRecordSeconds(0);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                setIsProcessingVoice(true);
                try {
                    const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
                    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                    const uploaded = await uploadFile(file);
                    const url = uploaded.url || uploaded.fullUrl || uploaded.fileUrl || uploaded;
                    setPendingRecording({ kind: 'voice', url, duration: recordSeconds });
                } catch (err) {
                    alert('Failed to send voice: ' + err.message);
                } finally {
                    stream.getTracks().forEach((t) => t.stop());
                    setIsProcessingVoice(false);
                    setIsRecording(false);
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (err) {
            alert('Microphone access denied');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const handleAttachClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file || !chatId) return;

        setIsUploading(true);

        try {
            const uploaded = await uploadFile(file);
            const url = uploaded.url || uploaded.fullUrl || uploaded.fileUrl || uploaded;
            setPendingAttachment({
                url,
                type: file.type || '',
                name: file.name
            });
        } catch (err) {
            alert('Failed to upload/send media: ' + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const startVideoRecording = async () => {
        if (isRecordingVideo) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { aspectRatio: 1, facingMode: 'user' },
                audio: true
            });
            videoStreamRef.current = stream;
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
            videoChunksRef.current = [];
            setVideoSeconds(0);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) videoChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                setIsProcessingVideo(true);
                try {
                    const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
                    const file = new File([blob], `note-${Date.now()}.webm`, { type: 'video/webm' });
                    const uploaded = await uploadFile(file);
                    const url = uploaded.url || uploaded.fullUrl || uploaded.fileUrl || uploaded;
                    setPendingRecording({ kind: 'video-note', url, duration: videoSeconds });
                } catch (err) {
                    alert('Failed to send video note: ' + err.message);
                } finally {
                    stream.getTracks().forEach((t) => t.stop());
                    setIsProcessingVideo(false);
                    setIsRecordingVideo(false);
                }
            };

            videoRecorderRef.current = recorder;
            recorder.start();
            setIsRecordingVideo(true);
        } catch (err) {
            alert('Camera access denied');
        }
    };

    const stopVideoRecording = () => {
        if (videoRecorderRef.current && isRecordingVideo) {
            videoRecorderRef.current.stop();
        }
    };

    useEffect(() => {
        let timer;
        if (isRecording) {
            timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [isRecording]);

    useEffect(() => {
        let timer;
        if (isRecordingVideo) {
            timer = setInterval(() => setVideoSeconds((s) => s + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [isRecordingVideo]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const scrollToBottom = () => {
            el.scrollTop = el.scrollHeight;
        };

        if (!loadingMoreRef.current && (isNearBottomRef.current || prevChatIdRef.current !== chatId)) {
            scrollToBottom();
            const t1 = setTimeout(scrollToBottom, 50);
            const t2 = setTimeout(scrollToBottom, 250);
            prevChatIdRef.current = chatId;
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }
        prevChatIdRef.current = chatId;
    }, [messages?.length, chatId]);

    useEffect(() => {
        setMessageLimit(50);
    }, [chatId, includeArchive]);

    useEffect(() => {
        if (!loadingMoreRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        const prevHeight = scrollHeightRef.current;
        const nextHeight = el.scrollHeight;
        el.scrollTop = nextHeight - prevHeight;
        loadingMoreRef.current = false;
    }, [messages?.length]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
            isNearBottomRef.current = distance < 80;
            if (el.scrollTop <= 80 && !loadingMoreRef.current && messages?.length >= messageLimit) {
                loadingMoreRef.current = true;
                scrollHeightRef.current = el.scrollHeight;
                setMessageLimit((prev) => prev + 50);
            }
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [messages?.length, messageLimit]);

    useEffect(() => {
        if (!chatId) return;
        const state = { chatId };
        window.history.pushState(state, '', window.location.pathname);
        const onPop = () => {
            if (onBack) onBack();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [chatId, onBack]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        const handleEsc = (e) => {
            if (e.key === 'Escape') setContextMenu(null);
        };
        window.addEventListener('click', handleClick);
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('keydown', handleEsc);
        };
    }, []);

    useEffect(() => {
        if (!contextMenu) {
            setMenuPos(null);
            return;
        }
        const padding = 8;
        const rect = menuRef.current?.getBoundingClientRect();
        let x = contextMenu.x;
        let y = contextMenu.y;
        if (rect) {
            if (x + rect.width + padding > window.innerWidth) {
                x = window.innerWidth - rect.width - padding;
            }
            if (y + rect.height + padding > window.innerHeight) {
                y = window.innerHeight - rect.height - padding;
            }
        }
        if (x < padding) x = padding;
        if (y < padding) y = padding;
        setMenuPos({ x, y });
    }, [contextMenu]);

    if (isLoading && !messages) {
        return (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--accent-blue)' }}>
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-red-400">
                Error loading messages
            </div>
        );
    }

    const activeChat = chats?.find(c => String(c.id) === String(chatId));

    const avatarColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

    const isSameDay = (d1, d2) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const resolveMessageDate = (msg) => {
        if (msg?.time) {
            const t = new Date(msg.time);
            if (!Number.isNaN(t.getTime())) return t;
        }
        if (msg?.date) {
            const raw = msg.date;
            const t = new Date(typeof raw === 'number' ? raw * 1000 : raw);
            if (!Number.isNaN(t.getTime())) return t;
        }
        if (msg?.date_ms) {
            const t = new Date(msg.date_ms);
            if (!Number.isNaN(t.getTime())) return t;
        }
        return null;
    };

    const formatDateSeparator = (dateStr) => {
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return null;
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        if (isSameDay(date, now)) return 'Сьогодні';
        if (isSameDay(date, yesterday)) return 'Вчора';

        return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
    };

    const handleOpenMenu = (event, message) => {
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            message
        });
    };

    const renderMessages = () => {
        if (!messages || messages.length === 0) return null;

        const rendered = [];
        let lastDate = null;

        messages.forEach((msg, index) => {
            const msgDate = resolveMessageDate(msg);

            if (msgDate && (!lastDate || !isSameDay(lastDate, msgDate))) {
                const label = formatDateSeparator(msgDate);
                if (!label) {
                    lastDate = msgDate;
                    return;
                }
                rendered.push(
                    <div key={`date-${index}`} className="flex justify-center my-6 animate-fade-in">
                        <span className="text-xs font-semibold px-4 py-1.5 rounded-full date-separator">
                            {label}
                        </span>
                    </div>
                );
                lastDate = msgDate;
            }

            rendered.push(
                <MessageBubble
                    key={msg.message_id || msg.id || index}
                    message={msg}
                    fallbackAvatarUrl={activeChat?.photo}
                    fallbackAvatarName={activeChat?.name}
                    onOpenMenu={handleOpenMenu}
                    onAvatarClick={(message) => {
                        const base = {
                            name: message.from?.first_name || message.from?.username || 'User',
                            lastName: message.from?.last_name,
                            username: message.from?.username,
                            id: message.from?.id || message.sender_id || message.from_id,
                            photo: message.from?.photo || message.from?.photo_url || message.avatar_url || message.photo_url
                        };
                        openProfile(base);
                    }}
                />
            );
        });

        return rendered;
    };

    const handleReaction = async (emoji) => {
        if (!contextMenu?.message) return;
        const msg = contextMenu.message;
        const reactions = msg.reactions?.results || msg.reactions || [];
        const hasOwn = reactions.some(r => (r.type?.emoji || r.emoji) === emoji && (r.is_own || r.me));
        const action = hasOwn ? 'remove' : 'add';
        await setReaction(chatId, msg.message_id || msg.id, emoji, action);
        queryClient.invalidateQueries(['messages', chatId]);
        setContextMenu(null);
    };

    const handleDelete = async () => {
        if (!contextMenu?.message) return;
        const msg = contextMenu.message;
        await deleteMessage(chatId, msg.message_id || msg.id);
        queryClient.invalidateQueries(['messages', chatId]);
        setContextMenu(null);
    };

    const handleEdit = async () => {
        if (!contextMenu?.message) return;
        const msg = contextMenu.message;
        const currentText = msg.text || msg.caption || '';
        const next = window.prompt('Edit message', currentText);
        if (next === null) return;
        const isCaption = Boolean(msg.caption && !msg.text);
        await editMessage(chatId, msg.message_id || msg.id, next, isCaption);
        queryClient.invalidateQueries(['messages', chatId]);
        setContextMenu(null);
    };

    const handleManualToggle = async (checked) => {
        await setManualMode(chatId, checked);
        queryClient.invalidateQueries(['manual-mode', chatId]);
    };

    return (
        <div className="flex flex-col h-full app-shell">
            <Paper className="chat-header" radius={0} p="md">
                <Group align="center" justify="space-between" wrap="nowrap">
                    <Group align="center" gap="sm" wrap="nowrap">
                        <ActionIcon
                            onClick={onBack}
                            variant="subtle"
                            color="gray"
                            className="md:hidden"
                        >
                            <ArrowLeft size={20} />
                        </ActionIcon>
                        <Avatar
                            size={42}
                            radius="xl"
                            className="chat-avatar"
                            style={{ backgroundColor: avatarColors[(parseInt(chatId) || 0) % avatarColors.length], cursor: 'pointer' }}
                            onClick={() => openProfile({
                                name: activeChat?.name || `Chat ${chatId}`,
                                id: activeChat?.id || chatId,
                                photo: activeChat?.photo
                            })}
                        >
                            {activeChat?.photo && activeChat.photo !== 'none' ? (
                                <img src={activeChat.photo} alt={activeChat.name} />
                            ) : (
                                activeChat?.name ? activeChat.name.slice(0, 2).toUpperCase() : '??'
                            )}
                        </Avatar>
                        <div>
                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                {activeChat?.name || `Chat ${chatId}`}
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>online</Text>
                        </div>
                    </Group>
                    <Group align="center" gap="xs" wrap="nowrap">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            onClick={() => setSettingsOpen(true)}
                            title="Налаштування"
                        >
                            <Settings size={18} />
                        </ActionIcon>
                    </Group>
                </Group>
            </Paper>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto chat-thread"
            >
                <div className="chat-thread-inner">
                    <Stack gap="sm" p="md">
                        {renderMessages()}
                        <div ref={bottomRef} />
                    </Stack>
                </div>
            </div>

            <Paper className="composer-bar" radius={0} p="md">
                <div className="composer-stack composer-inner">
                    {(isRecording || isProcessingVoice) && (
                        <div className="recording-status">
                            <span className="recording-dot" />
                            <span>Voice {isProcessingVoice ? 'processing…' : 'recording…'}</span>
                            {!isProcessingVoice && <span className="recording-time">{String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}</span>}
                        </div>
                    )}
                    {pendingRecording && (
                        <div className="attachment-preview">
                            <div className="attachment-meta">
                                <div className="attachment-name">
                                    {pendingRecording.kind === 'video-note' ? 'Відеокружок готовий' : 'Войс готовий'}
                                </div>
                                <div className="attachment-type">Надіслати чи скасувати</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="xs" variant="default" onClick={handleCancelRecording}>Скасувати</Button>
                                <Button size="xs" onClick={handleSendRecording}>Надіслати</Button>
                            </div>
                        </div>
                    )}
                    {pendingAttachment && (
                        <div className="attachment-preview">
                            <div className="attachment-meta">
                                <div className="attachment-name">{pendingAttachment.name || 'Attachment'}</div>
                                <div className="attachment-type">{pendingAttachment.type || 'file'}</div>
                            </div>
                            <button className="attachment-remove" onClick={() => setPendingAttachment(null)}>×</button>
                        </div>
                    )}

                    {isPickerOpen && (
                        <div className="composer-panel">
                            <div className="composer-panel-tabs">
                                <button
                                    className={"composer-panel-tab" + (pickerTab === 'emoji' ? ' active' : '')}
                                    onClick={() => setPickerTab('emoji')}
                                >
                                    Емодзі
                                </button>
                                <button
                                    className={"composer-panel-tab" + (pickerTab === 'stickers' ? ' active' : '')}
                                    onClick={() => setPickerTab('stickers')}
                                >
                                    Стікери
                                </button>
                                <div className="composer-panel-spacer" />
                                <button className="composer-panel-close" onClick={() => setIsPickerOpen(false)}>×</button>
                            </div>

                            {pickerTab === 'emoji' ? (
                                <div className="emoji-grid">
                                    {emojiList.map((emoji) => (
                                        <button
                                            key={emoji}
                                            className="emoji-item"
                                            onClick={() => handleEmojiPick(emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="sticker-panel">
                                    <div className="sticker-tabs">
                                        {stickerSets.map((set) => (
                                            <button
                                                key={set.name}
                                                className={"sticker-tab" + (activeStickerSet === set.name ? ' active' : '')}
                                                onClick={() => setActiveStickerSet(set.name)}
                                                title={set.title || set.name}
                                            >
                                                {set.title || set.name}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="sticker-grid">
                                        {isLoadingStickers && <div className="sticker-loading">Завантаження…</div>}
                                        {!isLoadingStickers && stickers.map((sticker) => (
                                            <button
                                                key={sticker.file_unique_id}
                                                className="sticker-item"
                                                onClick={() => handleStickerPick(sticker)}
                                                title={sticker.emoji || ''}
                                            >
                                                {sticker.url ? (
                                                    <img src={sticker.url} alt={sticker.emoji || 'sticker'} />
                                                ) : (
                                                    <span>{sticker.emoji || '🧩'}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <Group align="flex-end" gap="sm" wrap="nowrap">
                        <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleAttachClick}>
                            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                        </ActionIcon>

                        <ActionIcon
                            variant={isPickerOpen && pickerTab === 'emoji' ? 'filled' : 'subtle'}
                            color={isPickerOpen && pickerTab === 'emoji' ? 'blue' : 'gray'}
                            size="lg"
                            onClick={() => {
                                setIsPickerOpen((prev) => !(prev && pickerTab === 'emoji'));
                                setPickerTab('emoji');
                            }}
                            title="Емодзі"
                        >
                            <Smile size={18} />
                        </ActionIcon>

                        <ActionIcon
                            variant={isPickerOpen && pickerTab === 'stickers' ? 'filled' : 'subtle'}
                            color={isPickerOpen && pickerTab === 'stickers' ? 'blue' : 'gray'}
                            size="lg"
                            onClick={() => {
                                setIsPickerOpen((prev) => !(prev && pickerTab === 'stickers'));
                                setPickerTab('stickers');
                            }}
                            title="Стікери"
                        >
                            <Sticker size={18} />
                        </ActionIcon>

                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileChange}
                        />

                        <Textarea
                            className="composer-textarea"
                            placeholder="Повідомлення..."
                            autosize
                            minRows={1}
                            maxRows={4}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />

                        <ActionIcon
                            variant={noteMode ? 'filled' : 'subtle'}
                            color={noteMode ? 'blue' : 'gray'}
                            size="lg"
                            onClick={() => setNoteMode((prev) => !prev)}
                            title="Note mode"
                        >
                            <Sparkles size={18} />
                        </ActionIcon>

                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            className={isRecordingVideo || isProcessingVideo ? 'voice-recording' : undefined}
                            onClick={isRecordingVideo ? stopVideoRecording : startVideoRecording}
                            title="Record video note"
                            disabled={isProcessingVideo}
                        >
                            {isRecordingVideo ? <span className="voice-dot" /> : (isProcessingVideo ? <Loader2 size={18} className="animate-spin" /> : <CircleDot size={18} />)}
                        </ActionIcon>

                        {(inputValue.trim() || pendingAttachment) ? (
                            <ActionIcon
                                onClick={handleSend}
                                disabled={mutation.isLoading}
                                className="composer-send"
                                size="lg"
                            >
                                {mutation.isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </ActionIcon>
                        ) : (
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="lg"
                                className={isRecording || isProcessingVoice ? 'voice-recording' : undefined}
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isProcessingVoice}
                            >
                                {isRecording ? <span className="voice-dot" /> : (isProcessingVoice ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />)}
                            </ActionIcon>
                        )}
                    </Group>
                </div>
            </Paper>

            {(isRecordingVideo || isProcessingVideo) && (
                <div className={"video-note-overlay" + (isFlashOn ? ' flash-on' : '')}>
                    <div className="video-note-card">
                        <video
                            className="video-note-preview"
                            ref={(el) => {
                                if (el && videoStreamRef.current && isRecordingVideo) {
                                    el.srcObject = videoStreamRef.current;
                                    el.play().catch(() => { });
                                }
                            }}
                            muted
                            playsInline
                            autoPlay
                        />
                        <div className="video-note-controls">
                            <div className="video-note-time">
                                {isProcessingVideo ? 'processing…' : `${String(Math.floor(videoSeconds / 60)).padStart(2, '0')}:${String(videoSeconds % 60).padStart(2, '0')}`}
                            </div>
                            <div className="video-note-actions">
                                <button
                                    className="video-note-btn"
                                    onClick={() => setIsFlashOn((v) => !v)}
                                    title="Flash"
                                >
                                    <Zap size={16} />
                                </button>
                                <button
                                    className="video-note-btn primary"
                                    onClick={isRecordingVideo ? stopVideoRecording : undefined}
                                    disabled={isProcessingVideo}
                                >
                                    {isProcessingVideo ? <Loader2 size={16} className="animate-spin" /> : 'Stop'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: menuPos?.y ?? contextMenu.y, left: menuPos?.x ?? contextMenu.x }}
                    ref={menuRef}
                >
                    <button className="context-item" onClick={handleEdit}>Edit</button>
                    <button className="context-item" onClick={handleDelete}>Delete</button>
                    <div className="context-divider" />
                    <div className="context-reactions">
                        {['👍', '❤️', '🔥', '😂', '🎉', '😡'].map((emoji) => (
                            <button
                                key={emoji}
                                className="context-reaction"
                                onClick={() => handleReaction(emoji)}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <Modal
                opened={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                title="Налаштування"
                centered
                overlayProps={{ backgroundOpacity: 0.6, blur: 3 }}
                classNames={{
                    content: 'modal-content-dark',
                    header: 'modal-header-dark',
                    title: 'modal-title-dark',
                    close: 'modal-close-dark'
                }}
            >
                <Text size="sm" className="modal-subtext">
                    Тут будуть основні налаштування інтерфейсу.
                </Text>
                <Group align="center" justify="space-between" mt="md">
                    <Text size="sm" className="modal-subtext">Ручний режим</Text>
                    <Switch
                        size="sm"
                        checked={Boolean(manualMode?.enabled)}
                        onChange={(event) => handleManualToggle(event.currentTarget.checked)}
                        color="orange"
                    />
                </Group>
                <Group align="center" justify="space-between" mt="md">
                    <Text size="sm" className="modal-subtext">Архівні повідомлення</Text>
                    <Switch
                        size="sm"
                        checked={includeArchive}
                        onChange={(event) => {
                            const newValue = event.currentTarget.checked;
                            setIncludeArchive(newValue);
                            localStorage.setItem('includeArchive', String(newValue));
                            queryClient.invalidateQueries(['chats']);
                        }}
                        color="blue"
                    />
                </Group>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={() => setSettingsOpen(false)} className="modal-button-dark">Закрити</Button>
                </Group>
            </Modal>

            <Modal
                opened={Boolean(profileData)}
                onClose={() => setProfileData(null)}
                title="Профіль"
                centered
                overlayProps={{ backgroundOpacity: 0.6, blur: 3 }}
                classNames={{
                    content: 'modal-content-dark',
                    header: 'modal-header-dark',
                    title: 'modal-title-dark',
                    close: 'modal-close-dark'
                }}
            >
                <Group align="center" gap="md">
                    <Avatar
                        size={64}
                        radius="xl"
                        className="chat-avatar"
                        style={{ cursor: profileData?.photo ? 'pointer' : 'default' }}
                        onClick={() => profileData?.photo && setProfileImageOpen(true)}
                    >
                        {profileData?.photo && profileData.photo !== 'none' ? (
                            <img src={profileData.photo} alt={profileData?.name || 'User'} />
                        ) : (
                            (profileData?.name || 'U').slice(0, 2).toUpperCase()
                        )}
                    </Avatar>
                    <div>
                        <Text fw={600} className="modal-title-text">
                            {profileData?.first_name || profileData?.name || 'User'}
                        </Text>
                        {profileData?.real_name && <Text size="sm" className="modal-subtext" style={{ color: '#7c8fa6' }}>Прізвище Ім'я: {profileData.real_name}</Text>}
                        {profileData?.username && <Text size="sm" className="modal-subtext">@{profileData.username}</Text>}
                        {profileData?.phone && <Text size="sm" className="modal-subtext">{profileData.phone}</Text>}
                        {profileData?.phone_number && <Text size="sm" className="modal-subtext">{profileData.phone_number}</Text>}
                        {profileLoading && <Text size="sm" className="modal-subtext">Завантаження…</Text>}
                        {profileData?.id && <Text size="sm" className="modal-subtext">ID: {profileData.id}</Text>}
                        {profileData && (
                            <div className="profile-extra">
                                {Object.entries(profileData)
                                    .filter(([key, value]) => !['photo', 'photo_url', 'name', 'lastName', 'first_name', 'last_name', 'real_name', 'id', 'username', 'phone', 'phone_number'].includes(key) && value)
                                    .map(([key, value]) => (
                                        <div key={key} className="modal-subtext">
                                            {key}: {String(value)}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </Group>
            </Modal>

            <Modal
                opened={profileImageOpen}
                onClose={() => setProfileImageOpen(false)}
                centered
                overlayProps={{ backgroundOpacity: 0.75, blur: 4 }}
                classNames={{
                    content: 'modal-content-dark',
                    header: 'modal-header-dark',
                    title: 'modal-title-dark',
                    close: 'modal-close-dark'
                }}
                title=""
            >
                {profileData?.photo && (
                    <img src={profileData.photo} alt="avatar" className="profile-image-preview" />
                )}
            </Modal>
        </div>
    );
};

export default ChatWindow;
