// Tipos compartilhados pela aplicação. Mantêm o vocabulário do PESQUISADOR,
// nunca o vocabulário técnico do backend (TF-IDF, Louvain, HDBSCAN etc.)

export interface Project {
  id: string
  nome: string
  caminho: string          // pasta raiz do projeto no disco
  criadoEm: string         // ISO date
  abertoEm: string         // ISO date — para ordenar "recentes"
  miniatura?: string       // caminho de uma imagem de capa (ex: grafo gerado)
}

export interface Participante {
  nome: string
  totalFalas: number
  papel: 'entrevistado' | 'entrevistador' | 'indefinido'
}

export interface ConfiguracaoLimpeza {
  palavrasIgnoradas: string[]      // stopwords_extras
  palavrasProtegidas: string[]     // palavras_protegidas
  removerSiglas: boolean           // remover_siglas (por padrão false — siglas são mantidas)
  removerNomesDePessoas: boolean   // excluir_pessoas
  removerLocais: boolean           // excluir_locais
  removerOrganizacoes: boolean     // excluir_organizacoes
}

export interface FalaPreview {
  idFala: number
  falante: string
  texto: string
  textoProcessado: string
}

export type EstagioPipeline =
  | 'ocioso'
  | 'importando'
  | 'limpando'
  | 'calculando_frequencia'
  | 'calculando_categorias'
  | 'calculando_grafo'
  | 'concluido'
  | 'erro'

export interface ProgressoPipeline {
  estagio: EstagioPipeline
  mensagem: string
  percentual: number   // 0-100
}

/* ───────────────────────── Resultados ─────────────────────────
   Para o usuário, "Resultados" é uma seção única. Internamente os
   arquivos vêm de scripts diferentes, mas o manifesto unifica tudo. */

export type CategoriaResultado =
  | 'frequencia'
  | 'expressoes'
  | 'categorias_tematicas'
  | 'relacoes'
  | 'grafo_similitude'

export interface ArquivoResultado {
  titulo: string
  tipo: 'imagem' | 'tabela' | 'grafo_interativo'
  caminho: string        // caminho absoluto no disco, fornecido pelo backend
  descricao?: string
}

export interface ResultadosPorParticipante {
  participante: string
  categorias: Record<CategoriaResultado, ArquivoResultado[]>
}

export interface ManifestoResultados {
  geradoEm: string
  participantes: ResultadosPorParticipante[]
}

/* ───────────────────────── Grafo de similitude ─────────────────────────
   Estrutura que o backend exporta (05_grafo_dados.json) para a interface
   renderizar o grafo de forma interativa (zoom, pan, seleção, filtros). */

export interface NoGrafo {
  id: string             // termo
  frequencia: number
  comunidade: number      // id da categoria temática detectada
  central: boolean        // é o termo mais representativo da comunidade
}

export interface ArestaGrafo {
  origem: string
  destino: string
  peso: number            // força da relação (co-ocorrência)
}

export interface ComunidadeGrafo {
  id: number
  rotulo: string           // termo central -> usado como "nome da categoria"
  cor: string
  tamanho: number          // nº de termos
}

export interface DadosGrafo {
  participante: string
  nos: NoGrafo[]
  arestas: ArestaGrafo[]
  comunidades: ComunidadeGrafo[]
}

/* ───────────────────────── API exposta pelo Electron ───────────────────── */

export interface AnalyTextAPI {
  // Projetos
  listarProjetosRecentes(): Promise<Project[]>
  criarProjeto(nome: string): Promise<Project>
  abrirProjeto(id: string): Promise<Project | null>
  abrirProjetoPorId(id: string): Promise<Project | null>
  renomearProjeto(id: string, novoNome: string): Promise<Project | null>
  excluirProjeto(id: string): Promise<void>

  // Estado do projeto
  verificarEstadoProjeto(projetoId: string): Promise<{ temEntrevista: boolean; temResultados: boolean }>

  // Preparação dos dados
  importarEntrevista(projetoId: string): Promise<{ caminhoOriginal: string; nomeArquivo: string } | null>
  listarParticipantes(projetoId: string): Promise<Participante[]>
  definirPapeis(projetoId: string, entrevistados: string[], entrevistadores: string[]): Promise<void>
  obterConfiguracaoLimpeza(projetoId: string): Promise<ConfiguracaoLimpeza>
  salvarConfiguracaoLimpeza(projetoId: string, cfg: ConfiguracaoLimpeza): Promise<void>
  preVisualizar(projetoId: string, limite?: number): Promise<FalaPreview[]>

  // Pipeline / execução
  executarPreparacao(projetoId: string): Promise<void>
  executarAnalises(projetoId: string): Promise<void>
  onProgresso(callback: (p: ProgressoPipeline) => void): () => void

  // Resultados
  obterManifestoResultados(projetoId: string): Promise<ManifestoResultados>
  obterDadosGrafo(projetoId: string, participante: string): Promise<DadosGrafo>

  // Imagem local → base64
  lerImagemBase64(caminho: string): Promise<string | null>

  // Exportação / downloads
  exportarArquivo(caminhoOrigem: string, nomeSugerido: string): Promise<boolean>
  exportarPasta(projetoId: string, categoria: CategoriaResultado, participante: string): Promise<boolean>
  abrirNoExplorador(caminho: string): Promise<void>
}

declare global {
  interface Window {
    api: AnalyTextAPI
  }
}
