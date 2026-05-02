import { chunk } from 'lodash'
import { useMemo, useState, useRef, useEffect } from 'react'
import { solve } from './solver'

const byteMap: Record<string, string> = {
  1: '1C',
  7: '7A',
  5: '55',
  B: 'BD',
  E: 'E9',
  F: 'FF',
}

const stepColors = [
  '#ff6060', '#ffaa00', '#00e5ff', '#cfed57', '#cc77ff',
  '#ff60aa', '#60ffaa', '#6077ff', '#ffdd60', '#60ddff',
]

export function Result({
  matrix,
  targets,
  previewUrl,
  matrixBounds,
  targetsBounds,
  canvasWidth,
  canvasHeight,
  onStartOver,
}: {
  matrix: string[][]
  targets: string[][]
  previewUrl?: string
  matrixBounds?: { left: number; top: number; width: number; height: number }
  targetsBounds?: { left: number; top: number; width: number; height: number }
  canvasWidth?: number
  canvasHeight?: number
  onStartOver(): void
}) {
  const bufferSizeLocal = window.localStorage.getItem('buffer_size') || '8'
  const [bufferSize, setBufferSize] = useState(parseInt(bufferSizeLocal, 10))
  const [hiddenTargets, setHiddenTargets] = useState<Set<string>>(new Set())
  const [showOverlay, setShowOverlay] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth)
    }
    const el = containerRef.current
    if (!el) return
    const obs = new (window as any).ResizeObserver((entries: any[]) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const inputIsValid = matrix.length > 2 && targets.length && matrix[0].length > 2

  const final = useMemo(() => {
    const targetsToUse = targets.filter(
      target => !hiddenTargets.has(target.join('-'))
    )
    if (inputIsValid && targetsToUse.length && bufferSize) {
      const chosens = solve(matrix, targetsToUse, bufferSize)
      const chosenSeq = chosens[0] || { seq: [], matchedIndices: [] }
      const chosenBytes: Record<string, number> = {}
      chunk(chosenSeq.seq, 2).forEach(([row, col], i) => {
        chosenBytes[`${row},${col}`] = i
      })
      return { chosenBytes, matched: new Set(chosenSeq.matchedIndices) }
    }
    return { chosenBytes: {} as Record<string, number>, matched: new Set<number>() }
  }, [matrix, targets, bufferSize, hiddenTargets, inputIsValid])

  const overlayData = useMemo(() => {
    if (!previewUrl || !matrixBounds || !targetsBounds || !canvasWidth || !canvasHeight || !inputIsValid || containerWidth === 0) return null
    const scale = containerWidth / canvasWidth
    const imgHeight = canvasHeight * scale

    const rows = matrix.length
    const cols = matrix[0].length
    const cellW = (matrixBounds.width / cols) * scale
    const cellH = (matrixBounds.height / rows) * scale

    const cells: { row: number; col: number; x: number; y: number; w: number; h: number; byte: string; stepIndex?: number }[] = []
    matrix.forEach((line, row) => {
      line.forEach((byte, col) => {
        const x = matrixBounds.left * scale + col * cellW
        const y = matrixBounds.top * scale + row * cellH
        const stepIndex = final.chosenBytes[`${row},${col}`]
        cells.push({ row, col, x, y, w: cellW, h: cellH, byte, stepIndex })
      })
    })

    const tRows = targets.filter(t => !hiddenTargets.has(t.join('-'))).length
    const tCols = Math.max(...targets.map(t => t.length), 1)
    const tCellW = (targetsBounds.width / tCols) * scale
    const tCellH = tRows > 0 ? (canvasHeight / tRows) * scale : 0
    const targetCells: { tidx: number; cidx: number; x: number; y: number; w: number; h: number; byte: string; matched: boolean }[] = []
    targets.filter(t => !hiddenTargets.has(t.join('-'))).forEach((target, tidx) => {
      target.forEach((byte, cidx) => {
        const x = targetsBounds.left * scale + cidx * tCellW
        const y = tidx * tCellH
        targetCells.push({ tidx, cidx, x, y, w: tCellW, h: tCellH, byte, matched: final.matched.has(tidx) })
      })
    })

    return { cells, targetCells, imgHeight }
  }, [matrix, targets, previewUrl, matrixBounds, targetsBounds, canvasWidth, canvasHeight, containerWidth, final, hiddenTargets, inputIsValid])

  if (!inputIsValid) {
    return (
      <div style={{ margin: 16, color: '#ff6060', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <b>OCR не смог распознать матрицу.</b><br />
          Убедитесь что скриншот содержит область взлома (матрица + цели).
          {previewUrl && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.8em', color: '#ff606080', marginBottom: 4 }}>Что получил OCR:</div>
              <img src={previewUrl} style={{ maxWidth: '100%', border: '1px solid #ff606060' }} />
            </div>
          )}
        </div>
        <button onClick={onStartOver}>Попробовать снова</button>
      </div>
    )
  }

  return (
    <>
      {previewUrl && overlayData && (
        <div style={{ margin: 8 }} ref={containerRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.7em', color: '#cfed57' }}>
            <span>ДЕТЕКТ НА СКРИНЕ</span>
            <a href="#" style={{ color: '#cfed5780' }} onClick={e => { e.preventDefault(); setShowOverlay(!showOverlay) }}>
              {showOverlay ? 'скрыть' : 'показать'}
            </a>
          </div>
          {showOverlay && (
            <div style={{ position: 'relative', width: '100%' }}>
              <img src={previewUrl} style={{ width: '100%', display: 'block', filter: 'brightness(0.45)' }} />
              <svg
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                viewBox={`0 0 ${containerWidth} ${overlayData.imgHeight}`}
              >
                {overlayData.cells.map(cell => {
                  const isChosen = cell.stepIndex !== undefined
                  const color = isChosen ? stepColors[cell.stepIndex! % stepColors.length] : '#cfed5740'
                  return (
                    <g key={`m-${cell.row}-${cell.col}`}>
                      <rect x={cell.x + 1} y={cell.y + 1} width={cell.w - 2} height={cell.h - 2}
                        fill={isChosen ? color + '30' : 'none'} stroke={color}
                        strokeWidth={isChosen ? 2 : 0.5} rx={2} />
                      <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2 + 1}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={isChosen ? color : '#cfed5790'}
                        fontSize={Math.max(cell.h * 0.38, 8)}
                        fontWeight={isChosen ? 'bold' : 'normal'} fontFamily="monospace">
                        {byteMap[cell.byte]}
                      </text>
                      {isChosen && (
                        <text x={cell.x + cell.w - 3} y={cell.y + 4}
                          textAnchor="end" dominantBaseline="hanging"
                          fill={color} fontSize={Math.max(cell.h * 0.22, 6)}
                          fontFamily="monospace" fontWeight="bold">
                          {cell.stepIndex! + 1}
                        </text>
                      )}
                    </g>
                  )
                })}
                {overlayData.targetCells.map(cell => {
                  const color = cell.matched ? '#cfed57' : '#ffffff40'
                  return (
                    <g key={`t-${cell.tidx}-${cell.cidx}`}>
                      <rect x={cell.x + 1} y={cell.y + 1} width={cell.w - 2} height={cell.h - 2}
                        fill={cell.matched ? '#cfed5715' : 'none'} stroke={color}
                        strokeWidth={cell.matched ? 1.5 : 0.5} rx={2} />
                      <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2 + 1}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize={Math.max(cell.h * 0.38, 8)} fontFamily="monospace">
                        {byteMap[cell.byte]}
                      </text>
                    </g>
                  )
                })}
                {(() => {
                  const ordered = Object.entries(final.chosenBytes)
                    .sort((a, b) => a[1] - b[1])
                    .map(([key]) => {
                      const [row, col] = key.split(',').map(Number)
                      const cell = overlayData.cells.find(c => c.row === row && c.col === col)!
                      return { cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2, stepIndex: final.chosenBytes[key] }
                    })
                  return ordered.slice(0, -1).map((pt, i) => {
                    const next = ordered[i + 1]
                    const color = stepColors[i % stepColors.length]
                    return (
                      <line key={`line-${i}`} x1={pt.cx} y1={pt.cy} x2={next.cx} y2={next.cy}
                        stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
                    )
                  })
                })()}
              </svg>
            </div>
          )}
        </div>
      )}

      <div style={{ margin: 8, border: '1px solid #cfed5780', backgroundColor: '#120f18', paddingBottom: 8 }}>
        <div style={{ backgroundColor: '#cfed57', color: 'black', padding: '4px 16px', marginBottom: 8 }}>
          BEST ROUTE
        </div>
        {matrix.map((line, row) => (
          <div style={{ display: 'flex', justifyContent: 'center' }} key={`${line.join('-')}-${row}`}>
            {line.map((byte, col) => {
              const index = final.chosenBytes[`${row},${col}`]
              const color = index !== undefined ? stepColors[index % stepColors.length] : '#ccee7060'
              return (
                <span style={{
                  position: 'relative', display: 'inline-flex', color,
                  fontSize: '1.2em', textTransform: 'uppercase',
                  width: 40, height: 32, justifyContent: 'center', alignItems: 'center',
                  fontWeight: index !== undefined ? 'bold' : 'normal',
                }} key={`${byte}-${col}`}>
                  {byteMap[byte]}
                  {index !== undefined && (
                    <span style={{ position: 'absolute', fontSize: '0.6em', top: 0, right: 0 }}>
                      {index + 1}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ margin: 8, marginTop: 0, border: '1px solid #cfed5780', backgroundColor: '#120f18', paddingBottom: 8 }}>
        <div style={{ color: '#cfed57', padding: '4px 16px', marginBottom: 8, borderBottom: '1px solid #cfed5780' }}>
          TARGET SEQUENCES
        </div>
        {targets.filter(target => !hiddenTargets.has(target.join('-'))).map((target, i) => (
          <div style={{ paddingLeft: 16 }} key={target.join('-')}>
            {target.map((byte, j) => (
              <div style={{
                display: 'inline-flex',
                color: final.matched.has(i) ? '#cfed57' : '#FFFFFF40',
                fontSize: '1.1em', textTransform: 'uppercase',
                width: 32, height: 28, justifyContent: 'center', alignItems: 'center',
              }} key={`${byte}-${j}`}>
                {byteMap[byte]}
              </div>
            ))}
            <a style={{ display: 'float', float: 'right', marginRight: 16, color: '#cfed57' }}
              onClick={() => { setHiddenTargets(new Set(hiddenTargets).add(target.join('-'))) }}
              href="#">
              Remove
            </a>
          </div>
        ))}
      </div>

      <div style={{ marginLeft: 8, color: '#cfed57' }}>
        <label>BUFFER SIZE:</label>
        <input type="number" min={2} max={9} name="buffer-size"
          style={{ marginLeft: 8 }} value={bufferSize}
          onChange={e => {
            const bs = Math.min(Math.max(parseInt(e.target.value, 10), 4), 9)
            setBufferSize(bs)
            window.localStorage.setItem('buffer_size', `${bs}`)
          }} />
      </div>

      <button style={{ margin: 'auto', marginBottom: 16 }} onClick={onStartOver}>
        START OVER
      </button>
    </>
  )
}
