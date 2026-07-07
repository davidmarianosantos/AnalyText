import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import {
  listProjects,
  getProject,
  createProject,
  touchProject,
  renameProject,
  deleteProject,
} from './projectStore'
import { runPythonStep, PYTHON_STEPS } from './pythonBridge'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

// Protocolo customizado para servir arquivos locais do projeto (imagens, etc.)
// sem precisar desligar webSecurity. Usado como: analytext-file:///<caminho absoluto>
protocol.registerSchemesAsPrivileged([
  { scheme: 'analytext-file', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } },
])

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  Menu.setApplicationMenu(null)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  // Handler do protocolo analytext-file — serve qualquer arquivo do disco local
  // Registrado aqui (whenReady) para funcionar em todas as plataformas, inclusive Windows
  protocol.handle('analytext-file', (request) => {
    // URL gerada pelo ResultCard: analytext-file:///C:/Users/.../img.png
    // Removemos só o scheme (2 barras) → fica /C:/Users/...
    // No Windows retiramos a barra inicial para obter C:/Users/...
    const semScheme = request.url.slice('analytext-file://'.length) // → /C:/Users/...
    const filePath = decodeURIComponent(
      process.platform === 'win32' ? semScheme.replace(/^\/+/, '') : semScheme
    )
    return net.fetch('file:///' + filePath.replace(/\\/g, '/'))
  })

  createWindow()
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function projetoCaminho(id: string): string | null {
  const p = getProject(id)
  return p ? p.caminho : null
}

function garantirEstruturaProjeto(caminho: string) {
  for (const sub of ['data', 'config', 'outputs', 'preprocessing', 'analysis']) {
    fs.mkdirSync(path.join(caminho, sub), { recursive: true })
  }
  // Config padrão se não existir
  const cfgPath = path.join(caminho, 'config', 'analise_config.json')
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, JSON.stringify({
      entrevistados: [],
      entrevistadores: [],
    }, null, 2), 'utf-8')
  }
  const swPath = path.join(caminho, 'config', 'stopwords_config.json')
  if (!fs.existsSync(swPath)) {
    fs.writeFileSync(swPath, JSON.stringify({
      stopwords_extras: [],
      palavras_protegidas: [],
      remover_siglas: false,
      excluir_pessoas: true,
      excluir_locais: false,
      excluir_organizacoes: false,
    }, null, 2), 'utf-8')
  }
}

// ─── IPC: Projetos ──────────────────────────────────────────────────────────

ipcMain.handle('listarProjetosRecentes', () => listProjects())

ipcMain.handle('criarProjeto', (_e, nome: string) => {
  if (!nome?.trim()) throw new Error('Nome do projeto não pode ser vazio')
  return createProject(nome.trim())
})

ipcMain.handle('abrirProjeto', (_e, id: string) => {
  const p = getProject(id)
  if (!p) return null
  touchProject(id)
  return p
})

ipcMain.handle('abrirProjetoPorId', (_e, id: string) => {
  const p = getProject(id)
  if (!p) return null
  touchProject(id)
  return p
})

ipcMain.handle('renomearProjeto', (_e, id: string, novoNome: string) => {
  return renameProject(id, novoNome)
})

ipcMain.handle('excluirProjeto', (_e, id: string) => {
  deleteProject(id)
})

// ─── IPC: Estado do projeto ─────────────────────────────────────────────────

ipcMain.handle('verificarEstadoProjeto', (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return { temEntrevista: false, temResultados: false }
  const temEntrevista = fs.existsSync(path.join(caminho, 'data', 'entrevista_processada.csv'))
  const temResultados = fs.existsSync(path.join(caminho, 'outputs', 'manifest.json'))
  return { temEntrevista, temResultados }
})

// ─── IPC: Preparação dos dados ──────────────────────────────────────────────

