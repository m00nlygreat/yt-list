import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  EyeOff,
  GripVertical,
  ListMusic,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Repeat1,
  Save,
  Shuffle,
  SkipForward,
  Trash2,
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
        <ListMusic size={42} strokeWidth={1.6} />
        <h1>Drop YouTube links to start</h1>
        <p>Videos added here stay on this device and play from the selected playlist.</p>
      </div>
    )
  }

  return <div className="player-host" ref={hostRef} />
}

function PlaylistPanel({
  playlists,
  activePlaylist,
  activeItemId,
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
      <div className="panel-top">
        <div className="select-row">
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
          <button type="button" className="icon-button" onClick={onAddPlaylist} title="New playlist">
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onRenamePlaylist}
            title="Rename playlist"
          >
            <Pencil size={17} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            onClick={onDeletePlaylist}
            title="Delete playlist"
            disabled={playlists.length === 1}
          >
            <Trash2 size={17} />
          </button>
        </div>

        <div className="toolbar">
          <button type="button" onClick={onToggleMode} title="Change play mode">
            {playMode === 'shuffle' ? <Shuffle size={17} /> : null}
            {playMode === 'repeat-one' ? <Repeat1 size={17} /> : null}
            {playMode === 'sequence' ? <SkipForward size={17} /> : null}
            <span>{labelForMode(playMode)}</span>
          </button>
          <button type="button" onClick={onToggleSide} title="Move panel">
            {panelSide === 'left' ? <PanelRight size={17} /> : <PanelLeft size={17} />}
          </button>
          <button type="button" onClick={onHide} title="Hide panel">
            <EyeOff size={17} />
          </button>
        </div>
      </div>

      <div className="drop-note">
        <GripVertical size={16} />
        <span>Drop YouTube URLs anywhere</span>
      </div>

      <div className="items" aria-label="Playlist videos">
        {activePlaylist.items.length === 0 ? (
          <div className="empty-list">No videos in this playlist.</div>
        ) : (
          activePlaylist.items.map((item, index) => (
            <div
              className={`playlist-item ${item.id === activeItemId ? 'active' : ''}`}
              key={item.id}
            >
              <button
                type="button"
                className="thumb-button"
                onClick={() => onSelectItem(item.id)}
                title={`Play ${item.title}`}
              >
                <img src={thumbnailUrl(item.videoId)} alt="" loading="lazy" />
                <span>{index + 1}</span>
              </button>
              <input
                aria-label="Video title"
                value={item.title}
                onChange={(event) => onRenameItem(item.id, event.target.value)}
              />
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onDeleteItem(item.id)}
                title="Remove video"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [isDragging, setIsDragging] = useState(false)

  const activePlaylist = useMemo(() => {
    return (
      state.playlists.find((playlist) => playlist.id === state.settings.activePlaylistId) ??
      state.playlists[0]
    )
  }, [state.playlists, state.settings.activePlaylistId])

  const activeItem = useMemo(() => {
    return activePlaylist.items.find((item) => item.id === state.settings.activeItemId) ?? null
  }, [activePlaylist.items, state.settings.activeItemId])

  useEffect(() => {
    saveState(state)
  }, [state])

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
      if (activeItem) {
        player?.loadVideoById(activeItem.videoId)
      }
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

  return (
    <main
      className={`app panel-${state.settings.panelSide} ${
        state.settings.panelHidden ? 'panel-hidden' : ''
      } ${isDragging ? 'dragging' : ''}`}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {!state.settings.panelHidden && state.settings.panelSide === 'left' ? panel : null}

      <section className="stage" aria-label="YouTube player">
        <div className="top-bar">
          <div>
            <strong>{activePlaylist.name}</strong>
            <span>{activePlaylist.items.length} videos</span>
          </div>
          <div className="top-actions">
            <button
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  settings: { ...current.settings, panelHidden: false },
                }))
              }
              title="Show playlist"
              disabled={!state.settings.panelHidden}
            >
              <ListMusic size={18} />
            </button>
            <button type="button" onClick={resetState} title="Reset local data">
              <Save size={18} />
            </button>
          </div>
        </div>

        <Player videoId={activeItem?.videoId ?? null} onEnded={selectNextVideo} />
      </section>

      {!state.settings.panelHidden && state.settings.panelSide === 'right' ? panel : null}

      {isDragging ? <div className="drop-overlay">Drop to add videos</div> : null}
    </main>
  )
}

export default App
