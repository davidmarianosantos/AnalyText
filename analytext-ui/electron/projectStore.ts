import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

export interface StoredProject {
  id: string
  nome: string
  caminho: string   // sempre dentro de app.getPath('userData')/projects/<id>
  criadoEm: string
  abertoEm: string
}

// Pasta raiz onde todos os projetos ficam — invisível ao usuário
function projectsRoot(): string {
  return path.join(app.getPath('userData'), 'projects')
}

function storeFile(): string {
  return path.join(app.getPath('userData'), 'projetos.json')
}

function readAll(): StoredProject[] {
  const file = storeFile()
  if (!fs.existsSync(file)) return []
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) }
  catch { return [] }
}

function writeAll(projects: StoredProject[]) {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true })
  fs.writeFileSync(storeFile(), JSON.stringify(projects, null, 2), 'utf-8')
}

/** Cria a estrutura de pastas esperada pelos scripts Python dentro do projeto. */
export function garantirEstruturaProjeto(caminho: string) {
  for (const sub of ['data', 'config', 'outputs']) {
    fs.mkdirSync(path.join(caminho, sub), { recursive: true })
  }
}

export function listProjects(): StoredProject[] {
  return readAll().sort((a, b) => +new Date(b.abertoEm) - +new Date(a.abertoEm))
}

export function getProject(id: string): StoredProject | undefined {
  return readAll().find((p) => p.id === id)
}

/**
 * Cria um novo projeto gerenciado pelo app.
 * A pasta é gerada automaticamente em userData/projects/<uuid> — o usuário
 * nunca precisa escolher nem saber onde fica.
 */
export function createProject(nome: string): StoredProject {
  const id = randomUUID()
  const caminho = path.join(projectsRoot(), id)
  garantirEstruturaProjeto(caminho)

  const novo: StoredProject = {
    id,
    nome,
    caminho,
    criadoEm: new Date().toISOString(),
    abertoEm: new Date().toISOString(),
  }

  const projects = readAll()
  projects.push(novo)
  writeAll(projects)
  return novo
}

export function renameProject(id: string, novoNome: string): StoredProject | null {
  const projects = readAll()
  const p = projects.find((x) => x.id === id)
  if (!p) return null
  p.nome = novoNome
  writeAll(projects)
  return p
}

export function deleteProject(id: string): void {
  const p = getProject(id)
  if (p && fs.existsSync(p.caminho)) {
    fs.rmSync(p.caminho, { recursive: true, force: true })
  }
  writeAll(readAll().filter((x) => x.id !== id))
}

export function touchProject(id: string) {
  const projects = readAll()
  const p = projects.find((x) => x.id === id)
  if (p) {
    p.abertoEm = new Date().toISOString()
    writeAll(projects)
  }
}
