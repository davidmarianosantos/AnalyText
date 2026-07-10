import { FolderKanban, FileSpreadsheet, Share2, ChevronLeft, Sparkles, CalendarDays } from 'lucide-react'
import { useAppStore, type Secao } from '@/state/useAppStore'

const ITENS: { id: Secao; label: string; icon: typeof FolderKanban; precisaProjeto: boolean }[] = [
  { id: 'projetos', label: 'Projetos', icon: FolderKanban, precisaProjeto: false },
  { id: 'preparacao', label: 'Preparação dos Dados', icon: FileSpreadsheet, precisaProjeto: true },
  { id: 'resultados', label: 'Resultados', icon: Share2, precisaProjeto: true },
]

export default function Sidebar() {
  const { secaoAtiva, irPara, projetoAtual, definirProjeto } = useAppStore()

  const itensSemProjeto = ITENS.filter((i) => !i.precisaProjeto)
  const itensComProjeto = ITENS.filter((i) => i.precisaProjeto)

  const dataCriacao = projetoAtual
    ? new Date(projetoAtual.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <aside className="w-[248px] h-full flex flex-col shrink-0"
      style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' }}>

      {/* Logo */}
      <div className="h-20 flex items-center gap-3 px-5">
        <img src="/logo.png" alt="logo" className="w-12 h-12 object-contain" />
        <span className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          AnalyText
        </span>
      </div>

      {/* Nav principal */}
      <nav className="px-3 flex flex-col gap-1">
        {itensSemProjeto.map((item) => {
          const ativo = secaoAtiva === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => irPara(item.id)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all text-left"
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

      {/* Separador */}
      <div className="mx-4 my-3" style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Card do projeto */}
      {projetoAtual ? (
        <div className="mx-3 rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border-default)', background: 'var(--surface-2)' }}>

          <div className="px-3.5 pt-3 pb-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Projeto aberto
            </p>
            <p className="text-[13.5px] font-semibold truncate mb-2.5" style={{ color: 'var(--text-primary)' }}>
              {projetoAtual.nome}
            </p>
            <div className="flex items-center gap-1.5">
              <CalendarDays size={11} style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                Criado em {dataCriacao}
              </span>
            </div>
          </div>

          <button
            onClick={() => definirProjeto(null)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12px] transition-colors"
            style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
          >
            <ChevronLeft size={13} />
            Trocar projeto
          </button>
        </div>
      ) : (
        <div className="mx-3 px-3.5 py-3 rounded-xl flex items-center gap-2.5"
          style={{ border: '1px dashed var(--border-subtle)' }}>
          <FolderKanban size={14} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
          <p className="text-[12px]" style={{ color: 'var(--text-disabled)' }}>
            Nenhum projeto aberto
          </p>
        </div>
      )}

      {/* Nav de etapas */}
      {projetoAtual && (
        <nav className="px-3 mt-3 flex flex-col gap-1">
          <p className="px-3 text-[10.5px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Etapas
          </p>
          {itensComProjeto.map((item) => {
            const ativo = secaoAtiva === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => irPara(item.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all text-left"
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
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Rodapé */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2 mb-0.5">
          <Sparkles size={11} style={{ color: 'var(--text-disabled)' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-disabled)' }}>AnalyText v1.0</span>
        </div>
        <p className="text-[10.5px]" style={{ color: 'var(--text-disabled)' }}>
          Análise qualitativa para entrevistas
        </p>
      </div>

    </aside>
  )
}
