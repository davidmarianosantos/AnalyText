import { useEffect, useState } from 'react'
import { UserCheck, UserX, HelpCircle, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/state/useAppStore'
import SectionHeader from '@/components/SectionHeader'
import type { Participante } from '@/types'

type Papel = Participante['papel']

interface Props {
  onConcluir: () => void
  concluido: boolean
}

export default function ParticipantsStep({ onConcluir }: Props) {
  const { projetoAtual } = useAppStore()
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!projetoAtual) return
    window.api.listarParticipantes(projetoAtual.id).then(setParticipantes)
  }, [projetoAtual])

  function definirPapel(nome: string, papel: Papel) {
    setParticipantes((prev) => prev.map((p) => (p.nome === nome ? { ...p, papel } : p)))
  }

  async function salvarEContinuar() {
    if (!projetoAtual) return
    setSalvando(true)
    const entrevistados = participantes.filter((p) => p.papel === 'entrevistado').map((p) => p.nome)
    const entrevistadores = participantes.filter((p) => p.papel === 'entrevistador').map((p) => p.nome)
    await window.api.definirPapeis(projetoAtual.id, entrevistados, entrevistadores)
    setSalvando(false)
    onConcluir()
  }

  const temAlgumEntrevistado = participantes.some((p) => p.papel === 'entrevistado')
  const semDados = participantes.length === 0

  return (
    <div className="max-w-[680px] px-10 py-10">
      <SectionHeader
        titulo="Quem você quer analisar?"
        descricao="Marque quem é o participante entrevistado. Os resultados serão gerados para cada entrevistado separadamente."
      />

      {semDados ? (
        <div className="py-14 text-center rounded-2xl" style={{ border: '1px dashed var(--border-default)' }}>
          <p className="text-[13.5px]" style={{ color: 'var(--text-tertiary)' }}>
            Nenhum participante encontrado. Verifique se o arquivo foi importado corretamente.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {participantes.map((p) => (
              <div
                key={p.nome}
                className="flex items-center justify-between px-4 py-3.5 rounded-xl"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              >
                <div>
                  <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
                  <p className="text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>{p.totalFalas} falas</p>
                </div>

                <div className="flex gap-1.5">
                  <BotaoPapel
                    ativo={p.papel === 'entrevistado'}
                    cor="var(--brand-500)"
                    icone={UserCheck}
                    label="Entrevistado"
                    onClick={() => definirPapel(p.nome, 'entrevistado')}
                  />
                  <BotaoPapel
                    ativo={p.papel === 'entrevistador'} 
                    cor="var(--text-tertiary)"
                    icone={UserX}
                    label="Conduziu a entrevista"
                    onClick={() => definirPapel(p.nome, 'entrevistador')}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-xl flex gap-3" style={{ background: 'var(--surface-2)' }}>
            <HelpCircle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Participantes sem papel definido serão ignorados na análise. Você pode marcar mais de um como entrevistado.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={salvarEContinuar}
              disabled={salvando || !temAlgumEntrevistado}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold text-white transition-opacity',
                (!temAlgumEntrevistado || salvando) && 'opacity-40 cursor-not-allowed',
              )}
              style={{ background: 'var(--brand-500)' }}
            >
              {salvando ? 'Salvando…' : 'Continuar para limpeza'} <ChevronRight size={15} />
            </button>
            {!temAlgumEntrevistado && (
              <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                Marque pelo menos um entrevistado para continuar.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BotaoPapel({ ativo, cor, icone: Icon, label, onClick }: {
  ativo: boolean; cor: string; icone: typeof UserCheck; label: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
      style={{
        background: ativo ? cor : 'var(--surface-3)',
        color: ativo ? '#fff' : 'var(--text-secondary)',
      }}
    >
      <Icon size={12.5} /> {label}
    </button>
  )
}
