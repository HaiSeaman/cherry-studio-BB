import dotenv from 'dotenv'

export function parseKeyValueString(str: string): Record<string, string> {
  try {
    return dotenv.parse(str)
  } catch {
    return {}
  }
}
