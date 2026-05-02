import {
  createWorker,
  OEM,
  PSM,
  ImageLike,
  Page,
  WorkerParams,
  Worker,
} from 'tesseract.js'
import workerPath from '../lib/worker.min.js'
import corePath from '../lib/tesseract-core.wasm.js'

export type Logger = (packet: {
  name: string
  status: string
  progress?: number
}) => void

export class OCR {
  private matrixWorker: Promise<Worker>
  private targetsWorker: Promise<Worker>

  constructor(private logger: Logger) {
    this.matrixWorker = this.createWorker('matrix', {
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_ocr_engine_mode: OEM.LSTM_ONLY,
    })
    this.targetsWorker = this.createWorker('targets', {
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_ocr_engine_mode: OEM.LSTM_ONLY,
    })
  }

  public terminate = async () =>
    Promise.all([
      (await this.targetsWorker).terminate(),
      (await this.matrixWorker).terminate,
    ])

  public async recognize(image: ImageLike, width: number, height: number, cutRatio: number = 0.58) {
    const matrixWorker = await this.matrixWorker
    const targetsWorker = await this.targetsWorker

    // Upscale targets zone separately 2x for better OCR on small text
    const targetsCanvas = document.createElement('canvas')
    const scale = 2
    const tLeft = Math.round(width * cutRatio)
    const tWidth = width - tLeft
    targetsCanvas.width = tWidth * scale
    targetsCanvas.height = height * scale
    const tCtx = targetsCanvas.getContext('2d')!
    tCtx.imageSmoothingEnabled = true
    tCtx.imageSmoothingQuality = 'high'
    // Draw the targets region upscaled
    const srcCanvas = image as HTMLCanvasElement
    tCtx.drawImage(srcCanvas, tLeft, 0, tWidth, height, 0, 0, tWidth * scale, height * scale)
    // Apply contrast boost
    const imgData = tCtx.getImageData(0, 0, targetsCanvas.width, targetsCanvas.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      // Boost contrast: stretch range
      const gray = Math.round(d[i] * 0.7 + d[i+1] * 0.2 + d[i+2] * 0.1)
      const boosted = Math.min(255, Math.max(0, (gray - 40) * 1.8))
      d[i] = boosted; d[i+1] = boosted; d[i+2] = boosted
    }
    tCtx.putImageData(imgData, 0, 0)

    const results = await Promise.all([
      matrixWorker.recognize(image, {
        rectangle: { left: 0, top: 0, width: Math.round(width * cutRatio), height },
      }),
      targetsWorker.recognize(targetsCanvas),
    ])
    return {
      matrixData: results[0].data as Page,
      targetsData: results[1].data as Page,
    }
  }

  private async createWorker(name: string, params: Partial<WorkerParams>) {
    const worker = createWorker({
      langPath: './lib',
      workerPath,
      corePath,
      logger: args => this.logger({ name, ...args }),
    })
    await worker.load()
    await worker.loadLanguage('cyber')
    await worker.initialize('cyber')
    await worker.setParameters(params)
    return worker
  }
}
