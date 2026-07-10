import { useEffect, useRef, useState } from 'react'
import { FolderPlus, FileText, Clock, MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/state/useAppStore'
import type { Project } from '@/types'

export default function ProjectsView() {
  const { definirProjeto, projetoAtual } = useAppStore()
  const [recentes, setRecentes] = useState<Project[]>([])
  const [criando, setCriando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [erro, setErro] = useState('')

  function recarregar() {
    window.api?.listarProjetosRecentes().then(setRecentes)
  }

  useEffect(() => { recarregar() }, [])

  async function criarProjeto() {
    if (!nomeNovo.trim()) { setErro('Digite um nome para o projeto.'); return }
    setErro('')
    try {
      const p = await window.api.criarProjeto(nomeNovo.trim())
      definirProjeto(p)
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível criar o projeto.')
    } finally {
      setCriando(false)
      setNomeNovo('')
    }
  }

  async function abrir(p: Project) {
    // registra a abertura no backend (atualiza 'abertoEm' e a ordenação
    // dos recentes) sem tocar na data de criação, que a sidebar exibe
    const atualizado = await window.api.abrirProjeto(p.id)
    definirProjeto(atualizado ?? p)
  }

  async function renomear(id: string, novoNome: string) {
    await window.api.renomearProjeto(id, novoNome)
    recarregar()
  }

  async function excluir(id: string) {
    await window.api.excluirProjeto(id)
    if (projetoAtual?.id === id) definirProjeto(null)
    recarregar()
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-[900px] mx-auto px-10 py-14">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-[26px] font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-primary)' }}>
            Seus projetos de pesquisa
          </h1>
          <p className="text-[14px] mb-9" style={{ color: 'var(--text-secondary)' }}>
            Cada projeto guarda a entrevista, os participantes e os resultados gerados.
          </p>
        </motion.div>

        {/* Botão novo projeto */}
        <div className="mb-12">
          {!criando ? (
            <button
              onClick={() => { setCriando(true); setErro('') }}
              className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--brand-600), var(--brand-800))', boxShadow: 'var(--shadow-soft)' }}
            >
              <FolderPlus size={16} />
              Criar novo projeto
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="p-5 rounded-2xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
            >
              <label className="text-[12.5px] font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Nome do projeto
              </label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nomeNovo}
                  onChange={(e) => { setNomeNovo(e.target.value); setErro('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') criarProjeto(); if (e.key === 'Escape') setCriando(false) }}
                  placeholder="Ex.: Entrevistas — Alfabetização 2026"
                  className="flex-1 px-3.5 py-2.5 rounded-lg text-[13.5px] outline-none"
                  style={{ background: 'var(--surface-1)', border: `1px solid ${erro ? 'var(--error)' : 'var(--border-default)'}`, color: 'var(--text-primary)' }}
                />
                <button onClick={criarProjeto} className="px-4 py-2.5 rounded-lg text-[13.5px] font-medium text-white"
                  style={{ background: 'var(--brand-500)' }}>
                  Criar
                </button>
                <button onClick={() => { setCriando(false); setErro('') }}
                  className="px-3.5 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors hover:opacity-90"
                  style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
              </div>
              {erro && <p className="mt-2 text-[12px]" style={{ color: 'var(--error)' }}>{erro}</p>}
            </motion.div>
          )}
        </div>

        {/* Lista de projetos recentes */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
            <h2 className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Recentes
            </h2>
          </div>

          {recentes.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center rounded-2xl"
              style={{ border: '1px dashed var(--border-default)' }}>
              <FileText size={28} style={{ color: 'var(--text-disabled)' }} className="mb-3" />
              <p className="text-[13.5px]" style={{ color: 'var(--text-tertiary)' }}>
                Nenhum projeto ainda. Crie o primeiro acima.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <AnimatePresence>
                {recentes.map((p) => (
                  <CardProjeto
                    key={p.id}
                    projeto={p}
                    onAbrir={() => abrir(p)}
                    onRenomear={(nome) => renomear(p.id, nome)}
                    onExcluir={() => excluir(p.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card de projeto com menu de contexto ─────────────────────────────────────

function CardProjeto({ projeto, onAbrir, onRenomear, onExcluir }: {
  projeto: Project
  onAbrir: () => void
  onRenomear: (nome: string) => void
  onExcluir: () => void
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [renomeando, setRenomeando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [nomeEditado, setNomeEditado] = useState(projeto.nome)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!menuAberto) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAberto(false)
        setConfirmandoExclusao(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuAberto])

  // Foca o input ao entrar no modo renomear
  useEffect(() => {
    if (renomeando) setTimeout(() => inputRef.current?.focus(), 50)
  }, [renomeando])

  function confirmarRenomear() {
    const nome = nomeEditado.trim()
    if (nome && nome !== projeto.nome) onRenomear(nome)
    setRenomeando(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative rounded-xl group"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Área clicável principal — só ativa quando NÃO está renomeando */}
      <button
        onClick={() => { if (!renomeando) onAbrir() }}
        disabled={renomeando}
        className="w-full text-left p-4 rounded-xl"
      >
        <div className="w-full h-20 rounded-lg mb-3 flex items-center justify-center"
          style={{ background: 'var(--surface-3)' }}>
          <FileText size={20} style={{ color: 'var(--brand-400)' }} />
        </div>

        <p className="text-[13px] font-medium truncate mb-0.5 pr-2" style={{ color: 'var(--text-primary)' }}>
          {projeto.nome}
        </p>

        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Aberto em {new Date(projeto.abertoEm).toLocaleDateString('pt-BR')}
        </p>
      </button>

      {/* Input de renomear — fora do botão principal para evitar qualquer
          propagação de eventos de teclado (espaço, Enter, etc.) */}
      <AnimatePresence>
        {renomeando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0 rounded-xl p-4 flex flex-col"
            style={{ background: 'var(--surface-2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full h-20 rounded-lg mb-3 flex items-center justify-center"
              style={{ background: 'var(--surface-3)' }}>
              <FileText size={20} style={{ color: 'var(--brand-400)' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={nomeEditado}
                onChange={(e) => setNomeEditado(e.target.value)}
                onKeyDown={(e) => {
                  // Isolar completamente o input — nenhuma tecla deve
                  // vazar para o botão pai ou disparar outra ação.
                  e.stopPropagation()
                  if (e.key === 'Enter') confirmarRenomear()
                  if (e.key === 'Escape') { setRenomeando(false); setNomeEditado(projeto.nome) }
                }}
                className="flex-1 px-2 py-1 rounded text-[12.5px] outline-none min-w-0"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--brand-500)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={confirmarRenomear}
                className="p-1 rounded transition-colors hover:bg-green-500/20"
                style={{ color: 'var(--success)' }}
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => { setRenomeando(false); setNomeEditado(projeto.nome) }}
                className="p-1 rounded transition-colors hover:bg-red-500/20"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botão de menu (três pontinhos) — canto inferior direito, oculto durante renomeio */}
      <div className="absolute bottom-3 right-3" ref={menuRef} style={{ display: renomeando ? 'none' : undefined }}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuAberto(!menuAberto); setConfirmandoExclusao(false) }}
          className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}
        >
          <MoreHorizontal size={13} />
        </button>

        <AnimatePresence>
          {menuAberto && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 bottom-8 w-44 rounded-xl py-1 z-50"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
            >
              {!confirmandoExclusao ? (
                <>
                  <MenuItem
                    icone={Pencil}
                    label="Renomear"
                    onClick={() => { setRenomeando(true); setMenuAberto(false) }}
                  />
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 8px' }} />
                  <MenuItem
                    icone={Trash2}
                    label="Excluir projeto"
                    perigo
                    onClick={() => setConfirmandoExclusao(true)}
                  />
                </>
              ) : (
                <div className="px-3 py-2">
                  <p className="text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Excluir <strong>{projeto.nome}</strong>? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onExcluir(); setMenuAberto(false) }}
                      className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: 'var(--error)' }}
                    >
                      Excluir
                    </button>
                    <button
                      onClick={() => setConfirmandoExclusao(false)}
                      className="flex-1 py-1.5 rounded-lg text-[12px]"
                      style={{ color: 'var(--text-secondary)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function MenuItem({ icone: Icon, label, onClick, perigo = false }: {
  icone: typeof Pencil; label: string; onClick: () => void; perigo?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors hover:opacity-80"
      style={{ color: perigo ? 'var(--error)' : 'var(--text-secondary)' }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}
