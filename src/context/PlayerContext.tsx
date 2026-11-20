import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LocalDownloadItem, LocalHistoryItem, PictaPublicacion } from '../types/picta';

const HISTORY_KEY = 'picta_pulse_history_v1';
const SAVED_KEY = 'picta_pulse_saved_v1';
const DOWNLOADS_KEY = 'picta_pulse_downloads_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface PlayerContextValue {
  currentVideo: PictaPublicacion | null;
  queue: PictaPublicacion[];
  isMinimized: boolean;
  isPlaying: boolean;
  history: LocalHistoryItem[];
  savedVideos: PictaPublicacion[];
  savedDownloads: LocalDownloadItem[];
  playVideo: (video: PictaPublicacion, queue?: PictaPublicacion[]) => void;
  minimizePlayer: () => void;
  expandPlayer: () => void;
  closePlayer: () => void;
  setIsPlaying: (playing: boolean) => void;
  registerVideoElement: (el: HTMLVideoElement | null) => void;
  togglePlayPause: () => void;
  updateProgress: (video: PictaPublicacion, progressSeconds: number, durationSeconds: number) => void;
  getResumeSeconds: (videoId: number) => number;
  toggleSavedVideo: (video: PictaPublicacion) => boolean;
  isVideoSaved: (videoId: number) => boolean;
  addSavedDownload: (item: LocalDownloadItem) => void;
  removeSavedDownload: (id: string) => void;
  clearHistory: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentVideo, setCurrentVideo] = useState<PictaPublicacion | null>(null);
  const [queue, setQueue] = useState<PictaPublicacion[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlaying, setIsPlayingState] = useState(false);

  const [history, setHistory] = useState<LocalHistoryItem[]>(() => readJson(HISTORY_KEY, []));
  const [savedVideos, setSavedVideos] = useState<PictaPublicacion[]>(() => readJson(SAVED_KEY, []));
  const [savedDownloads, setSavedDownloads] = useState<LocalDownloadItem[]>(() => readJson(DOWNLOADS_KEY, []));

  const liveProgressRef = useRef<
    Map<number, { video: PictaPublicacion; progressSeconds: number; durationSeconds: number; committedSeconds: number }>
  >(new Map());
  const currentVideoRef = useRef<PictaPublicacion | null>(null);

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  useEffect(() => {
    for (const h of history) {
      if (!liveProgressRef.current.has(h.video.id)) {
        liveProgressRef.current.set(h.video.id, {
          video: h.video,
          progressSeconds: h.progressSeconds,
          durationSeconds: h.durationSeconds,
          committedSeconds: h.progressSeconds,
        });
      }
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
    } catch {
      // ignore quota error
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(savedVideos.slice(0, 100)));
    } catch {
      // ignore quota error
    }
  }, [savedVideos]);

  useEffect(() => {
    try {
      localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(savedDownloads.slice(0, 50)));
    } catch {
      // ignore quota error
    }
  }, [savedDownloads]);

  const flushProgress = useCallback((videoId?: number) => {
    const targetId = videoId ?? currentVideoRef.current?.id;
    if (!targetId) return;
    const entry = liveProgressRef.current.get(targetId);
    if (!entry || Math.abs(entry.progressSeconds - entry.committedSeconds) < 1) return;

    entry.committedSeconds = entry.progressSeconds;
    setHistory((prev) => {
      const idx = prev.findIndex((h) => h.video.id === targetId);
      const updated: LocalHistoryItem = {
        video: entry.video,
        watchedAt: Date.now(),
        progressSeconds: entry.progressSeconds,
        durationSeconds: entry.durationSeconds,
      };
      if (idx === -1) return [updated, ...prev].slice(0, 60);
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushProgress();
    };
    const onUnload = () => flushProgress();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flushProgress]);

  const playVideo = useCallback(
    (video: PictaPublicacion, nextQueue?: PictaPublicacion[]) => {
      flushProgress();
      setCurrentVideo(video);
      if (nextQueue) setQueue(nextQueue);
      setIsMinimized(false);
      setIsPlayingState(true);

      const live = liveProgressRef.current.get(video.id);
      setHistory((prev) => {
        const existing = prev.find((h) => h.video.id === video.id);
        const prog = live?.progressSeconds ?? existing?.progressSeconds ?? 0;
        const dur = live?.durationSeconds ?? existing?.durationSeconds ?? 0;
        liveProgressRef.current.set(video.id, {
          video,
          progressSeconds: prog,
          durationSeconds: dur,
          committedSeconds: prog,
        });
        const entry: LocalHistoryItem = {
          video,
          watchedAt: Date.now(),
          progressSeconds: prog,
          durationSeconds: dur,
        };
        return [entry, ...prev.filter((h) => h.video.id !== video.id)].slice(0, 60);
      });
    },
    [flushProgress],
  );

  const minimizePlayer = useCallback(() => {
    flushProgress();
    setIsMinimized(true);
  }, [flushProgress]);

  const expandPlayer = useCallback(() => setIsMinimized(false), []);

  const closePlayer = useCallback(() => {
    flushProgress();
    setCurrentVideo(null);
    setIsMinimized(false);
    setIsPlayingState(false);
  }, [flushProgress]);

  const setIsPlaying = useCallback(
    (playing: boolean) => {
      if (!playing) flushProgress();
      setIsPlayingState(playing);
    },
    [flushProgress],
  );

  const updateProgress = useCallback(
    (video: PictaPublicacion, progressSeconds: number, durationSeconds: number) => {
      const prevLive = liveProgressRef.current.get(video.id);
      const committed = prevLive?.committedSeconds ?? -1;
      liveProgressRef.current.set(video.id, {
        video,
        progressSeconds,
        durationSeconds,
        committedSeconds: committed,
      });

      if (committed < 0 || Math.abs(progressSeconds - committed) >= 12) {
        const currentEntry = liveProgressRef.current.get(video.id)!;
        currentEntry.committedSeconds = progressSeconds;
        setHistory((prev) => {
          const idx = prev.findIndex((h) => h.video.id === video.id);
          const updated: LocalHistoryItem = {
            video,
            watchedAt: Date.now(),
            progressSeconds,
            durationSeconds,
          };
          if (idx === -1) return [updated, ...prev].slice(0, 60);
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
      }
    },
    [],
  );

  const getResumeSeconds = useCallback(
    (videoId: number) => {
      const live = liveProgressRef.current.get(videoId);
      if (live && live.durationSeconds > 0) {
        if (live.progressSeconds > live.durationSeconds - 8) return 0;
        return live.progressSeconds > 5 ? live.progressSeconds : 0;
      }
      const found = history.find((h) => h.video.id === videoId);
      if (!found || !found.durationSeconds) return 0;
      if (found.progressSeconds > found.durationSeconds - 8) return 0;
      return found.progressSeconds > 5 ? found.progressSeconds : 0;
    },
    [history],
  );

  const isVideoSaved = useCallback(
    (videoId: number) => savedVideos.some((v) => v.id === videoId),
    [savedVideos],
  );

  const toggleSavedVideo = useCallback(
    (video: PictaPublicacion) => {
      const exists = savedVideos.some((v) => v.id === video.id);
      setSavedVideos((prev) =>
        prev.some((v) => v.id === video.id)
          ? prev.filter((v) => v.id !== video.id)
          : [video, ...prev],
      );
      return !exists;
    },
    [savedVideos],
  );

  const addSavedDownload = useCallback((item: LocalDownloadItem) => {
    setSavedDownloads((prev) => [item, ...prev.filter((d) => d.id !== item.id)]);
  }, []);

  const removeSavedDownload = useCallback((id: string) => {
    setSavedDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const mediaElRef = useRef<HTMLVideoElement | null>(null);

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    mediaElRef.current = el;
  }, []);

  const togglePlayPause = useCallback(() => {
    const el = mediaElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const clearHistory = useCallback(() => {
    liveProgressRef.current.clear();
    setHistory([]);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentVideo,
      queue,
      isMinimized,
      isPlaying,
      history,
      savedVideos,
      savedDownloads,
      playVideo,
      minimizePlayer,
      expandPlayer,
      closePlayer,
      setIsPlaying,
      registerVideoElement,
      togglePlayPause,
      updateProgress,
      getResumeSeconds,
      toggleSavedVideo,
      isVideoSaved,
      addSavedDownload,
      removeSavedDownload,
      clearHistory,
    }),
    [
      currentVideo,
      queue,
      isMinimized,
      isPlaying,
      history,
      savedVideos,
      savedDownloads,
      playVideo,
      minimizePlayer,
      expandPlayer,
      closePlayer,
      setIsPlaying,
      registerVideoElement,
      togglePlayPause,
      updateProgress,
      getResumeSeconds,
      toggleSavedVideo,
      isVideoSaved,
      addSavedDownload,
      removeSavedDownload,
      clearHistory,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer debe usarse dentro de PlayerProvider');
  return ctx;
}
