import React, { useMemo, useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Play, Pause } from 'lucide-react';

const checkIsMe = (msg) => {
    return msg.isBot === true ||
        msg.from?.is_bot === true ||
        msg.from?.id === 'bot' ||
        (msg.from?.username && msg.from.username.toLowerCase().includes('bot'));
};

const fileUrlCache = new Map();

const VoiceWaveform = ({ seed, progress }) => {
    const bars = useMemo(() => {
        return Array.from({ length: 40 }, (_, i) => {
            const hash = Math.sin(seed * 0.0001 + i * 0.7) * 10000;
            const h = 8 + Math.abs((hash % 20)) + Math.abs(Math.sin(seed + i * 0.3) * 8);
            return Math.min(28, Math.max(4, Math.round(h)));
        });
    }, [seed]);

    return (
        <svg className="w-full h-[30px]" viewBox="0 0 160 30" preserveAspectRatio="none">
            {bars.map((h, i) => (
                <rect key={i} x={i * 4} y={30 - h} width="2.5" height={h} rx="1.2" fill="currentColor"
                    className={clsx("transition-opacity", i / 40 < progress ? "opacity-100" : "opacity-30")} />
            ))}
        </svg>
    );
};

const VoicePlayer = ({ url, duration, messageId, isMe }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef(null);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        isPlaying ? audio.pause() : audio.play();
        setIsPlaying(!isPlaying);
    };

    const seed = parseInt(messageId?.toString().replace(/\D/g, '')) || 12345;
    const fmtDuration = (sec) => sec ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : '0:00';

    return (
        <div className="flex items-center gap-3 min-w-[220px] p-2">
            <audio ref={audioRef} src={url} onTimeUpdate={() => audioRef.current && setProgress(audioRef.current.currentTime / audioRef.current.duration)}
                onEnded={() => { setIsPlaying(false); setProgress(0); }} preload="metadata" />
            <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center rounded-full hover:opacity-80 shrink-0"
                style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}>
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="flex-1 cursor-pointer h-[30px]"><VoiceWaveform seed={seed} progress={progress} /></div>
            <span className="text-xs opacity-70">{fmtDuration(duration || 0)}</span>
        </div>
    );
};

const VideoPlayer = ({ src, muted = false, loop = false, autoPlayIfShort = false }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    };

    const updateProgress = () => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        setProgress(video.currentTime / video.duration);
    };

    const seek = (event) => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        video.currentTime = ratio * video.duration;
        setProgress(ratio);
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !autoPlayIfShort) return;
        const onLoaded = () => {
            if (video.duration && video.duration <= 10) {
                video.play().catch(() => { });
            }
        };
        video.addEventListener('loadedmetadata', onLoaded);
        return () => video.removeEventListener('loadedmetadata', onLoaded);
    }, [autoPlayIfShort]);

    return (
        <div className="media-video-player" onClick={togglePlay} onTouchEnd={togglePlay}>
            <video
                ref={videoRef}
                src={src}
                className="media-video"
                onTimeUpdate={updateProgress}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                playsInline
                muted={muted}
                loop={loop}
                preload="metadata"
                onClick={togglePlay}
                onTouchEnd={togglePlay}
            />
            <div className="media-video-progress" onClick={seek}>
                <div className="media-video-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
        </div>
    );
};

