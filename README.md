# AnalyText

Ferramenta de apoio à **análise qualitativa de entrevistas**, desenvolvida no
**Projeto Extensionista Integrador III (DEC001430)** do curso de Ciência da
Computação da **Universidade Estadual de Santa Cruz (UESC)**, semestre 2026.1,
sob orientação da **Prof.ª Verônica Alves**.

O projeto integra uma pesquisa etnográfica realizada em uma unidade escolar de
Ilhéus (BA) sobre os sentidos e significados construídos por professoras
alfabetizadoras acerca do ensino do sistema de escrita alfabética. O AnalyText
usa processamento de linguagem natural para organizar, tratar e analisar as
transcrições das entrevistas, tornando a análise mais sistemática e acessível
para pesquisadores da área de educação — sem exigir qualquer conhecimento de
programação.

**Discente:** David Júnio Mariano dos Santos
**Orientadora:** Prof.ª Verônica Alves

---

## O que a ferramenta faz

A partir de uma transcrição de entrevista (formato alternado `falante` /
`fala`), o AnalyText gera, **por participante**:

- **Frequência de termos** — ranking e gráfico das palavras mais presentes;
- **Expressões recorrentes** — bigramas e trigramas que se repetem na fala;
- **Nuvem de palavras**;
- **Grafo de similitude com campos de significado** (inspirado no IRaMuTeQ) —
  os grandes temas que movimentam a fala, com:
  - fusão automática de sinônimos em um único conceito via vetores semânticos
    (ex.: *alfabetização* + *letramento*);
  - campos semânticos (1 a 8) detectados por clustering híbrido
    (embeddings + perfil de co-ocorrência), apenas com substantivos e adjetivos;
  - esqueleto em árvore geradora máxima da co-ocorrência, com layout que mantém
    os campos legíveis e sem sobreposição;
- **Versão interativa do grafo** na interface (zoom, busca, seleção e filtro
  por campo).

O pré-processamento lematiza com o spaCy (`pt_core_news_lg`), corrige erros
conhecidos de lematização em fala coloquial, remove palavras genéricas de
qualquer tópico (verbos de discurso, avaliativos, curingas) e **anonimiza
automaticamente** nomes de pessoas detectados por NER — com salvaguardas contra
falsos positivos. Tudo é configurável pela interface (palavras ignoradas e
protegidas), sem editar código.

## Arquitetura

```
AnalyText/
├── preprocessing/            # Módulo 1 — limpeza e lematização das falas
│   └── preprocessing.py      #   entrevista.txt → entrevista_processada.csv
├── analysis/
│   ├── analise_padroes.py    # Módulos 2-3 — frequência, n-gramas, nuvem
│   ├── grafo_similitude.py   # Módulo 4 — campos de significado (grafo)
│   ├── gerar_manifesto.py    # Une as saídas em outputs/manifest.json
│   └── selecao_falantes.py   # Utilitário: quem é analisado (config)
├── config/                   # JSONs editáveis pela interface
│   ├── analise_config.json   #   participantes, nº de campos, limiares
│   └── stopwords_config.json #   palavras ignoradas/protegidas, NER
├── analytext-ui/             # Aplicativo desktop (Electron + React + TS)
│   ├── electron/             #   main process, ponte com o Python
│   ├── src/                  #   interface (views, componentes, D3)
│   ├── resources/python/     #   Python 3.9 embutido (gerado, fora do git)
│   └── scripts/              #   setup-python-embutido.ps1
├── requirements.txt          # Dependências Python (versões fixadas)
├── data/                     # Entrevistas locais (fora do git — privacidade)
└── outputs/                  # Resultados gerados (fora do git)
```

**Contrato Python ↔ interface:** a UI nunca lê os scripts — ela executa cada
etapa pelo `pythonBridge`, acompanha linhas `PROGRESS:<0-100>:<mensagem>` no
stdout e, ao final, lê apenas `outputs/manifest.json` e os arquivos por
participante (`04_grafo_similitude.png`, `04_comunidades_termos.csv`,
`05_grafo_dados.json` etc.). No aplicativo empacotado, os scripts e o Python
embutido são distribuídos via `extraResources` (ver `electron-builder.json5`),
e cada projeto de pesquisa vive numa pasta própria gerenciada pelo app.

## Como rodar (desenvolvimento)

### Scripts de análise (Python 3.9)

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# pipeline completo (espera data/entrevista.txt no formato falante/fala)
python preprocessing/preprocessing.py
python analysis/analise_padroes.py
python analysis/grafo_similitude.py
python analysis/gerar_manifesto.py
```

Os resultados ficam em `outputs/<Participante>/`. Quem é analisado é definido
em `config/analise_config.json` (`entrevistados` / `entrevistadores`).

### Interface (Electron)

```powershell
cd analytext-ui
npm install
npm run dev
```

Em desenvolvimento, a UI usa o Python do sistema (`python` no PATH). No app
empacotado, usa o Python embutido.

## Python embutido (distribuição)

O instalador embute um Python 3.9 completo para que pesquisadores usem o app
sem instalar nada. Essa pasta (`analytext-ui/resources/python/`) **não é
versionada** — gere-a com:

```powershell
cd analytext-ui
powershell -ExecutionPolicy Bypass -File scripts/setup-python-embutido.ps1
```

O script baixa o *Windows embeddable package* oficial do Python 3.9, habilita o
`site-packages`, instala o pip e todas as dependências do `requirements.txt`
(incluindo o modelo `pt_core_news_lg`, ~550 MB) e verifica os imports. Use
`-Recriar` para refazer do zero e `-Destino` para outra pasta.

### Gerar o instalador

```powershell
cd analytext-ui
npm run build   # tsc + vite build + electron-builder (saída em release/)
```

## Privacidade

Entrevistas são dados sensíveis. A pasta `data/` e as saídas em `outputs/`
estão no `.gitignore` e **não devem ser commitadas**. Além disso, o
pré-processamento remove automaticamente nomes de pessoas detectados nas falas
(configurável em `stopwords_config.json`).

## Créditos

- **David Júnio Mariano dos Santos** — desenvolvimento (Ciência da Computação, UESC)
- **Prof.ª Verônica Alves** — orientação e pesquisa em alfabetização
- Projeto Extensionista Integrador III · DEC/UESC · 2026.1
