/** 语音识别适配器统一接口（千问/豆包/腾讯各实现一份） */
export interface ASRAdapter {
  /** 建立 WebSocket 连接（含鉴权握手） */
  connect(): Promise<void>
  /** 发送开始任务指令（run-task） */
  startSession(): void
  /** 推送音频块（PCM） */
  sendAudio(chunk: Uint8Array): void
  /** 结束任务并返回最终识别文本 */
  stopAndFinalize(): Promise<string>
  /** 关闭连接释放资源 */
  close(): void
}