/**
 * tc3Signature.ts Unit Tests
 * 腾讯云 TC3-HMAC-SHA256 签名（固定向量标准答案由 Node crypto 独立计算得出）
 */

import { describe, expect, it } from 'vitest'

import { parseTencentCredentials, signTc3 } from '../tc3Signature'

// 固定向量（独立用 Node:crypto 计算的标准答案，非实现自身产物）
const VECTOR = {
  secretId: 'mock_test_secret_id_123456',
  secretKey: 'mock_test_secret_key_abcdef',
  service: 'hunyuan',
  host: 'hunyuan.tencentcloudapi.com',
  action: 'SubmitHunyuanVideoJob',
  version: '2023-09-01',
  payload: JSON.stringify({ Prompt: 'test' }),
  timestamp: 1787616000, // 2026-08-25T00:00:00Z
  expectedPayloadHash: '25e12be6186068c686b05dbd8e05bb80f50c56df044a7e33de8d39f82309bf03',
  expectedSignature: 'deada7fd2dd9c34cbe9d4491ab21528f1523242a387c55fb8a4142b087dfc794'
}

describe('signTc3', () => {
  it('固定向量：签名与官方算法一致，Authorization 结构完整', async () => {
    const headers = await signTc3(VECTOR)

    expect(headers.Authorization).toBe(
      `TC3-HMAC-SHA256 Credential=${VECTOR.secretId}/2026-08-25/${VECTOR.service}/tc3_request, ` +
        `SignedHeaders=content-type;host, Signature=${VECTOR.expectedSignature}`
    )
    expect(headers['X-TC-Action']).toBe(VECTOR.action)
    expect(headers['X-TC-Version']).toBe(VECTOR.version)
    expect(headers['X-TC-Timestamp']).toBe(String(VECTOR.timestamp))
    expect(headers.Host).toBe(VECTOR.host)
    expect(headers['Content-Type']).toContain('application/json')
  })

  it('同输入签名确定（可重放校验）', async () => {
    const a = await signTc3(VECTOR)
    const b = await signTc3(VECTOR)
    expect(a.Authorization).toBe(b.Authorization)
  })

  it('payload 变化导致签名变化', async () => {
    const modified = await signTc3({ ...VECTOR, payload: JSON.stringify({ Prompt: 'changed' }) })
    expect(modified.Authorization).not.toContain(VECTOR.expectedSignature)
  })
})

describe('parseTencentCredentials', () => {
  it('按冒号拆分 SecretId 与 SecretKey', () => {
    expect(parseTencentCredentials('mock_secret_id_123:mock_secret_key_456')).toEqual({
      secretId: 'mock_secret_id_123',
      secretKey: 'mock_secret_key_456'
    })
  })

  it('缺少冒号时给出格式提示', () => {
    expect(() => parseTencentCredentials('mock_secret_id_only')).toThrow(/SecretId:SecretKey/)
  })

  it('空值时给出格式提示', () => {
    expect(() => parseTencentCredentials('')).toThrow(/SecretId:SecretKey/)
  })
})