ipcMain.handle('importarEntrevista', async (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) throw new Error('Projeto não encontrado')
  const { filePaths, canceled } = await dialog.showOpenDialog(win!, {
    title: 'Importar entrevista',
    filters: [{ name: 'Texto', extensions: ['txt'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return null
  const origem = filePaths[0]
  const nomeArquivo = path.basename(origem)

  // Salva com nome fixo — o preprocessing.py espera ./data/entrevista.txt
  const destino = path.join(caminho, 'data', 'entrevista.txt')
  fs.copyFileSync(origem, destino)

  // Remove o CSV anterior para evitar PermissionError no Windows ao sobrescrever
  const csvAnterior = path.join(caminho, 'data', 'entrevista_processada.csv')
  if (fs.existsSync(csvAnterior)) {
    try { fs.unlinkSync(csvAnterior) } catch (_) { /* ignora se não conseguir */ }
  }

  win?.webContents.send('progresso', { estagio: 'limpando', percentual: 0, mensagem: 'Processando entrevista…' })

  try {
    await runPythonStep(PYTHON_STEPS.preprocessamento, caminho, (pct, msg) => {
      win?.webContents.send('progresso', { estagio: 'limpando', percentual: pct, mensagem: msg })
    })
    win?.webContents.send('progresso', { estagio: 'concluido', percentual: 100, mensagem: 'Pronto' })
  } catch (err: any) {
    win?.webContents.send('progresso', { estagio: 'erro', percentual: 0, mensagem: err?.message ?? String(err) })
    throw err
  }

  return { caminhoOriginal: destino, nomeArquivo }
})

ipcMain.handle('listarParticipantes', (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return []
  const csv = path.join(caminho, 'data', 'entrevista_processada.csv')
  if (!fs.existsSync(csv)) return []
  const linhas = fs.readFileSync(csv, 'utf-8').split('\n').filter(Boolean)
  const header = linhas[0].split(',')
  const idxFalante = header.findIndex((h) => h.trim().toLowerCase() === 'falante')
  if (idxFalante < 0) return []
  const contagem: Record<string, number> = {}
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(',')
    const nome = cols[idxFalante]?.trim()
    if (nome) contagem[nome] = (contagem[nome] ?? 0) + 1
  }
  return Object.entries(contagem).map(([nome, totalFalas]) => ({
    nome,
    totalFalas,
    papel: 'indefinido' as const,
  }))
})

ipcMain.handle('definirPapeis', (_e, projetoId: string, entrevistados: string[], entrevistadores: string[]) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return
  const cfgPath = path.join(caminho, 'config', 'analise_config.json')
  const cfg = fs.existsSync(cfgPath)
    ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    : {}
  cfg.entrevistados = entrevistados
  cfg.entrevistadores = entrevistadores
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8')
})

ipcMain.handle('obterConfiguracaoLimpeza', (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return {}
  const swPath = path.join(caminho, 'config', 'stopwords_config.json')
  if (!fs.existsSync(swPath)) return {
    palavrasIgnoradas: [], palavrasProtegidas: [], removerSiglas: false,
    removerNomesDePessoas: true, removerLocais: false, removerOrganizacoes: false,
  }
  const raw = JSON.parse(fs.readFileSync(swPath, 'utf-8'))
  return {
    palavrasIgnoradas: raw.stopwords_extras ?? [],
    palavrasProtegidas: raw.palavras_protegidas ?? [],
    removerSiglas: raw.remover_siglas ?? false,
    removerNomesDePessoas: raw.excluir_pessoas ?? true,
    removerLocais: raw.excluir_locais ?? false,
    removerOrganizacoes: raw.excluir_organizacoes ?? false,
  }
})

ipcMain.handle('salvarConfiguracaoLimpeza', (_e, projetoId: string, cfg: any) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return
  const swPath = path.join(caminho, 'config', 'stopwords_config.json')
  fs.writeFileSync(swPath, JSON.stringify({
    stopwords_extras: cfg.palavrasIgnoradas,
    palavras_protegidas: cfg.palavrasProtegidas,
    remover_siglas: cfg.removerSiglas,
    excluir_pessoas: cfg.removerNomesDePessoas,
    excluir_locais: cfg.removerLocais,
    excluir_organizacoes: cfg.removerOrganizacoes,
  }, null, 2), 'utf-8')
})

ipcMain.handle('preVisualizar', (_e, projetoId: string, limite = 50) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return []
  const csv = path.join(caminho, 'data', 'entrevista_processada.csv')
  if (!fs.existsSync(csv)) return []

  // Parser RFC-4180: respeita campos entre aspas com vírgulas e aspas escapadas ("")
  function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++ } // aspa escapada
          else inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') { inQuotes = true }
        else if (ch === ',') { fields.push(current); current = '' }
        else { current += ch }
      }
    }
    fields.push(current)
    return fields
  }

  const conteudo = fs.readFileSync(csv, 'utf-8').replace(/\r/g, '')
  const linhas = conteudo.split('\n').filter(Boolean)
  const header = parseCSVLine(linhas[0]).map((h) => h.trim().toLowerCase())
  const idx = (n: string) => header.findIndex((h) => h === n)

  return linhas.slice(1, limite + 1).map((linha, i) => {
    const cols = parseCSVLine(linha)
    return {
      idFala: i + 1,
      falante: cols[idx('falante')]?.trim() ?? '',
      texto: cols[idx('texto')]?.trim() ?? '',
      textoProcessado: cols[idx('texto_processado')]?.trim() ?? '',
    }
  })
})

