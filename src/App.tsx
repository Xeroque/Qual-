import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { VotingArena } from './components/VotingArena';
import { DashboardView } from './components/DashboardView';
import type { ActiveView } from './types';

const USERNAME_STORAGE_KEY = 'which_one_username';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('arena');
  const [uploadTriggerCount, setUploadTriggerCount] = useState(0);
  const [username, setUsername] = useState<string | null>(() => {
    try {
      const saved = window.localStorage.getItem(USERNAME_STORAGE_KEY);
      return saved && saved.trim() ? saved.trim() : null;
    } catch {
      return null;
    }
  });

  const handleSetUsername = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    setUsername(cleaned);
    try {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, cleaned);
    } catch {
      // Ignore storage errors
    }
  };

  const handleClearUsername = () => {
    setUsername(null);
    try {
      window.localStorage.removeItem(USERNAME_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleUserDeleted = (deletedUser: string) => {
    if (username === deletedUser) {
      handleClearUsername();
    }
  };

  const handlePrimaryAction = () => {
    if (activeView === 'arena') {
      setActiveView('dashboard');
    } else {
      setActiveView('arena');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#18181B] flex flex-col">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view === 'dashboard') {
            setUploadTriggerCount(0);
          }
        }}
        onPrimaryAction={handlePrimaryAction}
      />

      <div className="flex-1">
        {activeView === 'arena' ? (
          <VotingArena
            username={username}
            onSetUsername={handleSetUsername}
            onClearUsername={handleClearUsername}
            onOpenDashboard={() => setActiveView('dashboard')}
          />
        ) : (
          <DashboardView
            uploadTriggerCount={uploadTriggerCount}
            currentUsername={username}
            onUserDeleted={handleUserDeleted}
          />
        )}
      </div>
    </div>
  );
}
