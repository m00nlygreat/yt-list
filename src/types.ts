export type PlayMode = 'sequence' | 'shuffle' | 'repeat-one'

export type PanelSide = 'left' | 'right'

export type PlaylistItem = {
  id: string
  videoId: string
  title: string
  url: string
  addedAt: number
}

export type Playlist = {
  id: string
  name: string
  items: PlaylistItem[]
  createdAt: number
  updatedAt: number
}

export type Settings = {
  activePlaylistId: string
  activeItemId: string | null
  panelSide: PanelSide
  panelHidden: boolean
  playMode: PlayMode
}

export type AppState = {
  playlists: Playlist[]
  settings: Settings
}
