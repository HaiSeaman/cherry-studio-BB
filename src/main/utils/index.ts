import fs from 'node:fs'
import fsAsync from 'node:fs/promises'
import path from 'node:path'

import { app } from 'electron'

export function getResourcePath() {
  return path.join(app.getAppPath(), 'resources')
}

export function toAsarUnpackedPath(filePath: string): string {
  if (!app.isPackaged) {
    return filePath
  }

  const appPath = app.getAppPath()
  if (!appPath.endsWith('.asar')) {
    return filePath
  }

  const unpackedAppPath = appPath.replace(/\.asar$/, '.asar.unpacked')
  if (filePath === appPath) {
    return unpackedAppPath
  }

  const appPathPrefix = `${appPath}${path.sep}`
  if (!filePath.startsWith(appPathPrefix)) {
    return filePath
  }

  return path.join(unpackedAppPath, path.relative(appPath, filePath))
}

export function getDataPath(subPath?: string) {
  const dataPath = path.join(app.getPath('userData'), 'Data')

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }

  if (subPath) {
    const fullPath = path.join(dataPath, subPath)
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
    }
    return fullPath
  }

  return dataPath
}

export function makeSureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function calculateDirectorySize(directoryPath: string): Promise<number> {
  let totalSize = 0
  const items = await fsAsync.readdir(directoryPath)

  for (const item of items) {
    const itemPath = path.join(directoryPath, item)
    const stats = await fsAsync.stat(itemPath)

    if (stats.isFile()) {
      totalSize += stats.size
    } else if (stats.isDirectory()) {
      totalSize += await calculateDirectorySize(itemPath)
    }
  }
  return totalSize
}

export const removeEnvProxy = (env: Record<string, string>) => {
  delete env.HTTPS_PROXY
  delete env.HTTP_PROXY
  delete env.grpc_proxy
  delete env.http_proxy
  delete env.https_proxy
}
