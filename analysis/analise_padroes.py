"""
analise_padroes.py
==================
Módulo 2 – Identificação de padrões e frequência de termos
Projeto Extensionista Integrador III – UESC 2026.1
Discente: David Júnio Mariano dos Santos

Pré-requisito: rodar primeiro o script de pré-processamento,
que gera ./data/entrevista_processada.csv

Quem é analisado: controlado por ./config/analise_config.json
  • "entrevistados": ["Nome1", "Nome2"]  → analisa só esses
  • "entrevistadores": ["Nome3"]         → analisa todos exceto esses
  • ambos vazios                         → analisa todos (modo legado)

Cada entrevistado gera seu próprio conjunto de arquivos em ./outputs/<Nome>/.

Etapas geradas por entrevistado:
  01  Frequência absoluta de termos
  02  N-gramas: bigramas e trigramas
  03  Nuvem de palavras

Dependências:
    pip install pandas matplotlib wordcloud scikit-learn
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
import matplotlib.pyplot as plt
from collections import Counter
from sklearn.feature_extraction.text import CountVectorizer
from wordcloud import WordCloud

from selecao_falantes import resolver_entrevistados, filtrar_df

# ── Configuração global ───────────────────────────────────────────────────────

INPUT_CSV  = "./data/entrevista_processada.csv"
OUTPUT_DIR = "./outputs"

CORES = [
    "#3266ad", "#0f6e56", "#ba7517", "#993c1d",
    "#533ab7", "#3b6d11", "#993556", "#185fa5",
]

COLORMAPS_NUVEM = ["Blues", "Greens", "Oranges", "Reds",
                   "Purples", "YlOrBr", "PuRd", "GnBu"]

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def dir_falante(falante: str) -> str:
    """Diretório de saída exclusivo para cada entrevistado."""
    safe = falante.replace(" ", "_")
    d = os.path.join(OUTPUT_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


def salvar(fig, caminho: str) -> None:
    fig.savefig(caminho, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"    -> {caminho}")


def barras_horizontais(series, titulo, cor, caminho):
    """Gráfico de barras horizontais legível."""
    fig, ax = plt.subplots(figsize=(9, max(4, len(series) * 0.40)))
    ax.barh(series.index[::-1], series.values[::-1], color=cor, height=0.65)
    ax.set_title(titulo, fontsize=13, pad=10)
    ax.set_xlabel("Frequência", fontsize=10)
    ax.tick_params(axis="y", labelsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    plt.tight_layout()
    salvar(fig, caminho)


# ── Pipeline por falante ──────────────────────────────────────────────────────

def analisar_falante(falante, df_f, cor, colormap, top_n_freq, top_n_ngram, gerar_nuvem):
    """Gera todas as análises de padrões para um único entrevistado."""
    d = dir_falante(falante)
    textos = df_f["texto_processado"].fillna("").tolist()
    todos_tokens = " ".join(textos).split()

    if not todos_tokens:
        print(f"  [aviso] {falante} nao tem tokens apos pre-processamento — pulando.")
        return

    # ── 01. Frequência de termos ─────────────────────────────────────────────
    print(f"\n  [01] Frequencia de termos — {falante}")

    contagem = Counter(todos_tokens)
    freq_top = pd.Series(dict(contagem.most_common(top_n_freq)))

    barras_horizontais(
        freq_top,
        titulo=f"{falante} — Top {top_n_freq} termos mais frequentes",
        cor=cor,
        caminho=os.path.join(d, "01_freq_termos.png"),
    )

    freq_df = pd.DataFrame(contagem.most_common(), columns=["termo", "frequencia"])
    freq_df.to_csv(os.path.join(d, "01_freq_termos.csv"), index=False)

    # ── 02. N-gramas ─────────────────────────────────────────────────────────
    print(f"  [02] N-gramas — {falante}")

    for n, rotulo, cor_n in [(2, "bigramas", "#ba7517"), (3, "trigramas", "#993c1d")]:
        try:
            vec = CountVectorizer(ngram_range=(n, n), max_features=200)
            mat = vec.fit_transform(textos)
        except ValueError:
            print(f"    [aviso] Corpus insuficiente para {rotulo} de {falante}.")
            continue

        counts = mat.sum(axis=0).A1
        ngrams = (
            pd.Series(counts, index=vec.get_feature_names_out())
            .sort_values(ascending=False)
            .head(top_n_ngram)
        )

        if ngrams.empty:
            continue

        barras_horizontais(
            ngrams,
            titulo=f"{falante} — Top {top_n_ngram} {rotulo}",
            cor=cor_n,
            caminho=os.path.join(d, f"02_{rotulo}.png"),
        )

        ngrams.reset_index().rename(columns={"index": rotulo, 0: "freq"}).to_csv(
            os.path.join(d, f"02_{rotulo}.csv"), index=False
        )

    # ── 03. Nuvem de palavras ─────────────────────────────────────────────────
    if gerar_nuvem:
        print(f"  [03] Nuvem de palavras — {falante}")
        texto_completo = " ".join(todos_tokens)

        wc = WordCloud(
            width=1000, height=500,
            background_color="white",
            max_words=100,
            collocations=False,
            colormap=colormap,
            prefer_horizontal=0.85,
        ).generate(texto_completo)

        fig, ax = plt.subplots(figsize=(11, 5.5))
        ax.imshow(wc, interpolation="bilinear")
        ax.axis("off")
        ax.set_title(f"Nuvem de palavras — {falante}", fontsize=13, pad=10)
        plt.tight_layout(pad=0.5)
        salvar(fig, os.path.join(d, "03_nuvem_palavras.png"))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    df = pd.read_csv(INPUT_CSV)
    df["texto_processado"] = df["texto_processado"].fillna("")

    entrevistados, config = resolver_entrevistados(df)
    df_filtrado = filtrar_df(df, entrevistados)

    cfg_padroes = config.get("analise_padroes", {})
    top_n_freq  = cfg_padroes.get("top_n_freq", 20)
    top_n_ngram = cfg_padroes.get("top_n_ngram", 15)
    gerar_nuvem = cfg_padroes.get("gerar_nuvem", True)

    print(f"\n[analise_padroes] {len(df_filtrado)} falas | entrevistados: {entrevistados}\n")

    for i, falante in enumerate(entrevistados):
        df_f     = df_filtrado[df_filtrado["falante"] == falante]
        cor      = CORES[i % len(CORES)]
        colormap = COLORMAPS_NUVEM[i % len(COLORMAPS_NUVEM)]

        print(f"\n-- {falante.upper()} ({len(df_f)} falas) --")
        analisar_falante(falante, df_f, cor, colormap, top_n_freq, top_n_ngram, gerar_nuvem)

    print("\n[analise_padroes] Concluido.")
    for falante in entrevistados:
        print(f"  outputs/{falante.replace(' ', '_')}/  ->  01_freq_termos, 02_bigramas, 02_trigramas, 03_nuvem")


if __name__ == "__main__":
    main()
