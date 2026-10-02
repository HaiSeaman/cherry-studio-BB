/* global AudioWorkletProcessor, registerProcessor */
/**
 * 语音输入的采集处理器（跑在音频线程，不在界面主线程）。
 *
 * 为什么要有它：原来的 ScriptProcessorNode 把「取音频」这件事交给界面主线程做，
 * 主线程一忙（打字上屏、Markdown 重排……）音频就会被丢掉，识别结果跟着变差。
 * 这里只做一件事：把音频攒成一批，通过 port 交给主线程；
 * 重采样、分包那些 DSP 留在主线程的 TypeScript 里（那部分有单元测试覆盖）。
 *
 * 为什么放在 public/ 而不是 src/ 里 import：
 *   页面 CSP 是 `script-src 'self'`，而 Vite 会把小于 4KB 的资源内联成 data: URL
 *   （实测构建产物就是 `new URL("data:text/javascript;base64,...")`），
 *   data:/blob: 都会被这条 CSP 拦掉 → addModule 失败 → 只能退回 ScriptProcessor，等于白装。
 *   放在 renderer/public 下由 Vite 原样拷贝，运行时用同源路径加载，CSP 放行。
 *
 * 注意：registerProcessor 的名字必须与 useVoiceInput.ts 里的 WORKLET_PROCESSOR_NAME 一致。
 */
const BLOCK_FRAMES = 2048

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.block = new Float32Array(BLOCK_FRAMES)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.block[this.filled++] = channel[i]
        if (this.filled === this.block.length) {
          // 必须复制一份交出去：这块内存下一轮就会被复用
          this.port.postMessage(this.block.slice(0))
          this.filled = 0
        }
      }
    }
    // 返回 true 才会持续收到音频
    return true
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor)
