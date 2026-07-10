import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react'

/* ────────────────────────── ImageLightbox ──────────────────────────
   Visualizador de imagem em tela cheia com zoom e navegação:
     · roda do mouse  → zoom centrado no cursor
     · arrastar       → move a imagem
     · duplo clique   → alterna entre "ajustar à tela" e ampliado
     · Esc            → fecha  ·  + / -  → zoom  ·  0 → ajustar
   Sem dependências externas — transform translate+scale com origem 0,0. */

const ZOOM_MIN = 0.1
const ZOOM_MAX = 8
const PASSO_ZOOM = 1.25

interface Props {
  src: string
  titulo: string
  onClose: () => void
  onBaixar?: () => void
}

interface Vista {
  escala: number
  x: number
  y: number
}

export default function ImageLightbox({ src, titulo, onClose, onBaixar }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [vista, setVista] = useState<Vista>({ escala: 1, x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const escalaAjusteRef = useRef(1)
  const arrastoRef = useRef<{ px: number; py: number; x: number; y: number; moveu: boolean } | null>(null)

  const ajustar = useCallback(() => {
    const area = areaRef.current
    const img = imgRef.current
    if (!area || !img || !img.naturalWidth) return
    const s = Math.min(
      area.clientWidth / img.naturalWidth,
      area.clientHeight / img.naturalHeight,
    )
    escalaAjusteRef.current = s
    setVista({
      escala: s,
      x: (area.clientWidth - img.naturalWidth * s) / 2,
      y: (area.clientHeight - img.naturalHeight * s) / 2,
    })
  }, [])

  // mantém a imagem presa à tela: quando ela é menor que a área fica
  // centralizada (sem arrasto nesse eixo); quando é maior, pode arrastar,
  // mas a borda da imagem nunca se descola da borda da tela
  const clampar = useCallback((v: Vista): Vista => {
    const area = areaRef.current
    const img = imgRef.current
    if (!area || !img || !img.naturalWidth) return v
    const w = img.naturalWidth * v.escala
    const h = img.naturalHeight * v.escala
    const cw = area.clientWidth
    const ch = area.clientHeight
    return {
      escala: v.escala,
      x: w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(v.x, cw - w)),
      y: h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(v.y, ch - h)),
    }
  }, [])

  // zoom multiplicativo mantendo fixo o ponto (px, py) do container
  const zoomEm = useCallback((fator: number, px?: number, py?: number) => {
    const area = areaRef.current
    setVista((v) => {
      const cx = px ?? (area ? area.clientWidth / 2 : 0)
      const cy = py ?? (area ? area.clientHeight / 2 : 0)
      const nova = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.escala * fator))
      const r = nova / v.escala
      return clampar({ escala: nova, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r })
    })
  }, [clampar])

  // roda do mouse — listener manual porque o React registra wheel como
  // passivo e o preventDefault (necessário p/ não rolar a página) falharia
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = area.getBoundingClientRect()
      zoomEm(e.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM, e.clientX - rect.left, e.clientY - rect.top)
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [zoomEm])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomEm(PASSO_ZOOM)
      else if (e.key === '-') zoomEm(1 / PASSO_ZOOM)
      else if (e.key === '0') ajustar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, zoomEm, ajustar])

  // janela redimensionada → reajusta para a imagem nunca ficar perdida
  useEffect(() => {
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [ajustar])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch { /* captura indisponível — o arrasto ainda funciona no elemento */ }
    arrastoRef.current = { px: e.clientX, py: e.clientY, x: vista.x, y: vista.y, moveu: false }
    setArrastando(true)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = arrastoRef.current
    if (!d) return
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moveu = true
    setVista((v) => clampar({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = arrastoRef.current
    arrastoRef.current = null
    setArrastando(false)
    // clique simples no fundo (sem arrasto e fora da imagem) fecha
    if (d && !d.moveu && e.target === areaRef.current) onClose()
  }

  function onDoubleClick(e: React.MouseEvent) {
    const area = areaRef.current
    if (!area) return
    const rect = area.getBoundingClientRect()
    if (vista.escala <= escalaAjusteRef.current * 1.05) {
      zoomEm(2.5, e.clientX - rect.left, e.clientY - rect.top)
    } else {
      ajustar()
    }
  }

  const botao =
    'flex items-center justify-center w-8 h-8 rounded-lg transition-colors ' +
    'hover:bg-white/15 text-white/80 hover:text-white'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(4, 9, 18, 0.9)', backdropFilter: 'blur(3px)' }}
    >
      {/* barra superior: título + controles */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3">
        <p className="text-[13px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
          {titulo}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button className={botao} onClick={() => zoomEm(1 / PASSO_ZOOM)} title="Diminuir zoom (-)">
            <ZoomOut size={16} />
          </button>
          <span
            className="text-[12px] tabular-nums text-center select-none"
            style={{ color: 'rgba(255,255,255,0.6)', minWidth: 48 }}
          >
            {Math.round(vista.escala * 100)}%
          </span>
          <button className={botao} onClick={() => zoomEm(PASSO_ZOOM)} title="Aumentar zoom (+)">
            <ZoomIn size={16} />
          </button>
          <button className={botao} onClick={ajustar} title="Ajustar à tela (0)">
            <Maximize size={15} />
          </button>
          {onBaixar && (
            <button className={botao} onClick={onBaixar} title="Baixar imagem">
              <Download size={15} />
            </button>
          )}
          <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <button className={botao} onClick={onClose} title="Fechar (Esc)">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* área da imagem */}
      <div
        ref={areaRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: arrastando ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <img
          ref={imgRef}
          src={src}
          alt={titulo}
          draggable={false}
          onLoad={ajustar}
          className="absolute top-0 left-0 select-none"
          style={{
            transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})`,
            transformOrigin: '0 0',
            maxWidth: 'none',
            willChange: 'transform',
          }}
        />
      </div>

      {/* dica de uso */}
      <div
        className="shrink-0 text-center pb-3 pt-1 text-[11.5px] select-none"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        Role para dar zoom · arraste para mover · duplo clique amplia · Esc fecha
      </div>
    </div>,
    document.body,
  )
}
