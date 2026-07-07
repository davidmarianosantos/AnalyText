import { FolderKanban, FileSpreadsheet, Share2, ChevronLeft, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore, type Secao } from '@/state/useAppStore'

const ITENS: { id: Secao; label: string; icon: typeof FolderKanban; precisaProjeto: boolean }[] = [
  { id: 'projetos', label: 'Projetos', icon: FolderKanban, precisaProjeto: false },
  { id: 'preparacao', label: 'Preparação dos Dados', icon: FileSpreadsheet, precisaProjeto: true },
  { id: 'resultados', label: 'Resultados', icon: Share2, precisaProjeto: true },
]

export default function Sidebar() {
  const { secaoAtiva, irPara, projetoAtual, definirProjeto } = useAppStore()

  return (
    <aside className="w-[248px] h-full flex flex-col shrink-0"
      style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' }}>

      <div className="h-14 flex items-center gap-2 px-5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-700))' }}>
          <Sparkles size={13} color="white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          AnalyText
        </span>
      </div>

      {projetoAtual && (
        <button
          onClick={() => definirProjeto(null)}
          className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors group"
          style={{ background: 'var(--surface-2)' }}
        >
          <ChevronLeft size={14} style={{ color: 'var(--text-tertiary)' }} />
          <div className="overflow-hidden">
            <p className="text-[11px] leading-none mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Projeto atual
            </p>
            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {projetoAtual.nome}
            </p>
          </div>
        </button>
      )}

      <nav className="flex-1 px-3 py-1 flex flex-col gap-1">
        {ITENS.map((item) => {
          const desabilitado = item.precisaProjeto && !projetoAtual
          const ativo = secaoAtiva === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              disabled={desabilitado}
              onClick={() => irPara(item.id)}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all text-left',
                desabilitado && 'opacity-35 cursor-not-allowed',
              )}
              style={{
                background: ativo ? 'var(--surface-3)' : 'transparent',
                color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={16} strokeWidth={2} style={{ color: ativo ? 'var(--brand-400)' : undefined }} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="px-4 py-3 text-[11px]" style={{ color: 'var(--text-disabled)' }}>
        Análise qualitativa de entrevistas
      </div>
    </aside>
  )
}
