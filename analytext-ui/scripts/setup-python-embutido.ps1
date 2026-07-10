<#
.SYNOPSIS
  Monta o Python embutido do AnalyText em analytext-ui/resources/python.

.DESCRIPTION
  O aplicativo Electron executa os scripts de análise com um Python 3.9
  distribuído dentro do próprio instalador (extraResources), para que o
  usuário final não precise instalar nada. Este script recria essa pasta
  do zero, em vez de copiá-la de um venv:

    1. Baixa o "Windows embeddable package" oficial do Python 3.9;
    2. Habilita o site-packages (edita o python39._pth);
    3. Instala o pip (get-pip.py do canal compatível com 3.9);
    4. Instala as dependências do ../../requirements.txt
       (inclui o modelo pt_core_news_lg do spaCy);
    5. Verifica que os imports principais funcionam.

.PARAMETER Destino
  Pasta de destino. Padrão: <repo>/analytext-ui/resources/python.

.PARAMETER Recriar
  Apaga o destino antes de montar, se ele já existir.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/setup-python-embutido.ps1
#>
param(
  [string]$Destino = '',
  [switch]$Recriar
)

$ErrorActionPreference = 'Stop'

$VersaoPython = '3.9.13'
$UrlPython    = "https://www.python.org/ftp/python/$VersaoPython/python-$VersaoPython-embed-amd64.zip"
# pip moderno não suporta mais Python 3.9 — usar o canal específico da 3.9
$UrlGetPip    = 'https://bootstrap.pypa.io/pip/3.9/get-pip.py'

$pastaUi = Split-Path -Parent $PSScriptRoot           # analytext-ui/
$raizRepo = Split-Path -Parent $pastaUi               # raiz do repositório
if (-not $Destino) { $Destino = Join-Path $pastaUi 'resources\python' }
$Requirements = Join-Path $raizRepo 'requirements.txt'

if (-not (Test-Path $Requirements)) {
  throw "requirements.txt não encontrado em $Requirements"
}

if (Test-Path (Join-Path $Destino 'python.exe')) {
  if (-not $Recriar) {
    Write-Host "Já existe um Python embutido em $Destino."
    Write-Host 'Use -Recriar para apagar e montar do zero.'
    exit 0
  }
  Write-Host "Removendo instalação anterior em $Destino..."
  Remove-Item -Recurse -Force $Destino
}
New-Item -ItemType Directory -Force $Destino | Out-Null

$temp = Join-Path $env:TEMP 'analytext-python-embutido'
New-Item -ItemType Directory -Force $temp | Out-Null
$zip = Join-Path $temp "python-$VersaoPython-embed-amd64.zip"
$getPip = Join-Path $temp 'get-pip.py'

# TLS 1.2 para o download funcionar no Windows PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "[1/5] Baixando Python $VersaoPython (embeddable)..."
if (-not (Test-Path $zip)) {
  Invoke-WebRequest -Uri $UrlPython -OutFile $zip -UseBasicParsing
}

Write-Host "[2/5] Extraindo para $Destino..."
Expand-Archive -Path $zip -DestinationPath $Destino -Force

# O pacote embeddable vem com o site-packages desligado; o _pth precisa
# expor Lib\site-packages e importar o módulo site para o pip funcionar.
Write-Host '[3/5] Habilitando site-packages (python39._pth)...'
@'
python39.zip
.
Lib\site-packages

# Uncomment to run site.main() automatically
import site
'@ | Out-File -FilePath (Join-Path $Destino 'python39._pth') -Encoding ascii

$python = Join-Path $Destino 'python.exe'

Write-Host '[4/5] Instalando pip e as dependências do requirements.txt...'
Write-Host '      (o modelo pt_core_news_lg tem ~550 MB — pode demorar)'
if (-not (Test-Path $getPip)) {
  Invoke-WebRequest -Uri $UrlGetPip -OutFile $getPip -UseBasicParsing
}
& $python $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o pip.' }
& $python -m pip install --no-warn-script-location -r $Requirements
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências.' }

Write-Host '[5/5] Verificando os imports principais...'
& $python -c "import pandas, numpy, matplotlib, networkx, scipy, sklearn, wordcloud, spacy; spacy.load('pt_core_news_lg'); print('Python embutido OK — todas as dependências carregam.')"
if ($LASTEXITCODE -ne 0) { throw 'A verificação final falhou.' }

Write-Host ''
Write-Host "Pronto! Python embutido montado em: $Destino"
Write-Host 'O electron-builder empacota essa pasta via extraResources (electron-builder.json5).'
