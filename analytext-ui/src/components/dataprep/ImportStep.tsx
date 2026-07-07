import { useState } from 'react'
import { Upload, FileCheck2, FileText, AlertCircle, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import SectionHeader from '@/components/SectionHeader'

interface Props {
  onConcluir: () => void
  concluido: boolean
}

export default function ImportStep({ onConcluir, concluido }: Props) {
  const { projetoAtual } = useAppStore()
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function selecionarArquivo() {
    if (!projetoAtual) return
    setProcessando(true)
    setErro(null)
    try {
      const res = await window.api.importarEntrevista(projetoAtual.id)
      if (res) setArquivo(res.nomeArquivo)
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      // Mensagens amigáveis para erros conhecidos
      if (msg.includes('Permission denied') || msg.includes('Acesso negado')) {
        setErro('Não foi possível salvar o arquivo processado. Feche o projeto e tente novamente.')
      } else if (msg.includes('não encontrado') || msg.includes('not found')) {
        setErro('Arquivo não encontrado. Verifique se o .txt ainda existe no local selecionado.')
      } else {
        setErro(msg || 'Ocorreu um erro ao importar a entrevista.')
      }
    } finally {
      setProcessando(false)
    }
  }

  function removerArquivo() {
    setArquivo(null)
    setErro(null)
  }

  return (
    <div className="max-w-[620px] px-10 py-10">
      <SectionHeader
        titulo="Importar entrevista"
        descricao="Selecione um único arquivo de texto (.txt) com a transcrição completa. Cada fala deve estar identificada pelo nome do participante."
      />

      {/* Área de upload */}
      {!arquivo && !processando ? (
        <button
          onClick={selecionarArquivo}
          className="w-full rounded-2xl py-14 flex flex-col items-center gap-3 transition-colors"
          style={{ border: '1.5px dashed var(--border-strong)', background: 'var(--surface-2)' }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface-3)' }}>
            <Upload size={22} style={{ color: 'var(--brand-400)' }} />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Clique para selecionar o arquivo
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Apenas um arquivo .txt por projeto
            </p>
          </div>
        </button>

      ) : processando ? (
        /* Loading enquanto o preprocessing roda */
        <div
          className="w-full rounded-2xl py-14 flex flex-col items-center gap-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
        >
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--brand-400)' }} />
          <div className="text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Processando entrevista…
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Identificando participantes e preparando os dados
            </p>
          </div>
        </div>

      ) : (
        /* Arquivo importado com sucesso */
        <div
          className="w-full rounded-2xl p-5 flex items-center gap-4"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--success-subtle, #d1fae5)' }}>
            <FileCheck2 size={18} style={{ color: 'var(--success)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{arquivo}</p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Entrevista importada e processada com sucesso
            </p>
          </div>
          <button
            onClick={removerArquivo}
            className="p-2 rounded-lg transition-colors hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
            title="Remover e escolher outro"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {erro && (
        <div className="mt-3 flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--error, #ef4444)' }}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Dica de formato */}
      <div className="mt-5 p-4 rounded-xl flex gap-3" style={{ background: 'var(--surface-2)' }}>
        <FileText size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <div>
          <p className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Formato esperado</p>
          <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
{`Maria
Eu comecei a trabalhar cedo...

Pesquisadora
Como foi essa experiência?`}
          </pre>
        </div>
      </div>

      {/* Botão de avançar — só aparece quando processado com sucesso */}
      {arquivo && !processando && (
        <button
          onClick={onConcluir}
          className="mt-7 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold text-white"
          style={{ background: 'var(--brand-500)' }}
        >
          Continuar para participantes <ChevronRight size={15} />
        </button>
      )}

      {concluido && !arquivo && !processando && (
        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>
          Entrevista já importada. Selecione outra se quiser substituir.
        </p>
      )}
    </div>
  )
}
