import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  GripVertical,
  Home,
  ListMusic,
  PanelRight,
  PanelRightClose,
  Pencil,
  Play,
  Plus,
  Repeat1,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shuffle,
  SkipForward,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import './App.css'
import { createInitialState, createPlaylist, loadState, makeId, saveState } from './storage'
import type { AppState, PanelSide, PlayMode, Playlist, PlaylistItem } from './types'
import { extractVideoIds, thumbnailUrl, videoUrl } from './youtube'

let youtubeApiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve()
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        resolve()
      }

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(script)
      }
    })
  }

  return youtubeApiPromise
}

function labelForMode(mode: PlayMode): string {
  if (mode === 'shuffle') return 'Shuffle'
  if (mode === 'repeat-one') return 'Repeat one'
  return 'Sequence'
}

function nextMode(mode: PlayMode): PlayMode {
  if (mode === 'sequence') return 'shuffle'
  if (mode === 'shuffle') return 'repeat-one'
  return 'sequence'
}

function formatCount(count: number): string {
  return `${count} video${count === 1 ? '' : 's'}`
}

function Player({
  videoId,
  onEnded,
}: {
  videoId: string | null
  onEnded: (player: YTPlayer) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const latestEndedRef = useRef(onEnded)
  const initialVideoIdRef = useRef(videoId)

  useEffect(() => {
    latestEndedRef.current = onEnded
  }, [onEnded])

  useEffect(() => {
    let cancelled = false

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player || playerRef.current) {
        return
      }

      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId: initialVideoIdRef.current ?? undefined,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: initialVideoIdRef.current ? 1 : 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState.ENDED) {
              latestEndedRef.current(event.target)
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!videoId || !playerRef.current) {
      return
    }

    playerRef.current.loadVideoById(videoId)
  }, [videoId])

  if (!videoId) {
    return (
      <div className="empty-player">
        <div className="empty-player-icon">
          <ListMusic size={32} strokeWidth={1.8} />
        </div>
        <h1>Drop YouTube links</h1>
        <p>Links added here are stored on this device and appear in the selected playlist.</p>
      </div>
    )
  }

  return <div className="player-host" ref={hostRef} />
}

function Sidebar({ activePlaylistName }: { activePlaylistName: string }) {
  const navItems = [
    { key: 'home', label: '홈', icon: Home },
    { key: 'library', label: '목록', icon: Users, active: true, badge: true },
    { key: 'courses', label: '과정', icon: BookOpen },
    { key: 'schedule', label: '일정', icon: CalendarDays },
    { key: 'notices', label: '공지', icon: Send },
  ]

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <button className="brand-mark" type="button" title={activePlaylistName}>
        Y<span className="dot" />
      </button>
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            className={`nav-btn ${item.active ? 'is-active' : ''}`}
            data-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            title={item.label}
          >
            <Icon size={20} strokeWidth={1.8} />
            {item.badge ? <span className="badge" /> : null}
          </button>
        )
      })}
      <div className="nav-spacer" />
      <div className="nav-divider" />
      <button className="nav-btn" type="button" data-label="설정" title="설정">
        <Settings size={20} strokeWidth={1.8} />
      </button>
      <button className="nav-btn" type="button" data-label="도움말" title="도움말">
        <CircleHelp size={20} strokeWidth={1.8} />
      </button>
      <div className="nav-avatar" title="Local profile">
        YT
      </div>
    </aside>
  )
}

