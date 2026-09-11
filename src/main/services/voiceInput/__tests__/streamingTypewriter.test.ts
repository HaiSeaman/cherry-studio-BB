import { beforeEach, describe, expect, it } from 'vitest'

import { commonPrefixLength, StreamingTypewriter, type TypewriterIO } from '../streamingTypewriter'

/** 模拟目标输入框：记录操作，并维护「光标处实际内容」，便于断言最终落字结果 */
class FakeEditor implements TypewriterIO {
  text = ''
  ops: string[] = []

  type(text: string): void {
    this.ops.push(`+${text}`)
    this.text += text
  }

  backspace(count: number): void {
    this.ops.push(`-${count}`)
    // 真机行为：一次退格删掉一个「码点」，emoji 等代理对算一个字符
    const chars = [...this.text]
    this.text = chars.slice(0, Math.max(0, chars.length - count)).join('')
  }
}

describe('commonPrefixLength', () => {
  it('返回公共前缀长度', () => {
    expect(commonPrefixLength('你好世界', '你好')).toBe(2)
    expect(commonPrefixLength('abc', 'abc')).toBe(3)
    expect(commonPrefixLength('abc', 'xyz')).toBe(0)
    expect(commonPrefixLength('', 'xyz')).toBe(0)
  })

  it('切点落在代理对中间时回退一位，避免拆散 emoji', () => {
    // 😀 = \uD83D\uDE00，😁 = \uD83D\uDE01：按码元比较会停在 1，必须回退到 0
    expect(commonPrefixLength('😀', '😁')).toBe(0)
    expect(commonPrefixLength('好😀', '好😁')).toBe(1)
  })
})

describe('StreamingTypewriter', () => {
  let editor: FakeEditor
  let typewriter: StreamingTypewriter

  beforeEach(() => {
    editor = new FakeEditor()
    typewriter = new StreamingTypewriter(editor)
  })

  it('首次提交：直接逐字输入全量文本', () => {
    typewriter.commit('你好')
    expect(editor.ops).toEqual(['+你好'])
    expect(editor.text).toBe('你好')
    expect(typewriter.getTypedText()).toBe('你好')
  })

  it('增量提交：只输入新增部分，不重复已上屏内容', () => {
    typewriter.commit('你')
    typewriter.commit('你好')
    typewriter.commit('你好世界')
    expect(editor.ops).toEqual(['+你', '+好', '+世界'])
    expect(editor.text).toBe('你好世界')
  })

  it('结果未变化时不产生任何输入动作', () => {
    typewriter.commit('你好世界')
    editor.ops = []
    typewriter.commit('你好世界')
    expect(editor.ops).toEqual([])
  })

  it('服务端改写前文：退格删掉分叉尾巴再补新文本', () => {
    typewriter.commit('你说今天在主')
    typewriter.commit('你说今天在做些什么东西')
    // 公共前缀「你说今天在」，退掉「主」再补「做些什么东西」
    expect(editor.ops).toEqual(['+你说今天在主', '-1', '+做些什么东西'])
    expect(editor.text).toBe('你说今天在做些什么东西')
  })

  it('跨分句改写：旧分句整段被替换时正确收敛', () => {
    typewriter.commit('今天天气不错。')
    typewriter.commit('今天天气不错。明天出太阳。')
    typewriter.commit('今天天气很好。明天出太阳。')
    expect(editor.text).toBe('今天天气很好。明天出太阳。')
  })

  it('空文本不动作：不会把已经上屏的内容擦掉', () => {
    typewriter.commit('已经说了半句')
    editor.ops = []
    typewriter.commit('')
    expect(editor.ops).toEqual([])
    expect(editor.text).toBe('已经说了半句')
  })

  it('空白字符属于正常文本，照常上屏', () => {
    typewriter.commit('你好')
    typewriter.commit('你好 ')
    expect(editor.ops).toEqual(['+你好', '+ '])
    expect(editor.text).toBe('你好 ')
  })

  it('emoji 改写时不会产生半个代理对，且退格只删一个字符', () => {
    typewriter.commit('好😀')
    typewriter.commit('好😁')
    expect(editor.text).toBe('好😁')
    // 😀 是一个码点：只该退 1 次（按 UTF-16 码元会退 2 次，把「好」也删掉）
    expect(editor.ops).toEqual(['+好😀', '-1', '+😁'])
  })

  it('emoji 夹在句中时，改写只退掉 emoji 之后的内容，不动前面的字', () => {
    typewriter.commit('你好😀世界')
    typewriter.commit('你好😁世界啦')
    expect(editor.text).toBe('你好😁世界啦')
    expect(editor.ops).toEqual(['+你好😀世界', '-3', '+😁世界啦'])
  })

  it('连续多个 emoji 时退格次数按码点计', () => {
    typewriter.commit('😀😀')
    typewriter.commit('😀😁')
    expect(editor.text).toBe('😀😁')
    expect(editor.ops).toEqual(['+😀😀', '-1', '+😁'])
  })

  it('焦点冻结后只追加、不退格（宁可少改字也不删错地方）', () => {
    typewriter.commit('你说今天在主')
    typewriter.freeze()
    editor.ops = []

    typewriter.commit('你说今天在做些什么东西')
    // 非前缀增长：冻结状态下不做任何动作
    expect(editor.ops).toEqual([])
    expect(editor.text).toBe('你说今天在主')

    typewriter.commit('你说今天在主很好')
    expect(editor.ops).toEqual(['+很好'])
    expect(editor.text).toBe('你说今天在主很好')
  })

  it('finish：把光标处校正为最终文本，已上屏部分不重复输入', () => {
    typewriter.commit('今天天气')
    typewriter.commit('今天天气不错')
    editor.ops = []
    const typed = typewriter.finish('今天天气不错。')
    expect(editor.ops).toEqual(['+。'])
    expect(typed).toBe('今天天气不错。')
  })

  it('finish：最终文本为空时不删除任何已上屏文字', () => {
    typewriter.commit('听到了一点点')
    editor.ops = []
    typewriter.finish('')
    expect(editor.ops).toEqual([])
    expect(editor.text).toBe('听到了一点点')
  })

  it('finish：流式期间没有任何中间结果时，整段补输入（极短按键场景）', () => {
    const typed = typewriter.finish('识别文本')
    expect(editor.ops).toEqual(['+识别文本'])
    expect(typed).toBe('识别文本')
  })

  it('reset：开启新一轮会话后重新从零累计', () => {
    typewriter.commit('上一轮的文本')
    typewriter.reset()
    expect(typewriter.getTypedText()).toBe('')
    editor.ops = []
    typewriter.commit('新的')
    expect(editor.ops).toEqual(['+新的'])
  })
})
