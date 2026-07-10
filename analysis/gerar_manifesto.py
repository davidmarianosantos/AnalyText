"""
gerar_manifesto.py
===================
Une as saídas de analise_padroes.py, clustering_falas.py e grafo_similitude.py
em um único manifesto (./outputs/manifest.json).

Esse é o contrato entre Python e a interface: a UI NUNCA lê os scripts
individualmente nem precisa saber que eles existem — ela só lê este JSON
e mostra tudo dentro de uma única seção "Resultados", organizada por
participante e por categoria de análise (linguagem de pesquisa, não de NLP).

Roda depois de analise_padroes.py, clustering_falas.py e grafo_similitude.py.
"""

import os
import json
import sys
from datetime import datetime, timezone

OUTPUT_DIR = "./outputs"
MANIFEST_PATH = os.path.join(OUTPUT_DIR, "manifest.json")

# Mapeia prefixo de arquivo -> (categoria exposta ao usuário, título amigável)
REGRAS = [
    ("01_freq_termos.png",        "frequencia", "Termos mais frequentes"),
    ("01_freq_termos.csv",        "frequencia", "Tabela de frequência de termos"),
    ("03_nuvem_palavras.png",     "frequencia", "Nuvem de palavras"),

    ("02_bigramas.png",           "expressoes", "Expressões de duas palavras"),
    ("02_bigramas.csv",           "expressoes", "Tabela de expressões (bigramas)"),
    ("02_trigramas.png",          "expressoes", "Expressões de três palavras"),
    ("02_trigramas.csv",          "expressoes", "Tabela de expressões (trigramas)"),

    ("04_comunidades_termos.csv", "relacoes", "Conceitos relacionados (tabela)"),

    ("04_grafo_similitude.png",   "grafo_similitude", "Grafo de similitude"),
    ("05_grafo_dados.json",       "grafo_similitude", "Dados interativos do grafo"),
]

CATEGORIAS = ["frequencia", "expressoes", "categorias_tematicas", "relacoes", "grafo_similitude"]


def progress(pct: int, msg: str):
    print(f"PROGRESS:{pct}:{msg}", flush=True)


def montar_manifesto():
    progress(10, "Lendo pastas de resultados por participante…")

    if not os.path.isdir(OUTPUT_DIR):
        print("Nenhum resultado encontrado ainda.", file=sys.stderr)
        return {"geradoEm": datetime.now(timezone.utc).isoformat(), "participantes": []}

    participantes = []
    pastas = sorted(
        d for d in os.listdir(OUTPUT_DIR)
        if os.path.isdir(os.path.join(OUTPUT_DIR, d))
    )

    for i, pasta in enumerate(pastas):
        nome_exibicao = pasta.replace("_", " ")
        dir_completo = os.path.join(OUTPUT_DIR, pasta)
        arquivos_na_pasta = set(os.listdir(dir_completo))

        categorias = {c: [] for c in CATEGORIAS}
        for arquivo_esperado, categoria, titulo in REGRAS:
            if arquivo_esperado in arquivos_na_pasta:
                caminho_abs = os.path.abspath(os.path.join(dir_completo, arquivo_esperado))
                tipo = (
                    "grafo_interativo" if arquivo_esperado.endswith(".json")
                    else "tabela" if arquivo_esperado.endswith(".csv")
                    else "imagem"
                )
                categorias[categoria].append({
                    "titulo": titulo,
                    "tipo": tipo,
                    "caminho": caminho_abs,
                })

        participantes.append({
            "participante": nome_exibicao,
            "categorias": categorias,
        })
        progress(10 + int(80 * (i + 1) / max(len(pastas), 1)), f"Organizando resultados de {nome_exibicao}…")

    manifesto = {
        "geradoEm": datetime.now(timezone.utc).isoformat(),
        "participantes": participantes,
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=2)

    progress(100, "Manifesto de resultados atualizado.")
    return manifesto


if __name__ == "__main__":
    montar_manifesto()