function Header({
  activePlaylist,
  query,
  railOpen,
  onQueryChange,
  onToggleRail,
}: {
  activePlaylist: Playlist
  query: string
  railOpen: boolean
  onQueryChange: (query: string) => void
  onToggleRail: () => void
}) {
  return (
    <header className="header">
      <div className="app-title">
        <div className="page-title">
          <span className="pt-name">YouTube List</span>
          <span className="pt-sub">{activePlaylist.name}</span>
        </div>
      </div>
      <label className="search">
        <span className="search-icon">
          <Search size={22} strokeWidth={1.8} />
        </span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="워크스페이스 전체 검색 - 영상, 재생목록, URL..."
        />
        <span className="kbd">
          <span className="key">Ctrl</span>
          <span className="key">K</span>
        </span>
      </label>
      <div className="header-actions">
        <button className="iconbtn" type="button" title="알림">
          <Bell size={20} strokeWidth={1.8} />
          <span className="dot" />
        </button>
        <button
          className="iconbtn"
          type="button"
          onClick={onToggleRail}
          title={railOpen ? '오른쪽 패널 접기' : '오른쪽 패널 열기'}
        >
          <PanelRight size={20} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}

function PlaylistPanel({
  playlists,
  activePlaylist,
  activeItemId,
  items,
  playMode,
  panelSide,
  onAddPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onSelectPlaylist,
  onSelectItem,
  onDeleteItem,
  onRenameItem,
  onToggleMode,
  onToggleSide,
  onHide,
}: {
  playlists: Playlist[]
  activePlaylist: Playlist
  activeItemId: string | null
  items: PlaylistItem[]
  playMode: PlayMode
  panelSide: PanelSide
  onAddPlaylist: () => void
  onDeletePlaylist: () => void
  onRenamePlaylist: () => void
  onSelectPlaylist: (playlistId: string) => void
  onSelectItem: (itemId: string) => void
  onDeleteItem: (itemId: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onToggleMode: () => void
  onToggleSide: () => void
  onHide: () => void
}) {
  return (
    <aside className="playlist-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Collection</p>
          <h2>{activePlaylist.name}</h2>
        </div>
        <button className="iconbtn small" type="button" title="패널 숨기기" onClick={onHide}>
          <X size={18} strokeWidth={1.9} />
        </button>
      </div>

      <div className="select-row">
        <label className="playlist-select">
          <select
            aria-label="Playlist"
            value={activePlaylist.id}
            onChange={(event) => onSelectPlaylist(event.target.value)}
          >
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </label>
        <button type="button" className="btn iconly" onClick={onAddPlaylist} title="New playlist">
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="btn iconly"
          onClick={onRenamePlaylist}
          title="Rename playlist"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className="btn iconly danger"
          onClick={onDeletePlaylist}
          title="Delete playlist"
          disabled={playlists.length === 1}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="panel-tools">
        <button type="button" className="chip is-active" onClick={onToggleMode}>
          {playMode === 'shuffle' ? <Shuffle size={15} /> : null}
          {playMode === 'repeat-one' ? <Repeat1 size={15} /> : null}
          {playMode === 'sequence' ? <SkipForward size={15} /> : null}
          {labelForMode(playMode)}
        </button>
        <button type="button" className="chip" onClick={onToggleSide}>
          <PanelRightClose size={15} />
          {panelSide === 'right' ? 'Right' : 'Left'}
        </button>
      </div>

      <div className="drop-note">
        <GripVertical size={16} />
        <span>Drop YouTube URLs anywhere</span>
      </div>

      <div className="items" aria-label="Playlist videos">
        {items.length === 0 ? (
          <div className="empty-list">
            <Sparkles size={20} />
            <strong>No videos</strong>
            <span>Paste or drop a YouTube URL to build this collection.</span>
          </div>
        ) : (
          items.map((item, index) => (
            <article className={`playlist-item ${item.id === activeItemId ? 'active' : ''}`} key={item.id}>
              <button
                type="button"
                className="thumb-button"
                onClick={() => onSelectItem(item.id)}
                title={`Play ${item.title}`}
              >
                <img src={thumbnailUrl(item.videoId)} alt="" loading="lazy" />
                <span className="play-dot">
                  <Play size={12} fill="currentColor" />
                </span>
              </button>
              <div className="item-copy">
                <div className="item-meta">
                  <span className="mono">#{String(index + 1).padStart(2, '0')}</span>
                  <span>{item.videoId}</span>
                </div>
                <input
                  aria-label="Video title"
                  value={item.title}
                  onChange={(event) => onRenameItem(item.id, event.target.value)}
                />
              </div>
              <button
                type="button"
                className="iconbtn small danger"
                onClick={() => onDeleteItem(item.id)}
                title="Remove video"
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}

function AssistantRail({
  activePlaylist,
  activeItem,
  playMode,
  onAddPlaylist,
  onReset,
}: {
  activePlaylist: Playlist
  activeItem: PlaylistItem | null
  playMode: PlayMode
  onAddPlaylist: () => void
  onReset: () => void
}) {
  return (
    <aside className="rail">
      <section>
        <h3>
          <Sparkles size={14} />
          Assistant
        </h3>
        <div className="ai-card">
          <div className="head">
            <Wand2 size={14} />
            Playlist ops
          </div>
          <p>
            Drag YouTube links into the workspace. The first new video becomes active when nothing
            is playing.
          </p>
          <div className="mini-actions">
            <button type="button" className="mini primary" onClick={onAddPlaylist}>
              새 목록
            </button>
            <button type="button" className="mini" onClick={onReset}>
              초기화
            </button>
          </div>
        </div>
      </section>
      <section>
        <h3>
          <CheckCircle2 size={14} />
          Status
        </h3>
        <div className="alert kind-info">
          <Clock3 size={17} />
          <div>
            <strong>{formatCount(activePlaylist.items.length)}</strong>
            <p>{activePlaylist.name}</p>
          </div>
        </div>
        <div className="alert kind-warn">
          <SkipForward size={17} />
          <div>
            <strong>{labelForMode(playMode)}</strong>
            <p>Auto-advance mode for ended videos.</p>
          </div>
        </div>
      </section>
      <section>
        <h3>
          <ListMusic size={14} />
          Now playing
        </h3>
        {activeItem ? (
          <div className="now-card">
            <img src={thumbnailUrl(activeItem.videoId)} alt="" />
            <strong>{activeItem.title}</strong>
            <span className="mono">{activeItem.videoId}</span>
          </div>
        ) : (
          <p className="rail-empty">No active video selected.</p>
        )}
      </section>
    </aside>
  )
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [isDragging, setIsDragging] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'all' | 'current' | 'recent'>('all')

  const activePlaylist = useMemo(() => {
    return (
      state.playlists.find((playlist) => playlist.id === state.settings.activePlaylistId) ??
      state.playlists[0]
    )
  }, [state.playlists, state.settings.activePlaylistId])

  const activeItem = useMemo(() => {
    return activePlaylist.items.find((item) => item.id === state.settings.activeItemId) ?? null
  }, [activePlaylist.items, state.settings.activeItemId])

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    let items = [...activePlaylist.items]

    if (view === 'current' && state.settings.activeItemId) {
      items = items.filter((item) => item.id === state.settings.activeItemId)
    }

    if (view === 'recent') {
      items.sort((a, b) => b.addedAt - a.addedAt)
    }

    if (!normalized) {
      return items
    }

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalized) ||
        item.videoId.toLowerCase().includes(normalized) ||
        item.url.toLowerCase().includes(normalized)
      )
    })
  }, [activePlaylist.items, query, state.settings.activeItemId, view])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search input')?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function updateActivePlaylist(updater: (playlist: Playlist) => Playlist) {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) =>
        playlist.id === current.settings.activePlaylistId ? updater(playlist) : playlist,
      ),
    }))
  }

  function addVideosFromText(text: string) {
    const videoIds = extractVideoIds(text)

    if (videoIds.length === 0) {
      return
    }

    const newItems: PlaylistItem[] = videoIds.map((videoId) => ({
      id: makeId('item'),
      videoId,
      title: `YouTube video ${videoId}`,
      url: videoUrl(videoId),
      addedAt: Date.now(),
    }))

    setState((current) => {
      let firstNewItemId: string | null = null
      const playlists = current.playlists.map((playlist) => {
        if (playlist.id !== current.settings.activePlaylistId) {
          return playlist
        }

        firstNewItemId = newItems[0]?.id ?? null

        return {
          ...playlist,
          items: [...playlist.items, ...newItems],
          updatedAt: Date.now(),
        }
      })

      return {
        playlists,
        settings: {
          ...current.settings,
          activeItemId: current.settings.activeItemId ?? firstNewItemId,
        },
      }
    })
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    const text =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain') ||
      ''

    addVideosFromText(text)
  }

  function selectNextVideo(player?: YTPlayer) {
    if (!activeItem || activePlaylist.items.length === 0) {
      return
    }

    if (state.settings.playMode === 'repeat-one') {
      player?.loadVideoById(activeItem.videoId)
      return
    }

    const currentIndex = activePlaylist.items.findIndex((item) => item.id === activeItem.id)
    let nextItem = activePlaylist.items[(currentIndex + 1) % activePlaylist.items.length]

    if (state.settings.playMode === 'shuffle' && activePlaylist.items.length > 1) {
      const candidates = activePlaylist.items.filter((item) => item.id !== activeItem.id)
      nextItem = candidates[Math.floor(Math.random() * candidates.length)]
    }

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        activeItemId: nextItem.id,
      },
    }))
  }

  function addPlaylist() {
    const name = window.prompt('Playlist name', `Playlist ${state.playlists.length + 1}`)
    if (!name?.trim()) return

    const playlist = createPlaylist(name.trim())
    setState((current) => ({
      playlists: [...current.playlists, playlist],
      settings: {
        ...current.settings,
        activePlaylistId: playlist.id,
        activeItemId: null,
      },
    }))
  }

  function renamePlaylist() {
    const name = window.prompt('Playlist name', activePlaylist.name)
    if (!name?.trim()) return

    updateActivePlaylist((playlist) => ({
      ...playlist,
      name: name.trim(),
      updatedAt: Date.now(),
    }))
  }

  function deletePlaylist() {
    if (state.playlists.length === 1) return

    const confirmed = window.confirm(`Delete "${activePlaylist.name}"?`)
    if (!confirmed) return

    setState((current) => {
      const playlists = current.playlists.filter(
        (playlist) => playlist.id !== current.settings.activePlaylistId,
      )
      const nextPlaylist = playlists[0]

      return {
        playlists,
        settings: {
          ...current.settings,
          activePlaylistId: nextPlaylist.id,
          activeItemId: nextPlaylist.items[0]?.id ?? null,
        },
      }
    })
  }

  function selectPlaylist(playlistId: string) {
    const playlist = state.playlists.find((candidate) => candidate.id === playlistId)
    if (!playlist) return

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        activePlaylistId: playlist.id,
        activeItemId: playlist.items[0]?.id ?? null,
      },
    }))
  }

  function deleteItem(itemId: string) {
    updateActivePlaylist((playlist) => ({
      ...playlist,
      items: playlist.items.filter((item) => item.id !== itemId),
      updatedAt: Date.now(),
    }))

    if (itemId === state.settings.activeItemId) {
      const remaining = activePlaylist.items.filter((item) => item.id !== itemId)
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          activeItemId: remaining[0]?.id ?? null,
        },
      }))
    }
  }

  function renameItem(itemId: string, title: string) {
    updateActivePlaylist((playlist) => ({
      ...playlist,
      items: playlist.items.map((item) => (item.id === itemId ? { ...item, title } : item)),
      updatedAt: Date.now(),
    }))
  }

  function setPanelSide(panelSide: PanelSide) {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        panelSide,
      },
    }))
  }

  function toggleMode() {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        playMode: nextMode(current.settings.playMode),
      },
    }))
  }

  function resetState() {
    const confirmed = window.confirm('Reset all playlists and settings on this device?')
    if (!confirmed) return
    setState(createInitialState())
  }

  const panel = (
    <PlaylistPanel
      playlists={state.playlists}
      activePlaylist={activePlaylist}
      activeItemId={state.settings.activeItemId}
      items={visibleItems}
      playMode={state.settings.playMode}
      panelSide={state.settings.panelSide}
      onAddPlaylist={addPlaylist}
      onDeletePlaylist={deletePlaylist}
      onRenamePlaylist={renamePlaylist}
      onSelectPlaylist={selectPlaylist}
      onSelectItem={(itemId) =>
        setState((current) => ({
          ...current,
          settings: { ...current.settings, activeItemId: itemId },
        }))
      }
      onDeleteItem={deleteItem}
      onRenameItem={renameItem}
      onToggleMode={toggleMode}
      onToggleSide={() => setPanelSide(state.settings.panelSide === 'left' ? 'right' : 'left')}
      onHide={() =>
        setState((current) => ({
          ...current,
          settings: { ...current.settings, panelHidden: true },
        }))
      }
    />
  )

  const railOpen = !state.settings.panelHidden

  return (
    <main
      className={`app-shell panel-${state.settings.panelSide} ${
        state.settings.panelHidden ? 'panel-hidden' : ''
      } ${isDragging ? 'dragging' : ''}`}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <Sidebar activePlaylistName={activePlaylist.name} />

      <div className="main">
        <Header
          activePlaylist={activePlaylist}
          query={query}
          railOpen={railOpen}
          onQueryChange={setQuery}
          onToggleRail={() =>
            setState((current) => ({
              ...current,
              settings: { ...current.settings, panelHidden: !current.settings.panelHidden },
            }))
          }
        />

        <div
          className={`body-grid ${state.settings.panelHidden ? 'rail-closed' : ''} ${
            state.settings.panelSide === 'left' ? 'panel-left' : 'panel-right'
          }`}
        >
          {!state.settings.panelHidden && state.settings.panelSide === 'left' ? panel : null}

          <section className="workspace">
            <div className="subheader">
              <div className="tabs" role="tablist" aria-label="Video views">
                {[
                  ['all', '전체'],
                  ['current', '재생 중'],
                  ['recent', '최근 추가'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`tab ${view === id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setView(id as typeof view)}
                    role="tab"
                    aria-selected={view === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="toolbar">
                <button className="btn ghost" type="button">
                  <Download size={16} />
                  내보내기
                </button>
                <button className="btn primary" type="button" onClick={addPlaylist}>
                  <Plus size={16} />
                  목록 추가
                </button>
              </div>
            </div>

            <div className="player-card">
              <div className="player-topline">
                <div>
                  <p className="eyebrow">Player</p>
                  <h1>{activeItem?.title ?? 'No video selected'}</h1>
                </div>
                <div className="player-actions">
                  <span className="status live">
                    <span className="status-dot" />
                    {formatCount(activePlaylist.items.length)}
                  </span>
                  <button
                    type="button"
                    className="btn tonal"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        settings: { ...current.settings, panelHidden: false },
                      }))
                    }
                    disabled={!state.settings.panelHidden}
                  >
                    <ListMusic size={16} />
                    패널 열기
                  </button>
                  <button type="button" className="btn iconly" onClick={resetState} title="Reset local data">
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>
              <div className="player-frame">
                <Player videoId={activeItem?.videoId ?? null} onEnded={selectNextVideo} />
              </div>
            </div>
          </section>

          {!state.settings.panelHidden && state.settings.panelSide === 'right' ? panel : null}

          <AssistantRail
            activePlaylist={activePlaylist}
            activeItem={activeItem}
            playMode={state.settings.playMode}
            onAddPlaylist={addPlaylist}
            onReset={resetState}
          />
        </div>
      </div>

      {isDragging ? (
        <div className="drop-overlay">
          <div>
            <ListMusic size={28} />
            <strong>Drop to add videos</strong>
            <span>YouTube URLs will be appended to {activePlaylist.name}</span>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
