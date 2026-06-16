import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Copy,
  ExternalLink,
  Pause,
  PanelLeft,
  PanelRight,
  Pencil,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import './App.css'
import { createPlaylist, loadState, makeId, saveState } from './storage'
import type { AppState, PanelSide, PlayMode, Playlist, PlaylistItem } from './types'
import { extractVideoIds, thumbnailUrl, videoUrl } from './youtube'

let youtubeApiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()

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

function SeqIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1.5" width="11" height="1.8" rx="0.9" />
      <rect x="1" y="5.5" width="11" height="1.8" rx="0.9" />
      <rect x="1" y="9.5" width="11" height="1.8" rx="0.9" />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4h2l6 6h2" />
      <path d="M12 4h-2L9 5" />
      <path d="M10 3l2 1-2 1" />
      <path d="M2 10l2-2" />
      <path d="M10 9l2 1-2 1" />
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 7A5 5 0 1 0 7 2" />
      <path d="M7 2L5 4l2 2" />
      <text x="7" y="10" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="currentColor" stroke="none">
        1
      </text>
    </svg>
  )
}

function droppedTextFromDataTransfer(dataTransfer: DataTransfer | null): string {
  return (
    dataTransfer?.getData('text/uri-list') ||
    dataTransfer?.getData('text/plain') ||
    dataTransfer?.getData('text') ||
    ''
  )
}

function droppedText(event: DragEvent<HTMLElement>): string {
  return droppedTextFromDataTransfer(event.dataTransfer)
}

function hasTextDrop(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.types ?? []).some((type) =>
    ['text/uri-list', 'text/plain', 'text'].includes(type),
  )
}

function playbackStartSeconds(item: PlaylistItem): number | undefined {
  if (item.completed) return undefined
  if (typeof item.currentTime !== 'number' || !Number.isFinite(item.currentTime)) return undefined
  if (typeof item.duration === 'number' && item.duration > 0 && item.currentTime >= item.duration - 2) {
    return undefined
  }
  const seconds = Math.max(0, Math.floor(item.currentTime))
  return seconds > 0 ? seconds : undefined
}

function loadPlayerVideo(player: YTPlayer, item: PlaylistItem): void {
  const startSeconds = playbackStartSeconds(item)
  player.loadVideoById(item.videoId, startSeconds)
}

function cuePlayerVideo(player: YTPlayer, item: PlaylistItem): void {
  const startSeconds = playbackStartSeconds(item)
  player.cueVideoById(item.videoId, startSeconds)
}

function progressRatio(item: PlaylistItem): number | null {
  if (item.completed) return 1
  if (typeof item.duration !== 'number' || item.duration <= 0) return null
  if (typeof item.currentTime !== 'number' || item.currentTime <= 0) return null
  return Math.max(0, Math.min(1, item.currentTime / item.duration))
}

function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function embedUrl(item: PlaylistItem): string {
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  })
  const startSeconds = playbackStartSeconds(item)
  if (startSeconds !== undefined) params.set('start', String(startSeconds))

  return `https://www.youtube.com/embed/${item.videoId}?${params.toString()}`
}

function EdgeTrigger({ side, onShow }: { side: PanelSide; onShow: () => void }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  return (
    <button
      ref={triggerRef}
      type="button"
      className={`edge-trigger ${side === 'right' ? 'edge-trigger-r' : 'edge-trigger-l'}`}
      onClick={onShow}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        triggerRef.current?.style.setProperty('--edge-y', `${event.clientY - rect.top}px`)
      }}
      title="패널 열기"
      aria-label="패널 열기"
    />
  )
}

function UrlInputForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
    setValue('')
  }

  return (
    <form className="url-form" onSubmit={handleSubmit}>
      <input
        className="url-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://youtube.com/watch?v=..."
      />
      <button type="submit" className="url-submit">
        추가
      </button>
    </form>
  )
}

