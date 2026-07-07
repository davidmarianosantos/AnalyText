"""
grafo_similitude.py
===================
Módulo 4 – Grafo de Similitude entre termos
Projeto Extensionista Integrador III – UESC 2026.1
Discente: David Júnio Mariano dos Santos

Gera um grafo de co-ocorrência estilo IRaMuTeQ por entrevistado:
  - Nós = termos mais frequentes do falante
  - Arestas = co-ocorrência nas falas
  - Comunidades detectadas automaticamente (Louvain ou modularity)
  - Blob por comunidade (convex hull suavizado)
  - Nó central da comunidade destacado (borda grossa + fonte maior)

Quem é analisado: ./config/analise_config.json
  • "entrevistados": ["Nome1"]   → analisa só esses
  • "entrevistadores": ["Nome2"] → todos exceto esses
  • ambos vazios                 → todos

Saídas por entrevistado em ./outputs/<Nome>/:
  04_grafo_similitude.png
  04_comunidades_termos.csv

Dependências:
    pip install pandas networkx python-louvain matplotlib scipy numpy
"""

import os
import sys
import logging
import warnings
import itertools

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from collections import Counter
from scipy.spatial import ConvexHull
from scipy.interpolate import splprep, splev

from selecao_falantes import resolver_entrevistados, filtrar_df

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# ── Configuração global ───────────────────────────────────────────────────────

INPUT_CSV  = "./data/entrevista_processada.csv"
OUTPUT_DIR = "./outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

PALETA = [
    "#f7c948", "#7ec8a4", "#89bfdf", "#b39ddb",
    "#f48fb1", "#ff8a65", "#80cbc4", "#ce93d8",
    "#ef9a9a", "#a5d6a7",
]

FIGURA_W = 20
FIGURA_H = 16
DPI      = 180

NODE_MIN_PT = 800
NODE_MAX_PT = 5500


# ── Helpers ───────────────────────────────────────────────────────────────────

