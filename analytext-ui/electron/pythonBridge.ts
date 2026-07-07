import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

// __dirname não existe em ES modules — reconstruído manualmente
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolve o executável Python a usar.
 *
 * Em desenvolvimento, usa o Python do sistema/venv (configurável via env var
 * ANALYTEXT_PYTHON). Em produção (build empacotado), usa o Python Embeddable
 * que é distribuído dentro de resources/python — o usuário final não precisa
 * instalar nada.
 */
function resolverPython(): string {
  if (process.env.ANALYTEXT_PYTHON) return process.env.ANALYTEXT_PYTHON

  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'python.exe' : 'bin/python3'
    return path.join(process.resourcesPath, 'python', exe)
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

/** Resolve a pasta onde estão os scripts .py (analysis/, preprocessing/). */
function resolverScriptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts')
  }

  // Em dev o __dirname pode ser dist-electron/ ou electron/ dependendo do runner.
  // Testamos candidatos em ordem até achar a pasta que contém preprocessing/preprocessing.py
  const candidatos = [
    path.join(__dirname, '..', '..'),        // dist-electron/ -> analytext-ui/ -> raiz
    path.join(__dirname, '..', '..', '..'), // um nível a mais (caso aninhado)
    path.join(app.getAppPath(), '..'),       // analytext-ui/ -> raiz
    path.join(app.getAppPath(), '..', '..'),
  ]

  for (const dir of candidatos) {
    if (fs.existsSync(path.join(dir, 'preprocessing', 'preprocessing.py'))) {
      return dir
    }
  }

  // Fallback: loga para facilitar debug
  const fallback = path.join(__dirname, '..', '..')
  console.warn('[scriptsDir] nenhum candidato encontrou preprocessing.py, usando:', fallback)
  return fallback
}

export const PYTHON_STEPS = {
  preprocessamento: 'preprocessing/preprocessing.py',
  padroes: 'analysis/analise_padroes.py',
  grafo: 'analysis/grafo_similitude.py',
  manifesto: 'analysis/gerar_manifesto.py',
} as const

type OnProgress = (percentual: number, mensagem: string) => void

/**
 * Executa um script Python dentro da pasta de um projeto (cwd = raiz do
 * projeto), para que os caminhos relativos ./data, ./config, ./outputs
 * usados pelos scripts continuem funcionando sem nenhuma alteração neles.
 *
 * Linhas que o script imprimir no formato "PROGRESS:<0-100>:<mensagem>"
 * são interpretadas como progresso; o restante vai para o log de debug.
 */
export function runPythonStep(
  scriptRelativo: string,
  cwdProjeto: string,
  onProgress?: OnProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const python = resolverPython()
    const scriptPath = path.join(resolverScriptsDir(), scriptRelativo)

    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Script não encontrado: ${scriptPath}`))
      return
    }

    const proc = spawn(python, ['-u', scriptPath], {
      cwd: cwdProjeto,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let stderrBuf = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const texto = chunk.toString('utf-8')
      for (const linha of texto.split('\n')) {
        const m = linha.match(/^PROGRESS:(\d+):(.*)$/)
        if (m) onProgress?.(Number(m[1]), m[2])
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf-8')
    })

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const linhas = stderrBuf.split('\n').map((l) => l.trim()).filter(Boolean)
        const ultima = linhas[linhas.length - 1] ?? 'Erro desconhecido'
        const mensagem = ultima.replace(/^[\w.]+Error: /, '').replace(/^\[Errno \d+\] /, '')
        reject(new Error(mensagem))
      }
    })

    proc.on('error', (err) => reject(err))
  })
}
