import styled from 'styled-components'

import CodeEditor from '../CodeEditor'
import GeneralPopup from './GeneralPopup'

const Text = styled.div`
  padding: 16px;
  white-space: pre;
  cursor: text;
`

const Editor = styled(CodeEditor)`
  .cm-line {
    cursor: text;
  }
`

/** 文本/代码文件预览弹窗：GeneralPopup 展示只读 CodeEditor 的特例 */
export default class TextFilePreviewPopup {
  static hide() {
    GeneralPopup.hide()
  }
  static show(text: string, title: string, extension?: string) {
    return GeneralPopup.show({
      title,
      width: 700,
      closable: true,
      footer: null,
      styles: {
        content: {
          borderRadius: 20,
          padding: 0,
          overflow: 'hidden'
        },
        body: {
          height: '80vh',
          maxHeight: 'inherit',
          padding: 0
        }
      },
      content:
        extension !== undefined ? (
          <Editor
            readOnly={true}
            expanded={false}
            height="100%"
            style={{ height: '100%' }}
            value={text}
            language={extension}
            options={{
              keymap: true
            }}
          />
        ) : (
          <Text>{text}</Text>
        )
    })
  }
}
