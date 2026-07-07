import { useState, useEffect } from 'react'
import { Check, Upload, Users, SlidersHorizontal, Eye, PlayCircle, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useAppStore } from '@/state/useAppStore'
import ImportStep from '@/components/dataprep/ImportStep'
import PreviewStep from '@/components/dataprep/PreviewStep'
import ParticipantsStep from '@/components/dataprep/ParticipantsStep'
import CleaningStep from '@/components/dataprep/CleaningStep'
import GenerateStep from '@/components/dataprep/GenerateStep'

const PASSOS = [
  { id: 0, label: 'Importar entrevista', desc: 'Arquivo .txt da transcrição', icon: Upload },
  { id: 1, label: 'Pré-visualização', desc: 'Confirmar que o import está ok', icon: Eye },
  { id: 2, label: 'Participantes', desc: 'Quem é entrevistado?', icon: Users },
  { id: 3, label: 'Limpeza', desc: 'O que ignorar na análise', icon: SlidersHorizontal },
  { id: 4, label: 'Gerar resultados', desc: 'Rodar a análise completa', icon: PlayCircle },
] as const

export default function DataPrepView() {
  const { projetoAtual, projetoTemEntrevista, irPara, definirProgresso, definirProjetoTemEntrevista } = useAppStore()

  // Inicializa já no estado correto: se projetoTemEntrevista é true no momento
  // da montagem (ex: usuário voltou de Resultados na mesma sessão), não precisa
  // esperar o useEffect — o passo e os concluídos já nascem certos.
  const [passoAtual, setPassoAtual] = useState(() => projetoTemEntrevista ? 2 : 0)
  const [concluidos, setConcluidos] = useState<Set<number>>(
    () => projetoTemEntrevista ? new Set([0, 1]) : new Set()
  )
  const [executando, setExecutando] = useState(false)

  // Cobre o caso de projetoTemEntrevista mudar depois da montagem
  // (ex: usuário importou o arquivo pela primeira vez nesta sessão e
  // depois gerou resultados e voltou — nesse ponto já está em passo 4
  // então não precisa fazer nada, mas cobre mudanças futuras inesperadas)
  useEffect(() => {
    if (projetoTemEntrevista) {
      setConcluidos((prev) => {
        if (prev.has(0) && prev.has(1)) return prev
        return new Set([0, 1, ...prev])
      })
    }
  }, [projetoTemEntrevista])

  function concluirPasso(id: number) {
    setConcluidos((prev) => new Set([...prev, id]))
    if (id < PASSOS.length - 1) setPassoAtual(id + 1)
  }

  async function irParaResultados() {
    if (!projetoAtual || !concluidos.has(2)) return
    setExecutando(true)
    try {
      await window.api.executarAnalises(projetoAtual.id)
      definirProjetoTemEntrevista(true)
      irPara('resultados')
    } finally {
      setExecutando(false)
      setTimeout(() => definirProgresso(null), 800)
    }
  }

  // No modo "projeto existente", participantes (2), limpeza (3) e gerar (4) são acessíveis
  function isAcessivel(idx: number) {
    if (projetoTemEntrevista) {
      return idx >= 2
    }
    return idx === 0 || concluidos.has(idx - 1)
  }

  return (
    <div className="h-full flex">
      {/* Sidebar de passos */}
      <div
        className="w-[240px] shrink-0 flex flex-col py-8 px-3"
        style={{ borderRight: '1px solid var(--border-subtle)' }}
      >
        <p className="px-3 mb-5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          Preparação dos dados
        </p>

        <div className="flex flex-col gap-1">
          {PASSOS.map((passo, idx) => {
            const Icon = passo.icon
            const ativo = passoAtual === idx
            const concluido = concluidos.has(idx)
            const acessivel = isAcessivel(idx)
            // Import e preview bloqueados em modo "projeto existente"
            const bloqueadoPermanente = projetoTemEntrevista && idx < 2

            return (
              <button
                key={passo.id}
                disabled={!acessivel}
                onClick={() => acessivel && setPassoAtual(idx)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                  !acessivel && 'opacity-35 cursor-not-allowed',
                  ativo && 'shadow-sm',
                )}
                style={{ background: ativo ? 'var(--surface-2)' : 'transparent' }}
              >
                <div
                  className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{
                    background: concluido
                      ? 'var(--success)'
                      : ativo
                      ? 'var(--brand-500)'
                      : 'var(--surface-3)',
                    color: concluido || ativo ? '#fff' : 'var(--text-disabled)',
                  }}
                >
                  {concluido ? <Check size={11} strokeWidth={3} /> : bloqueadoPermanente ? <Lock size={10} /> : idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium leading-tight truncate"
                    style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {passo.label}
                  </p>
                  <p className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: 'var(--text-disabled)' }}>
                    {bloqueadoPermanente ? 'Arquivo já importado' : passo.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex-1" />
      </div>

      {/* Conteúdo do passo ativo */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={passoAtual}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className={passoAtual === 1 ? 'h-full' : 'h-full overflow-y-auto scrollbar-thin'}
          >
            {passoAtual === 0 && (
              <ImportStep onConcluir={() => concluirPasso(0)} concluido={concluidos.has(0)} />
            )}
            {passoAtual === 1 && (
              <PreviewStep
                onConcluir={() => concluirPasso(1)}
                concluido={concluidos.has(1)}
                onVoltar={() => setPassoAtual(0)}
              />
            )}
            {passoAtual === 2 && (
              <ParticipantsStep onConcluir={() => concluirPasso(2)} concluido={concluidos.has(2)} />
            )}
            {passoAtual === 3 && (
              <CleaningStep onConcluir={() => concluirPasso(3)} concluido={concluidos.has(3)} />
            )}
            {passoAtual === 4 && (
              <GenerateStep
                executando={executando}
                podeComecar={concluidos.has(2)}
                jaTemResultados={projetoTemEntrevista}
                onGerar={irParaResultados}
                onVoltarResultados={() => irPara('resultados')}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
