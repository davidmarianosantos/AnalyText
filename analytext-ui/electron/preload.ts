import { ipcRenderer, contextBridge } from 'electron'
import type { AnalyTextAPI } from '../src/types'

// Expõe window.api com todos os métodos que o frontend usa.
// Cada método é apenas uma ponte IPC — a lógica real fica no main.ts.

const api: AnalyTextAPI = {
  // Projetos
  listarProjetosRecentes: () => ipcRenderer.invoke('listarProjetosRecentes'),
  criarProjeto: (nome) => ipcRenderer.invoke('criarProjeto', nome),
  abrirProjeto: (id: string) => ipcRenderer.invoke('abrirProjeto', id),
  abrirProjetoPorId: (id: string) => ipcRenderer.invoke('abrirProjetoPorId', id),
  renomearProjeto: (id: string, novoNome: string) => ipcRenderer.invoke('renomearProjeto', id, novoNome),
  excluirProjeto: (id: string) => ipcRenderer.invoke('excluirProjeto', id),

  // Estado do projeto
  verificarEstadoProjeto: (projetoId) => ipcRenderer.invoke('verificarEstadoProjeto', projetoId),

  // Preparação
  importarEntrevista: (projetoId) => ipcRenderer.invoke('importarEntrevista', projetoId),
  listarParticipantes: (projetoId) => ipcRenderer.invoke('listarParticipantes', projetoId),
  definirPapeis: (projetoId, entrevistados, entrevistadores) =>
    ipcRenderer.invoke('definirPapeis', projetoId, entrevistados, entrevistadores),
  obterConfiguracaoLimpeza: (projetoId) => ipcRenderer.invoke('obterConfiguracaoLimpeza', projetoId),
  salvarConfiguracaoLimpeza: (projetoId, cfg) =>
    ipcRenderer.invoke('salvarConfiguracaoLimpeza', projetoId, cfg),
  preVisualizar: (projetoId, limite) => ipcRenderer.invoke('preVisualizar', projetoId, limite),

  // Pipeline
  executarPreparacao: (projetoId) => ipcRenderer.invoke('executarPreparacao', projetoId),
  executarAnalises: (projetoId) => ipcRenderer.invoke('executarAnalises', projetoId),
  onProgresso: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, p: any) => callback(p)
    ipcRenderer.on('progresso', handler)
    return () => ipcRenderer.off('progresso', handler)
  },

  // Resultados
  obterManifestoResultados: (projetoId) =>
    ipcRenderer.invoke('obterManifestoResultados', projetoId),
  obterDadosGrafo: (projetoId, participante) =>
    ipcRenderer.invoke('obterDadosGrafo', projetoId, participante),

  // Imagem local → base64
  lerImagemBase64: (caminho) => ipcRenderer.invoke('lerImagemBase64', caminho),

  // Exportação
  exportarArquivo: (caminhoOrigem, nomeSugerido) =>
    ipcRenderer.invoke('exportarArquivo', caminhoOrigem, nomeSugerido),
  exportarPasta: (projetoId, categoria, participante) =>
    ipcRenderer.invoke('exportarPasta', projetoId, categoria, participante),
  abrirNoExplorador: (caminho) => ipcRenderer.invoke('abrirNoExplorador', caminho),
}

contextBridge.exposeInMainWorld('api', api)
