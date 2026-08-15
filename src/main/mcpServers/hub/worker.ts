export const hubWorkerSource = `
const crypto = require('node:crypto')
const vm = require('node:vm')
const { parentPort } = require('node:worker_threads')

const MAX_LOGS = 1000

const logs = []
const pendingCalls = new Map()
let isExecuting = false

const stringify = (value) => {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Error) return value.message

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const pushLog = (level, args) => {
  if (logs.length >= MAX_LOGS) {
    return
  }

  const message = args.map((arg) => stringify(arg)).join(' ')
  const entry = \`[\${level}] \${message}\`
  logs.push(entry)
  parentPort?.postMessage({ type: 'log', entry })
}

const capturedConsole = {
  log: (...args) => pushLog('log', args),
  warn: (...args) => pushLog('warn', args),
  error: (...args) => pushLog('error', args),
  info: (...args) => pushLog('info', args),
  debug: (...args) => pushLog('debug', args)
}

const callTool = (name, params) =>
  new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    pendingCalls.set(requestId, { resolve, reject })
    parentPort?.postMessage({ type: 'callTool', requestId, name, params })
  })

const mcp = {
  callTool,
  log: (level, message, fields) => {
    const safeLevel = typeof level === 'string' ? level : 'info'
    const safeMsg = typeof message === 'string' ? message : stringify(message)
    if (fields !== undefined) {
      pushLog(safeLevel, [safeMsg, fields])
    } else {
      pushLog(safeLevel, [safeMsg])
    }
  }
}

const buildContext = () => {
  return {
    mcp,
    parallel: (...promises) => Promise.all(promises),
    settle: (...promises) => Promise.allSettled(promises),
    console: capturedConsole
  }
}

/**
 * Wrap a host function so its prototype chain cannot be used to reach the
 * host realm (e.g. \`mcp.callTool.constructor('return process')()\`).
 */
const safeHostFn = (fn) => {
  const wrapped = (...args) => fn(...args)
  Object.setPrototypeOf(wrapped, Object.create(null))
  return wrapped
}

/**
 * Detect obvious escape hatch syntax before running untrusted code.
 * The vm context shares intrinsics with the host, so vm alone is NOT a
 * security boundary; these checks raise the bar for accidental escapes.
 */
const FORBIDDEN_PATTERNS = [
  // dynamic import resolves against the host module registry
  /\\bimport\\s*\\(/,
  // require is not available inside vm, but block it defensively
  /\\brequire\\s*\\(/,
  // direct access to host globals that escape the sandbox
  /\\bprocess\\s*\\.\\s*getBuiltinModule\\s*\\(/
]

const validateCode = (code) => {
  if (typeof code !== 'string') {
    throw new Error('exec code must be a string')
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error('exec code contains a forbidden pattern (import/require/process.getBuiltinModule)')
    }
  }
}

const runCode = async (code, context) => {
  validateCode(code)

  // Build a sandbox whose injected values have no link back to host intrinsics.
  const sandbox = Object.create(null)
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'function') {
      sandbox[key] = safeHostFn(value)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const wrappedObj = Object.create(null)
      for (const [k, v] of Object.entries(value)) {
        wrappedObj[k] = typeof v === 'function' ? safeHostFn(v) : v
      }
      sandbox[key] = Object.freeze(wrappedObj)
    } else if (Array.isArray(value)) {
      sandbox[key] = Object.freeze(value.slice())
    } else {
      sandbox[key] = value
    }
  }

  const contextObj = vm.createContext(sandbox, { name: 'hub-exec' })

  // NOTE: we deliberately do NOT try to sever prototype chains inside the vm
  // context (e.g. Object.prototype.constructor = undefined). vm contexts share
  // intrinsics with the host, so mutating them here would corrupt the worker's
  // own runtime. The real protections are: exec disabled by default, forbidden
  // syntax (import/require/process.getBuiltinModule), prototype-free injected
  // objects, and the 60s worker timeout.

  // We run in an async context to allow top-level await inside the provided code.
  // IMPORTANT: Users should explicitly return the final value.
  // NOTE: top-level \`return\` is illegal in a vm.Script, so the async IIFE is
  // written as an expression; runInContext returns its resulting promise.
  const wrappedCode = "(async () => {\\n" + code + "\\n})()"
  const result = vm.runInContext(wrappedCode, contextObj)
  return await result
}

const handleExec = async (code) => {
  if (isExecuting) {
    return
  }
  isExecuting = true

  try {
    const context = buildContext()
    const result = await runCode(code, context)
    parentPort?.postMessage({ type: 'result', result, logs: logs.length > 0 ? logs : undefined })
  } catch (error) {
    // Errors thrown inside the vm context are NOT \`instanceof Error\` in this
    // realm, so read the message property defensively.
    const errorMessage =
      error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
    parentPort?.postMessage({ type: 'error', error: errorMessage, logs: logs.length > 0 ? logs : undefined })
  } finally {
    pendingCalls.clear()
    isExecuting = false
  }
}

const handleToolResult = (message) => {
  const pending = pendingCalls.get(message.requestId)
  if (!pending) {
    return
  }
  pendingCalls.delete(message.requestId)
  pending.resolve(message.result)
}

const handleToolError = (message) => {
  const pending = pendingCalls.get(message.requestId)
  if (!pending) {
    return
  }
  pendingCalls.delete(message.requestId)
  pending.reject(new Error(message.error))
}

parentPort?.on('message', (message) => {
  if (!message || typeof message !== 'object') {
    return
  }
  switch (message.type) {
    case 'exec':
      handleExec(message.code)
      break
    case 'toolResult':
      handleToolResult(message)
      break
    case 'toolError':
      handleToolError(message)
      break
    default:
      break
  }
})
`
