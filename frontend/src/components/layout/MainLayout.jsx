import React from 'react';
import ChatList from '../chat/ChatList';
import clsx from 'clsx';

const MainLayout = ({ children, selectedChatId, onSelectChat }) => {
    return (
        <div className="flex h-screen w-full overflow-hidden app-shell">
            {/* Sidebar - Clean Style */}
            <aside className={clsx(
                "w-full md:w-[300px] border-r flex flex-col shrink-0 transition-all duration-200 sidebar",
                selectedChatId ? "hidden md:flex" : "flex"
            )}
                style={{ borderColor: 'var(--border-default)' }}>
                <ChatList selectedChatId={selectedChatId} onSelectChat={onSelectChat} />
            </aside>

            {/* Main Content */}
            <main className={clsx(
                "flex-1 flex flex-col w-full h-full",
                selectedChatId ? "flex" : "hidden md:flex"
            )}>
                {children}
            </main>
        </div>
    );
};

export default MainLayout;
