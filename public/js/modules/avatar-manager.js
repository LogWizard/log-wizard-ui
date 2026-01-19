/**
 * 🌿 AvatarManager
 * Handles fetching, caching, and serving user avatars.
 */
export class AvatarManager {
    constructor() {
        if (AvatarManager.instance) {
            return AvatarManager.instance;
        }
        this.cache = new Map(); // userId -> avatarUrl
        this.pendingRequests = new Map(); // userId -> Promise
        this.subscribers = new Map(); // userId -> Set<callback(url)>
        AvatarManager.instance = this;
        this.loadFromLocalStorage();
    }

    static getInstance() {
        if (!AvatarManager.instance) {
            AvatarManager.instance = new AvatarManager();
        }
        return AvatarManager.instance;
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('avatarbox_cache');
            if (stored) {
                const data = JSON.parse(stored);
                // Clean up old entries (optional expiration logic could go here)
                Object.entries(data).forEach(([id, url]) => {
                    if (url) this.cache.set(id, url);
                });
                console.log(`🌿 Loaded ${this.cache.size} avatars from local storage`);
            }
        } catch (e) {
            console.warn('Failed to load avatar cache:', e);
        }
    }

    saveToLocalStorage() {
        try {
            const data = Object.fromEntries(this.cache);
            localStorage.setItem('avatarbox_cache', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save avatar cache:', e);
        }
    }

    /**
     * Get avatar URL for a user/chat.
     * If cached, returns immediately.
     * If not, fetches in background and returns null (triggers callback later).
     * @param {string} userId - User or Chat ID
     * @param {function} callback - Optional callback when avatar loads
     * @returns {string|null} - Current URL or null if loading
     */
    getAvatar(userId, callback) {
        if (!userId) return null;
        userId = String(userId);

        // 1. Check Memory Cache
        if (this.cache.has(userId)) {
            const url = this.cache.get(userId);
            // If we have a null/placeholder cached, maybe retry? For now, trust cache.
            // But if callback provided, just run it immediately for consistency
            if (callback) callback(url);
            return url;
        }

        // 2. Register Subscriber
        if (callback) {
            if (!this.subscribers.has(userId)) {
                this.subscribers.set(userId, new Set());
            }
            this.subscribers.get(userId).add(callback);
        }

        // 3. Trigger Fetch if not pending
        if (!this.pendingRequests.has(userId)) {
            this.fetchAvatar(userId);
        }

        return null;
    }

    async fetchAvatar(userId) {
        // 🌿 Client-Side Fetch Disabled
        // Use backend-provided `photo_url` in messages/chats API.
        this.cache.set(userId, null);
        this.notifySubscribers(userId, null);
        return null;
    }

    notifySubscribers(userId, url) {
        if (this.subscribers.has(userId)) {
            const callbacks = this.subscribers.get(userId);
            callbacks.forEach(cb => {
                try { cb(url); } catch (e) { console.error('Avatar callback error:', e); }
            });
            this.subscribers.delete(userId); // notify once
        }
    }

    /**
     * Preload avatars for a list of chats/users
     * @param {Array} chatList - List of chat/msg objects with ids
     */
    preloadAvatars(chatList) {
        if (!chatList || !Array.isArray(chatList)) return;

        const uniqueIds = new Set();
        chatList.forEach(c => {
            const id = String(c.from?.id || c.chat?.id || c.id || '');
            // 🌿 Only preload if not in cache and not pending
            if (id && !id.startsWith('-') && !this.cache.has(id) && !this.pendingRequests.has(id)) {
                uniqueIds.add(id);
            }
        });

        if (uniqueIds.size > 0) {
            console.log(`🌿 Preloading ${uniqueIds.size} new avatars...`);
            uniqueIds.forEach(id => this.getAvatar(id));
        }
    }

    /**
     * Helper to set image source when ready
     */
    bindImage(imgElement, userId, placeholderHtml = '') {
        if (!userId) return;

        const url = this.getAvatar(userId, (loadedUrl) => {
            if (loadedUrl) imgElement.src = loadedUrl;
            imgElement.classList.remove('loading-avatar');
        });

        if (url) {
            imgElement.src = url;
        } else {
            // If placeholder needed
            if (placeholderHtml) {
                // Complex logic if we want to replace img with div...
                // Easier: let caller handle placeholder, we just update src.
            }
            imgElement.classList.add('loading-avatar');
        }
    }
}

export const avatarManager = new AvatarManager();
