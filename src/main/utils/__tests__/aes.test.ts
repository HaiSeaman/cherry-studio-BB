import * as crypto from 'crypto'

import { describe, expect, it } from 'vitest'

import { decrypt } from '../aes'

const key = '12345678901234567890123456789012' // 32 字节
const iv = '1234567890abcdef1234567890abcdef' // 32 字节 hex（16 字节）
const getIv16 = () => iv.slice(0, 32)

// 用 node crypto 直接加密，验证 decrypt 是它的逆操作
function encryptForTest(text: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(getIv16(), 'hex'))
  return cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
}

describe('aes.decrypt', () => {
  it('decrypts a normal string', () => {
    expect(decrypt(encryptForTest('hello world'), getIv16(), key)).toBe('hello world')
  })

  it('supports unicode and special chars', () => {
    const text = '你好，世界！🌟🚀'
    expect(decrypt(encryptForTest(text), getIv16(), key)).toBe(text)
  })

  it('handles empty string', () => {
    expect(decrypt(encryptForTest(''), getIv16(), key)).toBe('')
  })

  it('handles long string', () => {
    const text = 'a'.repeat(100_000)
    expect(decrypt(encryptForTest(text), getIv16(), key)).toBe(text)
  })

  it('throws for wrong key', () => {
    expect(() => decrypt(encryptForTest('test'), getIv16(), 'wrongkeywrongkeywrongkeywrongkey')).toThrow()
  })

  it('throws for wrong iv', () => {
    expect(() => decrypt(encryptForTest('test'), 'abcdefabcdefabcdefabcdefabcdefab', key)).toThrow()
  })

  it('throws for invalid encrypted data', () => {
    expect(() => decrypt('nothexdata', getIv16(), key)).toThrow()
  })

  it('throws for non-string input', () => {
    // @ts-expect-error purposely pass wrong type to test error branch
    expect(() => decrypt(null, getIv16(), key)).toThrow()
  })
})
