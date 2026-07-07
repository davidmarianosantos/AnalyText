import { FolderDown, Inbox } from 'lucide-react'
import ResultCard from '@/components/results/ResultCard'
import type { ArquivoResultado, CategoriaResultado } from '@/types'

export default function ResultGrid({ arquivos, projetoId, categoria, participante }: {
  arquivos: ArquivoResultado[]
  projetoId: string
  categoria: CategoriaResultado
  participante: string
}) {
  async function baixarTudo() {
    await window.api.exportarPasta(projetoId, categoria, participante)
  }

  if (arquivos.length === 0) {
    return (
      <div className="py-14 text-center rounded-2xl" style={{ border: '1px dashed var(--border-default)' }}>
        <Inbox size={24} className="mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
        <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          Ainda não há resultados nesta categoria para {participante}.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={baixarTudo} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12.5px] font-medium"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
          <FolderDown size={14} /> Baixar todos desta categoria
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {arquivos.map((a) => <ResultCard key={a.caminho} arquivo={a} />)}
      </div>
    </div>
  )
}
