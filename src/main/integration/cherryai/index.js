/**
 * CherryAI request signature client (HMAC-SHA256).
 * Reconstructed from the original obfuscated bundle (out/main/index.js).
 */
const crypto = require('crypto')

const CLIENT_ID = 'cherry-studio'

function getClientSecret() {
  return global.CHERRYAI_CLIENT_SECRET + '.GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g'
}

class SignatureClient {
  constructor(clientId, clientSecret) {
    this.clientId = clientId || CLIENT_ID
    this.clientSecret = clientSecret || getClientSecret()
    this.generateSignature = this.generateSignature.bind(this)
  }

  generateSignature(options) {
    const { method, path, query = '', body = '' } = options
    const timestamp = Math.floor(Date.now() / 1000).toString()

    let bodyString = ''
    if (body) {
      bodyString = typeof body === 'object' ? JSON.stringify(body) : body.toString()
    }

    const signatureString = [method.toUpperCase(), path, query, this.clientId, timestamp, bodyString].join('\n')

    const hmac = crypto.createHmac('sha256', this.clientSecret)
    hmac.update(signatureString)
    const signature = hmac.digest('hex')

    return {
      'X-Client-ID': this.clientId,
      'X-Timestamp': timestamp,
      'X-Signature': signature
    }
  }
}

let signatureClient = null
function generateSignature(options) {
  if (!signatureClient) signatureClient = new SignatureClient()
  return signatureClient.generateSignature(options)
}

module.exports = {
  SignatureClient,
  generateSignature
}