function VideoItem({
  video,
  isActive,
  isPlaying,
  iconOnly,
  dropPosition,
  onSelect,
  onDelete,
  onRename,
  onReorderStart,
  onOpenContextMenu,
}: {
  video: PlaylistItem
  isActive: boolean
  isPlaying: boolean
  iconOnly: boolean
  dropPosition: 'before' | 'after' | null
  onSelect: (itemId: string) => void
  onDelete: (itemId: string) => void
  onRename: (itemId: string, title: string) => void
  onReorderStart: (itemId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  onOpenContextMenu: (itemId: string, event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const progress = progressRatio(video)
  const currentLabel =
    typeof video.currentTime === 'number' && video.currentTime > 0 ? formatPlaybackTime(video.currentTime) : null
  const durationLabel =
    typeof video.duration === 'number' && video.duration > 0 ? formatPlaybackTime(video.duration) : null

  function startEdit(event: ReactMouseEvent<HTMLSpanElement>) {
    event.stopPropagation()
    setEditValue(video.title)
    setEditing(true)
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 10)
  }

  function commitEdit() {
    setEditing(false)
    const title = editValue.trim()
    if (title && title !== video.title) onRename(video.id, title)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commitEdit()
    if (event.key === 'Escape') setEditing(false)
  }

  return (
    <div
      className={[
        'vi',
        isActive ? 'vi-active' : '',
        iconOnly ? 'vi-icon-mode' : '',
        dropPosition ? `vi-drop-${dropPosition}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-item-id={video.id}
      onClick={() => onSelect(video.id)}
      onPointerDown={(event) => {
        if (!editing) onReorderStart(video.id, event)
      }}
      onContextMenu={(event) => onOpenContextMenu(video.id, event)}
      title={iconOnly ? video.title : undefined}
    >
      <div className={['vi-thumb', iconOnly ? 'vi-thumb-sq' : ''].filter(Boolean).join(' ')}>
        <img src={thumbnailUrl(video.videoId)} alt="" loading="lazy" draggable="false" />
        {isActive && isPlaying ? (
          <div className="vi-bars">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {isActive && !isPlaying ? <div className="vi-paused">▶</div> : null}
        {currentLabel ? <span className="vi-time-badge vi-time-current">{currentLabel}</span> : null}
        {durationLabel ? <span className="vi-time-badge vi-time-duration">{durationLabel}</span> : null}
        {iconOnly && progress !== null ? (
          <div className="vi-progress vi-progress-thumb" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        ) : null}
      </div>

      {!iconOnly ? (
        <>
          <div className="vi-meta">
            {editing ? (
              <input
                ref={inputRef}
                className="vi-input"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span className="vi-title" onDoubleClick={startEdit}>
                {video.title}
              </span>
            )}
            {progress !== null ? (
              <div className="vi-progress vi-progress-meta" aria-hidden="true">
                <span style={{ transform: `scaleX(${progress})` }} />
              </div>
            ) : null}
          </div>
          <button
            className="vi-del"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(video.id)
            }}
            title="삭제"
          >
            ×
          </button>
        </>
      ) : null}
    </div>
  )
}

function NowPlaying({
  item,
  isPlaying,
  playMode,
  volume,
  iconOnly,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onSetPlayMode,
  onSetVolume,
}: {
  item: PlaylistItem | null
  isPlaying: boolean
  playMode: PlayMode
  volume: number
  iconOnly: boolean
  onTogglePlay: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onSetPlayMode: (mode: PlayMode) => void
  onSetVolume: (volume: number) => void
}) {
  const currentTime = item?.currentTime ?? 0
  const duration = item?.duration ?? 0
  const canSeek = duration > 0
  const seekProgress = canSeek ? Math.max(0, Math.min(1, currentTime / duration)) : 0
  const playModes = [
    { mode: 'sequence' as const, Icon: SeqIcon, title: '순차' },
    { mode: 'shuffle' as const, Icon: ShuffleIcon, title: '셔플' },
    { mode: 'repeat-one' as const, Icon: RepeatIcon, title: '반복' },
  ]
  const currentModeIndex = Math.max(
    0,
    playModes.findIndex((candidate) => candidate.mode === playMode),
  )
  const currentMode = playModes[currentModeIndex]
  const CurrentModeIcon = currentMode.Icon

  function togglePlayMode() {
    onSetPlayMode(playModes[(currentModeIndex + 1) % playModes.length].mode)
  }

  function seekFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canSeek) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = rect.width <= 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }

  return (
    <div className={['now-playing', iconOnly ? 'now-playing-compact' : ''].filter(Boolean).join(' ')}>
      {!iconOnly ? (
        <div className="np-title">{item?.title ?? '재생 중인 영상 없음'}</div>
      ) : null}

      {!iconOnly ? (
        <>
          <div className="np-seek-row">
            <span>{formatPlaybackTime(currentTime)}</span>
            <div
              className={`np-progress ${canSeek ? '' : 'np-progress-disabled'}`}
              role="slider"
              tabIndex={canSeek ? 0 : -1}
              aria-label="재생 위치"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.floor(duration))}
              aria-valuenow={Math.min(Math.floor(currentTime), Math.max(1, Math.floor(duration)))}
              aria-disabled={!canSeek}
              onPointerDown={(event) => {
                if (!canSeek) return
                event.currentTarget.setPointerCapture(event.pointerId)
                seekFromPointer(event)
              }}
              onPointerMove={(event) => {
                if (!canSeek || !event.currentTarget.hasPointerCapture(event.pointerId)) return
                seekFromPointer(event)
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
              onKeyDown={(event) => {
                if (!canSeek) return
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  onSeek(Math.max(0, currentTime - 5))
                }
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  onSeek(Math.min(duration, currentTime + 5))
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  onSeek(0)
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  onSeek(duration)
                }
              }}
            >
              <span className="np-progress-fill" style={{ transform: `translateY(-50%) scaleX(${seekProgress})` }} />
              <span className="np-progress-handle" style={{ left: `${seekProgress * 100}%` }} />
            </div>
            <span>{canSeek ? formatPlaybackTime(duration) : '--:--'}</span>
          </div>

          <div className="np-bottom-row">
            <div className="np-transport">
              <button className="np-btn" type="button" onClick={onPrevious} title="이전">
                <SkipBack size={15} strokeWidth={2.1} />
              </button>
              <button className="np-btn np-play" type="button" onClick={onTogglePlay} title={isPlaying ? '일시정지' : '재생'}>
                {isPlaying ? <Pause size={15} strokeWidth={2.3} /> : <Play size={15} strokeWidth={2.3} />}
              </button>
              <button className="np-btn" type="button" onClick={onNext} title="다음">
                <SkipForward size={15} strokeWidth={2.1} />
              </button>
            </div>
            <button className="mode-btn np-mode-btn active" type="button" onClick={togglePlayMode} title={currentMode.title}>
              <CurrentModeIcon />
            </button>
            <label className="np-volume" title="볼륨">
              <Volume2 size={15} strokeWidth={2} />
              <input
                className="np-range"
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={(event) => onSetVolume(Number(event.currentTarget.value))}
                aria-label="볼륨"
              />
            </label>
          </div>
        </>
      ) : (
        <div className="np-transport">
          <button className="np-btn" type="button" onClick={onPrevious} title="이전">
            <SkipBack size={15} strokeWidth={2.1} />
          </button>
          <button className="np-btn np-play" type="button" onClick={onTogglePlay} title={isPlaying ? '일시정지' : '재생'}>
            {isPlaying ? <Pause size={15} strokeWidth={2.3} /> : <Play size={15} strokeWidth={2.3} />}
          </button>
          <button className="np-btn" type="button" onClick={onNext} title="다음">
            <SkipForward size={15} strokeWidth={2.1} />
          </button>
          <button className="mode-btn np-mode-btn active" type="button" onClick={togglePlayMode} title={currentMode.title}>
            <CurrentModeIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function PlaylistPanel({
  playlists,
  activePlaylist,
  activeItem,
  activeItemId,
  isPlaying,
  playMode,
  volume,
  panelSide,
  panelWidth,
  onAddPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onClearPlaylist,
  onSelectPlaylist,
  onSelectItem,
  onDeleteItem,
  onRenameItem,
  onReorderItem,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onSetPlayMode,
  onSetVolume,
  onToggleSide,
  onHide,
  onResize,
  onAddVideos,
}: {
  playlists: Playlist[]
  activePlaylist: Playlist
  activeItem: PlaylistItem | null
  activeItemId: string | null
  isPlaying: boolean
  playMode: PlayMode
  volume: number
  panelSide: PanelSide
  panelWidth: number
  onAddPlaylist: () => void
  onDeletePlaylist: (playlistId: string) => void
  onRenamePlaylist: (playlistId: string, name: string) => void
  onClearPlaylist: () => void
  onSelectPlaylist: (playlistId: string) => void
  onSelectItem: (itemId: string) => void
  onDeleteItem: (itemId: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onReorderItem: (fromItemId: string, insertIndex: number) => void
  onTogglePlay: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onSetPlayMode: (mode: PlayMode) => void
  onSetVolume: (volume: number) => void
  onToggleSide: () => void
  onHide: () => void
  onResize: (width: number) => void
  onAddVideos: (text: string) => void
}) {
  const iconOnly = panelWidth < 128
  const [showMenu, setShowMenu] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [reorderState, setReorderState] = useState<{
    fromId: string
    insertIndex: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    itemId: string
    x: number
    y: number
  } | null>(null)
  const reorderStateRef = useRef<typeof reorderState>(null)
  const reorderPointerRef = useRef<{
    active: boolean
    fromId: string
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const reorderCleanupRef = useRef<(() => void) | null>(null)
  const suppressSelectUntilRef = useRef(0)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const resizePointerIdRef = useRef<number | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!showMenu) return
    const close = () => setShowMenu(false)
    document.addEventListener('click', close, { once: true })
    return () => document.removeEventListener('click', close)
  }, [showMenu])

  useEffect(() => {
    if (!contextMenu) return

    function closeContextMenu() {
      setContextMenu(null)
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu, true)
    window.addEventListener('resize', closeContextMenu)

    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', closeContextMenu)
      window.removeEventListener('scroll', closeContextMenu, true)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [contextMenu])

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
      reorderCleanupRef.current?.()
    }
  }, [])

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    resizeCleanupRef.current?.()
    startXRef.current = event.clientX
    startWidthRef.current = panelWidth
    resizePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-panel-resizing')

    const handle = event.currentTarget
    const controller = new AbortController()
    const signal = controller.signal

    function finishResize(nativeEvent?: PointerEvent) {
      if (nativeEvent && resizePointerIdRef.current !== nativeEvent.pointerId) return
      if (resizePointerIdRef.current !== null && handle.hasPointerCapture(resizePointerIdRef.current)) {
        handle.releasePointerCapture(resizePointerIdRef.current)
      }
      resizePointerIdRef.current = null
      document.body.classList.remove('is-panel-resizing')
      controller.abort()
      resizeCleanupRef.current = null
    }

    function moveResize(nativeEvent: PointerEvent) {
      if (resizePointerIdRef.current !== nativeEvent.pointerId) return
      if (nativeEvent.buttons === 0) {
        finishResize(nativeEvent)
        return
      }
      const delta =
        panelSide === 'right' ? startXRef.current - nativeEvent.clientX : nativeEvent.clientX - startXRef.current
      const width = Math.max(52, Math.min(window.innerWidth * 0.55, startWidthRef.current + delta))
      onResize(Math.round(width))
      nativeEvent.preventDefault()
    }

    function cancelResize() {
      resizePointerIdRef.current = null
      document.body.classList.remove('is-panel-resizing')
      controller.abort()
      resizeCleanupRef.current = null
    }

    window.addEventListener('pointermove', moveResize, { signal })
    window.addEventListener('pointerup', finishResize, { signal })
    window.addEventListener('pointercancel', finishResize, { signal })
    window.addEventListener('blur', cancelResize, { signal })
    resizeCleanupRef.current = cancelResize
    event.preventDefault()
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    resizeCleanupRef.current?.()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const text = droppedText(event)
    if (text) onAddVideos(text)
  }

  function beginReorder(itemId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (event.target instanceof HTMLElement && event.target.closest('button, input')) return

    reorderCleanupRef.current?.()
    reorderStateRef.current = null
    setReorderState(null)
    reorderPointerRef.current = {
      active: false,
      fromId: itemId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }

    const source = event.currentTarget
    source.setPointerCapture(event.pointerId)
    const controller = new AbortController()
    const signal = controller.signal

    function clearReorder() {
      reorderStateRef.current = null
      reorderPointerRef.current = null
      document.body.classList.remove('is-reordering')
      controller.abort()
      reorderCleanupRef.current = null
      setReorderState(null)
    }

    function finishReorder(nativeEvent?: PointerEvent) {
      const currentPointer = reorderPointerRef.current
      if (!currentPointer) return
      if (nativeEvent && currentPointer.pointerId !== nativeEvent.pointerId) return

      const currentTarget = reorderStateRef.current
      if (currentPointer.active) {
        suppressSelectUntilRef.current = Date.now() + 350
      }
      if (currentPointer.active && currentTarget && currentTarget.fromId === currentPointer.fromId) {
        onReorderItem(currentPointer.fromId, currentTarget.insertIndex)
      }
      if (source.hasPointerCapture(currentPointer.pointerId)) source.releasePointerCapture(currentPointer.pointerId)
      clearReorder()
    }

    function moveReorder(nativeEvent: PointerEvent) {
      const currentPointer = reorderPointerRef.current
      if (!currentPointer || currentPointer.pointerId !== nativeEvent.pointerId) return
      if (nativeEvent.buttons === 0) {
        finishReorder(nativeEvent)
        return
      }

      const moved =
        Math.abs(nativeEvent.clientX - currentPointer.startX) > 4 ||
        Math.abs(nativeEvent.clientY - currentPointer.startY) > 4
      if (!currentPointer.active && !moved) return

      currentPointer.active = true
      document.body.classList.add('is-reordering')
      nativeEvent.preventDefault()

      const target = document
        .elementFromPoint(nativeEvent.clientX, nativeEvent.clientY)
        ?.closest<HTMLElement>('.vi[data-item-id]')
      const toId = target?.dataset.itemId
      if (!target || !toId || toId === currentPointer.fromId) {
        reorderStateRef.current = null
        setReorderState(null)
        return
      }

      const targetIndex = activePlaylist.items.findIndex((item) => item.id === toId)
      if (targetIndex < 0) return

      const rect = target.getBoundingClientRect()
      const insertIndex = nativeEvent.clientY < rect.top + rect.height / 2 ? targetIndex : targetIndex + 1
      const nextState = { fromId: currentPointer.fromId, insertIndex }
      reorderStateRef.current = nextState
      setReorderState((current) =>
        current?.fromId === nextState.fromId && current.insertIndex === nextState.insertIndex
          ? current
          : nextState,
      )
    }

    window.addEventListener('pointermove', moveReorder, { signal })
    window.addEventListener('pointerup', finishReorder, { signal })
    window.addEventListener('pointercancel', finishReorder, { signal })
    window.addEventListener('blur', clearReorder, { signal })
    reorderCleanupRef.current = clearReorder
  }

  function selectItemUnlessReordering(itemId: string) {
    if (Date.now() < suppressSelectUntilRef.current) {
      return
    }
    onSelectItem(itemId)
  }

  function openItemContextMenu(itemId: string, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      itemId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  async function copyContextMenuLink() {
    if (!contextMenu) return
    const item = activePlaylist.items.find((candidate) => candidate.id === contextMenu.itemId)
    if (!item) return

    try {
      await navigator.clipboard.writeText(videoUrl(item.videoId))
    } finally {
      setContextMenu(null)
    }
  }

  function watchContextMenuItemOnYoutube() {
    if (!contextMenu) return
    const item = activePlaylist.items.find((candidate) => candidate.id === contextMenu.itemId)
    if (!item) return

    window.open(videoUrl(item.videoId), '_blank', 'noopener,noreferrer')
    setContextMenu(null)
  }

  function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!urlValue.trim()) return
    onAddVideos(urlValue.trim())
    setUrlValue('')
    setShowUrlInput(false)
  }

  function commitPlaylistRename(playlistId: string) {
    const name = renameValue.trim()
    if (name) onRenamePlaylist(playlistId, name)
    setRenamingId(null)
  }

  function startCurrentPlaylistRename() {
    if (!activePlaylist) return
    const name = window.prompt('플레이리스트 이름', activePlaylist.name)
    if (!name?.trim()) return
    onRenamePlaylist(activePlaylist.id, name.trim())
  }

  return (
    <aside
      className={`panel ${panelSide === 'right' ? 'panel-r' : 'panel-l'}`}
      style={{ width: `${panelWidth}px` }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      <div
        className={`rh ${panelSide === 'right' ? 'rh-l' : 'rh-r'}`}
        onPointerDown={beginResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      />
      <button
        className={`panel-bookmark-close ${panelSide === 'right' ? 'panel-bookmark-close-l' : 'panel-bookmark-close-r'}`}
        type="button"
        onClick={onHide}
        title="패널 닫기"
        aria-label="패널 닫기"
      >
        ×
      </button>

      <div className="panel-hdr">
        <div className="panel-hdr-top">
          {!iconOnly ? (
            <>
              <div className="pl-selector" onClick={(event) => event.stopPropagation()}>
                <button className="pl-btn" type="button" onClick={() => setShowMenu((value) => !value)}>
                  <span className="pl-name">{activePlaylist.name}</span>
                  <span className="pl-arrow">▼</span>
                </button>

                {showMenu ? (
                  <div className="pl-menu">
                    {playlists.map((playlist) => (
                      <div
                        key={playlist.id}
                        className={`pl-menu-item ${playlist.id === activePlaylist.id ? 'cur' : ''}`}
                        onClick={() => {
                          onSelectPlaylist(playlist.id)
                          setShowMenu(false)
                        }}
                      >
                        {renamingId === playlist.id ? (
                          <input
                            className="pl-rename-input"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={() => commitPlaylistRename(playlist.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitPlaylistRename(playlist.id)
                              if (event.key === 'Escape') setRenamingId(null)
                            }}
                            onClick={(event) => event.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="pl-menu-item-name"
                            onDoubleClick={(event) => {
                              event.stopPropagation()
                              setRenamingId(playlist.id)
                              setRenameValue(playlist.name)
                            }}
                          >
                            {playlist.name}
                          </span>
                        )}

                        {playlists.length > 1 ? (
                          <button
                            className="pl-del-btn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              onDeletePlaylist(playlist.id)
                              setShowMenu(false)
                            }}
                          >
                            <X size={13} strokeWidth={2.2} />
                          </button>
                        ) : null}
                      </div>
                    ))}

                    <button
                      className="pl-add-btn"
                      type="button"
                      onClick={() => {
                        onAddPlaylist()
                        setShowMenu(false)
                      }}
                    >
                      <Plus size={13} strokeWidth={2.2} />
                      <span>새 플레이리스트</span>
                    </button>
                  </div>
                ) : null}
              </div>

              <button className="icon-btn rename-icon" type="button" onClick={startCurrentPlaylistRename} title="플레이리스트 이름 변경">
                <Pencil size={18} strokeWidth={2} />
              </button>
              <button className="icon-btn side-icon" type="button" onClick={onToggleSide} title={panelSide === 'right' ? '왼쪽으로' : '오른쪽으로'}>
                {panelSide === 'right' ? <PanelLeft size={19} strokeWidth={2} /> : <PanelRight size={19} strokeWidth={2} />}
              </button>
            </>
          ) : null}

          <button className="icon-btn clear-icon" type="button" onClick={onClearPlaylist} title="플레이리스트 비우기">
            <Trash2 size={19} strokeWidth={2} />
          </button>
        </div>

        {!iconOnly ? <div className="panel-hdr-count"><span className="panel-count">{activePlaylist.items.length}개</span></div> : null}
      </div>

      {showUrlInput && !iconOnly ? (
        <form className="panel-url-row" onSubmit={submitUrl}>
          <input
            className="panel-url-input"
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
            placeholder="YouTube URL 또는 영상 ID..."
            autoFocus
          />
          <button type="submit" className="panel-url-btn">
            추가
          </button>
        </form>
      ) : null}

      <div className="panel-body">
        {activePlaylist.items.length === 0 ? (
          <div className="panel-empty">
            {!iconOnly ? (
              <>
                <div className="panel-empty-arrow">↓</div>
                <div>
                  URL을 드롭하거나
                  <br />+ 버튼으로 추가하세요
                </div>
              </>
            ) : null}
          </div>
        ) : (
          activePlaylist.items.map((video, index) => (
            <VideoItem
              key={video.id}
              video={video}
              isActive={video.id === activeItemId}
              isPlaying={video.id === activeItemId && isPlaying}
              dropPosition={
                reorderState?.insertIndex === index && reorderState.fromId !== video.id
                  ? 'before'
                  : reorderState?.insertIndex === activePlaylist.items.length &&
                      index === activePlaylist.items.length - 1 &&
                      reorderState.fromId !== video.id
                    ? 'after'
                    : null
              }
              onSelect={selectItemUnlessReordering}
              onDelete={onDeleteItem}
              onRename={onRenameItem}
              onReorderStart={beginReorder}
              onOpenContextMenu={openItemContextMenu}
              iconOnly={iconOnly}
            />
          ))
        )}
      </div>

      {contextMenu ? (
        <div
          className="vi-context-menu"
          style={{
            left: `${Math.min(contextMenu.x, window.innerWidth - 180)}px`,
            top: `${Math.min(contextMenu.y, window.innerHeight - 76)}px`,
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="vi-context-menu-item" onClick={copyContextMenuLink}>
            <Copy size={13} strokeWidth={2} />
            <span>Copy link</span>
          </button>
          <button type="button" className="vi-context-menu-item" onClick={watchContextMenuItemOnYoutube}>
            <ExternalLink size={13} strokeWidth={2} />
            <span>Watch on youtube</span>
          </button>
        </div>
      ) : null}

      <NowPlaying
        item={activeItem}
        isPlaying={isPlaying}
        playMode={playMode}
        volume={volume}
        iconOnly={iconOnly}
        onTogglePlay={onTogglePlay}
        onPrevious={onPrevious}
        onNext={onNext}
        onSeek={onSeek}
        onSetPlayMode={onSetPlayMode}
        onSetVolume={onSetVolume}
      />
    </aside>
  )
}

async function fetchVideoTitle(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(videoId))}&format=json`,
    )
    if (!response.ok) return null
    const data = (await response.json()) as { title?: string }
    return data.title ?? null
  } catch {
    return null
  }
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [isDragging, setIsDragging] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [iframeControlMode, setIframeControlMode] = useState(false)
  const [volume, setVolume] = useState(100)
  const [addToast, setAddToast] = useState<{
    id: number
    side: PanelSide
    videoId: string
    title: string
  } | null>(null)
  const playerAreaRef = useRef<HTMLElement | null>(null)
  const playerHostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const stateRef = useRef(state)
  const shouldPlayRef = useRef(false)
  const dragCountRef = useRef(0)
  const toastTimerRef = useRef<number | null>(null)
  const playerClickTimerRef = useRef<number | null>(null)
  const middleShortcutHandledRef = useRef(false)

  const updateItemPlayback = useCallback(
    (itemId: string, currentTime: number, duration: number, completed: boolean) => {
      const roundedTime = Math.max(0, Math.floor(currentTime))
      const roundedDuration = Math.max(0, Math.floor(duration))

      setState((current) => {
        let changed = false
        const playlists = current.playlists.map((playlist) => {
          let playlistChanged = false
          const items = playlist.items.map((item) => {
            if (item.id !== itemId) return item

            const nextCompleted = completed || (roundedDuration > 0 && roundedTime >= roundedDuration - 1)
            if (
              item.currentTime === roundedTime &&
              item.duration === roundedDuration &&
              Boolean(item.completed) === nextCompleted
            ) {
              return item
            }

            changed = true
            playlistChanged = true
            return {
              ...item,
              currentTime: roundedTime,
              duration: roundedDuration,
              completed: nextCompleted,
            }
          })

          return playlistChanged ? { ...playlist, items } : playlist
        })

        return changed ? { ...current, playlists } : current
      })
    },
    [],
  )

  const readAndSaveActivePlayback = useCallback(
    (player: YTPlayer) => {
      const itemId = stateRef.current.settings.activeItemId
      if (!itemId) return

      const currentTime = player.getCurrentTime()
      const duration = player.getDuration()
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return

      updateItemPlayback(itemId, currentTime, duration, false)
    },
    [updateItemPlayback],
  )

  const markActiveItemCompleted = useCallback(
    (player: YTPlayer) => {
      const itemId = stateRef.current.settings.activeItemId
      if (!itemId) return

      const duration = player.getDuration()
      const fallbackTime = player.getCurrentTime()
      const completedAt = Number.isFinite(duration) && duration > 0 ? duration : fallbackTime
      if (!Number.isFinite(completedAt) || completedAt <= 0) return

      updateItemPlayback(itemId, completedAt, completedAt, true)
    },
    [updateItemPlayback],
  )

  const activePlaylist = useMemo(() => {
    return (
      state.playlists.find((playlist) => playlist.id === state.settings.activePlaylistId) ??
      state.playlists[0]
    )
  }, [state.playlists, state.settings.activePlaylistId])

  const activeItem = useMemo(() => {
    return activePlaylist.items.find((item) => item.id === state.settings.activeItemId) ?? null
  }, [activePlaylist.items, state.settings.activeItemId])
  const activeItemId = state.settings.activeItemId

  useEffect(() => {
    stateRef.current = state
    saveState(state)
  }, [state])

  const selectNextVideo = useCallback(
    (player?: YTPlayer, respectRepeatMode = false) => {
      const current = stateRef.current
      const playlist =
        current.playlists.find((candidate) => candidate.id === current.settings.activePlaylistId) ??
        current.playlists[0]
      if (!playlist || playlist.items.length === 0) return

      const currentIndex = playlist.items.findIndex((item) => item.id === current.settings.activeItemId)

      if (respectRepeatMode && current.settings.playMode === 'repeat-one') {
        player?.seekTo?.(0)
        player?.playVideo()
        return
      }

      let nextItem = playlist.items[(currentIndex + 1) % playlist.items.length]
      if (current.settings.playMode === 'shuffle' && playlist.items.length > 1) {
        const candidates = playlist.items.filter((_, index) => index !== currentIndex)
        nextItem = candidates[Math.floor(Math.random() * candidates.length)]
      }

      shouldPlayRef.current = true
      setState((previous) => ({
        ...previous,
        settings: { ...previous.settings, activeItemId: nextItem.id },
      }))
    },
    [],
  )

  const selectPreviousVideo = useCallback(() => {
    const current = stateRef.current
    const playlist =
      current.playlists.find((candidate) => candidate.id === current.settings.activePlaylistId) ??
      current.playlists[0]
    if (!playlist || playlist.items.length === 0) return

    const currentIndex = playlist.items.findIndex((item) => item.id === current.settings.activeItemId)
    const previousIndex = currentIndex <= 0 ? playlist.items.length - 1 : currentIndex - 1
    shouldPlayRef.current = true
    setState((previous) => ({
      ...previous,
      settings: { ...previous.settings, activeItemId: playlist.items[previousIndex].id },
    }))
  }, [])

  const playActiveOrFirst = useCallback(() => {
    const current = stateRef.current
    const playlist =
      current.playlists.find((candidate) => candidate.id === current.settings.activePlaylistId) ??
      current.playlists[0]
    const activeId = current.settings.activeItemId ?? playlist?.items[0]?.id
    if (!activeId) return

    if (activeId !== current.settings.activeItemId) {
      shouldPlayRef.current = true
      setState((previous) => ({
        ...previous,
        settings: { ...previous.settings, activeItemId: activeId },
      }))
      return
    }

    playerRef.current?.playVideo()
  }, [])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.pauseVideo?.()
      return
    }
    playActiveOrFirst()
  }, [isPlaying, playActiveOrFirst])

  const seekActiveBy = useCallback(
    (deltaSeconds: number) => {
      const player = playerRef.current
      if (!player) return
      const currentTime = player.getCurrentTime()
      const duration = player.getDuration()
      if (!Number.isFinite(currentTime)) return
      const upperBound = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
      const nextTime = Math.max(0, Math.min(upperBound, currentTime + deltaSeconds))
      player.seekTo?.(nextTime)
      readAndSaveActivePlayback(player)
    },
    [readAndSaveActivePlayback],
  )

  const seekActiveTo = useCallback(
    (seconds: number) => {
      const player = playerRef.current
      if (!player || !Number.isFinite(seconds)) return
      player.seekTo?.(Math.max(0, seconds))
      readAndSaveActivePlayback(player)
    },
    [readAndSaveActivePlayback],
  )

  const setPlayerVolume = useCallback((nextVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, Math.round(nextVolume)))
    setVolume(clampedVolume)
    playerRef.current?.setVolume?.(clampedVolume)
  }, [])

  const copyActiveVideoLink = useCallback(async () => {
    const current = stateRef.current
    const playlist =
      current.playlists.find((candidate) => candidate.id === current.settings.activePlaylistId) ??
      current.playlists[0]
    const item = playlist?.items.find((candidate) => candidate.id === current.settings.activeItemId)
    if (!item) return
    await navigator.clipboard.writeText(videoUrl(item.videoId))
  }, [])

  const togglePanelHidden = useCallback(() => {
    setState((current) => ({
      ...current,
      settings: { ...current.settings, panelHidden: !current.settings.panelHidden },
    }))
  }, [])

  const showPanelHiddenToast = useCallback((item: PlaylistItem, side: PanelSide) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setAddToast({ id: Date.now(), side, videoId: item.videoId, title: item.title })
    toastTimerRef.current = window.setTimeout(() => {
      setAddToast(null)
      toastTimerRef.current = null
    }, 2000)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player || playerRef.current) return

      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId: '',
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            setPlayerReady(true)
            setVolume(playerRef.current?.getVolume?.() ?? 100)
          },
          onStateChange: (event) => {
            setIsPlaying(event.data === window.YT?.PlayerState.PLAYING)
            if (
              event.data === window.YT?.PlayerState.PAUSED ||
              event.data === window.YT?.PlayerState.BUFFERING ||
              event.data === window.YT?.PlayerState.CUED
            ) {
              readAndSaveActivePlayback(event.target)
            }
            if (event.data === window.YT?.PlayerState.ENDED) {
              markActiveItemCompleted(event.target)
              selectNextVideo(event.target, true)
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
      setPlayerReady(false)
    }
  }, [markActiveItemCompleted, readAndSaveActivePlayback, selectNextVideo])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
      if (playerClickTimerRef.current !== null) window.clearTimeout(playerClickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setIframeControlMode(false)
  }, [activeItemId])

  useEffect(() => {
    if (!iframeControlMode) return

    setState((current) => {
      if (!current.settings.panelHidden) return current
      return { ...current, settings: { ...current.settings, panelHidden: false } }
    })
  }, [iframeControlMode])

  useEffect(() => {
    if (!iframeControlMode) return

    function exitIframeControlMode(event: globalThis.MouseEvent) {
      const target = event.target
      if (target instanceof Node && playerAreaRef.current?.contains(target)) return
      setIframeControlMode(false)
    }

    window.addEventListener('mousedown', exitIframeControlMode, true)
    return () => window.removeEventListener('mousedown', exitIframeControlMode, true)
  }, [iframeControlMode])

  useEffect(() => {
    if (!isPlaying || !activeItemId) return

    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      readAndSaveActivePlayback(player)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [activeItemId, isPlaying, readAndSaveActivePlayback])

  useEffect(() => {
    if (!activeItemId) {
      playerRef.current?.stopVideo?.()
      return
    }

    if (!playerReady || !playerRef.current) return
    const current = stateRef.current
    const playlist =
      current.playlists.find((candidate) => candidate.id === current.settings.activePlaylistId) ??
      current.playlists[0]
    const item = playlist?.items.find((candidate) => candidate.id === activeItemId)
    if (!item) return

    if (shouldPlayRef.current) {
      shouldPlayRef.current = false
      loadPlayerVideo(playerRef.current, item)
      return
    }

    cuePlayerVideo(playerRef.current, item)
  }, [activeItemId, playerReady])

  const addVideosFromText = useCallback((text: string) => {
    const ids = extractVideoIds(text)
    if (ids.length === 0) return

    const current = stateRef.current
    const activePlaylistId = current.settings.activePlaylistId
    const existingIds = new Set(
      current.playlists
        .find((playlist) => playlist.id === activePlaylistId)
        ?.items.map((item) => item.videoId) ?? [],
    )
    const newIds = ids.filter((videoId) => !existingIds.has(videoId))
    if (newIds.length === 0) {
      const existingItem = current.playlists
        .find((playlist) => playlist.id === activePlaylistId)
        ?.items.find((item) => ids.includes(item.videoId))
      if (current.settings.panelHidden && existingItem) showPanelHiddenToast(existingItem, current.settings.panelSide)
      return
    }

    const newItems: PlaylistItem[] = newIds.map((videoId) => ({
      id: makeId('item'),
      videoId,
      title: videoId,
      url: videoUrl(videoId),
      addedAt: Date.now(),
    }))

    setState((previous) => {
      const playlist = previous.playlists.find((candidate) => candidate.id === previous.settings.activePlaylistId)
      const shouldSelectFirst = !playlist || (playlist.items.length === 0 && !previous.settings.activeItemId)
      if (shouldSelectFirst) shouldPlayRef.current = true

      return {
        ...previous,
        playlists: previous.playlists.map((candidate) =>
          candidate.id === previous.settings.activePlaylistId
            ? { ...candidate, items: [...candidate.items, ...newItems], updatedAt: Date.now() }
            : candidate,
        ),
        settings: {
          ...previous.settings,
          panelHidden: previous.settings.panelHidden,
          activeItemId: shouldSelectFirst ? newItems[0].id : previous.settings.activeItemId,
        },
      }
    })

    if (current.settings.panelHidden) showPanelHiddenToast(newItems[0], current.settings.panelSide)

    for (const item of newItems) {
      fetchVideoTitle(item.videoId).then((title) => {
        if (!title) return
        setAddToast((toast) => (toast?.videoId === item.videoId ? { ...toast, title } : toast))
        setState((previous) => ({
          ...previous,
          playlists: previous.playlists.map((playlist) =>
            playlist.id === activePlaylistId
              ? {
                  ...playlist,
                  items: playlist.items.map((candidate) =>
                    candidate.id === item.id ? { ...candidate, title } : candidate,
                  ),
                  updatedAt: Date.now(),
                }
              : playlist,
          ),
        }))
      })
    }
  }, [showPanelHiddenToast])

  useEffect(() => {
    function isAppTextDragEvent(event: globalThis.DragEvent) {
      if (!hasTextDrop(event.dataTransfer)) return false

      const target = event.target
      if (!(target instanceof Element)) return true

      return Boolean(target.closest('.app')) || target === document.documentElement || target === document.body
    }

    function handleWindowDragEnter(event: globalThis.DragEvent) {
      if (!isAppTextDragEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragCountRef.current += 1
      setIsDragging(true)
    }

    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (!isAppTextDragEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    function handleWindowDrop(event: globalThis.DragEvent) {
      if (!isAppTextDragEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragCountRef.current = 0
      setIsDragging(false)
      const text = droppedTextFromDataTransfer(event.dataTransfer)
      if (text) addVideosFromText(text)
    }

    function handleWindowDragLeave(event: globalThis.DragEvent) {
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        dragCountRef.current = 0
        setIsDragging(false)
      }
    }

    window.addEventListener('dragenter', handleWindowDragEnter, true)
    window.addEventListener('dragover', handleWindowDragOver, true)
    window.addEventListener('drop', handleWindowDrop, true)
    window.addEventListener('dragleave', handleWindowDragLeave, true)

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter, true)
      window.removeEventListener('dragover', handleWindowDragOver, true)
      window.removeEventListener('drop', handleWindowDrop, true)
      window.removeEventListener('dragleave', handleWindowDragLeave, true)
    }
  }, [addVideosFromText])

  useEffect(() => {
    async function handlePasteShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return
      if (event.altKey || event.shiftKey) return

      if (isEditableTarget(event.target)) return

      try {
        const text = await navigator.clipboard.readText()
        if (extractVideoIds(text).length === 0) return
        event.preventDefault()
        addVideosFromText(text)
      } catch {
        // Clipboard read can be denied by the browser; keep the default paste behavior in that case.
      }
    }

    window.addEventListener('keydown', handlePasteShortcut)
    return () => window.removeEventListener('keydown', handlePasteShortcut)
  }, [addVideosFromText])

  useEffect(() => {
    function handleGlobalShortcut(event: globalThis.KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      if (event.altKey || event.metaKey) return

      const key = event.key.toLowerCase()
      const hasCtrl = event.ctrlKey

      if (hasCtrl && key === 'c') {
        event.preventDefault()
        copyActiveVideoLink()
        return
      }

      if (event.ctrlKey || event.shiftKey) return

      if (event.key === 'ArrowLeft' || key === 'z') {
        event.preventDefault()
        seekActiveBy(-10)
        return
      }
      if (event.key === 'ArrowRight' || key === 'x') {
        event.preventDefault()
        seekActiveBy(10)
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayback()
        return
      }
      if (key === 'q') {
        event.preventDefault()
        togglePanelHidden()
        return
      }
      if (key === 's') {
        event.preventDefault()
        selectNextVideo(playerRef.current ?? undefined)
        return
      }
      if (key === 'a') {
        event.preventDefault()
        selectPreviousVideo()
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut)
    return () => window.removeEventListener('keydown', handleGlobalShortcut)
  }, [copyActiveVideoLink, seekActiveBy, selectNextVideo, selectPreviousVideo, togglePanelHidden, togglePlayback])

  useEffect(() => {
    function isMiddleClick(event: globalThis.MouseEvent) {
      return event.button === 1
    }

    function handleMiddleMouseDown(event: globalThis.MouseEvent) {
      if (!isMiddleClick(event)) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      middleShortcutHandledRef.current = true
      togglePanelHidden()
    }

    function handleMiddleAuxClick(event: globalThis.MouseEvent) {
      if (!isMiddleClick(event)) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      if (!middleShortcutHandledRef.current) {
        togglePanelHidden()
      }
      middleShortcutHandledRef.current = false
    }

    window.addEventListener('mousedown', handleMiddleMouseDown, true)
    window.addEventListener('auxclick', handleMiddleAuxClick, true)
    return () => {
      window.removeEventListener('mousedown', handleMiddleMouseDown, true)
      window.removeEventListener('auxclick', handleMiddleAuxClick, true)
    }
  }, [togglePanelHidden])

  function updateActivePlaylist(updater: (playlist: Playlist) => Playlist) {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) =>
        playlist.id === current.settings.activePlaylistId ? updater(playlist) : playlist,
      ),
    }))
  }

  function addPlaylist() {
    const playlist = createPlaylist(`플레이리스트 ${stateRef.current.playlists.length + 1}`)
    setState((current) => ({
      ...current,
      playlists: [...current.playlists, playlist],
      settings: { ...current.settings, activePlaylistId: playlist.id, activeItemId: null },
    }))
  }

  function renamePlaylist(playlistId: string, name: string) {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, name, updatedAt: Date.now() } : playlist,
      ),
    }))
  }

  function deletePlaylist(playlistId: string) {
    setState((current) => {
      if (current.playlists.length === 1) return current
      const playlists = current.playlists.filter((playlist) => playlist.id !== playlistId)
      const nextPlaylist = playlists[0]

      return {
        ...current,
        playlists,
        settings:
          current.settings.activePlaylistId === playlistId
            ? {
                ...current.settings,
                activePlaylistId: nextPlaylist.id,
                activeItemId: nextPlaylist.items[0]?.id ?? null,
              }
            : current.settings,
      }
    })
  }

  function selectPlaylist(playlistId: string) {
    setIsPlaying(false)
    setState((current) => ({
      ...current,
      settings: { ...current.settings, activePlaylistId: playlistId, activeItemId: null },
    }))
  }

  function selectItem(itemId: string) {
    const selectedItem = activePlaylist.items.find((item) => item.id === itemId)
    if (itemId === stateRef.current.settings.activeItemId && selectedItem) {
      shouldPlayRef.current = false
      if (playerRef.current) loadPlayerVideo(playerRef.current, selectedItem)
      playerRef.current?.playVideo()
      return
    }

    shouldPlayRef.current = true
    setState((current) => ({
      ...current,
      settings: { ...current.settings, activeItemId: itemId },
    }))
  }

  function deleteItem(itemId: string) {
    updateActivePlaylist((playlist) => ({
      ...playlist,
      items: playlist.items.filter((item) => item.id !== itemId),
      updatedAt: Date.now(),
    }))

    if (itemId === stateRef.current.settings.activeItemId) {
      setIsPlaying(false)
      setState((current) => ({
        ...current,
        settings: { ...current.settings, activeItemId: null },
      }))
    }
  }

  function clearPlaylist() {
    if (activePlaylist.items.length === 0) return
    const confirmed = window.confirm(`"${activePlaylist.name}" 플레이리스트를 비울까요?`)
    if (!confirmed) return

    setIsPlaying(false)
    updateActivePlaylist((playlist) => ({
      ...playlist,
      items: [],
      updatedAt: Date.now(),
    }))
    setState((current) => ({
      ...current,
      settings: { ...current.settings, activeItemId: null },
    }))
  }

  function renameItem(itemId: string, title: string) {
    updateActivePlaylist((playlist) => ({
      ...playlist,
      items: playlist.items.map((item) => (item.id === itemId ? { ...item, title } : item)),
      updatedAt: Date.now(),
    }))
  }

  function reorderItem(fromItemId: string, insertIndex: number) {
    updateActivePlaylist((playlist) => {
      const fromIndex = playlist.items.findIndex((item) => item.id === fromItemId)
      if (fromIndex < 0) return playlist

      const clampedInsertIndex = Math.max(0, Math.min(playlist.items.length, insertIndex))
      if (clampedInsertIndex === fromIndex || clampedInsertIndex === fromIndex + 1) return playlist

      const items = [...playlist.items]
      const [movingItem] = items.splice(fromIndex, 1)
      const adjustedInsertIndex = clampedInsertIndex > fromIndex ? clampedInsertIndex - 1 : clampedInsertIndex

      items.splice(adjustedInsertIndex, 0, movingItem)

      return {
        ...playlist,
        items,
        updatedAt: Date.now(),
      }
    })
  }

  function setPanelSide(panelSide: PanelSide) {
    setState((current) => ({ ...current, settings: { ...current.settings, panelSide } }))
  }

  function setPanelWidth(panelWidth: number) {
    setState((current) => ({ ...current, settings: { ...current.settings, panelWidth } }))
  }

  function handleDragEnter() {
    dragCountRef.current += 1
    setIsDragging(true)
  }

  function handleDragLeave() {
    dragCountRef.current -= 1
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setIsDragging(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    dragCountRef.current = 0
    setIsDragging(false)
    const text = droppedText(event)
    if (text) addVideosFromText(text)
  }

  function clearPlayerClickTimer() {
    if (playerClickTimerRef.current === null) return
    window.clearTimeout(playerClickTimerRef.current)
    playerClickTimerRef.current = null
  }

  function enterIframeControlMode() {
    setIframeControlMode(true)
    window.setTimeout(() => {
      const iframe = playerAreaRef.current?.querySelector('iframe')
      iframe?.focus()
    }, 0)
  }

  function handlePlayerOverlayMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.currentTarget.focus({ preventScroll: true })
    if (event.button === 0) event.preventDefault()
  }

  function handlePlayerOverlayClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    if (event.detail > 1) {
      clearPlayerClickTimer()
      return
    }

    clearPlayerClickTimer()
    playerClickTimerRef.current = window.setTimeout(() => {
      togglePlayback()
      playerClickTimerRef.current = null
    }, 180)
  }

  function handlePlayerOverlayDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    clearPlayerClickTimer()
    enterIframeControlMode()
  }

  const panel = !state.settings.panelHidden ? (
    <PlaylistPanel
      playlists={state.playlists}
      activePlaylist={activePlaylist}
      activeItem={activeItem}
      activeItemId={state.settings.activeItemId}
      isPlaying={isPlaying}
      playMode={state.settings.playMode}
      volume={volume}
      panelSide={state.settings.panelSide}
      panelWidth={state.settings.panelWidth}
      onAddPlaylist={addPlaylist}
      onDeletePlaylist={deletePlaylist}
      onRenamePlaylist={renamePlaylist}
      onClearPlaylist={clearPlaylist}
      onSelectPlaylist={selectPlaylist}
      onSelectItem={selectItem}
      onDeleteItem={deleteItem}
      onRenameItem={renameItem}
      onReorderItem={reorderItem}
      onTogglePlay={togglePlayback}
      onPrevious={selectPreviousVideo}
      onNext={() => selectNextVideo(playerRef.current ?? undefined)}
      onSeek={seekActiveTo}
      onSetPlayMode={(playMode) => setState((current) => ({ ...current, settings: { ...current.settings, playMode } }))}
      onSetVolume={setPlayerVolume}
      onToggleSide={() => setPanelSide(state.settings.panelSide === 'left' ? 'right' : 'left')}
      onHide={() => setState((current) => ({ ...current, settings: { ...current.settings, panelHidden: true } }))}
      onResize={setPanelWidth}
      onAddVideos={addVideosFromText}
    />
  ) : null

  return (
    <main
      className={`app ${isDragging ? 'app-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      {state.settings.panelHidden ? (
        <EdgeTrigger
          side={state.settings.panelSide}
          onShow={() => setState((current) => ({ ...current, settings: { ...current.settings, panelHidden: false } }))}
        />
      ) : null}

      {addToast ? (
        <div className={`add-toast add-toast-${addToast.side}`} key={addToast.id}>
          <img className="add-toast-thumb" src={thumbnailUrl(addToast.videoId)} alt="" />
          <div className="add-toast-title">{addToast.title}</div>
        </div>
      ) : null}

      <div className="main-content">
        {state.settings.panelSide === 'left' ? panel : null}

        <section
          ref={playerAreaRef}
          className={`player-area ${iframeControlMode ? 'iframe-control-mode' : ''}`}
          aria-label="YouTube player"
        >
          <div className="yt-wrapper">
            <div ref={playerHostRef} className="yt-api-host" />
            {activeItem && !playerReady ? (
              <iframe
                className="fallback-player"
                src={embedUrl(activeItem)}
                title={activeItem.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : null}
          </div>

          {activeItem && !iframeControlMode ? (
            <div
              className="player-shortcut-layer"
              tabIndex={-1}
              onMouseDown={handlePlayerOverlayMouseDown}
              onClick={handlePlayerOverlayClick}
              onDoubleClick={handlePlayerOverlayDoubleClick}
              aria-label="플레이어 단축키 영역"
            />
          ) : null}

          {!activeItem ? (
            <div className={`drop-overlay ${isDragging ? 'drag-active' : ''}`}>
              <div className="drop-icon">▶</div>
              <p className="drop-hint-text">
                YouTube URL을 여기에 드롭하거나
                <br />
                아래에 붙여넣기하세요
              </p>
              <UrlInputForm onSubmit={addVideosFromText} />
            </div>
          ) : null}

          {isDragging && activeItem ? <div className="drag-indicator">URL 드롭해서 추가</div> : null}
          {isDragging && activeItem ? <div className="player-drop-catcher" aria-hidden="true" /> : null}
        </section>

        {state.settings.panelSide === 'right' ? panel : null}
      </div>
    </main>
  )
}

export default App
