"use strict";
const electron = require("electron");
const api = {
  // Projetos
  listarProjetosRecentes: () => electron.ipcRenderer.invoke("listarProjetosRecentes"),
  criarProjeto: (nome) => electron.ipcRenderer.invoke("criarProjeto", nome),
  abrirProjeto: (id) => electron.ipcRenderer.invoke("abrirProjeto", id),
  abrirProjetoPorId: (id) => electron.ipcRenderer.invoke("abrirProjetoPorId", id),
  renomearProjeto: (id, novoNome) => electron.ipcRenderer.invoke("renomearProjeto", id, novoNome),
  excluirProjeto: (id) => electron.ipcRenderer.invoke("excluirProjeto", id),
  // Estado do projeto
  verificarEstadoProjeto: (projetoId) => electron.ipcRenderer.invoke("verificarEstadoProjeto", projetoId),
  // Preparação
  importarEntrevista: (projetoId) => electron.ipcRenderer.invoke("importarEntrevista", projetoId),
  listarParticipantes: (projetoId) => electron.ipcRenderer.invoke("listarParticipantes", projetoId),
  definirPapeis: (projetoId, entrevistados, entrevistadores) => electron.ipcRenderer.invoke("definirPapeis", projetoId, entrevistados, entrevistadores),
  obterConfiguracaoLimpeza: (projetoId) => electron.ipcRenderer.invoke("obterConfiguracaoLimpeza", projetoId),
  salvarConfiguracaoLimpeza: (projetoId, cfg) => electron.ipcRenderer.invoke("salvarConfiguracaoLimpeza", projetoId, cfg),
  preVisualizar: (projetoId, limite) => electron.ipcRenderer.invoke("preVisualizar", projetoId, limite),
  // Pipeline
  executarPreparacao: (projetoId) => electron.ipcRenderer.invoke("executarPreparacao", projetoId),
  executarAnalises: (projetoId) => electron.ipcRenderer.invoke("executarAnalises", projetoId),
  onProgresso: (callback) => {
    const handler = (_, p) => callback(p);
    electron.ipcRenderer.on("progresso", handler);
    return () => electron.ipcRenderer.off("progresso", handler);
  },
  // Resultados
  obterManifestoResultados: (projetoId) => electron.ipcRenderer.invoke("obterManifestoResultados", projetoId),
  obterDadosGrafo: (projetoId, participante) => electron.ipcRenderer.invoke("obterDadosGrafo", projetoId, participante),
  // Imagem local → base64
  lerImagemBase64: (caminho) => electron.ipcRenderer.invoke("lerImagemBase64", caminho),
  // Exportação
  exportarArquivo: (caminhoOrigem, nomeSugerido) => electron.ipcRenderer.invoke("exportarArquivo", caminhoOrigem, nomeSugerido),
  exportarPasta: (projetoId, categoria, participante) => electron.ipcRenderer.invoke("exportarPasta", projetoId, categoria, participante),
  abrirNoExplorador: (caminho) => electron.ipcRenderer.invoke("abrirNoExplorador", caminho)
};
electron.contextBridge.exposeInMainWorld("api", api);
