"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Download,
  Folder,
  FolderPlus,
  Flame,
  GripVertical,
  HardDrive,
  Headphones,
  ImagePlus,
  Library,
  ListMusic,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  SlidersHorizontal,
  Square,
  Target,
  TimerReset,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
} from "recharts";

type View = "focus" | "sessions" | "analytics" | "music" | "settings";
type TimerMode = "focus" | "pomodoro" | "deep";
type PomodoroPhase = "focus" | "shortBreak" | "longBreak";

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  rounds: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
};

type TimerSnapshot = {
  schemaVersion: 1;
  phaseId: string;
  mode: TimerMode;
  subject: string;
  customDuration: number;
  pomodoroPhase: PomodoroPhase;
  pomodoroRound: number;
  pomodoroCycleRounds: number;
  pomodoroPhaseDuration: number;
  pomodoroSettings: PomodoroSettings;
  elapsed: number;
  running: boolean;
  savedAt: number;
  phaseStartedAt: string | null;
};

type Session = {
  id: string;
  subject: string;
  seconds: number;
  startedAt: string;
  mode: TimerMode;
};

type Track = {
  id: string;
  title: string;
  url: string;
  embedUrl: string;
  kind: "video" | "playlist";
  playlistId: string;
};

type StudyPlaylist = { id: string; name: string };
type BackupPayload = {
  schemaVersion: 1;
  exportedAt: string;
  sessions: Session[];
  tracks: Track[];
  playlists: StudyPlaylist[];
  goalHours: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  pomodoroSettings?: PomodoroSettings;
  background: string | null;
};

type StorageUsage = { dataBytes: number; browserUsage: number | null; browserQuota: number | null };

const DEFAULT_WALLPAPER = "/assets/wallpapers/kairo-night.png";
const DEFAULT_PLAYLIST_ID = "focus-library";
const defaultPlaylists: StudyPlaylist[] = [{ id: DEFAULT_PLAYLIST_ID, name: "Focus library" }];
const LOCAL_DB_NAME = "kairo-local";
const LOCAL_DB_STORE = "assets";
const WALLPAPER_KEY = "wallpaper";
const TIMER_STATE_KEY = "kairo-timer-state";
const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  rounds: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

const navItems: { id: View; label: string; icon: typeof Compass }[] = [
  { id: "focus", label: "Focus", icon: Compass },
  { id: "sessions", label: "Sessions", icon: Library },
  { id: "analytics", label: "Insights", icon: BarChart3 },
  { id: "music", label: "Music", icon: Headphones },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const modes: { id: TimerMode; label: string; duration: number }[] = [
  { id: "focus", label: "Focus", duration: 0 },
  { id: "pomodoro", label: "Pomodoro", duration: 25 * 60 },
  { id: "deep", label: "Custom", duration: 3 * 60 * 60 },
];

const defaultTracks: Track[] = [];

function toYouTubeEmbed(value: string): Pick<Track, "embedUrl" | "kind"> | null {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === "youtu.be" || url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com");
    if (!allowedHost) return null;
    const list = url.searchParams.get("list");
    const video = url.hostname.includes("youtu.be")
      ? url.pathname.slice(1)
      : url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();

    if (list) return { embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`, kind: "playlist" };
    if (video && video !== "watch" && video !== "playlist") return { embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}`, kind: "video" };
  } catch {
    return null;
  }
  return null;
}

function getTrackArtwork(track: Track) {
  try {
    const url = new URL(track.url);
    const videoId = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v");
    if (videoId) return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`;
  } catch {
    const match = track.embedUrl.match(/\/embed\/([^?]+)/);
    if (match?.[1] && match[1] !== "videoseries") return `https://i.ytimg.com/vi/${encodeURIComponent(match[1])}/maxresdefault.jpg`;
  }
  const match = track.embedUrl.match(/\/embed\/([^?]+)/);
  if (match?.[1] && match[1] !== "videoseries") return `https://i.ytimg.com/vi/${encodeURIComponent(match[1])}/maxresdefault.jpg`;
  return DEFAULT_WALLPAPER;
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (!hours && !minutes) return `${seconds}s`;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function sanitizePomodoroSettings(value: unknown): PomodoroSettings {
  const settings = value && typeof value === "object" ? value as Partial<PomodoroSettings> : {};
  const bounded = (input: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(input) || fallback)));
  return {
    focusMinutes: bounded(settings.focusMinutes, DEFAULT_POMODORO_SETTINGS.focusMinutes, 1, 180),
    shortBreakMinutes: bounded(settings.shortBreakMinutes, DEFAULT_POMODORO_SETTINGS.shortBreakMinutes, 1, 60),
    longBreakMinutes: bounded(settings.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes, 1, 120),
    rounds: bounded(settings.rounds, DEFAULT_POMODORO_SETTINGS.rounds, 1, 12),
    autoStartBreaks: Boolean(settings.autoStartBreaks),
    autoStartFocus: Boolean(settings.autoStartFocus),
  };
}

function pomodoroPhaseSeconds(settings: PomodoroSettings, phase: PomodoroPhase) {
  if (phase === "shortBreak") return settings.shortBreakMinutes * 60;
  if (phase === "longBreak") return settings.longBreakMinutes * 60;
  return settings.focusMinutes * 60;
}

