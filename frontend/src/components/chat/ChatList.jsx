import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChats, fetchUserProfile } from '../../api/chatApi';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ActionIcon, Avatar, Group, Paper, ScrollArea, Stack, Text, TextInput, Title, Modal, Button } from '@mantine/core';
import { Search } from 'lucide-react';

const ChatList = ({ selectedChatId, onSelectChat }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [profileData, setProfileData] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileImageOpen, setProfileImageOpen] = useState(false);
    const includeArchive = localStorage.getItem('includeArchive') === 'true';
    const { data: chats, isLoading, error } = useQuery({
        queryKey: ['chats', includeArchive],
        queryFn: () => fetchChats(includeArchive),
        refetchInterval: 5000
    });

    // Solid avatar colors for clean look
    const avatarColors = useMemo(() => [
        '#e74c3c', // Red
        '#3498db', // Blue
        '#2ecc71', // Green
        '#f39c12', // Orange
        '#9b59b6', // Purple
        '#1abc9c', // Teal
        '#e67e22', // Dark Orange
    ], []);

    if (isLoading) return <div className="p-4 text-center text-[var(--text-secondary)]">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-400">Error loading chats</div>;

    const filteredChats = chats?.filter((chat) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            chat.name?.toLowerCase().includes(q) ||
            chat.lastMessage?.text?.toLowerCase().includes(q)
        );
    });

    const formatChatTime = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

        if (isSameDay(date, now)) return format(date, 'HH:mm');
        if (isSameDay(date, yesterday)) return 'Вчора';

        const weekday = date.toLocaleDateString('uk-UA', { weekday: 'short' });
        const datePart = date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
        return `${weekday} · ${datePart}`;
    };

    return (
        <div className="chat-list-panel">
            <div className="chat-list-header">
                <Group justify="space-between" align="center">
                    <Title
                        order={4}
                        className="chat-list-title"
                        onClick={() => window.location.reload()}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Chats
                    </Title>
                    <ActionIcon variant="subtle" color="gray" radius="xl">
                        <Search size={16} />
                    </ActionIcon>
                </Group>
                <TextInput
                    className="chat-search-input"
                    placeholder="Пошук чатів..."
                    leftSection={<Search size={14} />}
                    radius="md"
                    size="sm"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                />
            </div>

            <ScrollArea className="chat-list-scroll" scrollbarSize={6} offsetScrollbars>
                <Stack gap="sm" p="md">
                    {filteredChats?.map((chat) => {
                        const initials = chat.name ? chat.name.slice(0, 2).toUpperCase() : '??';
                        const colorIndex = (chat.id || 0) % avatarColors.length;
                        const avatarColor = avatarColors[colorIndex];
                        const isSelected = selectedChatId === chat.id;

                        return (
                            <Paper
                                key={chat.id}
                                onClick={() => onSelectChat(chat.id)}
                                className={clsx('chat-card', isSelected && 'selected')}
                                p="sm"
                                radius="lg"
                            >
                                <Group wrap="nowrap" align="center">
                                    <Avatar
                                        size={44}
                                        radius="xl"
                                        color="blue"
                                        className="chat-avatar"
                                        style={{ backgroundColor: avatarColor }}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            const base = {
                                                name: chat.name || 'User',
                                                id: chat.id,
                                                photo: chat.photo
                                            };
                                            setProfileData(base);
                                            if (chat.id) {
                                                setProfileLoading(true);
                                                fetchUserProfile(chat.id)
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
                                        }}
                                    >
                                        {chat.photo && chat.photo !== 'none' ? (
                                            <img src={chat.photo} alt={chat.name} />
                                        ) : (
                                            initials
                                        )}
                                    </Avatar>
                                    <div className="chat-card-body">
                                        <Group justify="space-between" align="center" gap="xs">
                                            <Text className="chat-name" lineClamp={1}>{chat.name}</Text>
                                            <Text className="chat-time">
                                                {formatChatTime(chat.lastDate)}
                                            </Text>
                                        </Group>
                                        <Text className="chat-preview" lineClamp={1}>
                                            {chat.lastMessage?.text || 'No messages'}
                                        </Text>
                                    </div>
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>
            </ScrollArea>

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
                            {[profileData?.name, profileData?.lastName].filter(Boolean).join(' ') || 'User'}
                        </Text>
                        {profileData?.username && <Text size="sm" className="modal-subtext">@{profileData.username}</Text>}
                        {profileData?.phone && <Text size="sm" className="modal-subtext">{profileData.phone}</Text>}
                        {profileLoading && <Text size="sm" className="modal-subtext">Завантаження…</Text>}
                        {profileData?.id && <Text size="sm" className="modal-subtext">ID: {profileData.id}</Text>}
                        {profileData && (
                            <div className="profile-extra">
                                {Object.entries(profileData)
                                    .filter(([key, value]) => !['photo', 'photo_url', 'name', 'lastName', 'first_name', 'last_name'].includes(key) && value && key !== 'id' && key !== 'username' && key !== 'phone' && key !== 'phone_number')
                                    .map(([key, value]) => (
                                        <div key={key} className="modal-subtext">
                                            {key}: {String(value)}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </Group>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={() => setProfileData(null)}>Закрити</Button>
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

export default ChatList;
