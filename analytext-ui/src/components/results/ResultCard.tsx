import { useEffect, useState } from 'react'
import { Download, Table2, ImageIcon } from 'lucide-react'
import type { ArquivoResultado } from '@/types'

export default function ResultCard({ arquivo }: { arquivo: ArquivoResultado }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    if (arquivo.tipo !== 'imagem') return
    window.api.lerImagemBase64(arquivo.caminho).then((data) => {
      if (data) setImgSrc(data)
    })
  }, [arquivo.caminho, arquivo.tipo])

  async function baixar() {
    const nome = arquivo.caminho.split(/[\\/]/).pop() ?? 'resultado'
    await window.api.exportarArquivo(arquivo.caminho, nome)
  }

  return (
    <div className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
      <div className="aspect-[4/3] flex items-center justify-center overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        {arquivo.tipo === 'imagem' ? (
          imgSrc
            ? <img src={imgSrc} alt={arquivo.titulo} className="w-full h-full object-contain" />
            : <ImageIcon size={32} style={{ color: 'var(--text-disabled)' }} />
        ) : (
          <Table2 size={32} style={{ color: 'var(--text-disabled)' }} />
        )}
      </div>
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-hidden">
          {arquivo.tipo === 'imagem' ? (
            <ImageIcon size={13} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <Table2 size={13} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          )}
          <p className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{arquivo.titulo}</p>
        </div>
        <button onClick={baixar} className="shrink-0 p-1.5 rounded-md transition-colors" style={{ background: 'var(--surface-3)' }}>
          <Download size={13} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>
    </div>
  )
}
