import { PlayCircle, RefreshCw, CheckCircle2, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import SectionHeader from '@/components/SectionHeader'

interface Props {
  executando: boolean
  podeComecar: boolean
  jaTemResultados: boolean
  onGerar: () => void
  onVoltarResultados: () => void
}

export default function GenerateStep({
  executando,
  podeComecar,
  jaTemResultados,
  onGerar,
  onVoltarResultados,
}: Props) {
  return (
    <div className="px-10 py-10 max-w-[620px]">
      <SectionHeader
        titulo={jaTemResultados ? 'Reanalisar entrevista' : 'Gerar resultados'}
        descricao={
          jaTemResultados
            ? 'As configurações foram salvas. Clique em reanalisar para aplicar as mudanças — isso substitui os resultados anteriores.'
            : 'Tudo pronto. A análise processa a entrevista com as configurações definidas nas etapas anteriores. Isso pode levar alguns minutos dependendo do tamanho do arquivo.'
        }
      />

      {/* Card principal */}
      <div
        className="p-6 rounded-2xl flex flex-col items-center text-center gap-5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--surface-3)' }}
        >
          {jaTemResultados
            ? <RefreshCw size={24} style={{ color: 'var(--brand-400)' }} />
            : <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
          }
        </div>

        <div>
          <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            {jaTemResultados ? 'Pronto para reanalisar' : 'Preparação concluída'}
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>
            {jaTemResultados
              ? 'Os resultados anteriores serão substituídos ao concluir.'
              : 'Participantes e limpeza configurados. Clique para iniciar a análise.'}
          </p>
        </div>

        <button
          onClick={onGerar}
          disabled={executando || !podeComecar}
          className={clsx(
            'flex items-center gap-2.5 px-7 py-3 rounded-xl text-[14px] font-semibold text-white transition-opacity',
            (executando || !podeComecar) && 'opacity-50 cursor-not-allowed',
          )}
          style={{ background: 'var(--brand-500)' }}
        >
          {jaTemResultados
            ? <RefreshCw size={15} className={clsx(executando && 'animate-spin')} />
            : <PlayCircle size={16} />
          }
          {executando ? 'Analisando…' : jaTemResultados ? 'Reanalisar' : 'Gerar resultados'}
        </button>

        {!podeComecar && (
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            Defina os participantes antes de continuar.
          </p>
        )}
      </div>

      {/* Voltar para resultados existentes sem reanalisar */}
      {jaTemResultados && !executando && (
        <button
          onClick={onVoltarResultados}
          className="mt-4 flex items-center gap-1.5 text-[12.5px] transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <ArrowLeft size={13} /> Ver resultados anteriores sem reanalisar
        </button>
      )}
    </div>
  )
}
