export {}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId?: string
          width?: string
          height?: string
          playerVars?: Record<string, number | string>
          events?: {
            onReady?: (event: { target: YTPlayer }) => void
            onStateChange?: (event: { data: number; target: YTPlayer }) => void
          }
        },
      ) => YTPlayer
      PlayerState: {
        ENDED: number
        PLAYING: number
        PAUSED: number
        BUFFERING: number
        CUED: number
      }
    }
    onYouTubeIframeAPIReady?: () => void
  }

  interface YTPlayer {
    destroy: () => void
    loadVideoById: (videoId: string) => void
    cueVideoById: (videoId: string) => void
    playVideo: () => void
  }
}