// ─── IPC: Pipeline Python ───────────────────────────────────────────────────

ipcMain.handle('executarPreparacao', async (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) throw new Error('Projeto não encontrado')
  await runPythonStep(PYTHON_STEPS.preprocessamento, caminho, (pct, msg) => {
    win?.webContents.send('progresso', { estagio: 'limpando', percentual: pct, mensagem: msg })
  })
  win?.webContents.send('progresso', { estagio: 'concluido', percentual: 100, mensagem: 'Preparação concluída' })
})

ipcMain.handle('executarAnalises', async (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) throw new Error('Projeto não encontrado')

  // Limpa outputs antigos antes de reanalisar para não misturar resultados velhos
  const outputsDir = path.join(caminho, 'outputs')
  if (fs.existsSync(outputsDir)) {
    for (const entry of fs.readdirSync(outputsDir)) {
      const entryPath = path.join(outputsDir, entry)
      if (fs.statSync(entryPath).isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true })
      } else if (entry === 'manifest.json') {
        fs.unlinkSync(entryPath)
      }
    }
  }

  const etapas = [
    { step: PYTHON_STEPS.preprocessamento, estagio: 'limpando',              label: 'Aplicando configurações de limpeza…' },
    { step: PYTHON_STEPS.padroes,          estagio: 'calculando_frequencia', label: 'Analisando frequência de termos…' },
    { step: PYTHON_STEPS.grafo,            estagio: 'calculando_grafo',      label: 'Calculando grafo de similitude…' },
    { step: PYTHON_STEPS.manifesto,        estagio: 'calculando_categorias', label: 'Organizando resultados…' },
  ]

  for (const { step, estagio, label } of etapas) {
    win?.webContents.send('progresso', { estagio, percentual: 0, mensagem: label })
    await runPythonStep(step, caminho, (pct, msg) => {
      win?.webContents.send('progresso', { estagio, percentual: pct, mensagem: msg || label })
    })
  }

  win?.webContents.send('progresso', { estagio: 'concluido', percentual: 100, mensagem: 'Análise concluída!' })
})

// ─── IPC: Resultados ────────────────────────────────────────────────────────

ipcMain.handle('obterManifestoResultados', (_e, projetoId: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return { geradoEm: '', participantes: [] }
  const manifestoPath = path.join(caminho, 'outputs', 'manifest.json')
  if (!fs.existsSync(manifestoPath)) return { geradoEm: '', participantes: [] }
  return JSON.parse(fs.readFileSync(manifestoPath, 'utf-8'))
})

ipcMain.handle('obterDadosGrafo', (_e, projetoId: string, participante: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return null
  const grafoPath = path.join(caminho, 'outputs', participante, '05_grafo_dados.json')
  if (!fs.existsSync(grafoPath)) return null
  return JSON.parse(fs.readFileSync(grafoPath, 'utf-8'))
})

// ─── IPC: Leitura de imagem local ───────────────────────────────────────────

ipcMain.handle('lerImagemBase64', (_e, caminhoArquivo: string) => {
  if (!fs.existsSync(caminhoArquivo)) return null
  const ext = path.extname(caminhoArquivo).toLowerCase().replace('.', '')
  const mime = ext === 'jpg' ? 'jpeg' : ext  // image/jpeg
  const dados = fs.readFileSync(caminhoArquivo)
  return `data:image/${mime};base64,` + dados.toString('base64')
})

// ─── IPC: Exportação ────────────────────────────────────────────────────────

ipcMain.handle('exportarArquivo', async (_e, caminhoOrigem: string, nomeSugerido: string) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win!, {
    defaultPath: nomeSugerido,
  })
  if (canceled || !filePath) return false
  fs.copyFileSync(caminhoOrigem, filePath)
  return true
})

ipcMain.handle('exportarPasta', async (_e, projetoId: string, _categoria: string, participante: string) => {
  const caminho = projetoCaminho(projetoId)
  if (!caminho) return false
  const origem = path.join(caminho, 'outputs', participante)
  const { filePaths, canceled } = await dialog.showOpenDialog(win!, {
    title: 'Escolha onde salvar os resultados',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths[0]) return false
  const destino = path.join(filePaths[0], participante)
  fs.cpSync(origem, destino, { recursive: true })
  return true
})

ipcMain.handle('abrirNoExplorador', (_e, caminho: string) => {
  shell.showItemInFolder(caminho)
})
