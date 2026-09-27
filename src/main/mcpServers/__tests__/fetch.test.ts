import { describe, expect, it } from 'vitest'

import { assertSafeFetchUrl, isBlockedIp } from '../fetch'

describe('isBlockedIp', () => {
  it('should block IPv4 loopback / private / link-local / CGNAT ranges', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true)
    expect(isBlockedIp('127.255.255.254')).toBe(true)
    expect(isBlockedIp('10.0.0.1')).toBe(true)
    expect(isBlockedIp('172.16.0.1')).toBe(true)
    expect(isBlockedIp('172.31.255.255')).toBe(true)
    expect(isBlockedIp('192.168.1.1')).toBe(true)
    expect(isBlockedIp('169.254.169.254')).toBe(true) // 云元数据
    expect(isBlockedIp('100.64.0.1')).toBe(true) // CGNAT
    expect(isBlockedIp('0.0.0.0')).toBe(true)
  })

  it('should allow public IPv4 addresses', () => {
    expect(isBlockedIp('1.1.1.1')).toBe(false)
    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp('172.32.0.1')).toBe(false) // 172.16/12 之外
    expect(isBlockedIp('100.128.0.1')).toBe(false) // CGNAT 之外
  })

  it('should block IPv6 loopback / link-local / unique-local', () => {
    expect(isBlockedIp('::1')).toBe(true)
    expect(isBlockedIp('::')).toBe(true)
    expect(isBlockedIp('fe80::1')).toBe(true)
    expect(isBlockedIp('fc00::1')).toBe(true)
    expect(isBlockedIp('fd12::1')).toBe(true)
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true) // IPv4-mapped loopback
  })

  it('should treat non-IP strings as not blocked', () => {
    expect(isBlockedIp('example.com')).toBe(false)
  })
})

describe('assertSafeFetchUrl', () => {
  it('should reject non-http(s) protocols', async () => {
    await expect(assertSafeFetchUrl('ftp://example.com/file')).rejects.toThrow(/only http\/https/)
    await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toThrow(/only http\/https/)
  })

  it('should reject literal loopback / private / metadata IPs', async () => {
    await expect(assertSafeFetchUrl('http://127.0.0.1/')).rejects.toThrow(/loopback|private/)
    await expect(assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/loopback|private/)
    await expect(assertSafeFetchUrl('http://192.168.0.1/')).rejects.toThrow(/loopback|private/)
  })

  it('should reject invalid URLs', async () => {
    await expect(assertSafeFetchUrl('not a url')).rejects.toThrow(/Invalid URL/)
  })

  it('should allow literal public IPs and normal public URLs', async () => {
    await expect(assertSafeFetchUrl('http://1.1.1.1/')).resolves.toBeUndefined()
    await expect(assertSafeFetchUrl('https://8.8.8.8/dns-query')).resolves.toBeUndefined()
  })
})