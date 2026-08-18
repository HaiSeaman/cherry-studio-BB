// Counter for numbering links
let linkCounter = 1
// Buffer to hold incomplete link fragments across chunks
let buffer = ''
// Map to track URLs that have already been assigned numbers
let urlToCounterMap: Map<string, number> = new Map()

/**
 * Determines if a string looks like a host/URL
 * @param {string} text The text to check
 * @returns {boolean} Boolean indicating if the text is likely a host
 */
function isHost(text: string): boolean {
  // Basic check for URL-like patterns
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)
}

/**
 * Converts Markdown links in the text to numbered links based on the rules:
 * 1. ([host](url)) -> [cnt](url)
 * 2. [host](url) -> [cnt](url)
 * 3. [any text except url](url)-> any text [cnt](url)
 *
 * @param {string} text The current chunk of text to process
 * @param {boolean} resetCounter Whether to reset the counter and buffer
 * @returns {{text: string, hasBufferedContent: boolean}} Processed text and whether content was buffered
 */
export function convertLinks(
  text: string,
  resetCounter: boolean = false
): { text: string; hasBufferedContent: boolean } {
  if (resetCounter) {
    linkCounter = 1
    buffer = ''
    urlToCounterMap = new Map<string, number>()
  }

  // Append the new text to the buffer
  buffer += text

  // Find the safe point - the position after which we might have incomplete patterns
  let safePoint = buffer.length

  // Check for potentially incomplete patterns from the end
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i] === '(') {
      // Check if this could be the start of a parenthesized link
      if (i + 1 < buffer.length && buffer[i + 1] === '[') {
        // Verify if we have a complete parenthesized link
        const substring = buffer.substring(i)
        const match = /^\(\[([^\]]+)\]\(([^)]+)\)\)/.exec(substring)

        if (!match) {
          // [text] 已完整但后面没跟 (，永远无法形成合法的 ([text](url)) 格式
          const definitelyNotLink = /^\(\[[^\]]+\][^(]/.test(substring)
          if (!definitelyNotLink) {
            safePoint = i
            break
          }
          // fall through，按普通字符处理
        }
      }
    } else if (buffer[i] === '[') {
      // Check if this could be the start of a regular link
      const substring = buffer.substring(i)

      // 检查是否是真正的不完整链接：[text]( 但没有完整的 url)
      const incompleteLink = /^\[([^\]]+)\]\s*\([^)]*$/.test(substring)
      if (incompleteLink) {
        safePoint = i
        break
      }

      // 检查是否是完整的链接
      const completeLink = /^\[([^\]]+)\]\(([^)]+)\)/.test(substring)
      if (completeLink) {
        // 如果是完整链接，继续处理，不设置safePoint
        continue
      }

      // 检查是否是不完整的 [ 开始但还没有闭合的 ]
      // 例如 [example. 这种情况
      const incompleteBracket = /^\[[^\]]*$/.test(substring)
      if (incompleteBracket) {
        safePoint = i
        break
      }

      // 如果不是潜在的链接格式，继续检查
    }
  }

  // Extract the part of the buffer that we can safely process
  const safeBuffer = buffer.substring(0, safePoint)
  buffer = buffer.substring(safePoint)

  // 检查是否有内容被保留在buffer中
  const hasBufferedContent = buffer.length > 0

  // Process the safe buffer to handle complete links
  let result = ''
  let position = 0

  while (position < safeBuffer.length) {
    // Check for parenthesized link pattern: ([text](url))
    if (position + 1 < safeBuffer.length && safeBuffer[position] === '(' && safeBuffer[position + 1] === '[') {
      const substring = safeBuffer.substring(position)
      const match = /^\(\[([^\]]+)\]\(([^)]+)\)\)/.exec(substring)

      if (match) {
        // Found complete parenthesized link
        const url = match[2]

        // Check if this URL has been seen before
        let counter: number
        if (urlToCounterMap.has(url)) {
          counter = urlToCounterMap.get(url)!
        } else {
          counter = linkCounter++
          urlToCounterMap.set(url, counter)
        }

        result += `[<sup>${counter}</sup>](${url})`
        position += match[0].length
        continue
      }
    }

    // Check for regular link pattern: [text](url)
    if (safeBuffer[position] === '[') {
      const substring = safeBuffer.substring(position)
      const match = /^\[([^\]]+)\]\(([^)]+)\)/.exec(substring)

      if (match) {
        // Found complete regular link
        const linkText = match[1]
        const url = match[2]

        // Check if this URL has been seen before
        let counter: number
        if (urlToCounterMap.has(url)) {
          counter = urlToCounterMap.get(url)!
        } else {
          counter = linkCounter++
          urlToCounterMap.set(url, counter)
        }

        // Rule 3: If the link text is not a URL/host, keep the text and add the numbered link
        // 增加一个条件：如果 linkText 是纯数字，也直接替换
        if (isHost(linkText) || /^\d+$/.test(linkText)) {
          // Rule 2: If the link text is a URL/host or purely digits, replace with numbered link
          result += `[<sup>${counter}</sup>](${url})`
        } else {
          // If the link text is neither a URL/host nor purely digits, keep the text and add the numbered link
          result += `${linkText} [<sup>${counter}</sup>](${url})`
        }

        position += match[0].length
        continue
      }
    }

    // If no pattern matches at this position, add the character and move on
    result += safeBuffer[position]
    position++
  }

  return {
    text: result,
    hasBufferedContent
  }
}

/**
 * 强制返回buffer中的所有内容，用于流结束时清空缓冲区
 * @returns {string} buffer中剩余的所有内容
 */
export function flushLinkConverterBuffer(): string {
  const remainingBuffer = buffer
  buffer = ''
  return remainingBuffer
}
