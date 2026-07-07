import { useEffect, useState } from 'react'
import { Plus, X, ChevronRight, Info } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import SectionHeader from '@/components/SectionHeader'
import type { ConfiguracaoLimpeza } from '@/types'

const VAZIO: ConfiguracaoLimpeza = {
  palavrasIgnoradas: [],
  palavrasProtegidas: [],
  removerSiglas: false,
  removerNomesDePessoas: true,
  removerLocais: false,
  removerOrganizacoes: false,
}

interface Props {
  onConcluir: () => void
  concluido: boolean
}

export default function CleaningStep({ onConcluir, concluido }: Props) {
  const { projetoAtual } = useAppStore()
  const [cfg, setCfg] = useState<ConfiguracaoLimpeza>(VAZIO)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!projetoAtual) return
    window.api.obterConfiguracaoLimpeza(projetoAtual.id).then(setCfg)
  }, [projetoAtual])

  async function salvarEContinuar() {
    if (!projetoAtual) return
    setSalvando(true)
    await window.api.salvarConfiguracaoLimpeza(projetoAtual.id, cfg)
    setSalvando(false)
    onConcluir()
  }

  return (
    <div className="max-w-[680px] px-10 py-10">
      <SectionHeader
        titulo="Configurações de limpeza"
        descricao="Ajuste o que deve ser ignorado na análise. Essas configurações são opcionais — os padrões já funcionam bem para a maioria das entrevistas."
      />

      <div className="flex flex-col gap-6">
        <ListaEditavel
          titulo="Palavras a ignorar"
          ajuda='Termos sem valor analítico, como marcadores de fala (ex.: "né", "tipo", "aí").'
          itens={cfg.palavrasIgnoradas}
          onChange={(itens) => setCfg({ ...cfg, palavrasIgnoradas: itens })}
        />

        <ListaEditavel
          titulo="Palavras que nunca devem ser removidas"
          ajuda="Termos importantes para sua pesquisa que não podem ser descartados mesmo que pareçam genéricos."
          itens={cfg.palavrasProtegidas}
          onChange={(itens) => setCfg({ ...cfg, palavrasProtegidas: itens })}
        />

        <div className="p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <Info size={13} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-[12.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              Remover automaticamente da análise
            </p>
          </div>
          <Toggle
            label="Nomes de pessoas citadas na conversa"
            checked={cfg.removerNomesDePessoas}
            onChange={(v) => setCfg({ ...cfg, removerNomesDePessoas: v })}
          />
          <Toggle
            label="Nomes de lugares"
            checked={cfg.removerLocais}
            onChange={(v) => setCfg({ ...cfg, removerLocais: v })}
          />
          <Toggle
            label="Nomes de instituições e organizações"
            checked={cfg.removerOrganizacoes}
            onChange={(v) => setCfg({ ...cfg, removerOrganizacoes: v })}
          />
          <Toggle
            label="Siglas (ex: ONG, PEI, AEE) — mantidas por padrão"
            checked={cfg.removerSiglas}
            onChange={(v) => setCfg({ ...cfg, removerSiglas: v })}
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={salvarEContinuar}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold text-white transition-opacity"
            style={{ background: 'var(--brand-500)', opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? 'Salvando…' : 'Salvar e continuar'} <ChevronRight size={15} />
          </button>
          <button
            onClick={onConcluir}
            className="text-[12.5px] transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Pular, usar padrões
          </button>
        </div>
      </div>
    </div>
  )
}

function ListaEditavel({ titulo, ajuda, itens, onChange }: {
  titulo: string; ajuda: string; itens: string[]; onChange: (v: string[]) => void
}) {
  const [novo, setNovo] = useState('')

  function adicionar() {
    const valor = novo.trim().toLowerCase()
    if (valor && !itens.includes(valor)) onChange([...itens, valor])
    setNovo('')
  }

  return (
    <div>
      <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
      <p className="text-[12px] mb-2.5" style={{ color: 'var(--text-tertiary)' }}>{ajuda}</p>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {itens.map((item) => (
          <span key={item} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-md text-[12px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
            {item}
            <button onClick={() => onChange(itens.filter((i) => i !== item))} className="p-0.5 rounded hover:opacity-70">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
          placeholder="Digite e pressione Enter"
          className="flex-1 px-3 py-2 rounded-lg text-[12.5px] outline-none"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        />
        <button onClick={adicionar} className="px-3 py-2 rounded-lg" style={{ background: 'var(--surface-3)' }}>
          <Plus size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between py-1 w-full">
      <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="w-9 h-5 rounded-full relative transition-colors shrink-0"
        style={{ background: checked ? 'var(--brand-500)' : 'var(--surface-4)' }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: checked ? '18px' : '2px' }} />
      </span>
    </button>
  )
}