function createTimerPhaseId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `phase-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readTimerSnapshot(): TimerSnapshot | null {
  try {
    const raw = window.localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TimerSnapshot>;
    const validMode = value.mode === "focus" || value.mode === "pomodoro" || value.mode === "deep";
    const validPhase = value.pomodoroPhase === "focus" || value.pomodoroPhase === "shortBreak" || value.pomodoroPhase === "longBreak";
    if (
      value.schemaVersion !== 1 ||
      typeof value.phaseId !== "string" || !value.phaseId ||
      !validMode || !validPhase ||
      typeof value.subject !== "string" ||
      !Number.isFinite(value.customDuration) ||
      !Number.isFinite(value.pomodoroRound) ||
      !Number.isFinite(value.pomodoroCycleRounds) ||
      !Number.isFinite(value.pomodoroPhaseDuration) ||
      !Number.isFinite(value.elapsed) ||
      typeof value.running !== "boolean" ||
      !Number.isFinite(value.savedAt)
    ) return null;

    return {
      schemaVersion: 1,
      phaseId: value.phaseId,
      mode: value.mode as TimerMode,
      subject: value.subject,
      customDuration: Math.max(60, Math.round(value.customDuration as number)),
      pomodoroPhase: value.pomodoroPhase as PomodoroPhase,
      pomodoroRound: Math.max(1, Math.round(value.pomodoroRound as number)),
      pomodoroCycleRounds: Math.max(1, Math.round(value.pomodoroCycleRounds as number)),
      pomodoroPhaseDuration: Math.max(60, Math.round(value.pomodoroPhaseDuration as number)),
      pomodoroSettings: sanitizePomodoroSettings(value.pomodoroSettings),
      elapsed: Math.max(0, Math.round(value.elapsed as number)),
      running: value.running,
      savedAt: Math.max(0, Math.round(value.savedAt as number)),
      phaseStartedAt: typeof value.phaseStartedAt === "string" && Number.isFinite(Date.parse(value.phaseStartedAt)) ? value.phaseStartedAt : null,
    };
  } catch {
    window.localStorage.removeItem(TIMER_STATE_KEY);
    return null;
  }
}

function calculateStreak(sessions: Session[]) {
  const studied = new Set(sessions.map((session) => new Date(session.startedAt).toDateString()));
  const cursor = new Date();
  if (!studied.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (studied.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function playCompletionChime(context: AudioContext | null) {
  if (!context) return;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.25);
  gain.connect(context.destination);
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.12);
    oscillator.stop(context.currentTime + 0.75 + index * 0.12);
  });
}

function openLocalDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_DB_STORE)) request.result.createObjectStore(LOCAL_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLocalAsset(key: string) {
  const database = await openLocalDatabase();
  return new Promise<string | null>((resolve, reject) => {
    const request = database.transaction(LOCAL_DB_STORE, "readonly").objectStore(LOCAL_DB_STORE).get(key);
    request.onsuccess = () => { database.close(); resolve(typeof request.result === "string" ? request.result : null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function writeLocalAsset(key: string, value: string) {
  const database = await openLocalDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(LOCAL_DB_STORE, "readwrite").objectStore(LOCAL_DB_STORE).put(value, key);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function deleteLocalAsset(key: string) {
  const database = await openLocalDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(LOCAL_DB_STORE, "readwrite").objectStore(LOCAL_DB_STORE).delete(key);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const backup = value as Partial<BackupPayload>;
  return backup.schemaVersion === 1 && Array.isArray(backup.sessions) && Array.isArray(backup.tracks) && Array.isArray(backup.playlists) && typeof backup.goalHours === "number" && typeof backup.soundEnabled === "boolean" && typeof backup.notificationsEnabled === "boolean";
}

export function StudyApp() {
  const [view, setView] = useState<View>("focus");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [goalHours, setGoalHours] = useState(10);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>(defaultTracks);
  const [playlists, setPlaylists] = useState<StudyPlaylist[]>(defaultPlaylists);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage>({ dataBytes: 0, browserUsage: null, browserQuota: null });
  const [timerResetVersion, setTimerResetVersion] = useState(0);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view") as View | null;
    if (requestedView && navItems.some((item) => item.id === requestedView)) setView(requestedView);

    const savedSessions = window.localStorage.getItem("study-hour-sessions");
    const savedGoal = window.localStorage.getItem("study-hour-goal");
    const savedBackground = window.localStorage.getItem("study-hour-background");
    const savedTracks = window.localStorage.getItem("study-hour-tracks");
    const savedPlaylists = window.localStorage.getItem("study-hour-playlists");
    const savedSound = window.localStorage.getItem("study-hour-sound");
    const savedNotifications = window.localStorage.getItem("study-hour-notifications");
    const savedPomodoro = window.localStorage.getItem("study-hour-pomodoro");
    if (savedSessions) setSessions(JSON.parse(savedSessions));
    if (savedGoal) setGoalHours(Number(savedGoal));
    if (savedSound) setSoundEnabled(savedSound === "true");
    if (savedNotifications) setNotificationsEnabled(savedNotifications === "true");
    if (savedPomodoro) {
      try { setPomodoroSettings(sanitizePomodoroSettings(JSON.parse(savedPomodoro))); }
      catch { setPomodoroSettings(DEFAULT_POMODORO_SETTINGS); }
    }
    const restoredPlaylists = savedPlaylists ? JSON.parse(savedPlaylists) as StudyPlaylist[] : defaultPlaylists;
    setPlaylists(restoredPlaylists.length ? restoredPlaylists : defaultPlaylists);
    if (savedTracks) {
      const parsed = (JSON.parse(savedTracks) as Track[]).filter((track) => track.id !== "lofi-girl" && track.id !== "peaceful-piano").map((track) => ({
        ...track,
        kind: track.kind || (track.embedUrl.includes("videoseries") ? "playlist" : "video"),
        playlistId: track.playlistId || DEFAULT_PLAYLIST_ID,
      }));
      setTracks(parsed);
      setSelectedTrack(parsed[0] || null);
    }
    void (async () => {
      try {
        const indexedWallpaper = await readLocalAsset(WALLPAPER_KEY);
        if (indexedWallpaper) setCustomBackground(indexedWallpaper);
        else if (savedBackground) {
          await writeLocalAsset(WALLPAPER_KEY, savedBackground);
          setCustomBackground(savedBackground);
          window.localStorage.removeItem("study-hour-background");
        }
      } catch {
        if (savedBackground) setCustomBackground(savedBackground);
      } finally {
        window.localStorage.removeItem("study-hour-cloud-sync");
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("study-hour-sessions", JSON.stringify(sessions));
  }, [sessions, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("study-hour-goal", String(goalHours));
    window.localStorage.setItem("study-hour-tracks", JSON.stringify(tracks));
    window.localStorage.setItem("study-hour-playlists", JSON.stringify(playlists));
    window.localStorage.setItem("study-hour-sound", String(soundEnabled));
    window.localStorage.setItem("study-hour-notifications", String(notificationsEnabled));
    window.localStorage.setItem("study-hour-pomodoro", JSON.stringify(pomodoroSettings));
  }, [goalHours, tracks, playlists, soundEnabled, notificationsEnabled, pomodoroSettings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const localBytes = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).reduce((total, key) => total + (key ? new Blob([key, window.localStorage.getItem(key) || ""]).size : 0), 0);
    void navigator.storage?.estimate().then((estimate) => setStorageUsage({ dataBytes: localBytes + (customBackground ? new Blob([customBackground]).size : 0), browserUsage: estimate.usage ?? null, browserQuota: estimate.quota ?? null })).catch(() => setStorageUsage({ dataBytes: localBytes, browserUsage: null, browserQuota: null }));
  }, [sessions, tracks, playlists, goalHours, soundEnabled, notificationsEnabled, pomodoroSettings, customBackground, hydrated]);

  function addSession(session: Session) {
    setSessions((current) => current.some((item) => item.id === session.id) ? current : [session, ...current]);
  }

  function removeSession(id: string) {
    setSessions((current) => current.filter((session) => session.id !== id));
  }

  const todaySeconds = useMemo(
    () =>
      sessions
        .filter((session) => sameDay(new Date(session.startedAt), new Date()))
        .reduce((sum, session) => sum + session.seconds, 0),
    [sessions],
  );
  const lifetimeSeconds = useMemo(() => sessions.reduce((sum, session) => sum + session.seconds, 0), [sessions]);

  function addTrack(track: Track) {
    setTracks((current) => [...current, track]);
    if (!selectedTrack) setSelectedTrack(track);
  }

  function removeTrack(id: string) {
    const next = tracks.filter((track) => track.id !== id);
    setTracks(next);
    if (selectedTrack?.id === id) {
      setSelectedTrack(next[0] || null);
      setMusicPlaying(false);
    }
  }

  function addPlaylist(name: string) {
    const playlist = { id: crypto.randomUUID(), name: name.trim() };
    setPlaylists((current) => [...current, playlist]);
    return playlist.id;
  }

  function deletePlaylist(id: string) {
    if (playlists.length <= 1) return playlists[0]?.id || DEFAULT_PLAYLIST_ID;
    const fallback = playlists.find((playlist) => playlist.id !== id) || defaultPlaylists[0];
    setPlaylists((current) => current.filter((playlist) => playlist.id !== id));
    setTracks((current) => current.map((track) => track.playlistId === id ? { ...track, playlistId: fallback.id } : track));
    return fallback.id;
  }

  function reorderPlaylistTracks(playlistId: string, orderedIds: string[]) {
    setTracks((current) => {
      const byId = new Map(current.map((track) => [track.id, track]));
      const ordered = orderedIds.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track));
      let queueIndex = 0;
      return current.map((track) => track.playlistId === playlistId ? ordered[queueIndex++] || track : track);
    });
  }

  async function uploadBackground(file: File) {
    if (!file.type.startsWith("image/")) return;
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = reject;
      nextImage.src = source;
    });
    const maxWidth = 2400;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const optimized = canvas.toDataURL("image/jpeg", 0.84);
    setCustomBackground(optimized);
    try {
      await writeLocalAsset(WALLPAPER_KEY, optimized);
      window.localStorage.removeItem("study-hour-background");
    } catch {
      try { window.localStorage.setItem("study-hour-background", optimized); } catch { /* Keep it active for this visit if browser storage is full. */ }
    }
  }

  async function resetBackground() {
    setCustomBackground(null);
    window.localStorage.removeItem("study-hour-background");
    try { await deleteLocalAsset(WALLPAPER_KEY); } catch { /* The default wallpaper is still restored for this visit. */ }
  }

  async function resetPreferences() {
    setGoalHours(10);
    setSoundEnabled(true);
    setNotificationsEnabled(false);
    setPomodoroSettings(DEFAULT_POMODORO_SETTINGS);
    await resetBackground();
  }

  function createBackup(): BackupPayload {
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), sessions, tracks, playlists, goalHours, soundEnabled, notificationsEnabled, pomodoroSettings, background: customBackground };
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(createBackup(), null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `kairo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function importBackup(file: File) {
    if (file.size > 15 * 1024 * 1024) throw new Error("This backup is too large to import.");
    const parsed: unknown = JSON.parse(await file.text());
    if (!isBackupPayload(parsed)) throw new Error("This is not a valid Kairo backup.");
    const restoredPlaylists = parsed.playlists.length ? parsed.playlists : defaultPlaylists;
    const playlistIds = new Set(restoredPlaylists.map((playlist) => playlist.id));
    const restoredTracks = parsed.tracks.filter((track) => track.id !== "peaceful-piano").map((track) => ({ ...track, playlistId: playlistIds.has(track.playlistId) ? track.playlistId : restoredPlaylists[0].id }));
    setSessions(parsed.sessions);
    setGoalHours(Math.min(12, Math.max(1, parsed.goalHours)));
    setSoundEnabled(parsed.soundEnabled);
    setNotificationsEnabled(parsed.notificationsEnabled);
    setPomodoroSettings(sanitizePomodoroSettings(parsed.pomodoroSettings));
    setPlaylists(restoredPlaylists);
    setTracks(restoredTracks);
    setSelectedTrack(restoredTracks[0] || null);
    setMusicPlaying(false);
    if (typeof parsed.background === "string" && parsed.background.startsWith("data:image/")) {
      await writeLocalAsset(WALLPAPER_KEY, parsed.background);
      setCustomBackground(parsed.background);
    } else {
      await resetBackground();
    }
  }

  async function deleteAllLocalData() {
    ["study-hour-sessions", "study-hour-goal", "study-hour-tracks", "study-hour-playlists", "study-hour-sound", "study-hour-notifications", "study-hour-pomodoro", "study-hour-background", "study-hour-cloud-sync", TIMER_STATE_KEY].forEach((key) => window.localStorage.removeItem(key));
    try { await deleteLocalAsset(WALLPAPER_KEY); } catch { /* State reset below remains authoritative. */ }
    setSessions([]);
    setGoalHours(10);
    setSoundEnabled(true);
    setNotificationsEnabled(false);
    setPomodoroSettings(DEFAULT_POMODORO_SETTINGS);
    setCustomBackground(null);
    setPlaylists(defaultPlaylists);
    setTracks(defaultTracks);
    setSelectedTrack(null);
    setMusicPlaying(false);
    setTimerResetVersion((current) => current + 1);
  }

  return (
    <div className={`app-shell view-${view}`}>
      <div className="app-backdrop" aria-hidden="true">
        <Image src={customBackground || DEFAULT_WALLPAPER} alt="" fill priority sizes="100vw" unoptimized={Boolean(customBackground)} />
      </div>
      <main
        className="main-shell"
      >
        <header className="topbar">
          <div className="topbar-start">
            <div className="brand topbar-brand">
              <div className="brand-mark"><TimerReset /></div>
              <span>Kairo</span>
            </div>
          </div>
          <Navigation active={view} onNavigate={setView} />
          <div className="topbar-actions">
            <NavStats lifetimeSeconds={lifetimeSeconds} todaySeconds={todaySeconds} goalHours={goalHours} sessions={sessions} onGoalChange={setGoalHours} />
            {view !== "focus" && (
              <Button size="lg" onClick={() => setAddSessionOpen(true)}>
                <Plus data-icon="inline-start" /> Add session
              </Button>
            )}
          </div>
        </header>

        <div className="view-wrap">
          <div className={view === "focus" ? "focus-view-host" : "focus-view-host is-hidden"} aria-hidden={view !== "focus"}>
            <FocusView appHydrated={hydrated} resetSignal={timerResetVersion} wallpaper={customBackground || DEFAULT_WALLPAPER} onSession={addSession} musicPlaying={musicPlaying} soundEnabled={soundEnabled} notificationsEnabled={notificationsEnabled} pomodoroSettings={pomodoroSettings} onPomodoroSettingsChange={setPomodoroSettings} />
          </div>
          {view === "sessions" && (
            <SessionsView sessions={sessions} onRemove={removeSession} onAdd={() => setAddSessionOpen(true)} />
          )}
          {view === "analytics" && <AnalyticsView sessions={sessions} goalHours={goalHours} />}
          {view === "music" && <MusicView tracks={tracks} playlists={playlists} selected={selectedTrack} musicPlaying={musicPlaying} onToggleMusic={() => setMusicPlaying((current) => !current)} onPlay={(track) => { setSelectedTrack(track); setMusicPlaying(true); }} onAdd={addTrack} onRemove={removeTrack} onAddPlaylist={addPlaylist} onDeletePlaylist={deletePlaylist} onReorder={reorderPlaylistTracks} />}
          {view === "settings" && <SettingsView goalHours={goalHours} onGoalChange={setGoalHours} sound={soundEnabled} onSoundChange={setSoundEnabled} notifications={notificationsEnabled} onNotificationsChange={setNotificationsEnabled} storageUsage={storageUsage} onExport={exportBackup} onImport={importBackup} onResetPreferences={resetPreferences} onDeleteAll={deleteAllLocalData} />}
        </div>
      </main>

      <BackgroundControls custom={Boolean(customBackground)} onUpload={uploadBackground} onReset={() => void resetBackground()} />
      {selectedTrack && <PersistentPlayer tracks={tracks} track={selectedTrack} playing={musicPlaying} muted={musicMuted} onTrackChange={(track) => { setSelectedTrack(track); setMusicPlaying(true); }} onPlayingChange={setMusicPlaying} onMutedChange={setMusicMuted} onOpenMusic={() => setView("music")} />}

      {addSessionOpen && <AddSessionModal onClose={() => setAddSessionOpen(false)} onAdd={addSession} />}
    </div>
  );
}

