import React, { useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import ChatWindow from './components/chat/ChatWindow';

function App() {
  const [selectedChatId, setSelectedChatId] = useState(null);

  return (
    <MainLayout selectedChatId={selectedChatId} onSelectChat={setSelectedChatId}>
      {selectedChatId ? (
        <ChatWindow chatId={selectedChatId} onBack={() => setSelectedChatId(null)} />
      ) : (
        <div className="flex items-center justify-center flex-col h-full text-center p-8" style={{ transform: 'translateY(5px)' }}>
          <h1 className="text-5xl font-bold mb-6 text-gradient filter drop-shadow-lg">Log Wizard UI</h1>
          <p className="text-xl" style={{ color: 'var(--text-secondary)' }}>
            Select a chat to start messaging
          </p>
        </div>
      )}
    </MainLayout>
  );
}

export default App;
