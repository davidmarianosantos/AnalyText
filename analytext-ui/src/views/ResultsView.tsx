import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Quote, Network, Users, Download, ImageIcon } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import type { ManifestoResultados, ArquivoResultado } from '@/types'

// Apenas as 3 categorias relevantes, na ordem de exibição
const CATEGORIAS = [
  { id: 'frequencia',      label: 'Frequência de termos',   icon: BarChart3, descricao: 'As palavras mais presentes na fala do participante.' },
  { id: 'expressoes',      label: 'Expressões recorrentes', icon: Quote,     descricao: 'Combinações de palavras que se repetem, como expressões e frases curtas.' },
  { id: 'grafo_similitude', label: 'Grafo de similitude',   icon: Network,   descricao: 'Mapa visual das relações entre os conceitos.' },
] as const

// Card de imagem grande com download
function ImageCard({ arquivo }: { arquivo: ArquivoResultado }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    window.api.lerImagemBase64(arquivo.caminho).then((data) => { if (data) setSrc(data) })
  }, [arquivo.caminho])

  async function baixar() {
    const nome = arquivo.caminho.split(/[\\/]/).pop() ?? 'resultado'
    await window.api.exportarArquivo(arquivo.caminho, nome)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="w-full rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', minHeight: 320 }}
      >
        {src
          ? <img src={src} alt={arquivo.titulo} className="w-full h-full object-contain" style={{ maxHeight: 520 }} />
          : <ImageIcon size={36} style={{ color: 'var(--text-disabled)' }} />
        }
      </div>
      <div className="flex items-center justify-between px-1">
        <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>{arquivo.titulo}</p>
        <button
          onClick={baixar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
          style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
        >
          <Download size={13} /> Baixar
        </button>
      </div>
    </div>
  )
}

export default function ResultsView() {
  const { projetoAtual } = useAppStore()
  const [manifesto, setManifesto] = useState<ManifestoResultados | null>(null)
  const [participante, setParticipante] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<typeof CATEGORIAS[number]['id']>('frequencia')

  useEffect(() => {
    if (!projetoAtual) return
    window.api.obterManifestoResultados(projetoAtual.id).then((m) => {
      setManifesto(m)
      if (m.participantes.length && !participante) setParticipante(m.participantes[0].participante)
    })
  }, [projetoAtual])

  const dadosParticipante = useMemo(
    () => manifesto?.participantes.find((p) => p.participante === participante) ?? null,
    [manifesto, participante],
  )

  // Só imagens, sem CSVs nem JSON
  const imagens = useMemo(() => {
    const cat = dadosParticipante?.categorias[categoria as keyof typeof dadosParticipante.categorias] ?? []
    return cat.filter((a) => a.tipo === 'imagem')
  }, [dadosParticipante, categoria])

  const semResultados = !manifesto || manifesto.participantes.length === 0

  if (semResultados) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-[360px]">
          <Network size={28} className="mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
          <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            Nenhum resultado ainda
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>
            Volte à Preparação dos Dados e clique em "Gerar resultados".
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Barra superior: participantes + categorias */}
      <div className="shrink-0 px-6 pt-5 pb-0 flex flex-col gap-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>

        {/* Seletor de participante */}
        <div className="flex items-center gap-2 flex-wrap">
          <Users size={13} style={{ color: 'var(--text-tertiary)' }} className="shrink-0" />
          {manifesto!.participantes.map((p) => (
            <button
              key={p.participante}
              onClick={() => setParticipante(p.participante)}
              className="px-3.5 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors"
              style={{
                background: participante === p.participante ? 'var(--brand-500)' : 'var(--surface-2)',
                color: participante === p.participante ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {p.participante}
            </button>
          ))}
        </div>

        {/* Tabs de categoria */}
        <div className="flex gap-0">
          {CATEGORIAS.map((c) => {
            const Icon = c.icon
            const ativo = categoria === c.id
            return (
              <button
                key={c.id}
                onClick={() => setCategoria(c.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors relative"
                style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                <Icon size={14} style={{ color: ativo ? 'var(--brand-400)' : 'var(--text-disabled)' }} />
                {c.label}
                {ativo && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                    style={{ background: 'var(--brand-500)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Área de conteúdo */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="text-[12.5px] mb-6" style={{ color: 'var(--text-tertiary)' }}>
          {CATEGORIAS.find((c) => c.id === categoria)?.descricao}
        </p>

        {imagens.length === 0 ? (
          <div className="py-16 text-center rounded-2xl"
            style={{ border: '1px dashed var(--border-default)' }}>
            <ImageIcon size={24} className="mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              Nenhuma imagem gerada para {participante} nesta categoria.
            </p>
          </div>
        ) : (
          <div className={imagens.length === 1 ? 'max-w-3xl mx-auto' : 'grid grid-cols-2 gap-8'}>
            {imagens.map((a) => <ImageCard key={a.caminho} arquivo={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