function BackgroundControls({ custom, onUpload, onReset }: { custom: boolean; onUpload: (file: File) => void; onReset: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="background-controls">
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.target.value = ""; }} />
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} />}>
          <ImagePlus /><span className="sr-only">Choose background</span>
        </TooltipTrigger>
        <TooltipContent>Upload a background image</TooltipContent>
      </Tooltip>
      {custom && <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={onReset} />}><RotateCcw /><span className="sr-only">Restore the default background</span></TooltipTrigger><TooltipContent>Restore default</TooltipContent></Tooltip>}
    </div>
  );
}

function NavStats({ lifetimeSeconds, goalHours, todaySeconds, sessions, onGoalChange }: { lifetimeSeconds: number; goalHours: number; todaySeconds: number; sessions: Session[]; onGoalChange: (value: number) => void }) {
  const todaySessions = sessions.filter((session) => sameDay(new Date(session.startedAt), new Date())).length;
  const streak = calculateStreak(sessions);
  return (
    <div className="nav-stats">
      <Tooltip><TooltipTrigger render={<div className="nav-stat" tabIndex={0} />}><TimerReset /><span>{formatDuration(lifetimeSeconds)}</span></TooltipTrigger><TooltipContent>Lifetime study time</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger render={<div className="nav-stat" tabIndex={0} />}><Flame /><span>{streak}</span></TooltipTrigger><TooltipContent>{streak} day consistency streak</TooltipContent></Tooltip>
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" className="nav-stat nav-stat-goal" />}><Clock3 /><span>{Math.floor(todaySeconds / 3600)}/{goalHours}h</span></PopoverTrigger>
        <PopoverContent align="end" className="nav-goal-popover"><PopoverHeader><PopoverTitle>Today&apos;s focus</PopoverTitle><PopoverDescription>{todaySessions} sessions completed · {streak} day streak</PopoverDescription></PopoverHeader><DailyGoal goalHours={goalHours} todaySeconds={todaySeconds} onGoalChange={onGoalChange} /></PopoverContent>
      </Popover>
    </div>
  );
}

function PersistentPlayer({ tracks, track, playing, muted, onTrackChange, onPlayingChange, onMutedChange, onOpenMusic }: { tracks: Track[]; track: Track; playing: boolean; muted: boolean; onTrackChange: (track: Track) => void; onPlayingChange: (playing: boolean) => void; onMutedChange: (muted: boolean) => void; onOpenMusic: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const handledEndRef = useRef<string | null>(null);
  const playerSrc = `${track.embedUrl}${track.embedUrl.includes("?") ? "&" : "?"}enablejsapi=1&controls=0&playsinline=1&rel=0`;
  const activeQueue = useMemo(() => tracks.filter((item) => item.playlistId === track.playlistId), [tracks, track.playlistId]);
  const currentIndex = Math.max(0, activeQueue.findIndex((item) => item.id === track.id));

  function command(func: "playVideo" | "pauseVideo" | "mute" | "unMute" | "seekTo", args: (number | boolean)[] = []) {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }

  function syncPlayer() {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "kairo-player", channel: "" }), "*");
    command(playing ? "playVideo" : "pauseVideo");
    command(muted ? "mute" : "unMute");
  }

  function moveTrack(direction: -1 | 1) {
    const nextTrack = activeQueue[currentIndex + direction];
    if (nextTrack) onTrackChange(nextTrack);
  }

  useEffect(() => {
    handledEndRef.current = null;
    const timeout = window.setTimeout(syncPlayer, 120);
    return () => window.clearTimeout(timeout);
  // The iframe remains mounted between view changes; these are the only playback inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, muted, track.id]);

  useEffect(() => {
    function handlePlayerMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const ended = (payload?.event === "infoDelivery" && payload?.info?.playerState === 0) || (payload?.event === "onStateChange" && payload?.info === 0);
        if (!ended || handledEndRef.current === track.id) return;
        handledEndRef.current = track.id;
        const nextTrack = activeQueue[currentIndex + 1];
        if (nextTrack) onTrackChange(nextTrack);
        else onPlayingChange(false);
      } catch {
        // Ignore unrelated window messages.
      }
    }
    window.addEventListener("message", handlePlayerMessage);
    return () => window.removeEventListener("message", handlePlayerMessage);
  }, [activeQueue, currentIndex, onPlayingChange, onTrackChange, track.id]);

  return (
    <aside className={`persistent-player ${playing ? "playing" : ""}`} aria-label="Persistent music player">
      <iframe ref={frameRef} className="soundtrack-frame" src={playerSrc} onLoad={syncPlayer} title={`${track.title} audio player`} allow="autoplay; encrypted-media" />
      <Tooltip><TooltipTrigger render={<button className="player-thumbnail" onClick={onOpenMusic} aria-label={`Open queue for ${track.title}`} />}><Image src={getTrackArtwork(track)} alt="" fill sizes="40px" /></TooltipTrigger><TooltipContent>{track.title}</TooltipContent></Tooltip>
      <button className="mini-control" disabled={currentIndex === 0} onClick={() => moveTrack(-1)} aria-label="Previous track"><ChevronLeft /></button>
      <button className="mini-play" onClick={() => onPlayingChange(!playing)} aria-label={playing ? "Pause music" : "Play music"}>{playing ? <Pause /> : <Play />}</button>
      <button className="mini-control" disabled={currentIndex >= activeQueue.length - 1} onClick={() => moveTrack(1)} aria-label="Next track"><ChevronRight /></button>
      <button className="mini-control volume-control" onClick={() => onMutedChange(!muted)} aria-label={muted ? "Unmute music" : "Mute music"}>{muted ? <VolumeX /> : <Volume2 />}</button>
      <button className="mini-control queue-control" onClick={onOpenMusic} aria-label="Open music queue"><ListMusic /></button>
    </aside>
  );
}

function Navigation({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  return (
      <nav className="app-dock" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button key={item.id} variant={active === item.id ? "secondary" : "ghost"} className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}>
              <Icon data-icon="inline-start" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </nav>
  );
}