const VideoNotePlayer = ({ src }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const frameRef = useRef(null);
    const progressRef = useRef(0);
    const suppressClickRef = useRef(false);
    const playPromiseRef = useRef(null);

    const updateProgress = () => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        const next = video.currentTime / video.duration;
        if (Math.abs(next - progressRef.current) > 0.001) {
            progressRef.current = next;
            setProgress(next);
        }
    };

    const handleToggle = async (e) => {
        if (e) e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;

        // Wait for pending play to finish before toggling
        if (playPromiseRef.current) {
            try {
                await playPromiseRef.current;
            } catch { }
            playPromiseRef.current = null;
        }

        // Логіка:
        // - Якщо маленький (не expanded): розширити + грати
        // - Якщо розширений: тільки пауза/плей
        if (!isExpanded) {
            // Маленький → розширити і грати
            setIsExpanded(true);
            if (video.paused) {
                playPromiseRef.current = video.play();
                playPromiseRef.current.then(() => {
                    setIsPlaying(true);
                    playPromiseRef.current = null;
                }).catch(() => {
                    playPromiseRef.current = null;
                });
            }
        } else {
            // Розширений → тільки пауза
            if (!video.paused) {
                video.pause();
                setIsPlaying(false);
            } else {
                // Якщо на паузі і натиснув - продовжити
                playPromiseRef.current = video.play();
                playPromiseRef.current.then(() => {
                    setIsPlaying(true);
                    playPromiseRef.current = null;
                }).catch(() => {
                    playPromiseRef.current = null;
                });
            }
        }
    };

    const handleLoaded = () => {
        const video = videoRef.current;
        if (video?.duration) {
            setDuration(video.duration);
            if (video.duration <= 10) {
                playPromiseRef.current = video.play();
                playPromiseRef.current.then(() => {
                    playPromiseRef.current = null;
                }).catch(() => {
                    playPromiseRef.current = null;
                });
            }
        }
    };

    const seekByPointer = (event) => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const angle = Math.atan2(dy, dx);
        const deg = (angle * 180) / Math.PI;
        const normalized = (deg + 450) % 360; // start at top
        const ratio = (1 - (normalized / 360)) % 1;
        video.currentTime = ratio * video.duration;
        progressRef.current = ratio;
        setProgress(ratio);
    };

    const handlePointerDown = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const ringMin = 64;
        const ringMax = 92;

        if (dist >= ringMin && dist <= ringMax) {
            setIsSeeking(true);
            suppressClickRef.current = true;
            seekByPointer(event);
        }
    };

    const handlePointerMove = (event) => {
        if (!isSeeking) return;
        seekByPointer(event);
    };

    const handlePointerUp = () => {
        setIsSeeking(false);
        setTimeout(() => {
            suppressClickRef.current = false;
        }, 0);
    };

    const size = 172;
    const stroke = 4;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isPlaying) return;

        const tick = () => {
            updateProgress();
            if (!video) return;
            if (typeof video.requestVideoFrameCallback === 'function') {
                frameRef.current = video.requestVideoFrameCallback(tick);
            } else {
                frameRef.current = requestAnimationFrame(tick);
            }
        };

        tick();

        return () => {
            if (!video) return;
            if (typeof video.cancelVideoFrameCallback === 'function' && frameRef.current) {
                video.cancelVideoFrameCallback(frameRef.current);
            } else if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [isPlaying]);

    return (
        <>
            {isExpanded && <div className="video-note-backdrop" onClick={() => setIsExpanded(false)} />}
            <div
                className={clsx('video-note-player', isExpanded && 'expanded', isPlaying && 'is-playing')}
                onClick={() => {
                    if (!suppressClickRef.current && !isSeeking) handleToggle();
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <svg
                    className="video-note-ring"
                    width={size}
                    height={size}
                >
                    <circle
                        className="video-note-ring-track"
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                    />
                    <circle
                        className="video-note-ring-progress"
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className="video-note-inner" role="button" tabIndex={0}>
                    <video
                        ref={videoRef}
                        src={src}
                        className="video-note-video"
                        onTimeUpdate={updateProgress}
                        onLoadedMetadata={handleLoaded}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                        playsInline
                        muted={!isExpanded}
                        preload="metadata"
                    />
                </div>
                {duration > 0 && (
                    <div className="video-note-time">
                        {new Date((duration - (duration * (1 - progress))) * 1000).toISOString().substr(14, 5)}
                    </div>
                )}
            </div>
        </>
    );
};

const fixMediaUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return url.startsWith('/') ? url : `/${url}`;
};

const normalizeReactions = (input) => {
    if (!input) return [];

    if (Array.isArray(input)) {
        return input.map((r) => {
            let emoji = null;

            // 1. Direct String (e.g. ['👍', '🔥'])
            if (typeof r === 'string') emoji = r;
            // 2. Standard Prop (My structure)
            else if (r?.emoji && typeof r.emoji === 'string') emoji = r.emoji;
            // 3. Nested Type (Telegram API)
            else if (r?.type?.emoji && typeof r.type.emoji === 'string') emoji = r.type.emoji;
            // 4. Nested Reaction
            else if (r?.reaction) {
                if (typeof r.reaction === 'string') emoji = r.reaction;
                else if (r.reaction?.emoji && typeof r.reaction.emoji === 'string') emoji = r.reaction.emoji;
            }

            return {
                emoji,
                count: Number(r.count ?? r.total ?? r.total_count ?? 1),
                me: Boolean(r.me || r.isMe || r.is_own)
            };
        }).filter(r => r.emoji);
    }

    if (typeof input === 'object') {
        if (Array.isArray(input.results)) return normalizeReactions(input.results);
        return Object.entries(input).map(([emoji, count]) => ({
            emoji,
            count: Number(count ?? 1),
            me: false
        }));
    }

    return [];
};

