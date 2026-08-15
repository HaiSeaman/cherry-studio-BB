import { defaultSchema } from 'rehype-sanitize'

/**
 * Sanitize schema for AI-rendered Markdown.
 *
 * Built on top of the GitHub-style default schema (which already strips
 * script/iframe/form/base/link and blocks javascript: protocols), extended
 * with:
 * - `style` (rendered into a Shadow DOM by MarkdownShadowDOMRenderer)
 * - inline SVG elements (rendered by MarkdownSvgRenderer) with only safe
 *   presentation attributes; `href`/`xlink:href` restricted to http(s)
 * - `data:` allowed for img src (markdown data:image URLs; inert in img tags)
 *
 * Everything not explicitly listed is removed, so `<form>` (phishing),
 * `<link rel=stylesheet>`, `<base>`, `<iframe>` etc. never reach the DOM.
 */
const baseTagNames = defaultSchema.tagNames ?? []
const baseAttributes = defaultSchema.attributes ?? {}
const baseProtocols = defaultSchema.protocols ?? {}

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...baseTagNames,
    'style',
    'svg',
    'path',
    'circle',
    'rect',
    'line',
    'polyline',
    'polygon',
    'text',
    'g',
    'defs',
    'title',
    'desc',
    'tspan'
  ],
  attributes: {
    ...baseAttributes,
    style: [],
    svg: [
      ['xmlns'],
      ['viewBox'],
      ['width'],
      ['height'],
      ['role'],
      ['aria-hidden'],
      ['focusable'],
      ['class'],
      ['fill'],
      ['stroke'],
      ['stroke-width'],
      ['opacity']
    ],
    path: [
      ['d'],
      ['fill'],
      ['stroke'],
      ['stroke-width'],
      ['opacity'],
      ['transform'],
      ['stroke-linecap'],
      ['stroke-linejoin'],
      ['fill-rule'],
      ['clip-rule'],
      ['stroke-dasharray'],
      ['stroke-dashoffset']
    ],
    circle: [['cx'], ['cy'], ['r'], ['fill'], ['stroke'], ['stroke-width'], ['opacity'], ['transform']],
    rect: [
      ['x'],
      ['y'],
      ['width'],
      ['height'],
      ['rx'],
      ['ry'],
      ['fill'],
      ['stroke'],
      ['stroke-width'],
      ['opacity'],
      ['transform']
    ],
    line: [['x1'], ['y1'], ['x2'], ['y2'], ['stroke'], ['stroke-width'], ['opacity'], ['transform']],
    polyline: [['points'], ['fill'], ['stroke'], ['stroke-width'], ['opacity'], ['transform']],
    polygon: [['points'], ['fill'], ['stroke'], ['stroke-width'], ['opacity'], ['transform']],
    text: [
      ['x'],
      ['y'],
      ['dx'],
      ['dy'],
      ['fill'],
      ['font-size'],
      ['font-family'],
      ['font-weight'],
      ['text-anchor'],
      ['opacity'],
      ['transform'],
      ['textLength']
    ],
    tspan: [
      ['x'],
      ['y'],
      ['dx'],
      ['dy'],
      ['fill'],
      ['font-size'],
      ['font-family'],
      ['font-weight'],
      ['text-anchor'],
      ['opacity'],
      ['transform'],
      ['textLength']
    ],
    g: [['fill'], ['stroke'], ['stroke-width'], ['opacity'], ['transform']],
    defs: [],
    title: [],
    desc: [],
    // http(s)-only URLs for SVG image/use references (blocks file://, data:, javascript:)
    image: [
      ['href', ['http', 'https']],
      ['xlink:href', ['http', 'https']]
    ],
    use: [
      ['href', ['http', 'https']],
      ['xlink:href', ['http', 'https']]
    ]
  },
  protocols: {
    ...baseProtocols,
    // data:image URLs referenced from markdown images are inert in <img> tags
    src: [...((baseProtocols.src as string[] | undefined) ?? ['http', 'https']), 'data']
  }
}
