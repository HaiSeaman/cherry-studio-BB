/** 打字器所需的底层能力（生产环境为全局模拟输入，测试中替换为记录桩） */
export interface TypewriterIO {
  /** 把文本追加输入到当前光标 */
  type(text: string): void
  /** 退格删除光标左侧 count 个字符（与输入框一致：一个码点算一个，emoji 算一个） */
  backspace(count: number): void
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

/**
 * 最长公共前缀长度。
 * 若切点正好落在一个 UTF-16 代理对中间（前缀以孤立高代理结尾），则回退一位，
 * 否则「退格 + 重新输入」会把 emoji 拆成半个码元。
 */
export function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++
  if (i > 0 && isHighSurrogate(a.charCodeAt(i - 1))) i--
  return i
}

/**
 * 流式增量打字器：把云端「累计全量识别文本」按差量打到光标处。
 *
 * 与「收尾时整段粘贴一次」的区别在于它是持续校正的：
 * 服务端修正前文（`你说今天在主` → `你说今天在做些什么东西`）时，
 * 退格删掉分叉的尾巴再补上新文本，因此光标处始终等于最新识别结果，且不会重复叠加。
 */
export class StreamingTypewriter {
  /** 已经打进目标应用（光标处）的文本 */
  private typed = ''
  /** 焦点可能已漂移：冻结后只允许追加，禁止退格，避免删掉别处的内容 */
  private frozen = false

  constructor(private readonly io: TypewriterIO) {}

  getTypedText(): string {
    return this.typed
  }

  /**
   * 焦点漂移保护：录音期间检测到用户真实按键盘/点鼠标后调用。
   * 之后只做追加式上屏，不再回退修正（宁可少几个字，也不能删错地方）。
   */
  freeze(): void {
    this.frozen = true
  }

  /** 收到最新的「累计全量」识别文本（中间结果与最终结果共用此入口） */
  commit(next: string): void {
    // 空文本视为「本轮还没有结果」：不动作，避免把已经上屏的内容擦掉
    if (!next || next === this.typed) return

    if (this.frozen) {
      if (!next.startsWith(this.typed)) return
      this.io.type(next.slice(this.typed.length))
      this.typed = next
      return
    }

    const common = commonPrefixLength(this.typed, next)
    // 退格按「码点」计数：真实输入框里一次退格删掉一个码点（emoji 等代理对算一个），
    // 若按 UTF-16 码元计数会多退，把改写点前面的字也一起删掉
    const removeCount = [...this.typed.slice(common)].length
    if (removeCount > 0) this.io.backspace(removeCount)
    const appended = next.slice(common)
    if (appended) this.io.type(appended)
    this.typed = next
  }

  /**
   * 收尾：把光标处校正为最终识别文本。
   * 流式过程中已经打过的内容由 commit 的差量逻辑复用，不会整段重复输入；
   * 最终文本为空（识别不出内容）时不删除任何已上屏文字。
   */
  finish(finalText: string): string {
    if (finalText.trim()) this.commit(finalText)
    return this.typed
  }

  /** 开始新一轮会话 */
  reset(): void {
    this.typed = ''
    this.frozen = false
  }
}
