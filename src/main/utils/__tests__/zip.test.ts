import zlib from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { decompress } from '../zip'

const gzip = (str: string) => zlib.gzipSync(Buffer.from(str, 'utf-8'))

describe('zip.decompress', () => {
  it('decompresses a gzipped JSON string', async () => {
    const jsonStr = JSON.stringify({ foo: 'bar', num: 42, arr: [1, 2, 3] })
    expect(await decompress(gzip(jsonStr))).toBe(jsonStr)
  })

  it('handles empty string', async () => {
    expect(await decompress(gzip(''))).toBe('')
  })

  it('handles large string', async () => {
    const largeStr = 'a'.repeat(100_000)
    expect(await decompress(gzip(largeStr))).toBe(largeStr)
  })

  it('throws when decompressing invalid buffer', async () => {
    await expect(decompress(Buffer.from('not a valid gzip', 'utf-8'))).rejects.toThrow()
  })

  it('throws when input is not a buffer', async () => {
    // @ts-expect-error purposely pass wrong type to test error branch
    await expect(decompress(null)).rejects.toThrow()
    // @ts-expect-error purposely pass wrong type to test error branch
    await expect(decompress(undefined)).rejects.toThrow()
    // @ts-expect-error purposely pass wrong type to test error branch
    await expect(decompress('string')).rejects.toThrow()
  })
})
