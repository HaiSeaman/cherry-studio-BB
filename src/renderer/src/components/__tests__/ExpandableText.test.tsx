import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ExpandableText from '../ExpandableText'

describe('ExpandableText', () => {
  const TEXT = 'This is a long text for testing.'

  it('should render text and expand button', () => {
    render(<ExpandableText text={TEXT} />)
    expect(screen.getByText(TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('展开')
  })

  it('should toggle expand/collapse when button is clicked', async () => {
    render(<ExpandableText text={TEXT} />)
    const button = screen.getByRole('button')
    // 初始为收起状态
    expect(button).toHaveTextContent('展开')
    // 点击展开
    await userEvent.click(button)
    expect(button).toHaveTextContent('折叠')
    // 再次点击收起
    await userEvent.click(button)
    expect(button).toHaveTextContent('展开')
  })
})
