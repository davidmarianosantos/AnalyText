import { create } from 'zustand'
import type { Project, ProgressoPipeline } from '@/types'

export type Secao = 'projetos' | 'preparacao' | 'resultados'

interface AppState {
  secaoAtiva: Secao
  projetoAtual: Project | null
  progresso: ProgressoPipeline | null
  // Flags de estado do projeto carregado
  projetoTemEntrevista: boolean
  projetoTemResultados: boolean

  irPara: (secao: Secao) => void
  definirProjeto: (p: Project | null) => void
  definirProgresso: (p: ProgressoPipeline | null) => void
  definirProjetoTemEntrevista: (valor: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  secaoAtiva: 'projetos',
  projetoAtual: null,
  progresso: null,
  projetoTemEntrevista: false,
  projetoTemResultados: false,

  irPara: (secao) => set({ secaoAtiva: secao }),

  definirProjeto: async (p) => {
    if (!p) {
      set({ projetoAtual: null, secaoAtiva: 'projetos', projetoTemEntrevista: false, projetoTemResultados: false })
      return
    }

    // Verifica o que já existe no disco para este projeto
    let temEntrevista = false
    let temResultados = false
    try {
      const estado = await window.api.verificarEstadoProjeto(p.id)
      temEntrevista = estado.temEntrevista
      temResultados = estado.temResultados
    } catch (_) { /* projeto novo ou api indisponível */ }

    set({
      projetoAtual: p,
      projetoTemEntrevista: temEntrevista,
      projetoTemResultados: temResultados,
      // Se já tem resultados → vai direto pra resultados
      // Se já tem entrevista → vai pra preparação (mas DataPrepView saberá pular o fluxo)
      // Caso novo → preparação do zero
      secaoAtiva: temResultados ? 'resultados' : 'preparacao',
    })
  },

  definirProgresso: (p) => set({ progresso: p }),
  definirProjetoTemEntrevista: (valor) => set({ projetoTemEntrevista: valor }),
}))
