import HistoryPage from '@renderer/pages/history/HistoryPage'

import GeneralPopup from './GeneralPopup'

/** 历史记录搜索弹窗：GeneralPopup 展示 HistoryPage 的特例 */
export default class SearchPopup {
  static hide() {
    GeneralPopup.hide()
  }
  static show() {
    return GeneralPopup.show({
      title: null,
      width: 700,
      closable: false,
      footer: null,
      styles: {
        content: {
          borderRadius: 20,
          padding: 0,
          overflow: 'hidden',
          paddingBottom: 16
        },
        body: {
          height: '80vh',
          maxHeight: 'inherit',
          padding: 0
        }
      },
      content: <HistoryPage />
    })
  }
}
