/**
 * Common Test Utilities
 */

/**
 * Collects all chunks from a stream
 */
export async function collectStreamChunks<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}
