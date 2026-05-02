import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera } from './camera'
import { Logger, OCR } from './ocr'
import { Result } from './result'
import { processMatrix, processTargets, threshold } from './utils'
import { UAParser } from 'ua-parser-js'
import { Upload } from './upload'

const defaultOcrProgress = { matrixProgress: 0, targetsProgress: 0, status: '' }
const defaultOcrResult: {
  matrix: string[][]
  targets: string[][]
  finished: boolean
  previewUrl?: string
  matrixBounds?: { left: number; top: number; width: number; height: number }
  targetsBounds?: { left: number; top: number; width: number; height: number }
  canvasWidth?: number
  canvasHeight?: number
} = { matrix: [], targets: [], finished: false }

const parser = new UAParser()
const deviceType = parser.getDevice()?.type

export const CUT_RATIO = 0.58

export default function App() {
  const OCRref = useRef<OCR>()
  const [ocrResult, setOcrResult] = useState(defaultOcrResult)
  const [ocrProgress, setOcrProgress] = useState(defaultOcrProgress)
  const [showInputPage, setShowInputPage] = useState(true)
  const [isMobile, setIsMobile] = useState(
    deviceType === 'mobile' || deviceType === 'tablet'
  )

  const logger: Logger = useCallback(({ name, status, progress = 0 }) => {
    if (status === 'recognizing text') {
      setOcrProgress(prev => ({
        status,
        matrixProgress: name === 'matrix' ? progress : prev.matrixProgress,
        targetsProgress: name === 'targets' ? progress : prev.targetsProgress,
      }))
    }
  }, [])

  useEffect(() => {
    OCRref.current = new OCR(logger)
    return () => {
      OCRref.current?.terminate()
    }
  }, [])

  const onCapture = useCallback(async (canvas: HTMLCanvasElement) => {
    setShowInputPage(false)
    setOcrProgress(defaultOcrProgress)
    setOcrResult(defaultOcrResult)

    const previewUrl = canvas.toDataURL('image/png')
    const w = canvas.width
    const h = canvas.height

    const result = await OCRref.current!.recognize(canvas, w, h, CUT_RATIO)
    const { lines: matrix, chars } = processMatrix(result.matrixData.text)
    const targets = processTargets(result.targetsData.text, chars)

    setOcrResult({
      matrix,
      targets,
      finished: true,
      previewUrl,
      canvasWidth: w,
      canvasHeight: h,
      matrixBounds: { left: 0, top: 0, width: Math.round(w * CUT_RATIO), height: h },
      targetsBounds: { left: Math.round(w * CUT_RATIO), top: 0, width: Math.round(w * (1 - CUT_RATIO)), height: h },
    })
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      const image = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      // Upscale small images so OCR works on low-res shots too
      const minWidth = 1280
      canvas.width = Math.max(image.width, minWidth)
      canvas.height = Math.round((canvas.width / image.width) * image.height)
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height)
      threshold(ctx, true)
      onCapture(canvas)
    },
    [onCapture]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isMobile) return
      e.preventDefault()
      const item = e.clipboardData?.items?.[0]
      const file = item?.kind === 'file' ? item.getAsFile() : null
      file && handleFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('paste', onPaste)
    }
  }, [handleFile, isMobile])

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 2,
          height: 'calc(100% - 14px)',
        }}
        className="app-border"
      >
        {showInputPage ? (
          isMobile ? (
            <Camera onCapture={onCapture} />
          ) : (
            <Upload
              handleFile={handleFile}
              toCameraMode={() => {
                setIsMobile(true)
              }}
            />
          )
        ) : ocrResult.finished ? (
          <Result
            matrix={ocrResult.matrix}
            targets={ocrResult.targets}
            previewUrl={ocrResult.previewUrl}
            matrixBounds={ocrResult.matrixBounds}
            targetsBounds={ocrResult.targetsBounds}
            canvasWidth={ocrResult.canvasWidth}
            canvasHeight={ocrResult.canvasHeight}
            onStartOver={() => {
              setShowInputPage(true)
            }}
          />
        ) : (
          <progress
            style={{ margin: 'auto' }}
            value={
              ocrProgress.status === 'recognizing text'
                ? (ocrProgress.matrixProgress + ocrProgress.targetsProgress) / 2
                : 0
            }
          />
        )}
      </div>

      <div
        style={{
          height: 12,
          fontSize: '0.6em',
          display: 'flex',
          padding: '0 1px',
          color: '#ff6060a0',
        }}
      >
        <span style={{ marginRight: 4 }}>OKAJ BREACHER by Kwent</span>
        <a
          style={{ marginLeft: 'auto', color: 'inherit' }}
          href="https://github.com/kwent-theking/okaj"
          rel="noopener"
          target="_blank"
        >
          GITHUB
        </a>
        <a
          style={{ marginLeft: 4, color: 'inherit' }}
          href="#"
          onClick={() => {
            setIsMobile(!isMobile)
            setShowInputPage(true)
          }}
        >
          {isMobile ? 'SCREENSHOT MODE' : 'CAMERA MODE'}
        </a>
      </div>
    </>
  )
}
