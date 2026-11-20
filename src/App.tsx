import React, { Suspense, useCallback, useState } from 'react';
import {
  BookmarkCheck,
  Compass,
  Download,
  Home,
  Loader2,
  Maximize2,
  Play,
  Search,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { AccountSheet } from './components/AccountSheet';
import { HomeFeed } from './components/HomeFeed';
import { LoginView } from './components/LoginView';
import { MediaImage } from './components/MediaImage';
import { PWAInstallButton } from './components/PWAInstallButton';
import type { PictaCanal, PictaPublicacion } from './types/picta';

const WatchView = lazyWithRetry(() => import('./components/WatchView').then((m) => ({ default: m.WatchView })));
const ExploreSearchView = lazyWithRetry(() =>
  import('./components/ExploreSearchView').then((m) => ({ default: m.ExploreSearchView })),
);
const ChannelView = lazyWithRetry(() => import('./components/ChannelView').then((m) => ({ default: m.ChannelView })));
const LibraryView = lazyWithRetry(() => import('./components/LibraryView').then((m) => ({ default: m.LibraryView })));
const DownloadsView = lazyWithRetry(() =>
  import('./components/DownloadsView').then((m) => ({ default: m.DownloadsView })),
);

const RouteFallback: React.FC = () => (
  <div className="py-20 flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
  </div>
);

type NavTab = 'home' | 'explore' | 'library' | 'downloads';

const PictaShell: React.FC = () => {
  const { isAuthenticated, isInitializing, user } = useAuth();
  const {
    currentVideo,
    isMinimized,
    isPlaying,
    playVideo,
    minimizePlayer,
    expandPlayer,
    closePlayer,
    togglePlayPause,
  } = usePlayer();
  const isOnline = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedChannel, setSelectedChannel] = useState<PictaCanal | null>(null);
  const [searchSeed, setSearchSeed] = useState('');
  const [showAccount, setShowAccount] = useState(false);

  const handleSelectVideo = useCallback(
    (video: PictaPublicacion) => {
      setSelectedChannel(null);
      playVideo(video);
    },
    [playVideo],
  );

  const handleSelectChannel = useCallback(
    (canal: PictaCanal) => {
      if (currentVideo && !isMinimized) {
        minimizePlayer();
      }
      setSelectedChannel(canal);
    },
    [currentVideo, isMinimized, minimizePlayer],
  );

  const handleTabChange = useCallback((tab: NavTab) => {
    setSelectedChannel(null);
    setActiveTab(tab);
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-dvh bg-[#070709] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#FF4D4D] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const showWatchFull = Boolean(currentVideo && !isMinimized && !selectedChannel);

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'explore', label: 'Explorar', icon: Compass },
    { id: 'library', label: 'Listas', icon: BookmarkCheck },
    { id: 'downloads', label: 'Descargas', icon: Download },
  ];

  return (
    <div className="min-h-dvh bg-[#070709] text-[#F5F6F8] flex flex-col">
      <header className="sticky top-0 z-40 h-14 pt-safe bg-[#070709]/90 backdrop-blur-md border-b border-white/[0.06] px-4 lg:px-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            setSelectedChannel(null);
            if (currentVideo && !isMinimized) minimizePlayer();
            setActiveTab('home');
          }}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="w-7 h-7 rounded-lg bg-[#FF4D4D] flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
          </span>
          <span className="font-display text-base font-bold tracking-tight text-[#F5F6F8]">
            Picta Pulse
          </span>
        </button>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#9CA3AF]">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (currentVideo && !isMinimized) minimizePlayer();
                handleTabChange(item.id);
              }}
              className={`min-h-[40px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                !showWatchFull && !selectedChannel && activeTab === item.id
                  ? 'text-[#F5F6F8] underline decoration-[#FF4D4D] decoration-2 underline-offset-8'
                  : 'hover:text-[#F5F6F8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton compact />
          </div>

          <button
            type="button"
            onClick={() => {
              if (currentVideo && !isMinimized) minimizePlayer();
              setSelectedChannel(null);
              setSearchSeed('');
              setActiveTab('explore');
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-[#F5F6F8] hover:bg-[#111318] cursor-pointer"
            aria-label="Buscar en Picta"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowAccount(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#111318] p-1 cursor-pointer"
            aria-label="Perfil y cuenta"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#181B22] border border-white/15">
              <MediaImage
                src={user?.avatar}
                size="80x80"
                alt={user?.username || 'Cuenta'}
                variant="avatar"
                fallbackText={user?.username || 'P'}
                className="w-full h-full object-cover"
              />
            </div>
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-600/95 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sin conexión — Mostrando listas e historial guardados localmente.</span>
        </div>
      )}

      <main className="flex-1 w-full">
        {currentVideo && (
          <div className={showWatchFull ? 'block' : 'hidden'}>
            <Suspense fallback={<RouteFallback />}>
              <WatchView
                video={currentVideo}
                onSelectVideo={handleSelectVideo}
                onSelectChannel={handleSelectChannel}
              />
            </Suspense>
          </div>
        )}

        {!showWatchFull && (
          <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-5 pb-24 lg:pb-12">
            <Suspense fallback={<RouteFallback />}>
              {selectedChannel ? (
                <ChannelView
                  canal={selectedChannel}
                  onBack={() => setSelectedChannel(null)}
                  onSelectVideo={handleSelectVideo}
                />
              ) : activeTab === 'home' ? (
                <HomeFeed onSelectVideo={handleSelectVideo} onSelectChannel={handleSelectChannel} />
              ) : activeTab === 'explore' ? (
                <ExploreSearchView
                  initialQuery={searchSeed}
                  onSelectVideo={handleSelectVideo}
                  onSelectChannel={handleSelectChannel}
                />
              ) : activeTab === 'library' ? (
                <LibraryView onSelectVideo={handleSelectVideo} onSelectChannel={handleSelectChannel} />
              ) : (
                <DownloadsView onSelectVideo={handleSelectVideo} />
              )}
            </Suspense>
          </div>
        )}
      </main>

      {currentVideo && !showWatchFull && (
        <div className="fixed bottom-[4.25rem] lg:bottom-4 left-2 right-2 lg:left-auto lg:right-6 lg:w-96 z-40 rounded-2xl bg-[#111318]/95 backdrop-blur-md border border-white/10 p-2 shadow-2xl flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSelectedChannel(null);
              expandPlayer();
            }}
            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="w-16 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
              <MediaImage
                src={currentVideo.url_imagen}
                size="120x68"
                alt={currentVideo.nombre}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F5F6F8] truncate">{currentVideo.nombre}</p>
              <p className="text-[11px] text-[#9CA3AF] truncate">
                {currentVideo.canal?.nombre || 'Reproduciendo'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5F6F8] hover:bg-white/10 cursor-pointer"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? <span className="font-mono-tabular text-xs font-bold">||</span> : <Play className="w-4 h-4 fill-white" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedChannel(null);
              expandPlayer();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5F6F8] hover:bg-white/10 cursor-pointer"
            aria-label="Expandir reproductor"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={closePlayer}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="Cerrar reproductor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <nav
        aria-label="Navegación principal móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070709]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = !showWatchFull && !selectedChannel && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (currentVideo && !isMinimized) minimizePlayer();
                  handleTabChange(item.id);
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                  active ? 'text-[#FF4D4D]' : 'text-[#9CA3AF] hover:text-[#F5F6F8]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} />}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <PictaShell />
      </PlayerProvider>
    </AuthProvider>
  );
}
