import { describe, expect, it } from 'vitest'

import { droppableReorder } from '../sort'

describe('sort', () => {
  describe('droppableReorder', () => {
    it('should reorder elements by moving single element forward', () => {
      const list = [1, 2, 3, 4, 5]
      const result = droppableReorder(list, 0, 2)
      expect(result).toEqual([2, 3, 1, 4, 5])
    })

    it('should reorder elements by moving single element backward', () => {
      const list = [1, 2, 3, 4, 5]
      const result = droppableReorder(list, 4, 1)
      expect(result).toEqual([1, 5, 2, 3, 4])
    })

    it('should support multi-element drag reordering while preserving group order', () => {
      const list = [1, 2, 3, 4, 5]
      const result = droppableReorder(list, 1, 3, 2)
      // 移动 [2,3] 到 '4' 后面，结果应为 [1, 4, 2, 3, 5]
      expect(result).toEqual([1, 4, 2, 3, 5])
    })

    it('should handle complex multi-element reordering while preserving group order', () => {
      const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const result = droppableReorder(list, 2, 5, 3)
      // 移动 [c,d,e] 到 'f' 后面，结果应为 ['a', 'b', 'f', 'c', 'd', 'e', 'g']
      expect(result).toEqual(['a', 'b', 'f', 'c', 'd', 'e', 'g'])
    })

    it('should maintain internal order of multi-element group when moving forward', () => {
      const list = [1, 2, 3, 4, 5, 6, 7]
      const result = droppableReorder(list, 1, 5, 3)
      // 移动 [2,3,4] 到 '6' 后面，结果应为 [1,5,6,2,3,4,7]
      expect(result).toEqual([1, 5, 6, 2, 3, 4, 7])
    })

    it('should maintain internal order of multi-element group when moving backward', () => {
      const list = [1, 2, 3, 4, 5, 6, 7]
      const result = droppableReorder(list, 4, 1, 3)
      // 移动 [5,6,7] 到 '2' 前面，结果应为 [1,5,6,7,2,3,4]
      expect(result).toEqual([1, 5, 6, 7, 2, 3, 4])
    })

    it('should handle empty list', () => {
      const list: number[] = []
      const result = droppableReorder(list, 0, 0)
      expect(result).toEqual([])
    })

    it('should not modify original list', () => {
      const list = [1, 2, 3, 4, 5]
      const originalList = [...list]
      droppableReorder(list, 0, 2)
      expect(list).toEqual(originalList)
    })

    it('should handle string list', () => {
      const list = ['a', 'b', 'c', 'd']
      const result = droppableReorder(list, 0, 2)
      expect(result).toEqual(['b', 'c', 'a', 'd'])
    })

    it('should handle object list', () => {
      const list = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const result = droppableReorder(list, 0, 2)
      expect(result).toEqual([{ id: 2 }, { id: 3 }, { id: 1 }])
    })
  })
})