function FocusView({
  appHydrated,
  resetSignal,
  wallpaper,
  onSession,
  musicPlaying,
  soundEnabled,
  notificationsEnabled,
  pomodoroSettings,
  onPomodoroSettingsChange,
}: {
  appHydrated: boolean;
  resetSignal: number;
  wallpaper: string;
  onSession: (session: Session) => void;
  musicPlaying: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  pomodoroSettings: PomodoroSettings;
  onPomodoroSettingsChange: (settings: PomodoroSettings) => void;
}) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [customDuration, setCustomDuration] = useState(3 * 60 * 60);
  const [durationOpen, setDurationOpen] = useState(false);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("focus");
  const [pomodoroRound, setPomodoroRound] = useState(1);
  const [pomodoroCycleRounds, setPomodoroCycleRounds] = useState(DEFAULT_POMODORO_SETTINGS.rounds);
  const [pomodoroPhaseDuration, setPomodoroPhaseDuration] = useState(DEFAULT_POMODORO_SETTINGS.focusMinutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [pendingMode, setPendingMode] = useState<TimerMode | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState<"phase" | "cycle" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subject, setSubject] = useState("Mathematics");
  const [timerHydrated, setTimerHydrated] = useState(false);
  const startRef = useRef<Date | null>(null);
  const phaseAnchorRef = useRef<number | null>(null);
  const elapsedAtAnchorRef = useRef(0);
  const completionRef = useRef(false);
  const phaseIdRef = useRef("");
  const onSessionRef = useRef(onSession);
  const handledResetSignalRef = useRef(resetSignal);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerPanelRef = useRef<HTMLElement>(null);

  const target = mode === "pomodoro" ? pomodoroPhaseDuration : mode === "deep" ? customDuration : 0;
  const displaySeconds = target ? Math.max(0, target - elapsed) : elapsed;
  const progress = target ? Math.min(100, (elapsed / target) * 100) : Math.min(100, (elapsed / 3600) * 100);
  const pomodoroPhaseLabel = pomodoroPhase === "focus" ? "Focus" : pomodoroPhase === "shortBreak" ? "Short break" : "Long break";

  useEffect(() => {
    onSessionRef.current = onSession;
  }, [onSession]);

  useEffect(() => {
    if (!appHydrated || timerHydrated) return;
    const snapshot = readTimerSnapshot();
    if (!snapshot) {
      phaseIdRef.current = createTimerPhaseId();
      setTimerHydrated(true);
      return;
    }

    phaseIdRef.current = snapshot.phaseId;
    onPomodoroSettingsChange(snapshot.pomodoroSettings);
    setMode(snapshot.mode);
    setSubject(snapshot.subject);
    setCustomDuration(snapshot.customDuration);
    setPomodoroPhase(snapshot.pomodoroPhase);
    setPomodoroRound(snapshot.pomodoroRound);
    setPomodoroCycleRounds(snapshot.pomodoroCycleRounds);
    setPomodoroPhaseDuration(snapshot.pomodoroPhaseDuration);
    startRef.current = snapshot.phaseStartedAt ? new Date(snapshot.phaseStartedAt) : null;

    const offlineSeconds = snapshot.running ? Math.max(0, Math.floor((Date.now() - snapshot.savedAt) / 1000)) : 0;
    const restoredElapsed = snapshot.elapsed + offlineSeconds;
    const snapshotTarget = snapshot.mode === "pomodoro"
      ? snapshot.pomodoroPhaseDuration
      : snapshot.mode === "deep"
        ? snapshot.customDuration
        : 0;

    if (snapshotTarget > 0 && restoredElapsed >= snapshotTarget) {
      completionRef.current = true;
      phaseIdRef.current = createTimerPhaseId();
      setElapsed(0);
      setRunning(false);
      phaseAnchorRef.current = null;
      elapsedAtAnchorRef.current = 0;
      startRef.current = null;

      if (snapshot.mode === "pomodoro" && snapshot.pomodoroPhase === "focus") {
        onSessionRef.current({
          id: `pomodoro-${snapshot.phaseId}`,
          subject: snapshot.subject.trim() || "Untitled study session",
          seconds: snapshotTarget,
          startedAt: snapshot.phaseStartedAt || new Date(snapshot.savedAt - snapshot.elapsed * 1000).toISOString(),
          mode: "pomodoro",
        });
        const nextPhase: PomodoroPhase = snapshot.pomodoroRound >= snapshot.pomodoroCycleRounds ? "longBreak" : "shortBreak";
        setPomodoroPhase(nextPhase);
        setPomodoroPhaseDuration(pomodoroPhaseSeconds(snapshot.pomodoroSettings, nextPhase));
        completionRef.current = false;
      } else if (snapshot.mode === "pomodoro") {
        const nextRound = snapshot.pomodoroRound >= snapshot.pomodoroCycleRounds ? 1 : snapshot.pomodoroRound + 1;
        setPomodoroRound(nextRound);
        setPomodoroPhase("focus");
        setPomodoroPhaseDuration(pomodoroPhaseSeconds(snapshot.pomodoroSettings, "focus"));
        completionRef.current = false;
      } else {
        setElapsed(snapshotTarget);
        elapsedAtAnchorRef.current = snapshotTarget;
      }
    } else {
      const boundedElapsed = snapshotTarget ? Math.min(snapshotTarget, restoredElapsed) : restoredElapsed;
      setElapsed(boundedElapsed);
      setRunning(snapshot.running);
      elapsedAtAnchorRef.current = boundedElapsed;
      phaseAnchorRef.current = snapshot.running ? Date.now() : null;
    }
    setTimerHydrated(true);
  }, [appHydrated, onPomodoroSettingsChange, timerHydrated]);

  useEffect(() => {
    if (!timerHydrated) return;
    const cycleInProgress = mode === "pomodoro" && (pomodoroRound > 1 || pomodoroPhase !== "focus");
    if (!running && elapsed === 0 && !cycleInProgress) {
      window.localStorage.removeItem(TIMER_STATE_KEY);
      return;
    }

    const anchor = phaseAnchorRef.current;
    const currentElapsed = running && anchor !== null
      ? elapsedAtAnchorRef.current + Math.floor((Date.now() - anchor) / 1000)
      : elapsed;
    const snapshot: TimerSnapshot = {
      schemaVersion: 1,
      phaseId: phaseIdRef.current || createTimerPhaseId(),
      mode,
      subject,
      customDuration,
      pomodoroPhase,
      pomodoroRound,
      pomodoroCycleRounds,
      pomodoroPhaseDuration,
      pomodoroSettings,
      elapsed: target ? Math.min(target, currentElapsed) : currentElapsed,
      running,
      savedAt: Date.now(),
      phaseStartedAt: startRef.current?.toISOString() || null,
    };
    phaseIdRef.current = snapshot.phaseId;
    window.localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(snapshot));
  }, [customDuration, elapsed, mode, pomodoroCycleRounds, pomodoroPhase, pomodoroPhaseDuration, pomodoroRound, pomodoroSettings, running, subject, target, timerHydrated]);

  useEffect(() => {
    if (!timerHydrated || resetSignal === handledResetSignalRef.current) return;
    handledResetSignalRef.current = resetSignal;
    window.localStorage.removeItem(TIMER_STATE_KEY);
    phaseIdRef.current = createTimerPhaseId();
    setMode("focus");
    setPomodoroPhase("focus");
    setPomodoroRound(1);
    setPomodoroCycleRounds(pomodoroSettings.rounds);
    setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, "focus"));
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
  }, [pomodoroSettings, resetSignal, timerHydrated]);

  useEffect(() => {
    if (!timerHydrated || !running) return;
    const tick = () => {
      const anchor = phaseAnchorRef.current;
      if (anchor === null) return;
      const next = elapsedAtAnchorRef.current + Math.floor((Date.now() - anchor) / 1000);
      const bounded = target ? Math.min(target, next) : next;
      setElapsed(bounded);
      if (target && bounded >= target) {
        phaseAnchorRef.current = null;
        elapsedAtAnchorRef.current = target;
        setRunning(false);
      }
    };
    tick();
    const timerId = window.setInterval(tick, 250);
    return () => window.clearInterval(timerId);
  }, [running, target, timerHydrated]);

  useEffect(() => {
    if (!timerHydrated || !target || elapsed < target || completionRef.current) return;
    completionRef.current = true;
    setRunning(false);
    if (soundEnabled) playCompletionChime(audioContextRef.current);

    if (mode === "pomodoro") {
      if (pomodoroPhase === "focus") {
        onSessionRef.current({
          id: `pomodoro-${phaseIdRef.current}`,
          subject: subject.trim() || "Untitled study session",
          seconds: target,
          startedAt: (startRef.current || new Date(Date.now() - target * 1000)).toISOString(),
          mode: "pomodoro",
        });
        const nextCycleRounds = pomodoroSettings.rounds;
        const nextPhase: PomodoroPhase = pomodoroRound >= nextCycleRounds ? "longBreak" : "shortBreak";
        phaseIdRef.current = createTimerPhaseId();
        setPomodoroCycleRounds(nextCycleRounds);
        setPomodoroPhase(nextPhase);
        setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, nextPhase));
        setElapsed(0);
        setRunning(pomodoroSettings.autoStartBreaks);
        phaseAnchorRef.current = pomodoroSettings.autoStartBreaks ? Date.now() : null;
        elapsedAtAnchorRef.current = 0;
        startRef.current = null;
        if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
          new Notification("Focus session complete", { body: `${pomodoroPhaseLabel} finished. Your break is ready.` });
        }
      } else {
        const nextRound = pomodoroRound >= pomodoroCycleRounds ? 1 : pomodoroRound + 1;
        phaseIdRef.current = createTimerPhaseId();
        setPomodoroRound(nextRound);
        setPomodoroPhase("focus");
        setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, "focus"));
        setElapsed(0);
        setRunning(pomodoroSettings.autoStartFocus);
        phaseAnchorRef.current = pomodoroSettings.autoStartFocus ? Date.now() : null;
        elapsedAtAnchorRef.current = 0;
        startRef.current = pomodoroSettings.autoStartFocus ? new Date() : null;
        if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
          new Notification("Break complete", { body: `Round ${nextRound} is ready when you are.` });
        }
      }
      window.setTimeout(() => { completionRef.current = false; }, 0);
      return;
    }

    if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("Focus block complete", { body: `${subject.trim() || "Your session"} is complete.` });
    }
  }, [elapsed, mode, notificationsEnabled, pomodoroCycleRounds, pomodoroPhase, pomodoroPhaseLabel, pomodoroRound, pomodoroSettings, soundEnabled, subject, target, timerHydrated]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === timerPanelRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, []);

  function applyMode(next: TimerMode) {
    window.localStorage.removeItem(TIMER_STATE_KEY);
    phaseIdRef.current = createTimerPhaseId();
    setMode(next);
    setDurationOpen(false);
    setPomodoroOpen(false);
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
    if (next === "pomodoro") {
      setPomodoroPhase("focus");
      setPomodoroRound(1);
      setPomodoroCycleRounds(pomodoroSettings.rounds);
      setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, "focus"));
    }
  }

  function changeMode(next: TimerMode) {
    if (next === mode) return;
    const cycleInProgress = mode === "pomodoro" && (pomodoroRound > 1 || pomodoroPhase !== "focus");
    if (running || elapsed > 0 || cycleInProgress) {
      setPendingMode(next);
      return;
    }
    applyMode(next);
  }

  function toggleTimer() {
    if (running) {
      const anchor = phaseAnchorRef.current;
      if (anchor !== null) {
        const next = elapsedAtAnchorRef.current + Math.floor((Date.now() - anchor) / 1000);
        setElapsed(target ? Math.min(target, next) : next);
        elapsedAtAnchorRef.current = target ? Math.min(target, next) : next;
      }
      phaseAnchorRef.current = null;
      setRunning(false);
      return;
    }
    if (!startRef.current && (mode !== "pomodoro" || pomodoroPhase === "focus")) startRef.current = new Date();
    if (elapsed === 0) completionRef.current = false;
    if (soundEnabled) {
      audioContextRef.current ||= getAudioContext();
      if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume();
    }
    elapsedAtAnchorRef.current = elapsed;
    phaseAnchorRef.current = Date.now();
    setRunning(true);
  }

  function performPhaseReset() {
    if (mode !== "pomodoro" || (pomodoroRound === 1 && pomodoroPhase === "focus")) window.localStorage.removeItem(TIMER_STATE_KEY);
    phaseIdRef.current = createTimerPhaseId();
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
    if (mode === "pomodoro") setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, pomodoroPhase));
  }

  function resetCurrentPhase() {
    if (running || elapsed > 0) setResetConfirmation("phase");
    else performPhaseReset();
  }

  function performCycleRestart() {
    window.localStorage.removeItem(TIMER_STATE_KEY);
    phaseIdRef.current = createTimerPhaseId();
    setPomodoroPhase("focus");
    setPomodoroRound(1);
    setPomodoroCycleRounds(pomodoroSettings.rounds);
    setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, "focus"));
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
    setPomodoroOpen(false);
  }

  function restartPomodoroCycle() {
    setPomodoroOpen(false);
    if (running || elapsed > 0 || pomodoroRound > 1 || pomodoroPhase !== "focus") setResetConfirmation("cycle");
    else performCycleRestart();
  }

  function skipPomodoroBreak() {
    if (mode !== "pomodoro" || pomodoroPhase === "focus") return;
    const nextRound = pomodoroRound >= pomodoroCycleRounds ? 1 : pomodoroRound + 1;
    phaseIdRef.current = createTimerPhaseId();
    setPomodoroRound(nextRound);
    setPomodoroPhase("focus");
    setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, "focus"));
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
  }

  function savePartialAndSwitch() {
    if (!pendingMode) return;
    if (elapsed > 0 && (mode !== "pomodoro" || pomodoroPhase === "focus")) {
      onSession({ id: crypto.randomUUID(), subject: subject.trim() || "Untitled study session", seconds: elapsed, startedAt: (startRef.current || new Date()).toISOString(), mode });
    }
    const next = pendingMode;
    setPendingMode(null);
    applyMode(next);
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await timerPanelRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  function finishSession() {
    if (elapsed < 1 || (mode === "pomodoro" && pomodoroPhase !== "focus")) return;
    onSession({
      id: crypto.randomUUID(),
      subject: subject.trim() || "Untitled study session",
      seconds: elapsed,
      startedAt: (startRef.current || new Date()).toISOString(),
      mode,
    });
    if (mode === "pomodoro") {
      const nextCycleRounds = pomodoroSettings.rounds;
      const nextPhase: PomodoroPhase = pomodoroRound >= nextCycleRounds ? "longBreak" : "shortBreak";
      phaseIdRef.current = createTimerPhaseId();
      setPomodoroCycleRounds(nextCycleRounds);
      setPomodoroPhase(nextPhase);
      setPomodoroPhaseDuration(pomodoroPhaseSeconds(pomodoroSettings, nextPhase));
      setElapsed(0);
      setRunning(pomodoroSettings.autoStartBreaks);
      phaseAnchorRef.current = pomodoroSettings.autoStartBreaks ? Date.now() : null;
      elapsedAtAnchorRef.current = 0;
      completionRef.current = false;
      startRef.current = null;
      return;
    }
    setElapsed(0);
    setRunning(false);
    completionRef.current = false;
    startRef.current = null;
    phaseAnchorRef.current = null;
    elapsedAtAnchorRef.current = 0;
    phaseIdRef.current = createTimerPhaseId();
  }

  return (
    <div className="focus-layout animate-in">
      <section className="timer-panel" ref={timerPanelRef} style={{ "--focus-wallpaper": `url(${wallpaper})` } as React.CSSProperties}>
        <div className="focus-toolbar">
          <div className="timer-head-actions">
            <Tabs value={mode} onValueChange={(value) => changeMode(value as TimerMode)}>
              <TabsList aria-label="Timer mode">
                {modes.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            {mode === "deep" && (
              <DurationControl
                duration={target}
                open={durationOpen}
                label="Custom focus length"
                onOpenChange={setDurationOpen}
                onChange={(value) => {
                  const nextDuration = Math.min(12 * 3600, Math.max(60, value));
                  setCustomDuration(nextDuration);
                  setElapsed(0);
                }}
              />
            )}
            {mode === "pomodoro" && <PomodoroControl settings={pomodoroSettings} open={pomodoroOpen} onOpenChange={setPomodoroOpen} onChange={onPomodoroSettingsChange} onRestart={restartPomodoroCycle} />}
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggleFullscreen} />}>
                {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                <span className="sr-only">{isFullscreen ? "Exit fullscreen clock" : "Open fullscreen clock"}</span>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="timer-stage">
          <div className="timer-orbit" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
            <div className="timer-center">
              {mode === "pomodoro" && <div className="pomodoro-rounds" aria-label={`Round ${pomodoroRound} of ${pomodoroCycleRounds}`}>{Array.from({ length: pomodoroCycleRounds }, (_, index) => <i key={index} data-complete={index < pomodoroRound - 1 || undefined} data-current={index === pomodoroRound - 1 || undefined} />)}</div>}
              <span className="timer-status">{mode === "pomodoro" ? pomodoroPhaseLabel : running ? "In focus" : elapsed ? "Paused" : "Ready"}</span>
              <strong>{formatClock(displaySeconds)}</strong>
              <span className="timer-mode-note">
                {mode === "focus" ? "Open-ended session" : mode === "pomodoro" ? `Round ${pomodoroRound} of ${pomodoroCycleRounds}${pomodoroPhase !== "focus" ? " · break time does not count" : ""}` : `${formatDuration(customDuration)} focus block`}
              </span>
              <span className="fullscreen-timer-subject">{subject.trim() || "Untitled study session"}</span>
            </div>
          </div>
        </div>

        <div className="timer-bottom-bar">
          <div className="session-subject">
            <PencilLine />
            <Input aria-label="What are you studying?" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <Separator orientation="vertical" />
          <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" onClick={resetCurrentPhase} />}><RotateCcw /><span className="sr-only">Reset timer</span></TooltipTrigger><TooltipContent>{mode === "pomodoro" ? "Reset this phase" : "Reset"}</TooltipContent></Tooltip>
          <Button size="lg" className="timer-cta" onClick={toggleTimer}>
            {running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {running ? "Pause" : elapsed ? "Resume" : mode === "pomodoro" && pomodoroPhase !== "focus" ? "Start break" : "Start focus"}
          </Button>
          {mode === "pomodoro" && pomodoroPhase !== "focus" ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" onClick={skipPomodoroBreak} />}><SkipForward /><span className="sr-only">Skip break</span></TooltipTrigger><TooltipContent>Skip break</TooltipContent></Tooltip> : <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" disabled={!elapsed} onClick={finishSession} />}><Square /><span className="sr-only">Finish session</span></TooltipTrigger><TooltipContent>Finish and save</TooltipContent></Tooltip>}
        </div>
        <div className={`fullscreen-track ${musicPlaying ? "playing" : ""}`}><Music2 /></div>
      </section>
      <Dialog open={Boolean(pendingMode)} onOpenChange={(open) => { if (!open) setPendingMode(null); }}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Switch timer mode?</DialogTitle><DialogDescription>{running ? "Your current timer is running." : "You have an unfinished timer."} Switching modes cannot keep the current phase.</DialogDescription></DialogHeader><DialogFooter className="timer-decision-actions"><Button variant="outline" onClick={() => setPendingMode(null)}>Keep current timer</Button>{elapsed > 0 && (mode !== "pomodoro" || pomodoroPhase === "focus") && <Button variant="secondary" onClick={savePartialAndSwitch}>Save partial and switch</Button>}<Button variant="destructive" onClick={() => { if (pendingMode) applyMode(pendingMode); setPendingMode(null); }}>Discard and switch</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={Boolean(resetConfirmation)} onOpenChange={(open) => { if (!open) setResetConfirmation(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{resetConfirmation === "cycle" ? "Restart this Pomodoro cycle?" : "Reset this timer?"}</DialogTitle><DialogDescription>{resetConfirmation === "cycle" ? "The current phase and round progress will be discarded. Completed focus sessions already saved will stay in history." : "The time in this unfinished phase will be discarded."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setResetConfirmation(null)}>Keep timer</Button><Button variant="destructive" onClick={() => { if (resetConfirmation === "cycle") performCycleRestart(); else performPhaseReset(); setResetConfirmation(null); }}>{resetConfirmation === "cycle" ? "Restart cycle" : "Reset timer"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function PomodoroControl({ settings, open, onOpenChange, onChange, onRestart }: { settings: PomodoroSettings; open: boolean; onOpenChange: (open: boolean) => void; onChange: (settings: PomodoroSettings) => void; onRestart: () => void }) {
  function update<K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) {
    onChange(sanitizePomodoroSettings({ ...settings, [key]: value }));
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <SlidersHorizontal data-icon="inline-start" />
        {settings.focusMinutes}/{settings.shortBreakMinutes}
      </PopoverTrigger>
      <PopoverContent align="end" className="pomodoro-popover">
        <PopoverHeader><PopoverTitle>Pomodoro cycle</PopoverTitle><PopoverDescription>New timings apply when the next phase begins.</PopoverDescription></PopoverHeader>
        <FieldGroup className="pomodoro-fields">
          <Field><FieldLabel htmlFor="pomodoro-focus">Focus</FieldLabel><div className="minute-input"><Input id="pomodoro-focus" type="number" min="1" max="180" value={settings.focusMinutes} onChange={(event) => update("focusMinutes", Number(event.target.value))} /><span>min</span></div></Field>
          <Field><FieldLabel htmlFor="pomodoro-short-break">Short break</FieldLabel><div className="minute-input"><Input id="pomodoro-short-break" type="number" min="1" max="60" value={settings.shortBreakMinutes} onChange={(event) => update("shortBreakMinutes", Number(event.target.value))} /><span>min</span></div></Field>
          <Field><FieldLabel htmlFor="pomodoro-long-break">Long break</FieldLabel><div className="minute-input"><Input id="pomodoro-long-break" type="number" min="1" max="120" value={settings.longBreakMinutes} onChange={(event) => update("longBreakMinutes", Number(event.target.value))} /><span>min</span></div></Field>
          <Field><FieldLabel htmlFor="pomodoro-rounds">Rounds</FieldLabel><div className="minute-input"><Input id="pomodoro-rounds" type="number" min="1" max="12" value={settings.rounds} onChange={(event) => update("rounds", Number(event.target.value))} /><span>cycle</span></div></Field>
        </FieldGroup>
        <div className="pomodoro-switches">
          <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="auto-breaks">Auto-start breaks</FieldLabel><FieldDescription>Begin the break as soon as focus ends.</FieldDescription></FieldContent><Switch id="auto-breaks" size="sm" checked={settings.autoStartBreaks} onCheckedChange={(value) => update("autoStartBreaks", value)} /></Field>
          <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="auto-focus">Auto-start focus</FieldLabel><FieldDescription>Begin the next round when a break ends.</FieldDescription></FieldContent><Switch id="auto-focus" size="sm" checked={settings.autoStartFocus} onCheckedChange={(value) => update("autoStartFocus", value)} /></Field>
        </div>
        <div className="pomodoro-popover-actions"><Button variant="ghost" size="sm" onClick={onRestart}><RotateCcw data-icon="inline-start" /> Restart cycle</Button><Button size="sm" onClick={() => onOpenChange(false)}><Check data-icon="inline-start" /> Done</Button></div>
      </PopoverContent>
    </Popover>
  );
}

function DurationControl({ duration, open, label, onOpenChange, onChange }: { duration: number; open: boolean; label: string; onOpenChange: (open: boolean) => void; onChange: (value: number) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <SlidersHorizontal data-icon="inline-start" />
        {formatDuration(duration)}
      </PopoverTrigger>
      <PopoverContent align="end" className="duration-popover">
          <PopoverHeader>
            <PopoverTitle>{label}</PopoverTitle>
            <PopoverDescription>Set any time from 1 minute to 12 hours.</PopoverDescription>
          </PopoverHeader>
          <div className="duration-fields">
            <Field><FieldLabel htmlFor="duration-hours">Hours</FieldLabel><Input id="duration-hours" type="number" min="0" max="12" value={Math.floor(duration / 3600)} onChange={(event) => onChange(Math.max(60, Math.min(12, Number(event.target.value) || 0) * 3600 + Math.floor((duration % 3600) / 60) * 60))} /></Field>
            <span>:</span>
            <Field><FieldLabel htmlFor="duration-minutes">Minutes</FieldLabel><Input id="duration-minutes" type="number" min="0" max="59" value={Math.floor((duration % 3600) / 60)} onChange={(event) => onChange(Math.max(60, Math.floor(duration / 3600) * 3600 + Math.min(59, Math.max(0, Number(event.target.value) || 0)) * 60))} /></Field>
          </div>
          <Button onClick={() => onOpenChange(false)}><Check data-icon="inline-start" /> Use this time</Button>
      </PopoverContent>
    </Popover>
  );
}

function DailyGoal({ goalHours, todaySeconds, onGoalChange }: { goalHours: number; todaySeconds: number; onGoalChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false);
  const percent = Math.min(100, Math.round((todaySeconds / (goalHours * 3600)) * 100));
  const remaining = Math.max(0, goalHours * 3600 - todaySeconds);

  return (
    <section className="goal-card">
      <div className="goal-title"><div><Target /><span>Daily goal</span></div><Button variant="ghost" size="icon-sm" onClick={() => setEditing((value) => !value)} aria-label="Edit daily goal"><PencilLine /></Button></div>
      <div className="goal-copy"><strong>{formatDuration(todaySeconds)}</strong><span>of {goalHours} hours</span></div>
      <Progress value={percent} aria-label={`${percent}% of daily goal complete`} />
      <div className="goal-meta"><span>{percent}% complete</span><span>{formatDuration(remaining)} left</span></div>
      {editing && (
        <div className="goal-editor">
          <label htmlFor="goal-range">Goal: {goalHours} hours</label>
          <Slider id="goal-range" min={1} max={12} value={[goalHours]} onValueChange={(value) => onGoalChange(Array.isArray(value) ? value[0] : Number(value))} />
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><Check data-icon="inline-start" /> Done</Button>
        </div>
      )}
    </section>
  );
}

function SessionsView({ sessions, onRemove, onAdd }: { sessions: Session[]; onRemove: (id: string) => void; onAdd: () => void }) {
  const [filter, setFilter] = useState<"all" | "today" | "week">("all");
  const filtered = sessions.filter((session) => {
    const date = new Date(session.startedAt);
    if (filter === "today") return sameDay(date, new Date());
    if (filter === "week") return Date.now() - date.getTime() < 7 * 86400000;
    return true;
  });

  return (
    <div className="page-stack sessions-page animate-in">
      <section className="summary-strip sessions-summary">
        <Metric label="Total focus" value={formatDuration(sessions.reduce((sum, item) => sum + item.seconds, 0))} icon={Clock3} />
        <Metric label="Sessions" value={String(sessions.length)} icon={CalendarDays} />
        <Metric label="Average session" value={formatDuration(sessions.length ? Math.round(sessions.reduce((sum, item) => sum + item.seconds, 0) / sessions.length) : 0)} icon={TimerReset} />
      </section>
      <section className="content-panel sessions-content">
        <div className="content-panel-head">
          <div><h2>Session history</h2><p>{filtered.length} {filtered.length === 1 ? "session" : "sessions"} in this view.</p></div>
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}><TabsList variant="line">{(["all", "today", "week"] as const).map((item) => <TabsTrigger key={item} value={item}>{item === "week" ? "7 days" : item}</TabsTrigger>)}</TabsList></Tabs>
        </div>
        {filtered.length ? (
          <div className="session-list-frame">
            <div className="session-list-head" aria-hidden="true"><span /><span>Session</span><span>Mode</span><span>Duration</span><span /></div>
            <div className="session-list" role="list">
              {filtered.map((session) => <SessionRow key={session.id} session={session} onRemove={onRemove} />)}
            </div>
          </div>
        ) : <EmptySessions onAction={onAdd} />}
      </section>
    </div>
  );
}

function SessionRow({ session, onRemove }: { session: Session; onRemove?: (id: string) => void }) {
  const date = new Date(session.startedAt);
  const SessionIcon = session.mode === "deep" ? Clock3 : session.mode === "pomodoro" ? TimerReset : Compass;
  return (
    <div className="session-row" role="listitem">
      <div className={`session-icon mode-${session.mode}`}><SessionIcon /></div>
      <div className="session-main"><strong>{session.subject}</strong><span>{date.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })} at {date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</span></div>
      <span className="mode-label">{session.mode === "deep" ? "Deep work" : session.mode}</span>
      <strong className="session-duration">{formatDuration(session.seconds)}</strong>
      {onRemove && <Button variant="ghost" size="icon-sm" className="row-action" aria-label={`Delete ${session.subject} session`} onClick={() => onRemove(session.id)}><Trash2 /></Button>}
    </div>
  );
}

function EmptySessions({ onAction }: { onAction: () => void }) {
  return <div className="empty-state"><div><TimerReset /></div><h3>No sessions here yet</h3><p>Start a timer or add a completed study block.</p><Button variant="outline" onClick={onAction}><Plus data-icon="inline-start" /> Add session</Button></div>;
}

function AnalyticsView({ sessions, goalHours }: { sessions: Session[]; goalHours: number }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const data = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const daySessions = sessions.filter((session) => sameDay(new Date(session.startedAt), date));
      const seconds = daySessions.reduce((sum, item) => sum + item.seconds, 0);
      return {
        day: date.toLocaleDateString("en", { weekday: "short" }),
        dateLabel: date.toLocaleDateString("en", { day: "numeric", month: "short" }),
        hours: Number((seconds / 3600).toFixed(2)),
        seconds,
        sessionCount: daySessions.length,
      };
    });
    const selectedSessions = sessions.filter((session) => {
      const date = new Date(session.startedAt);
      return date >= monday && date <= sunday;
    });

    return { start: monday, end: sunday, data, selectedSessions };
  }, [sessions, weekOffset]);

  const totalSeconds = week.data.reduce((sum, item) => sum + item.seconds, 0);
  const averageSeconds = Math.round(totalSeconds / 7);
  const best = week.data.reduce((top, item) => item.seconds > top.seconds ? item : top, week.data[0]);
  const weeklyGoalSeconds = goalHours * 7 * 3600;
  const goalPercent = weeklyGoalSeconds ? Math.round((totalSeconds / weeklyGoalSeconds) * 100) : 0;
  const ringPercent = Math.min(100, goalPercent);
  const goalDays = week.data.filter((item) => item.seconds >= goalHours * 3600).length;
  const averageSession = week.selectedSessions.length
    ? Math.round(totalSeconds / week.selectedSessions.length)
    : 0;
  const ringData = [
    { name: "Focused", value: ringPercent },
    { name: "Remaining", value: Math.max(0, 100 - ringPercent) },
  ];

  const weekRange = `${week.start.toLocaleDateString("en", { day: "numeric", month: "short" })} – ${week.end.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;

  const activity = useMemo(() => {
    const secondsByDay = new Map<string, number>();
    sessions.forEach((session) => {
      const date = new Date(session.startedAt);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      secondsByDay.set(key, (secondsByDay.get(key) || 0) + session.seconds);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - today.getDay());
    const start = new Date(currentSunday);
    start.setDate(currentSunday.getDate() - 51 * 7);
    const dailyGoalSeconds = Math.max(1, goalHours * 3600);

    const weeks = Array.from({ length: 52 }, (_, weekIndex) => (
      Array.from({ length: 7 }, (_, dayIndex) => {
        const date = new Date(start);
        date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const seconds = secondsByDay.get(key) || 0;
        const ratio = seconds / dailyGoalSeconds;
        const level = seconds === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : ratio < 1 ? 4 : 5;
        return { date, seconds, level, future: date > today };
      })
    ));

    const visibleDays = weeks.flat().filter((day) => !day.future);
    return {
      weeks,
      activeDays: visibleDays.filter((day) => day.seconds > 0).length,
      totalSeconds: visibleDays.reduce((sum, day) => sum + day.seconds, 0),
    };
  }, [goalHours, sessions]);

  return (
    <div className="analytics-layout animate-in">
      <section className="rhythm-panel">
        <div className="section-heading analytics-heading">
          <div><h2>Focus rhythm</h2><p>Your study time, one week at a time.</p></div>
          <div className="week-navigator">
            <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week"><ChevronLeft /></Button>
            <div><strong>{weekOffset === 0 ? "This week" : weekRange}</strong><span>{weekOffset === 0 ? weekRange : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? "week" : "weeks"} ago`}</span></div>
            <Button variant="ghost" size="icon-sm" disabled={weekOffset === 0} onClick={() => setWeekOffset((value) => Math.min(0, value + 1))} aria-label="Next week"><ChevronRight /></Button>
          </div>
        </div>
        <div className="insight-kpis">
          <Metric label="Focused" value={formatDuration(totalSeconds)} icon={Clock3} />
          <Metric label="Daily average" value={formatDuration(averageSeconds)} icon={BarChart3} />
          <Metric label="Best day" value={best?.seconds ? best.day : "—"} icon={Flame} trend={best?.seconds ? formatDuration(best.seconds) : "No sessions"} />
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week.data} margin={{ top: 18, right: 8, bottom: 0, left: -28 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.09)" strokeDasharray="4 5" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#85878d", fontSize: 12 }} />
              <ChartTooltip cursor={{ fill: "rgba(255,255,255,.035)" }} contentStyle={{ background: "rgba(6,10,18,.96)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, color: "#fafafa", fontSize: 11 }} labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ""} formatter={(value) => [`${Number(value).toFixed(1)} hours`, "Focus"]} />
              <Bar dataKey="hours" fill="rgba(255,255,255,.84)" radius={[4, 4, 1, 1]} maxBarSize={46} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <aside className="weekly-goal-panel">
        <div className="section-heading"><div><h2>Weekly goal</h2><p>{goalHours} hours a day · 7 days</p></div></div>
        <div className="goal-ring">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ringData} dataKey="value" innerRadius="78%" outerRadius="94%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={ringPercent > 2 ? 6 : 0} isAnimationActive animationDuration={600}>
                <Cell fill="rgba(255,255,255,.92)" />
                <Cell fill="rgba(255,255,255,.075)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="goal-ring-center"><strong>{goalPercent}%</strong><span>complete</span></div>
        </div>
        <div className="goal-ring-stats">
          <div><span>Goal days</span><strong>{goalDays}<small>/7</small></strong></div>
          <div><span>Average session</span><strong>{formatDuration(averageSession)}</strong></div>
        </div>
      </aside>

      <section className="activity-panel">
        <div className="section-heading activity-heading">
          <div><h2>Focus consistency</h2><p>One year of study, with brighter days showing more focused hours.</p></div>
          <span>{activity.activeDays} active days · {formatDuration(activity.totalSeconds)}</span>
        </div>
        <div className="activity-scroll">
          <div className="activity-map" aria-label="52 week study consistency heatmap">
            <div className="heatmap-month-row">
              <span aria-hidden="true" />
              <div className="heatmap-months">
                {activity.weeks.map((weekDays, index) => {
                  const previousMonth = index ? activity.weeks[index - 1][0].date.getMonth() : -1;
                  const showMonth = index === 0 || weekDays[0].date.getMonth() !== previousMonth;
                  return <span key={weekDays[0].date.toISOString()}>{showMonth ? weekDays[0].date.toLocaleDateString("en", { month: "short" }) : ""}</span>;
                })}
              </div>
            </div>
            <div className="heatmap-body">
              <div className="heatmap-days" aria-hidden="true">{["", "Mon", "", "Wed", "", "Fri", ""].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
              <div className="heatmap-weeks">
                {activity.weeks.map((weekDays) => (
                  <div className="heatmap-week" key={weekDays[0].date.toISOString()}>
                    {weekDays.map((day) => {
                      const label = `${formatDuration(day.seconds)} on ${day.date.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}`;
                      return <span key={day.date.toISOString()} data-level={day.level} data-future={day.future || undefined} title={day.future ? "" : label} aria-label={day.future ? undefined : label} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="heatmap-foot"><span>Less</span>{[0, 1, 2, 3, 4, 5].map((level) => <i key={level} data-level={level} />)}<span>More</span></div>
      </section>
    </div>
  );
}

function MusicView({ tracks, playlists, selected, musicPlaying, onToggleMusic, onPlay, onAdd, onRemove, onAddPlaylist, onDeletePlaylist, onReorder }: { tracks: Track[]; playlists: StudyPlaylist[]; selected: Track | null; musicPlaying: boolean; onToggleMusic: () => void; onPlay: (track: Track) => void; onAdd: (track: Track) => void; onRemove: (id: string) => void; onAddPlaylist: (name: string) => string; onDeletePlaylist: (id: string) => string; onReorder: (playlistId: string, orderedIds: string[]) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [error, setError] = useState("");
  const [addingTrack, setAddingTrack] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  async function addTrack(event: FormEvent) {
    event.preventDefault();
    if (!activePlaylistId) return;
    const embed = toYouTubeEmbed(url);
    if (!embed) { setError("Paste a valid YouTube video or playlist link."); return; }
    setAddingTrack(true);
    try {
      const response = await fetch(`/api/youtube/title?url=${encodeURIComponent(url)}`);
      const payload = await response.json();
      if (!response.ok || typeof payload.title !== "string") throw new Error(payload.message || "Could not read the YouTube title.");
      const track: Track = { id: crypto.randomUUID(), title: payload.title, url, playlistId: activePlaylistId, ...embed };
      onAdd(track);
      setUrl(""); setError(""); setAddOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the YouTube title.");
    } finally {
      setAddingTrack(false);
    }
  }

  const detectedMedia = url ? toYouTubeEmbed(url) : null;
  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || null;
  const playlistTracks = activePlaylist ? tracks.filter((track) => track.playlistId === activePlaylist.id) : [];

  function createPlaylist(event: FormEvent) {
    event.preventDefault();
    if (!playlistName.trim()) return;
    const id = onAddPlaylist(playlistName);
    setActivePlaylistId(id);
    setPlaylistName("");
    setPlaylistOpen(false);
  }

  function returnToLibrary() {
    setActivePlaylistId(null);
    setAddOpen(false);
    setError("");
  }

  return (
    <div className="music-layout animate-in">
      <aside className="music-library">
        {activePlaylist ? <div className="playlist-header">
          <Button variant="ghost" size="icon-sm" onClick={returnToLibrary} aria-label="Back to music libraries"><ChevronLeft /></Button>
          <div className="playlist-header-copy"><h2>{activePlaylist.name}</h2><span>{playlistTracks.length} {playlistTracks.length === 1 ? "track" : "tracks"}{playlistTracks.length > 1 ? " · drag to reorder" : ""}</span></div>
          <div className="queue-actions"><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => setDeleteOpen(true)} disabled={playlists.length === 1} />}><Trash2 /><span className="sr-only">Delete playlist</span></TooltipTrigger><TooltipContent>{playlists.length === 1 ? "Keep at least one playlist" : "Delete playlist"}</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => setAddOpen((value) => !value)} />}><Plus /><span className="sr-only">Add YouTube track</span></TooltipTrigger><TooltipContent>Add track</TooltipContent></Tooltip></div>
        </div> : <div className="queue-head"><div><span>Library</span><h2>Your focus shelf</h2></div><div className="queue-actions"><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => setPlaylistOpen(true)} />}><FolderPlus /><span className="sr-only">Create playlist</span></TooltipTrigger><TooltipContent>New playlist</TooltipContent></Tooltip></div></div>}
        {!activePlaylist && <div className="playlist-library" aria-label="Your playlists">{playlists.map((playlist) => { const count = tracks.filter((track) => track.playlistId === playlist.id).length; return <button key={playlist.id} onClick={() => setActivePlaylistId(playlist.id)}><span className="playlist-folder"><Folder /></span><span><strong>{playlist.name}</strong><small>{count} {count === 1 ? "track" : "tracks"}</small></span><ChevronRight /></button>; })}</div>}
        {addOpen && <form className="add-track-form" autoComplete="off" onSubmit={addTrack}><FieldGroup><Field data-invalid={Boolean(error)}><FieldLabel htmlFor="track-url">YouTube video or playlist</FieldLabel><Input id="track-url" name="kairo-youtube-url" autoComplete="off" spellCheck={false} autoFocus aria-invalid={Boolean(error)} value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="Paste a YouTube link" />{error ? <FieldError>{error}</FieldError> : <FieldDescription>Kairo will use the title from YouTube automatically.</FieldDescription>}</Field></FieldGroup><div><span>{detectedMedia ? `${detectedMedia.kind === "playlist" ? "YouTube playlist" : "Video"} · ${activePlaylist?.name}` : `Adding to ${activePlaylist?.name}`}</span><Button type="button" variant="ghost" disabled={addingTrack} onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" disabled={addingTrack || !detectedMedia}>{addingTrack ? "Reading title…" : "Add"}</Button></div></form>}
        {activePlaylist && <div className="track-list">{playlistTracks.map((track) => <div draggable className={`${selected?.id === track.id ? "active" : ""} ${dropTargetId === track.id ? "drop-target" : ""}`} key={track.id} onDragStart={(event) => { setDraggedTrackId(track.id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { event.preventDefault(); setDropTargetId(track.id); }} onDragLeave={() => setDropTargetId(null)} onDrop={(event) => { event.preventDefault(); if (!draggedTrackId || draggedTrackId === track.id) return; const ids = playlistTracks.map((item) => item.id); const from = ids.indexOf(draggedTrackId); const to = ids.indexOf(track.id); if (from < 0 || to < 0) return; const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved); onReorder(activePlaylist.id, ids); setDraggedTrackId(null); setDropTargetId(null); }} onDragEnd={() => { setDraggedTrackId(null); setDropTargetId(null); }}><button className="drag-handle" aria-label={`Drag to reorder ${track.title}`}><GripVertical /></button><button className="track-select" onClick={() => selected?.id === track.id ? onToggleMusic() : onPlay(track)}><span className="track-artwork"><Image src={getTrackArtwork(track)} alt={`${track.title} thumbnail`} fill sizes="42px" unoptimized /></span><span><strong>{track.title}</strong><small>{track.kind === "playlist" ? "YouTube playlist" : activePlaylist.name}</small></span><span className="track-row-play">{selected?.id === track.id && musicPlaying ? <Pause /> : <Play />}</span></button><Button variant="ghost" size="icon-sm" className="track-remove" onClick={() => onRemove(track.id)} aria-label={`Remove ${track.title}`}><X /></Button></div>)}</div>}
        {activePlaylist && !playlistTracks.length && <div className="playlist-empty"><Music2 /><span>No tracks in {activePlaylist.name}</span><button onClick={() => setAddOpen(true)}>Add a YouTube link</button></div>}
        <div className="library-note"><VolumeX /><span>Distraction-free playback</span></div>
      </aside>
      <section className="player-panel">
        {selected ? <><div className="player-copy"><span>Now playing</span><h2>{selected.title}</h2><p>{selected.kind === "playlist" ? "YouTube playlist" : "YouTube video"}</p></div><div className={`music-visual ${musicPlaying ? "playing" : ""}`}><div className="music-cover"><Image src={getTrackArtwork(selected)} alt={`${selected.title} artwork`} fill sizes="(max-width: 760px) 100vw, 70vw" priority unoptimized /><span className="cover-playing-icon"><Music2 /></span><div className="cover-controls"><Button size="lg" onClick={onToggleMusic}>{musicPlaying ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{musicPlaying ? "Pause" : "Play focus mix"}</Button><span>Playback continues across the app</span></div></div></div><div className="player-footer"><div className="player-art"><Image src={getTrackArtwork(selected)} alt="" fill sizes="40px" /></div><div><strong>{selected.title}</strong><span>Focus library</span></div><Button variant="ghost" size="icon"><ListMusic /><span className="sr-only">Open queue</span></Button></div></> : <div className="music-empty-player"><Music2 /><h2>Your player is empty</h2><p>Open a playlist and add a YouTube video or playlist to begin.</p><Button variant="outline" onClick={() => { setActivePlaylistId(playlists[0]?.id || DEFAULT_PLAYLIST_ID); setAddOpen(true); }}><Plus data-icon="inline-start" /> Add your first track</Button></div>}
      </section>
      <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}><DialogContent><DialogHeader><DialogTitle>Create playlist</DialogTitle><DialogDescription>Make a separate queue for a subject, mood, or study ritual.</DialogDescription></DialogHeader><form autoComplete="off" onSubmit={createPlaylist}><FieldGroup><Field><FieldLabel htmlFor="playlist-name">Playlist name</FieldLabel><Input id="playlist-name" name="kairo-playlist-name" autoComplete="off" autoFocus value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="Night revision" /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setPlaylistOpen(false)}>Cancel</Button><Button type="submit" disabled={!playlistName.trim()}>Create playlist</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Delete {activePlaylist?.name}?</DialogTitle><DialogDescription>The playlist will be removed. Its songs will be moved to your next library so nothing is lost.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => { if (activePlaylist) onDeletePlaylist(activePlaylist.id); setDeleteOpen(false); returnToLibrary(); }}>Delete playlist</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function SettingsView({ goalHours, onGoalChange, sound, onSoundChange, notifications, onNotificationsChange, storageUsage, onExport, onImport, onResetPreferences, onDeleteAll }: { goalHours: number; onGoalChange: (value: number) => void; sound: boolean; onSoundChange: (value: boolean) => void; notifications: boolean; onNotificationsChange: (value: boolean) => void; storageUsage: StorageUsage; onExport: () => void; onImport: (file: File) => Promise<void>; onResetPreferences: () => Promise<void>; onDeleteAll: () => Promise<void> }) {
  const [confirmAction, setConfirmAction] = useState<"reset" | "delete" | null>(null);
  const [importError, setImportError] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function requestNotifications(value: boolean) {
    if (value && "Notification" in window && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      onNotificationsChange(permission === "granted");
      return;
    }
    onNotificationsChange(value);
  }

  async function importFile(file: File) {
    setBusy(true);
    setImportError("");
    try { await onImport(file); }
    catch (reason) { setImportError(reason instanceof Error ? reason.message : "Could not import this backup."); }
    finally { setBusy(false); }
  }

  const browserPercent = storageUsage.browserUsage && storageUsage.browserQuota ? Math.min(100, storageUsage.browserUsage / storageUsage.browserQuota * 100) : 0;

  return <div className="settings-layout animate-in"><header className="page-title"><span>Preferences</span><h2>Make the space yours.</h2></header><section className="settings-panel">
    <div className="settings-section"><div><h2>Daily target</h2><p>Choose the amount of focused time you want to complete each day.</p></div><div className="setting-control"><strong>{goalHours}h</strong><Slider min={1} max={12} value={[goalHours]} onValueChange={(value) => onGoalChange(Array.isArray(value) ? value[0] : Number(value))} /></div></div>
    <Separator />
    <div className="settings-section"><div><h2>Timer</h2><p>Control how the timer gets your attention.</p></div><div><SettingToggle label="Completion sound" description="Play a soft three-note chime when a timed block finishes." checked={sound} onChange={onSoundChange} /><SettingToggle label="Desktop reminders" description="Notify you when a timed focus block is complete." checked={notifications} onChange={(value) => void requestNotifications(value)} /></div></div>
    <Separator />
    <div className="settings-section"><div><h2>Browser memory</h2><p>Your study history and music library stay private in this browser. Clearing site data removes them.</p></div><div className="local-data-settings"><div className="storage-summary"><HardDrive /><div><strong>{formatBytes(storageUsage.dataBytes)} of Kairo data</strong><span>{storageUsage.browserQuota ? `${formatBytes(storageUsage.browserUsage || 0)} used across this site · ${formatBytes(storageUsage.browserQuota)} available` : "Stored only on this device"}</span></div></div>{storageUsage.browserQuota && <Progress value={browserPercent} aria-label={`${browserPercent.toFixed(1)}% of browser storage used`} />}<input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} /><div className="settings-actions"><Button variant="outline" onClick={onExport}><Download data-icon="inline-start" /> Export backup</Button><Button variant="outline" disabled={busy} onClick={() => importRef.current?.click()}><Upload data-icon="inline-start" /> {busy ? "Importing…" : "Import backup"}</Button></div>{importError && <p className="settings-error" role="alert">{importError}</p>}</div></div>
    <Separator />
    <div className="settings-section danger-section"><div><h2>Reset</h2><p>Reset preferences without touching study history, or permanently erase all Kairo data from this browser.</p></div><div className="settings-actions"><Button variant="outline" onClick={() => setConfirmAction("reset")}><RotateCcw data-icon="inline-start" /> Reset settings</Button><Button variant="ghost" onClick={() => setConfirmAction("delete")}><Trash2 data-icon="inline-start" /> Delete all local data</Button></div></div>
  </section><Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}><DialogContent><DialogHeader><DialogTitle>{confirmAction === "delete" ? "Delete all local data?" : "Reset your settings?"}</DialogTitle><DialogDescription>{confirmAction === "delete" ? "This permanently removes study history, playlists, tracks, wallpaper, and preferences from this browser. Export a backup first if you may need it later." : "This restores the default goal, wallpaper, sound, and notifications. Your sessions and playlists stay intact."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button><Button variant={confirmAction === "delete" ? "destructive" : "default"} disabled={busy} onClick={async () => { setBusy(true); if (confirmAction === "delete") await onDeleteAll(); else await onResetPreferences(); setBusy(false); setConfirmAction(null); }}>{confirmAction === "delete" ? "Delete everything" : "Reset settings"}</Button></DialogFooter></DialogContent></Dialog></div>;
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="setting-row"><div><strong>{label}</strong><span>{description}</span></div><Switch checked={checked} onCheckedChange={onChange} aria-label={label} /></div>;
}

function Metric({ label, value, icon: Icon, trend }: { label: string; value: string; icon: typeof Clock3; trend?: string }) {
  return <div className="metric"><div className="metric-icon"><Icon /></div><div><span>{label}</span><strong>{value}</strong>{trend && <small>{trend}</small>}</div></div>;
}

function AddSessionModal({ onClose, onAdd }: { onClose: () => void; onAdd: (session: Session) => void }) {
  const [subject, setSubject] = useState("");
  const [minutes, setMinutes] = useState(50);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim() || minutes < 1) return;
    onAdd({ id: crypto.randomUUID(), subject: subject.trim(), seconds: minutes * 60, startedAt: new Date().toISOString(), mode: "focus" });
    onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Add study session</DialogTitle><DialogDescription>Log time you completed away from the timer.</DialogDescription></DialogHeader><form onSubmit={submit}><FieldGroup><Field><FieldLabel htmlFor="session-subject">Subject</FieldLabel><Input id="session-subject" autoFocus required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What did you study?" /></Field><Field><FieldLabel htmlFor="session-minutes">Duration in minutes</FieldLabel><Input id="session-minutes" type="number" min="1" max="720" required value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save session</Button></DialogFooter></form></DialogContent></Dialog>;
}
