import type { AppState, Playlist } from './types'

const STORAGE_KEY = 'yt-list:v1'

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createPlaylist(name = 'My Playlist'): Playlist {
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

  return {
    playlists: [playlist],
    settings: {
      activePlaylistId: playlist.id,
      activeItemId: null,
      panelSide: 'right',
      panelHidden: false,
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

    const activePlaylist = parsed.playlists.find(
      (playlist) => playlist.id === parsed.settings?.activePlaylistId,
    )

    return {
      playlists: parsed.playlists,
      settings: {
        activePlaylistId: activePlaylist?.id ?? parsed.playlists[0].id,
        activeItemId: parsed.settings?.activeItemId ?? null,
        panelSide: parsed.settings?.panelSide === 'left' ? 'left' : 'right',
        panelHidden: Boolean(parsed.settings?.panelHidden),
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
