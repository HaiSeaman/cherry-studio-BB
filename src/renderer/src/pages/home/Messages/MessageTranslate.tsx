import { TranslationOutlined } from '@ant-design/icons'
import { LoadingIcon } from '@renderer/components/Icons'
import type { TranslationMessageBlock } from '@renderer/types/newMessage'
import { Divider } from 'antd'
import type { FC } from 'react'
import { Fragment } from 'react'

import Markdown from '../Markdown/Markdown'

interface Props {
  block: TranslationMessageBlock
}

const MessageTranslate: FC<Props> = ({ block }) => {
  return (
    <Fragment>
      <Divider style={{ margin: 0, marginBottom: 10 }}>
        <TranslationOutlined />
      </Divider>
      {!block.content || block.content === '翻译中...' ? (
        <LoadingIcon color="var(--color-text-2)" style={{ marginBottom: 15 }} />
      ) : (
        <Markdown block={block} />
      )}
    </Fragment>
  )
}

export default MessageTranslate
