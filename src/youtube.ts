const VIDEO_ID_LENGTH = 11

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?[^ \n\r\t#]*v=)([a-zA-Z0-9_-]{11})/g,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/g,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/g,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/g,
]

export function extractVideoIds(input: string): string[] {
  const matches: Array<{ videoId: string; index: number }> = []
  const seen = new Set<string>()

  for (const pattern of YOUTUBE_PATTERNS) {
    for (const match of input.matchAll(pattern)) {
      const videoId = match[1]
      if (!seen.has(videoId)) {
        seen.add(videoId)
        matches.push({ videoId, index: match.index ?? 0 })
      }
    }
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    const videoId = input.trim()
    if (!seen.has(videoId)) {
      matches.push({ videoId, index: 0 })
    }
  }

  return matches.sort((a, b) => a.index - b.index).map((match) => match.videoId)
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export function isLikelyVideoId(value: string): boolean {
  return value.length === VIDEO_ID_LENGTH && /^[a-zA-Z0-9_-]+$/.test(value)
}