const MessageBubble = ({ message, fallbackAvatarUrl, fallbackAvatarName, onOpenMenu, onAvatarClick }) => {
    const isMe = checkIsMe(message);
    const resolveMessageTime = (msg) => {
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
    const resolvedTime = resolveMessageTime(message);
    const time = resolvedTime ? format(resolvedTime, 'HH:mm:ss') : '';

    const [stickerFallbackUrl, setStickerFallbackUrl] = useState(null);
    const stickerSrc = fixMediaUrl(message.url_sticker || message.url_animated_sticker || message.url_animation || message.animation?.url) || stickerFallbackUrl;
    const [photoSrc, setPhotoSrc] = useState(fixMediaUrl(message.url_photo || message.photo_url));
    const [videoUrl, setVideoUrl] = useState(fixMediaUrl(message.url_video || message.video?.url || message.url_animation || message.animation?.url));
    const [videoNoteUrl, setVideoNoteUrl] = useState(fixMediaUrl(message.url_video_note || message.video_note?.url));
    const voiceSrc = fixMediaUrl(message.url_voice || message.voice?.url);

    const hasMedia = stickerSrc || photoSrc || voiceSrc || videoUrl || videoNoteUrl;
    const hasText = message.text && message.text.trim();
    const mediaOnly = (stickerSrc || photoSrc || videoUrl || videoNoteUrl) && !hasText;
    const voiceOnly = voiceSrc && !hasText;
    const isGif = Boolean(message.animation || message.is_gif || message.video?.is_gif || (photoSrc && /\.gif($|\?)/i.test(photoSrc)));
    const mediaNoBubble = !hasText && (stickerSrc || videoUrl || videoNoteUrl || isGif);
    const stickerIsVideo = Boolean(message.sticker?.is_video || (stickerSrc && /\.webm($|\?)/i.test(stickerSrc)));

    useEffect(() => {
        const fileId = message.photo?.length ? message.photo[message.photo.length - 1].file_id : message.photo?.file_id;
        if (!fileId || photoSrc) return;
        if (fileUrlCache.has(fileId)) {
            setPhotoSrc(fileUrlCache.get(fileId));
            return;
        }
        fetch(`/api/file-url/${encodeURIComponent(fileId)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.url) {
                    fileUrlCache.set(fileId, data.url);
                    setPhotoSrc(data.url);
                }
            })
            .catch(() => { });
    }, [message.photo, photoSrc]);

    useEffect(() => {
        const fileId = message.video?.file_id || message.animation?.file_id;
        if (!fileId || videoUrl) return;
        if (fileUrlCache.has(fileId)) {
            setVideoUrl(fileUrlCache.get(fileId));
            return;
        }
        fetch(`/api/file-url/${encodeURIComponent(fileId)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.url) {
                    fileUrlCache.set(fileId, data.url);
                    setVideoUrl(data.url);
                }
            })
            .catch(() => { });
    }, [message.video?.file_id, message.animation?.file_id, videoUrl]);

    useEffect(() => {
        const fileId = message.video_note?.file_id;
        if (!fileId || videoNoteUrl) return;
        if (fileUrlCache.has(fileId)) {
            setVideoNoteUrl(fileUrlCache.get(fileId));
            return;
        }
        fetch(`/api/file-url/${encodeURIComponent(fileId)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.url) {
                    fileUrlCache.set(fileId, data.url);
                    setVideoNoteUrl(data.url);
                }
            })
            .catch(() => { });
    }, [message.video_note?.file_id, videoNoteUrl]);

    useEffect(() => {
        const fileId = message.sticker?.file_id || message.animation?.file_id;
        if (!fileId || stickerSrc) return;
        if (fileUrlCache.has(fileId)) {
            setStickerFallbackUrl(fileUrlCache.get(fileId));
            return;
        }
        fetch(`/api/file-url/${encodeURIComponent(fileId)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.url) {
                    fileUrlCache.set(fileId, data.url);
                    setStickerFallbackUrl(data.url);
                }
            })
            .catch(() => { });
    }, [message.sticker?.file_id, message.animation?.file_id, stickerSrc]);

    const [reactions, setReactions] = useState(() => normalizeReactions(message.reactions || message.reaction));

    useEffect(() => {
        setReactions(normalizeReactions(message.reactions || message.reaction));
    }, [message.reactions, message.reaction]);

    const toggleReaction = (emoji) => {
        setReactions((prev) => {
            const existing = prev.find(r => r.emoji === emoji);
            if (!existing) return [...prev, { emoji, count: 1, me: true }];
            if (existing.me) {
                const nextCount = Math.max(0, existing.count - 1);
                return prev
                    .map(r => r.emoji === emoji ? { ...r, count: nextCount, me: false } : r)
                    .filter(r => r.count > 0);
            }
            return prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, me: true } : r);
        });
    };

    const avatarUrl = fixMediaUrl(message.from?.photo || message.from?.photo_url || message.photo_url || message.avatar_url || fallbackAvatarUrl);
    const avatarInitial = message.from?.first_name?.[0]?.toUpperCase()
        || fallbackAvatarName?.[0]?.toUpperCase()
        || 'U';
    const [avatarOk, setAvatarOk] = useState(true);

    useEffect(() => {
        setAvatarOk(true);
    }, [avatarUrl]);

    const handleContextMenu = (event) => {
        if (onOpenMenu) {
            event.preventDefault();
            onOpenMenu(event, message);
        }
    };

    return (
        <div className={clsx("message-row mb-3", isMe && "message-row--me")} onContextMenu={handleContextMenu}>
            {/* Avatar */}
            {!isMe && (
                <button
                    type="button"
                    className="message-avatar flex-shrink-0"
                    style={{ backgroundColor: '#3498db' }}
                    onClick={() => onAvatarClick?.(message)}
                >
                    {avatarUrl && avatarOk ? (
                        <img
                            src={avatarUrl}
                            alt="avatar"
                            className="message-avatar-img"
                            onError={() => setAvatarOk(false)}
                        />
                    ) : (
                        avatarInitial
                    )}
                </button>
            )}

            {/* Bubble */}
            <div
                className={mediaNoBubble ? '' : clsx(
                    "message-bubble",
                    isMe ? "message-bubble--me" : "message-bubble--other",
                    mediaOnly && "message-bubble--media"
                )}
            >
                <div className="message-content">
                    {/* Author */}
                    {!isMe && message.from?.first_name && (
                        <div className="message-author" style={{ color: 'var(--accent-cyan)' }}>
                            {message.from.first_name}
                        </div>
                    )}

                    {/* Media */}
                    {(stickerSrc || photoSrc || videoUrl || voiceSrc || videoNoteUrl) && (
                        <div className={clsx("message-media", mediaOnly && "message-media--only", videoNoteUrl && "message-media--note")}>
                            {stickerSrc && (
                                stickerIsVideo ? (
                                    <video
                                        src={stickerSrc}
                                        className="message-media-sticker"
                                        muted
                                        loop
                                        autoPlay
                                        playsInline
                                    />
                                ) : (
                                    <img src={stickerSrc} alt="sticker" className="message-media-sticker" />
                                )
                            )}

                            {photoSrc && !stickerSrc && (
                                <img
                                    src={photoSrc}
                                    alt="photo"
                                    className="message-media-photo"
                                    onError={() => {
                                        const fileId = message.photo?.length ? message.photo[message.photo.length - 1].file_id : message.photo?.file_id;
                                        if (!fileId) return;
                                        fetch(`/api/file-url/${encodeURIComponent(fileId)}`)
                                            .then((r) => r.ok ? r.json() : null)
                                            .then((data) => data?.url && setPhotoSrc(data.url))
                                            .catch(() => { });
                                    }}
                                />
                            )}

                            {videoUrl && !stickerSrc && !photoSrc && (
                                <VideoPlayer src={videoUrl} muted loop={isGif} autoPlayIfShort />
                            )}

                            {videoNoteUrl && !stickerSrc && !photoSrc && !videoUrl && (
                                <VideoNotePlayer src={videoNoteUrl} />
                            )}

                            {voiceSrc && !hasText && (
                                <div className="message-media-voice">
                                    <VoicePlayer url={voiceSrc} duration={message.voice?.duration} messageId={message.message_id} isMe={isMe} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Text */}
                    {hasText && (
                        <div className="message-text">
                            {message.text}
                        </div>
                    )}

                </div>

                {/* Reactions */}
                {(reactions.length > 0 || hasText || hasMedia) && (
                    <div className={clsx("message-footer", mediaOnly && "message-footer--media", voiceOnly && "message-footer--voice")}>
                        {reactions.length > 0 ? (
                            <div className="reaction-row">
                                {reactions.map((reaction) => (
                                    <button
                                        key={reaction.emoji}
                                        className={clsx('reaction-pill', reaction.me && 'me')}
                                        onClick={() => toggleReaction(reaction.emoji)}
                                    >
                                        <span>{reaction.emoji}</span>
                                        <span>{reaction.count}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div />
                        )}

                        {(hasText || hasMedia) && (
                            <div className="message-time"
                                style={{ color: isMe ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)' }}>
                                {time}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export default MessageBubble;
