import { Button } from 'antd'
import { memo, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

interface ExpandableTextProps {
  text: string
  style?: React.CSSProperties
}

const ExpandableText = ({
  ref,
  text,
  style
}: ExpandableTextProps & { ref?: React.RefObject<HTMLParagraphElement> | null }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const button = useMemo(() => {
    return (
      <Button type="link" onClick={toggleExpand} style={{ alignSelf: 'flex-end' }}>
        {isExpanded ? '折叠' : '展开'}
      </Button>
    )
  }, [isExpanded, toggleExpand])

  return (
    <Container ref={ref} style={style} $expanded={isExpanded}>
      <TextContainer $expanded={isExpanded}>{text}</TextContainer>
      {button}
    </Container>
  )
}

const Container = styled.div<{ $expanded?: boolean }>`
  display: flex;
  flex-direction: ${(props) => (props.$expanded ? 'column' : 'row')};
`

const TextContainer = styled.div<{ $expanded?: boolean }>`
  overflow: hidden;
  text-overflow: ${(props) => (props.$expanded ? 'unset' : 'ellipsis')};
  white-space: ${(props) => (props.$expanded ? 'normal' : 'nowrap')};
  line-height: ${(props) => (props.$expanded ? 'unset' : '30px')};
`

export default memo(ExpandableText)
