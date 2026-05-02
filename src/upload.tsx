import { useState } from 'react'
import exampleImg from '../assets/crop-example.jpg'

export const Upload = ({
  handleFile,
  toCameraMode,
}: {
  handleFile(file: File): Promise<void>
  toCameraMode(): void
}) => {
  const [isDragOn, setIsDragOn] = useState(false)
  const [err, setErr] = useState('')
  const [exampleOn, setExampleOn] = useState(false)

  return (
    <>
      <label
        style={{
          margin: 16,
          flexBasis: 300,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'start',
          justifyContent: 'center',
          padding: '0 48px',
          ...(isDragOn && { backgroundColor: '#ff606020' }),
        }}
        className="dropzone"
        onDragOver={e => { e.preventDefault() }}
        onDragEnter={e => { e.target === e.currentTarget && setIsDragOn(true) }}
        onDragLeave={e => { e.target === e.currentTarget && setIsDragOn(false) }}
        onDrop={async e => {
          setIsDragOn(false)
          e.preventDefault()
          const item = e.dataTransfer?.items?.[0]
          const file = item.kind === 'file' ? item.getAsFile() : null
          file && handleFile(file).catch(() => { setErr('Не удалось обработать изображение') })
        }}
      >
        <div style={{ pointerEvents: 'none' }}>
          <div>Чтобы начать:</div>
          <div>— Перетащи скрин сюда</div>
          <div>— или нажми чтобы загрузить файл</div>
          <div>— или сделай скрин через WIN + SHIFT + S, потом CTRL + V сюда</div>
          <div style={{ marginTop: 8, color: '#cfed5780', fontSize: '0.85em' }}>
            Обрезка не обязательна — OCR работает с полными скринами.
          </div>
        </div>

        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            file && handleFile(file).catch(() => { setErr('Не удалось обработать изображение') })
          }}
        />
      </label>
      {err && <div style={{ marginLeft: 16, color: '#ff6060' }}>Ошибка: {err}</div>}
      <div style={{ margin: '0 16px' }}>
        <a
          style={{ marginLeft: 0 }}
          href="#"
          onClick={() => { setExampleOn(!exampleOn) }}
        >
          {exampleOn ? 'Скрыть' : 'Показать'} пример обрезки
        </a>
        {exampleOn && (
          <div>
            <img style={{ maxHeight: 240, maxWidth: '100%' }} src={exampleImg} />
          </div>
        )}
      </div>
      <div style={{ margin: '8px 16px' }}>
        Или{' '}
        <a href="#" onClick={toCameraMode}>
          использовать камеру
        </a>
      </div>
    </>
  )
}
