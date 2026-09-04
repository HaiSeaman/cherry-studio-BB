import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/copy-tex'
import 'katex/dist/contrib/mhchem'
import 'remark-github-blockquote-alert/alert.css'

import ImageViewer from '@renderer/components/ImageViewer'
import MarkdownShadowDOMRenderer from '@renderer/components/MarkdownShadowDOMRenderer'
import { useSettings } from '@renderer/hooks/useSettings'
import { useSmoothStream } from '@renderer/hooks/useSmoothStream'
import { loggerService } from '@renderer/services/LoggerService'
import type {
  CompactMessageBlock,
  MainTextMessageBlock,
  ThinkingMessageBlock,
  TranslationMessageBlock
} from '@renderer/types/newMessage'
import { removeSvgEmptyLines } from '@renderer/utils/formats'
import { processLatexBrackets } from '@renderer/utils/markdown'
import { isEmpty } from 'lodash'
import { type FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
// @ts-ignore rehype-mathjax is not typed
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'
import remarkAlert from 'remark-github-blockquote-alert'
import remarkMath from 'remark-math'
import type { Pluggable } from 'unified'

import CodeBlock from './CodeBlock'
import Link from './Link'
import MarkdownSvgRenderer from './MarkdownSvgRenderer'
import rehypeHeadingIds from './plugins/rehypeHeadingIds'
import { markdownSanitizeSchema } from './plugins/rehypeSanitizeSchema'
import rehypeScalableSvg from './plugins/rehypeScalableSvg'
import remarkDisableConstructs from './plugins/remarkDisableConstructs'
import Table from './Table'

const ALLOWED_ELEMENTS =
  /<(style|p|div|span|b|i|strong|em|ul|ol|li|table|tr|td|th|thead|tbody|h[1-6]|blockquote|pre|code|br|hr|svg|path|circle|rect|line|polyline|polygon|text|g|defs|title|desc|tspan|sub|sup|details|summary)/i
const DISALLOWED_ELEMENTS = ['iframe', 'script']

interface Props {
  // message: Message & { content: string }
  block: MainTextMessageBlock | TranslationMessageBlock | ThinkingMessageBlock | CompactMessageBlock
  // 可选的后处理函数，用于在流式渲染过程中处理文本（如引用标签转换）
  postProcess?: (text: string) => string
}

const Markdown: FC<Props> = ({ block, postProcess }) => {
  const { mathEngine, mathEnableSingleDollar } = useSettings()

  const isTrulyDone = 'status' in block && block.status === 'success'
  const [displayedContent, setDisplayedContent] = useState(postProcess ? postProcess(block.content) : block.content)
  const [isStreamDone, setIsStreamDone] = useState(isTrulyDone)

  const prevContentRef = useRef(block.content)
  const prevBlockIdRef = useRef(block.id)

  const { addChunk, reset } = useSmoothStream({
    onUpdate: (rawText) => {
      // 如果提供了后处理函数就调用，否则直接使用原始文本
      const finalText = postProcess ? postProcess(rawText) : rawText
      setDisplayedContent(finalText)
    },
    streamDone: isStreamDone,
    initialText: block.content
  })

  useEffect(() => {
    const newContent = block.content || ''
    const oldContent = prevContentRef.current || ''

    const isDifferentBlock = block.id !== prevBlockIdRef.current

    const isContentReset = oldContent && newContent && !newContent.startsWith(oldContent)

    if (isDifferentBlock || isContentReset) {
      reset(newContent)
    } else {
      const delta = newContent.substring(oldContent.length)
      if (delta) {
        addChunk(delta)
      }
    }

    prevContentRef.current = newContent
    prevBlockIdRef.current = block.id

    // 更新 stream 状态
    const isStreaming = block.status === 'streaming'
    setIsStreamDone(!isStreaming)
  }, [block.content, block.id, block.status, addChunk, reset])

  const remarkPlugins = useMemo(() => {
    const plugins = [
      [remarkGfm, { singleTilde: false }] as Pluggable,
      [remarkAlert] as Pluggable,
      remarkCjkFriendly,
      remarkDisableConstructs(['codeIndented'])
    ]
    if (mathEngine !== 'none') {
      plugins.push([remarkMath, { singleDollarTextMath: mathEnableSingleDollar }])
    }
    return plugins
  }, [mathEngine, mathEnableSingleDollar])

  const messageContent = useMemo(() => {
    if ('status' in block && block.status === 'paused' && isEmpty(block.content)) {
      return '会话已停止'
    }
    return removeSvgEmptyLines(processLatexBrackets(displayedContent))
  }, [block, displayedContent])

  // MathJax 引擎较重(mathjax-full ~37MB 源码), 用户显式切换到 MathJax 时才懒加载
  const [rehypeMathjax, setRehypeMathjax] = useState<Pluggable | null>(null)
  useEffect(() => {
    if (mathEngine !== 'MathJax' || rehypeMathjax) return
    let cancelled = false
    import('rehype-mathjax')
      .then((mod) => {
        if (!cancelled) setRehypeMathjax(mod.default as Pluggable)
      })
      .catch((err) => loggerService.error('Failed to load rehype-mathjax:', err as Error))
    return () => {
      cancelled = true
    }
  }, [mathEngine, rehypeMathjax])

  const rehypePlugins = useMemo(() => {
    const plugins: Pluggable[] = []
    if (ALLOWED_ELEMENTS.test(messageContent)) {
      // rehypeRaw parses raw HTML embedded in the markdown; rehypeSanitize
      // must follow it to strip disallowed tags/attributes/protocols
      // (form/link/base/iframe/javascript:/file: etc). See rehypeSanitizeSchema.
      plugins.push(rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeScalableSvg)
    }
    plugins.push([rehypeHeadingIds, { prefix: `heading-${block.id}` }])
    if (mathEngine === 'KaTeX') {
      plugins.push(rehypeKatex)
    } else if (mathEngine === 'MathJax' && rehypeMathjax) {
      plugins.push(rehypeMathjax)
    }
    return plugins
  }, [mathEngine, messageContent, block.id, rehypeMathjax])

  const components = useMemo(() => {
    const comps = {
      a: (props: any) => <Link {...props} />,
      code: (props: any) => <CodeBlock {...props} blockId={block.id} />,
      table: (props: any) => <Table {...props} blockId={block.id} />,
      img: (props: any) => <ImageViewer style={{ maxWidth: 500, maxHeight: 500 }} {...props} />,
      pre: (props: any) => <pre style={{ overflow: 'visible' }} {...props} />,
      p: (props) => {
        const hasImage = props?.node?.children?.some((child: any) => child.tagName === 'img')
        if (hasImage) return <div {...props} />
        return <p {...props} />
      },
      svg: MarkdownSvgRenderer
    } as Partial<Components>
    // 在 useMemo 内按条件生成 style 组件：流式内容从含 <style> 变不含时
    // components 会重建缓存，旧属性不会残留（原来在渲染期就地改 memo 对象）
    if (/<style\b[^>]*>/i.test(messageContent)) {
      comps.style = MarkdownShadowDOMRenderer as any
    }
    return comps
  }, [block.id, messageContent])

  const urlTransform = useCallback((value: string) => {
    if (value.startsWith('data:image/png') || value.startsWith('data:image/jpeg')) return value
    return defaultUrlTransform(value)
  }, [])

  return (
    <div className="markdown">
      <ReactMarkdown
        rehypePlugins={rehypePlugins}
        remarkPlugins={remarkPlugins}
        components={components}
        disallowedElements={DISALLOWED_ELEMENTS}
        urlTransform={urlTransform}
        remarkRehypeOptions={{
          footnoteLabel: '引用内容',
          footnoteLabelTagName: 'h4',
          footnoteBackContent: ' '
        }}>
        {messageContent}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
