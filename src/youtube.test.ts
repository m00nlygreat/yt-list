import { describe, expect, it } from 'vitest'
import { extractVideoIds } from './youtube'

describe('extractVideoIds', () => {
  it('extracts watch, short, shorts, and embed URLs', () => {
    const ids = extractVideoIds(`
      https://www.youtube.com/watch?v=dQw4w9WgXcQ
      https://youtu.be/oHg5SJYRHA0
      https://www.youtube.com/shorts/aqz-KE-bpKQ
      https://www.youtube.com/embed/ScMzIvxBSi4
    `)

    expect(ids).toEqual(['dQw4w9WgXcQ', 'oHg5SJYRHA0', 'aqz-KE-bpKQ', 'ScMzIvxBSi4'])
  })

  it('extracts a bare video id', () => {
    expect(extractVideoIds('dQw4w9WgXcQ')).toEqual(['dQw4w9WgXcQ'])
  })

  it('deduplicates and ignores invalid text', () => {
    const ids = extractVideoIds(`
      not youtube
      https://www.youtube.com/watch?v=dQw4w9WgXcQ
      https://youtu.be/dQw4w9WgXcQ
      https://example.com/watch?v=abcdefghijk
    `)

    expect(ids).toEqual(['dQw4w9WgXcQ'])
  })
})