def dir_falante(falante):
    safe = falante.replace(" ", "_")
    d = os.path.join(OUTPUT_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


def freq_para_tamanho(freq, f_min, f_max):
    if f_max == f_min:
        return (NODE_MIN_PT + NODE_MAX_PT) / 2
    t = (freq - f_min) / (f_max - f_min)
    return NODE_MIN_PT + t * (NODE_MAX_PT - NODE_MIN_PT)


def peso_para_lw(w, p_min, p_max):
    if p_max == p_min:
        return 1.5
    return 0.4 + 3.5 * (w - p_min) / (p_max - p_min)


def fonte_que_cabe(ax, fig, texto, size_pt, max_frac=0.88):
    """
    Calcula a maior fonte (pt) cujo texto renderizado cabe em max_frac
    do diâmetro do nó. Usa o renderer real do matplotlib para precisão.
    Requer que o renderer esteja disponível (canvas deve estar inicializado).
    """
    renderer = fig.canvas.get_renderer()
    dpi      = fig.dpi
    diametro_pt = 2 * np.sqrt(size_pt / np.pi)
    max_largura_pt = diametro_pt * max_frac

    fsize = 14.0
    while fsize >= 5.0:
        txt_obj = ax.text(0, 0, texto, fontsize=fsize)
        bb = txt_obj.get_window_extent(renderer=renderer)
        txt_obj.remove()
        largura_pt = bb.width / (dpi / 72)
        if largura_pt <= max_largura_pt:
            return fsize
        fsize -= 0.5
    return 5.0


def desenhar_blob(ax, nos, pos, cor, padding=0.22, alpha_fill=0.17):
    pontos = np.array([pos[n] for n in nos])

    if len(pontos) == 1:
        ax.add_patch(plt.Circle(pontos[0], padding * 1.8,
                                color=cor, alpha=alpha_fill + 0.08, zorder=0))
        return
    if len(pontos) == 2:
        cx, cy = pontos.mean(axis=0)
        r = np.linalg.norm(pontos[0] - pontos[1]) / 2 + padding
        ax.add_patch(plt.Circle((cx, cy), r, color=cor,
                                alpha=alpha_fill + 0.05, zorder=0))
        return

    centro   = pontos.mean(axis=0)
    direcoes = pontos - centro
    normas   = np.linalg.norm(direcoes, axis=1, keepdims=True) + 1e-8
    expandido = pontos + (direcoes / normas) * padding

    try:
        hull     = ConvexHull(expandido)
        vertices = expandido[hull.vertices]
    except Exception:
        vertices = expandido

    vertices = np.vstack([vertices, vertices[0]])

    try:
        k_sp = min(3, len(vertices) - 1)
        tck, _ = splprep([vertices[:, 0], vertices[:, 1]], s=0, per=True, k=k_sp)
        xs, ys = splev(np.linspace(0, 1, 300), tck)
        ax.fill(xs, ys, color=cor, alpha=alpha_fill, zorder=0)
        ax.plot(xs, ys, color=cor, alpha=alpha_fill + 0.25, linewidth=1.8, zorder=0)
    except Exception:
        ax.fill(vertices[:, 0], vertices[:, 1], color=cor, alpha=alpha_fill, zorder=0)


def no_central(G, nos):
    """Nó de maior grau interno — representa a comunidade."""
    subg = G.subgraph(nos)
    graus = nx.degree_centrality(subg)
    return max(graus, key=graus.get)


# ── Grafo por falante ─────────────────────────────────────────────────────────

def gerar_grafo_falante(falante, df_f, top_termos, min_freq_termo, min_cooc, min_grau):
    d = dir_falante(falante)

    df_f = df_f[df_f["texto_processado"].str.strip().str.len() > 0].reset_index(drop=True)
    if len(df_f) < 5:
        logging.warning(f"{falante}: corpus muito pequeno para grafo de similitude.")
        return

    # ── Frequência e co-ocorrência ────────────────────────────────────────────
    todos_tokens  = [t for fala in df_f["texto_processado"] for t in fala.split()]
    freq_global   = Counter(todos_tokens)

    termos_selecionados = set(
        t for t, c in freq_global.most_common(top_termos) if c >= min_freq_termo
    )

    cooc = Counter()
    for fala in df_f["texto_processado"]:
        tokens_fala = [t for t in set(fala.split()) if t in termos_selecionados]
        for par in itertools.combinations(sorted(tokens_fala), 2):
            cooc[par] += 1

    # ── Grafo ─────────────────────────────────────────────────────────────────
    G = nx.Graph()
    for termo in termos_selecionados:
        G.add_node(termo, freq=freq_global[termo])
    for (t1, t2), peso in cooc.items():
        if peso >= min_cooc:
            G.add_edge(t1, t2, weight=peso)

    G.remove_nodes_from([n for n, deg in G.degree() if deg < min_grau])

    if G.number_of_nodes() < 3:
        logging.warning(f"{falante}: grafo com menos de 3 nós após filtro — ignorado.")
        return

    logging.info(f"  {falante}: {G.number_of_nodes()} nós · {G.number_of_edges()} arestas")

    # ── Comunidades ───────────────────────────────────────────────────────────
    try:
        import community as community_louvain
        particao = community_louvain.best_partition(G, weight="weight", random_state=42)
    except ImportError:
        from networkx.algorithms.community import greedy_modularity_communities
        comunidades = list(greedy_modularity_communities(G, weight="weight"))
        particao = {no: i for i, com in enumerate(comunidades) for no in com}

    n_com = len(set(particao.values()))
    logging.info(f"  {falante}: {n_com} comunidades")

    cores_com   = {c: PALETA[i % len(PALETA)] for i, c in enumerate(set(particao.values()))}
    cor_no      = {no: cores_com[particao[no]] for no in G.nodes()}
    nos_por_com = {}
    for no, com in particao.items():
        if no in G.nodes():
            nos_por_com.setdefault(com, []).append(no)

    # ── Layout ────────────────────────────────────────────────────────────────
    k = 6.0 / np.sqrt(max(G.number_of_nodes(), 1))
    pos = nx.spring_layout(G, weight="weight", k=k, iterations=500, seed=42)

    MIN_DIST = 0.18
    nodes_l = list(G.nodes())
    for _ in range(80):
        for i in range(len(nodes_l)):
            for j in range(i + 1, len(nodes_l)):
                ni, nj = nodes_l[i], nodes_l[j]
                dx = pos[nj][0] - pos[ni][0]
                dy = pos[nj][1] - pos[ni][1]
                dist = np.sqrt(dx**2 + dy**2) + 1e-9
                if dist < MIN_DIST:
                    forca = (MIN_DIST - dist) / 2
                    pos[ni] = (pos[ni][0] - dx / dist * forca,
                               pos[ni][1] - dy / dist * forca)
                    pos[nj] = (pos[nj][0] + dx / dist * forca,
                               pos[nj][1] + dy / dist * forca)

    freqs   = np.array([G.nodes[n]["freq"] for n in G.nodes()])
    f_min, f_max = freqs.min(), freqs.max()
    tamanho_nos = {n: freq_para_tamanho(G.nodes[n]["freq"], f_min, f_max) for n in G.nodes()}

    pesos_arr = np.array([d["weight"] for _, _, d in G.edges(data=True)]) if G.number_of_edges() else np.array([1])
    p_min, p_max = pesos_arr.min(), pesos_arr.max()

    # ── Renderização ──────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(FIGURA_W, FIGURA_H))
    fig.canvas.draw()   # inicializa renderer antes de medir fontes
    ax.set_facecolor("white")
    ax.axis("off")

    coords = np.array(list(pos.values()))
    margem = 0.35
    ax.set_xlim(coords[:, 0].min() - margem, coords[:, 0].max() + margem)
    ax.set_ylim(coords[:, 1].min() - margem, coords[:, 1].max() + margem)

    for com, nos in nos_por_com.items():
        desenhar_blob(ax, nos, pos, cores_com[com])

    for u, v, data in G.edges(data=True):
        w     = data["weight"]
        lw    = peso_para_lw(w, p_min, p_max)
        alpha = 0.18 + 0.55 * ((w - p_min) / (p_max - p_min + 1e-8))
        ax.plot([pos[u][0], pos[v][0]], [pos[u][1], pos[v][1]],
                color="#aaaaaa", linewidth=lw, alpha=alpha, zorder=1)
        if w >= max(3, p_max * 0.35):
            mx = (pos[u][0] + pos[v][0]) / 2
            my = (pos[u][1] + pos[v][1]) / 2
            ax.text(mx, my, str(w), fontsize=6, ha="center", va="center",
                    color="#777777", alpha=0.8, zorder=2)

    node_list   = list(G.nodes())
    node_sizes  = [tamanho_nos[n] for n in node_list]
    node_colors = [cor_no[n] for n in node_list]

    nx.draw_networkx_nodes(
        G, pos, ax=ax,
        nodelist=node_list,
        node_size=node_sizes,
        node_color=node_colors,
        alpha=0.92,
        linewidths=1.2,
        edgecolors="white",
    )

    # rótulos — fonte calculada para caber no nó
    for no in node_list:
        x, y  = pos[no]
        size  = tamanho_nos[no]
        fsize = fonte_que_cabe(ax, fig, no, size)
        t_norm = (G.nodes[no]["freq"] - f_min) / (f_max - f_min + 1e-8)
        ax.text(x, y, no,
                fontsize=fsize,
                fontweight="bold" if t_norm > 0.55 else "normal",
                ha="center", va="center",
                color="#111111", zorder=5, clip_on=True)

    # destaque: nó central de cada comunidade
    nos_centrais = {com: no_central(G, nos) for com, nos in nos_por_com.items()}

    for com, nc in nos_centrais.items():
        x, y  = pos[nc]
        size  = tamanho_nos[nc]
        cor   = cores_com[com]
        ax.scatter(x, y, s=size * 1.05, color=cor,
                   edgecolors="#333333", linewidths=3.0,
                   zorder=7, alpha=0.95)
        fsize = fonte_que_cabe(ax, fig, nc, size)
        ax.text(x, y, nc,
                fontsize=fsize + 3,
                fontweight="bold",
                ha="center", va="center",
                color="#111111", zorder=8)

    patches = [
        mpatches.Patch(
            color=cores_com[c],
            label=f"Comunidade {c + 1}  —  {nos_centrais[c]}  ({len(nos_por_com[c])} termos)",
        )
        for c in sorted(nos_por_com.keys())
    ]
    ax.legend(handles=patches, loc="lower left", fontsize=9,
              framealpha=0.85, title="Clusters temáticos", title_fontsize=10)

    ax.set_title(
        f"{falante} — Grafo de similitude (co-ocorrência de termos)\n"
        f"({G.number_of_nodes()} termos · {G.number_of_edges()} conexões · {n_com} comunidades)",
        fontsize=14, pad=18,
    )

    caminho_png = os.path.join(d, "04_grafo_similitude.png")
    fig.savefig(caminho_png, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    logging.info(f"  -> {caminho_png}")

    # ── CSV por comunidade ────────────────────────────────────────────────────
    linhas = []
    for com in sorted(nos_por_com.keys()):
        for no in sorted(nos_por_com[com], key=lambda n: -G.nodes[n]["freq"]):
            linhas.append({
                "comunidade":  f"comunidade_{com + 1}",
                "termo":       no,
                "frequencia":  G.nodes[no]["freq"],
                "grau":        G.degree(no),
            })

    com_df = pd.DataFrame(linhas)
    com_df.to_csv(os.path.join(d, "04_comunidades_termos.csv"), index=False)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    df = pd.read_csv(INPUT_CSV)
    df["texto_processado"] = df["texto_processado"].fillna("")

    entrevistados, config = resolver_entrevistados(df)
    df_filtrado = filtrar_df(df, entrevistados)

    cfg_cl     = config.get("clustering", {})
    top_termos = cfg_cl.get("top_termos_grafo", 35)
    min_cooc   = cfg_cl.get("min_cooc", 3)

    logging.info(f"[grafo_similitude] {len(df_filtrado)} falas | entrevistados: {entrevistados}")

    for falante in entrevistados:
        df_f = df_filtrado[df_filtrado["falante"] == falante]
        logging.info(f"\n-- {falante.upper()} ({len(df_f)} falas) --")
        gerar_grafo_falante(
            falante, df_f,
            top_termos=top_termos,
            min_freq_termo=2,
            min_cooc=min_cooc,
            min_grau=1,
        )

    print("\n[grafo_similitude] Concluido.")
    for falante in entrevistados:
        print(f"  outputs/{falante.replace(' ', '_')}/  ->  04_grafo_similitude, 04_comunidades_termos")


if __name__ == "__main__":
    main()
