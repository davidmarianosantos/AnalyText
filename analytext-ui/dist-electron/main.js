import { app, protocol, BrowserWindow, net, ipcMain, dialog, shell, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
function projectsRoot() {
  return path.join(app.getPath("userData"), "projects");
}
function storeFile() {
  return path.join(app.getPath("userData"), "projetos.json");
}
function readAll() {
  const file = storeFile();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}
function writeAll(projects) {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify(projects, null, 2), "utf-8");
}
function garantirEstruturaProjeto(caminho) {
  for (const sub of ["data", "config", "outputs"]) {
    fs.mkdirSync(path.join(caminho, sub), { recursive: true });
  }
}
function listProjects() {
  return readAll().sort((a, b) => +new Date(b.abertoEm) - +new Date(a.abertoEm));
}
function getProject(id) {
  return readAll().find((p) => p.id === id);
}
function createProject(nome) {
  const id = randomUUID();
  const caminho = path.join(projectsRoot(), id);
  garantirEstruturaProjeto(caminho);
  const novo = {
    id,
    nome,
    caminho,
    criadoEm: (/* @__PURE__ */ new Date()).toISOString(),
    abertoEm: (/* @__PURE__ */ new Date()).toISOString()
  };
  const projects = readAll();
  projects.push(novo);
  writeAll(projects);
  return novo;
}
function renameProject(id, novoNome) {
  const projects = readAll();
  const p = projects.find((x) => x.id === id);
  if (!p) return null;
  p.nome = novoNome;
  writeAll(projects);
  return p;
}
function deleteProject(id) {
  const p = getProject(id);
  if (p && fs.existsSync(p.caminho)) {
    fs.rmSync(p.caminho, { recursive: true, force: true });
  }
  writeAll(readAll().filter((x) => x.id !== id));
}
function touchProject(id) {
  const projects = readAll();
  const p = projects.find((x) => x.id === id);
  if (p) {
    p.abertoEm = (/* @__PURE__ */ new Date()).toISOString();
    writeAll(projects);
  }
}
const __dirname$2 = path.dirname(fileURLToPath(import.meta.url));
function resolverPython() {
  if (process.env.ANALYTEXT_PYTHON) return process.env.ANALYTEXT_PYTHON;
  const exe = process.platform === "win32" ? "python.exe" : "bin/python3";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "python", exe);
  }
  const embutidoDev = path.join(app.getAppPath(), "resources", "python", exe);
  if (fs.existsSync(embutidoDev)) return embutidoDev;
  return process.platform === "win32" ? "python" : "python3";
}
function resolverScriptsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "scripts");
  }
  const candidatos = [
    path.join(__dirname$2, "..", ".."),
    // dist-electron/ -> analytext-ui/ -> raiz
    path.join(__dirname$2, "..", "..", ".."),
    // um nível a mais (caso aninhado)
    path.join(app.getAppPath(), ".."),
    // analytext-ui/ -> raiz
    path.join(app.getAppPath(), "..", "..")
  ];
  for (const dir of candidatos) {
    if (fs.existsSync(path.join(dir, "preprocessing", "preprocessing.py"))) {
      return dir;
    }
  }
  const fallback = path.join(__dirname$2, "..", "..");
  console.warn("[scriptsDir] nenhum candidato encontrou preprocessing.py, usando:", fallback);
  return fallback;
}
const PYTHON_STEPS = {
  preprocessamento: "preprocessing/preprocessing.py",
  padroes: "analysis/analise_padroes.py",
  grafo: "analysis/grafo_similitude.py",
  manifesto: "analysis/gerar_manifesto.py"
};
function runPythonStep(scriptRelativo, cwdProjeto, onProgress) {
  return new Promise((resolve, reject) => {
    const python = resolverPython();
    const scriptPath = path.join(resolverScriptsDir(), scriptRelativo);
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Script não encontrado: ${scriptPath}`));
      return;
    }
    const proc = spawn(python, ["-u", scriptPath], {
      cwd: cwdProjeto,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    let stderrBuf = "";
    proc.stdout.on("data", (chunk) => {
      const texto = chunk.toString("utf-8");
      for (const linha of texto.split("\n")) {
        const m = linha.match(/^PROGRESS:(\d+):(.*)$/);
        if (m) onProgress == null ? void 0 : onProgress(Number(m[1]), m[2]);
      }
    });
    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString("utf-8");
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const linhas = stderrBuf.split("\n").map((l) => l.trim()).filter(Boolean);
        const ultima = linhas[linhas.length - 1] ?? "Erro desconhecido";
        const mensagem = ultima.replace(/^[\w.]+Error: /, "").replace(/^\[Errno \d+\] /, "");
        reject(new Error(mensagem));
      }
    });
    proc.on("error", (err) => reject(err));
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
protocol.registerSchemesAsPrivileged([
  { scheme: "analytext-file", privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
]);
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
  protocol.handle("analytext-file", (request) => {
    const semScheme = request.url.slice("analytext-file://".length);
    const filePath = decodeURIComponent(
      process.platform === "win32" ? semScheme.replace(/^\/+/, "") : semScheme
    );
    return net.fetch("file:///" + filePath.replace(/\\/g, "/"));
  });
  createWindow();
});
function projetoCaminho(id) {
  const p = getProject(id);
  return p ? p.caminho : null;
}
ipcMain.handle("listarProjetosRecentes", () => listProjects());
ipcMain.handle("criarProjeto", (_e, nome) => {
  if (!(nome == null ? void 0 : nome.trim())) throw new Error("Nome do projeto não pode ser vazio");
  return createProject(nome.trim());
});
ipcMain.handle("abrirProjeto", (_e, id) => {
  const p = getProject(id);
  if (!p) return null;
  touchProject(id);
  return p;
});
ipcMain.handle("abrirProjetoPorId", (_e, id) => {
  const p = getProject(id);
  if (!p) return null;
  touchProject(id);
  return p;
});
ipcMain.handle("renomearProjeto", (_e, id, novoNome) => {
  return renameProject(id, novoNome);
});
ipcMain.handle("excluirProjeto", (_e, id) => {
  deleteProject(id);
});
ipcMain.handle("verificarEstadoProjeto", (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return { temEntrevista: false, temResultados: false };
  const temEntrevista = fs.existsSync(path.join(caminho, "data", "entrevista_processada.csv"));
  const temResultados = fs.existsSync(path.join(caminho, "outputs", "manifest.json"));
  return { temEntrevista, temResultados };
});
ipcMain.handle("importarEntrevista", async (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) throw new Error("Projeto não encontrado");
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: "Importar entrevista",
    filters: [{ name: "Texto", extensions: ["txt"] }],
    properties: ["openFile"]
  });
  if (canceled || !filePaths[0]) return null;
  const origem = filePaths[0];
  const nomeArquivo = path.basename(origem);
  const destino = path.join(caminho, "data", "entrevista.txt");
  fs.copyFileSync(origem, destino);
  const csvAnterior = path.join(caminho, "data", "entrevista_processada.csv");
  if (fs.existsSync(csvAnterior)) {
    try {
      fs.unlinkSync(csvAnterior);
    } catch (_) {
    }
  }
  win == null ? void 0 : win.webContents.send("progresso", { estagio: "limpando", percentual: 0, mensagem: "Processando entrevista…" });
  try {
    await runPythonStep(PYTHON_STEPS.preprocessamento, caminho, (pct, msg) => {
      win == null ? void 0 : win.webContents.send("progresso", { estagio: "limpando", percentual: pct, mensagem: msg });
    });
    win == null ? void 0 : win.webContents.send("progresso", { estagio: "concluido", percentual: 100, mensagem: "Pronto" });
  } catch (err) {
    win == null ? void 0 : win.webContents.send("progresso", { estagio: "erro", percentual: 0, mensagem: (err == null ? void 0 : err.message) ?? String(err) });
    throw err;
  }
  return { caminhoOriginal: destino, nomeArquivo };
});
ipcMain.handle("listarParticipantes", (_e, projetoId) => {
  var _a;
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return [];
  const csv = path.join(caminho, "data", "entrevista_processada.csv");
  if (!fs.existsSync(csv)) return [];
  const linhas = fs.readFileSync(csv, "utf-8").split("\n").filter(Boolean);
  const header = linhas[0].split(",");
  const idxFalante = header.findIndex((h) => h.trim().toLowerCase() === "falante");
  if (idxFalante < 0) return [];
  const contagem = {};
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(",");
    const nome = (_a = cols[idxFalante]) == null ? void 0 : _a.trim();
    if (nome) contagem[nome] = (contagem[nome] ?? 0) + 1;
  }
  return Object.entries(contagem).map(([nome, totalFalas]) => ({
    nome,
    totalFalas,
    papel: "indefinido"
  }));
});
ipcMain.handle("definirPapeis", (_e, projetoId, entrevistados, entrevistadores) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return;
  const cfgPath = path.join(caminho, "config", "analise_config.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf-8")) : {};
  cfg.entrevistados = entrevistados;
  cfg.entrevistadores = entrevistadores;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf-8");
});
ipcMain.handle("obterConfiguracaoLimpeza", (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return {};
  const swPath = path.join(caminho, "config", "stopwords_config.json");
  if (!fs.existsSync(swPath)) return {
    palavrasIgnoradas: [],
    palavrasProtegidas: [],
    removerSiglas: false,
    removerNomesDePessoas: true,
    removerLocais: false,
    removerOrganizacoes: false
  };
  const raw = JSON.parse(fs.readFileSync(swPath, "utf-8"));
  return {
    palavrasIgnoradas: raw.stopwords_extras ?? [],
    palavrasProtegidas: raw.palavras_protegidas ?? [],
    removerSiglas: raw.remover_siglas ?? false,
    removerNomesDePessoas: raw.excluir_pessoas ?? true,
    removerLocais: raw.excluir_locais ?? false,
    removerOrganizacoes: raw.excluir_organizacoes ?? false
  };
});
ipcMain.handle("salvarConfiguracaoLimpeza", (_e, projetoId, cfg) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return;
  const swPath = path.join(caminho, "config", "stopwords_config.json");
  fs.writeFileSync(swPath, JSON.stringify({
    stopwords_extras: cfg.palavrasIgnoradas,
    palavras_protegidas: cfg.palavrasProtegidas,
    remover_siglas: cfg.removerSiglas,
    excluir_pessoas: cfg.removerNomesDePessoas,
    excluir_locais: cfg.removerLocais,
    excluir_organizacoes: cfg.removerOrganizacoes
  }, null, 2), "utf-8");
});
ipcMain.handle("preVisualizar", (_e, projetoId, limite = 50) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return [];
  const csv = path.join(caminho, "data", "entrevista_processada.csv");
  if (!fs.existsSync(csv)) return [];
  function parseCSVLine(line) {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }
  const conteudo = fs.readFileSync(csv, "utf-8").replace(/\r/g, "");
  const linhas = conteudo.split("\n").filter(Boolean);
  const header = parseCSVLine(linhas[0]).map((h) => h.trim().toLowerCase());
  const idx = (n) => header.findIndex((h) => h === n);
  return linhas.slice(1, limite + 1).map((linha, i) => {
    var _a, _b, _c;
    const cols = parseCSVLine(linha);
    return {
      idFala: i + 1,
      falante: ((_a = cols[idx("falante")]) == null ? void 0 : _a.trim()) ?? "",
      texto: ((_b = cols[idx("texto")]) == null ? void 0 : _b.trim()) ?? "",
      textoProcessado: ((_c = cols[idx("texto_processado")]) == null ? void 0 : _c.trim()) ?? ""
    };
  });
});
ipcMain.handle("executarPreparacao", async (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) throw new Error("Projeto não encontrado");
  await runPythonStep(PYTHON_STEPS.preprocessamento, caminho, (pct, msg) => {
    win == null ? void 0 : win.webContents.send("progresso", { estagio: "limpando", percentual: pct, mensagem: msg });
  });
  win == null ? void 0 : win.webContents.send("progresso", { estagio: "concluido", percentual: 100, mensagem: "Preparação concluída" });
});
ipcMain.handle("executarAnalises", async (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) throw new Error("Projeto não encontrado");
  const outputsDir = path.join(caminho, "outputs");
  if (fs.existsSync(outputsDir)) {
    for (const entry of fs.readdirSync(outputsDir)) {
      const entryPath = path.join(outputsDir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else if (entry === "manifest.json") {
        fs.unlinkSync(entryPath);
      }
    }
  }
  const etapas = [
    { step: PYTHON_STEPS.preprocessamento, estagio: "limpando", label: "Aplicando configurações de limpeza…" },
    { step: PYTHON_STEPS.padroes, estagio: "calculando_frequencia", label: "Analisando frequência de termos…" },
    { step: PYTHON_STEPS.grafo, estagio: "calculando_grafo", label: "Calculando grafo de similitude…" },
    { step: PYTHON_STEPS.manifesto, estagio: "calculando_categorias", label: "Organizando resultados…" }
  ];
  for (const { step, estagio, label } of etapas) {
    win == null ? void 0 : win.webContents.send("progresso", { estagio, percentual: 0, mensagem: label });
    await runPythonStep(step, caminho, (pct, msg) => {
      win == null ? void 0 : win.webContents.send("progresso", { estagio, percentual: pct, mensagem: msg || label });
    });
  }
  win == null ? void 0 : win.webContents.send("progresso", { estagio: "concluido", percentual: 100, mensagem: "Análise concluída!" });
});
ipcMain.handle("obterManifestoResultados", (_e, projetoId) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return { geradoEm: "", participantes: [] };
  const manifestoPath = path.join(caminho, "outputs", "manifest.json");
  if (!fs.existsSync(manifestoPath)) return { geradoEm: "", participantes: [] };
  return JSON.parse(fs.readFileSync(manifestoPath, "utf-8"));
});
ipcMain.handle("obterDadosGrafo", (_e, projetoId, participante) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return null;
  const grafoPath = path.join(caminho, "outputs", participante, "05_grafo_dados.json");
  if (!fs.existsSync(grafoPath)) return null;
  return JSON.parse(fs.readFileSync(grafoPath, "utf-8"));
});
ipcMain.handle("lerImagemBase64", (_e, caminhoArquivo) => {
  if (!fs.existsSync(caminhoArquivo)) return null;
  const ext = path.extname(caminhoArquivo).toLowerCase().replace(".", "");
  const mime = ext === "jpg" ? "jpeg" : ext;
  const dados = fs.readFileSync(caminhoArquivo);
  return `data:image/${mime};base64,` + dados.toString("base64");
});
ipcMain.handle("exportarArquivo", async (_e, caminhoOrigem, nomeSugerido) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: nomeSugerido
  });
  if (canceled || !filePath) return false;
  fs.copyFileSync(caminhoOrigem, filePath);
  return true;
});
ipcMain.handle("exportarPasta", async (_e, projetoId, _categoria, participante) => {
  const caminho = projetoCaminho(projetoId);
  if (!caminho) return false;
  const origem = path.join(caminho, "outputs", participante);
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: "Escolha onde salvar os resultados",
    properties: ["openDirectory", "createDirectory"]
  });
  if (canceled || !filePaths[0]) return false;
  const destino = path.join(filePaths[0], participante);
  fs.cpSync(origem, destino, { recursive: true });
  return true;
});
ipcMain.handle("abrirNoExplorador", (_e, caminho) => {
  shell.showItemInFolder(caminho);
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
