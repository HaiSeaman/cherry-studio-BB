/**
 * Extract text content from PDF data.
 * Works in both Node.js and browser environments (pdf-parse 2.x).
 *
 * pdf-parse bundles pdfjs-dist 5.x which requires browser globals
 * (DOMMatrix etc.) in the main process — keep the import lazy so the
 * module is only loaded when a PDF is actually parsed, after the main
 * process polyfill (see src/main/bootstrap.ts) is in place.
 *
 * @param data - PDF content as Uint8Array, ArrayBuffer, base64-encoded string, or URL
 * @returns Extracted text content
 */
export async function extractPdfText(data: Uint8Array | ArrayBuffer | string | URL): Promise<string> {
  const { PDFParse } = await import('pdf-parse')

  if (data instanceof URL) {
    const parser = new PDFParse({ url: data.href })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  let buffer: Uint8Array
  if (typeof data === 'string') {
    // base64 string → Uint8Array
    const binaryString = atob(data)
    buffer = Uint8Array.from(binaryString, (c) => c.charCodeAt(0))
  } else if (data instanceof ArrayBuffer) {
    buffer = new Uint8Array(data)
  } else {
    buffer = data
  }

  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}
