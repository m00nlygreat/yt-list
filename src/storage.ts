import type { AppState, Playlist } from './types'

const STORAGE_KEY = 'yt-list:v1'

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createPlaylist(name = '기본'): Playlist {
  const now = Date.now()

  return {
    id: createId('playlist'),
    name,
    items: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createInitialState(): AppState {
  const playlist = createPlaylist()
  const fallbackWidth =
    typeof window === 'undefined' ? 260 : Math.max(180, Math.round(window.innerWidth * 0.16))

  return {
    playlists: [playlist],
    settings: {
      activePlaylistId: playlist.id,
      activeItemId: null,
      panelSide: 'right',
      panelHidden: false,
      panelWidth: fallbackWidth,
      playMode: 'sequence',
    },
  }
}

export function loadState(): AppState {
  const fallback = createInitialState()
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return fallback
  }

  try {
    const parsed = JSON.parse(raw) as AppState

    if (!Array.isArray(parsed.playlists) || parsed.playlists.length === 0) {
      return fallback
    }

    const playlists = parsed.playlists.map((playlist) =>
      playlist.name === 'My Playlist' && playlist.items.length === 0 ? { ...playlist, name: '기본' } : playlist,
    )
    const activePlaylist = playlists.find(
      (playlist) => playlist.id === parsed.settings?.activePlaylistId,
    )

    return {
      playlists,
      settings: {
        activePlaylistId: activePlaylist?.id ?? playlists[0].id,
        activeItemId: parsed.settings?.activeItemId ?? null,
        panelSide: parsed.settings?.panelSide === 'left' ? 'left' : 'right',
        panelHidden: Boolean(parsed.settings?.panelHidden),
        panelWidth:
          typeof parsed.settings?.panelWidth === 'number'
            ? Math.max(52, parsed.settings.panelWidth)
            : fallback.settings.panelWidth,
        playMode: parsed.settings?.playMode ?? 'sequence',
      },
    }
  } catch {
    return fallback
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function makeId(prefix: string): string {
  return createId(prefix)
}
