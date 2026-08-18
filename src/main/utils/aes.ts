import * as crypto from 'crypto'

// 解密函数
export function decrypt(encryptedData: string, iv: string, secretKey: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), Buffer.from(iv, 'hex'))
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
