import { useEffect, useState } from 'react'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import SectionHeader from '@/components/SectionHeader'
import type { FalaPreview } from '@/types'

interface Props {
  onConcluir: () => void
  onVoltar: () => void
  concluido: boolean
}

export default function PreviewStep({ onConcluir, onVoltar, concluido }: Props) {
  const { projetoAtual } = useAppStore()
  const [falas, setFalas] = useState<FalaPreview[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!projetoAtual) return
    setCarregando(true)
    window.api.preVisualizar(projetoAtual.id, 9999)
      .then(setFalas)
      .finally(() => setCarregando(false))
  }, [projetoAtual])

  const participantes = [...new Set(falas.map((f) => f.falante).filter(Boolean))]

  return (
    <div className="px-10 py-10 max-w-[820px] h-full flex flex-col gap-5">

      {/* Cabeçalho */}
      <div className="shrink-0">
        <SectionHeader
          titulo="Conferir importação"
          descricao="Verifique se as falas foram identificadas corretamente antes de continuar."
        />
      </div>

      {/* Participantes detectados */}
      {participantes.length > 0 && (
        <div className="shrink-0 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <Users size={14} style={{ color: 'var(--brand-400)' }} />
          <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {participantes.length} participante{participantes.length !== 1 ? 's' : ''} detectado{participantes.length !== 1 ? 's' : ''}:
            </span>{' '}
            {participantes.join(', ')}
          </p>
        </div>
      )}

      {/* Botões */}
      {falas.length > 0 && !carregando && (
        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={onVoltar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <ChevronLeft size={13} /> Algo está errado, voltar
          </button>
          <button
            onClick={onConcluir}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-semibold text-white"
            style={{ background: 'var(--brand-500)' }}
          >
            {concluido ? 'Confirmar e continuar' : 'Parece correto, continuar'} <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Tabela rolável */}
      <div className="flex-1 min-h-0 rounded-xl flex flex-col"
        style={{ border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        {falas.length === 0 && !carregando ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13.5px]" style={{ color: 'var(--text-tertiary)' }}>
              Nenhuma fala encontrada. Verifique se o arquivo foi importado corretamente.
            </p>
          </div>
        ) : carregando ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--brand-400)', borderTopColor: 'transparent' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Carregando falas…</p>
          </div>
        ) : (
          <>
            {/* Header fixo — fora do scroll, scrollbar não aparece aqui */}
            <table className="w-full text-[12.5px] shrink-0">
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <Th>#</Th>
                  <Th>Participante</Th>
                  <Th>Fala</Th>
                </tr>
              </thead>
            </table>
            {/* Corpo rolável — scrollbar aparece só aqui */}
            <div className="flex-1 overflow-y-auto" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <table className="w-full text-[12.5px]">
                <colgroup>
                  <col style={{ width: '3rem' }} />
                  <col style={{ width: '9rem' }} />
                  <col />
                </colgroup>
                <tbody>
                  {falas.map((f) => (
                    <tr key={f.idFala} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text-disabled)' }}>
                        {f.idFala}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--brand-300)' }}>
                        {f.falante}
                      </td>
                      <td className="px-4 py-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {f.texto}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </th>
  )
}
