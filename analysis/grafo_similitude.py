"""
grafo_similitude.py
===================
Módulo 4 – Grafo de similitude e campos de significado
Projeto Extensionista Integrador III – UESC 2026.1
Discente: David Júnio Mariano dos Santos

Gera, por entrevistado, um grafo de similitude estilo IRaMuTeQ cujo foco
são os CAMPOS DE SIGNIFICADO — os grandes tópicos que movimentam a fala:

  1. Seleção de termos: apenas substantivos e adjetivos (verbos e advérbios
     não formam campo semântico) entre os mais frequentes do falante.
  2. Fusão de sinônimos: termos com vetores semânticos muito próximos
     (spaCy pt_core_news_lg) viram um único conceito
     (ex.: "alfabetização" + "letramento").
  3. Campos semânticos: clustering hierárquico sobre uma similaridade
     híbrida (significado dos vetores + perfil de co-ocorrência),
     com o número de campos escolhido automaticamente entre 3 e 8
     pelo critério de silhueta.
  4. Esqueleto do grafo: árvore geradora máxima da co-ocorrência
     (como no IRaMuTeQ) + arestas extras fortes — sem emaranhado.
  5. Layout em dois níveis: cada campo é posicionado como um bloco;
     dentro do bloco os conceitos se organizam sem sobreposição
     (o algoritmo considera o tamanho real de nós E rótulos).

Quem é analisado: ./config/analise_config.json
  • "entrevistados": ["Nome1"]   → analisa só esses
  • "entrevistadores": ["Nome2"] → todos exceto esses
  • ambos vazios                 → todos

Saídas por entrevistado em ./outputs/<Nome>/:
  04_grafo_similitude.png    imagem do grafo com os campos de significado
  04_comunidades_termos.csv  termos por campo (com sinônimos agrupados)
  05_grafo_dados.json        dados para o grafo interativo da interface

Dependências:
    pip install pandas networkx matplotlib scipy numpy scikit-learn spacy
    python -m spacy download pt_core_news_lg
"""

import os
import sys
import json
import logging
import warnings
import itertools

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patches as mpatches
import matplotlib.patheffects as mpatheffects
from collections import Counter
from scipy.spatial import ConvexHull
from scipy.interpolate import splprep, splev
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_score

from selecao_falantes import resolver_entrevistados, filtrar_df

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# ── Configuração global ───────────────────────────────────────────────────────

INPUT_CSV  = "./data/entrevista_processada.csv"
OUTPUT_DIR = "./outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODELO_SPACY = "pt_core_news_lg"

# Classes gramaticais que podem formar campo semântico.
# Verbos e advérbios são ações/circunstâncias — não representam bem
# os tópicos da conversa, então ficam de fora por padrão.
POS_CAMPO_PADRAO = {"NOUN", "ADJ"}

# Similaridade de cosseno mínima para fundir dois termos em um conceito
# (sinônimos / mesmo sentido). Calibrado com pt_core_news_lg:
# "alfabetização"~"letramento" = 0.84 funde; "livro"~"texto" = 0.66 não.
SIM_FUSAO_PADRAO = 0.75

# Mistura da similaridade híbrida usada para formar os campos:
# peso do significado (vetores) vs. perfil de co-ocorrência.
PESO_SEMANTICO = 0.55

MIN_CAMPOS_PADRAO = 1
MAX_CAMPOS_PADRAO = 8

DPI = 180

# Tamanho dos nós (área em pt²) e das fontes dos rótulos (pt)
NODE_MIN_PT  = 700
NODE_MAX_PT  = 3800
FONTE_MIN_PT = 9.5
FONTE_MAX_PT = 20.0

# Espaçamentos (em polegadas — o layout trabalha em polegadas reais)
FOLGA_NOS    = 0.14   # folga mínima entre nós/rótulos
FOLGA_CAMPOS = 1.10   # folga mínima entre campos

PALETA = [
    "#4e79a7", "#e15759", "#59a14f", "#f28e2b",
    "#b07aa1", "#76b7b2", "#d4a017", "#d37295",
]


def progress(pct: int, msg: str):
    """Linha de progresso lida pela interface (pythonBridge)."""
    print(f"PROGRESS:{pct}:{msg}", flush=True)


# ── Helpers visuais ───────────────────────────────────────────────────────────

def dir_falante(falante):
    safe = falante.replace(" ", "_")
    d = os.path.join(OUTPUT_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


def clarear(cor, frac=0.72):
    r, g, b = mcolors.to_rgb(cor)
    return (r + (1 - r) * frac, g + (1 - g) * frac, b + (1 - b) * frac)


def escurecer(cor, frac=0.35):
    r, g, b = mcolors.to_rgb(cor)
    return (r * (1 - frac), g * (1 - frac), b * (1 - frac))


def escala_sqrt(valor, v_min, v_max, saida_min, saida_max):
    """Escala perceptual (raiz quadrada) de frequência para tamanho."""
    if v_max <= v_min:
        return (saida_min + saida_max) / 2
    t = (np.sqrt(valor) - np.sqrt(v_min)) / (np.sqrt(v_max) - np.sqrt(v_min))
    return saida_min + t * (saida_max - saida_min)


def raio_efetivo(size_pt, rotulo, fonte_pt):
    """
    Raio de colisão do nó em POLEGADAS: o maior entre o círculo desenhado
    e a metade da largura do rótulo (que pode transbordar o círculo).
    """
    r_circulo = np.sqrt(size_pt / np.pi) / 72.0
    linha_maior = max(len(l) for l in rotulo.split("\n"))
    meia_largura = 0.5 * linha_maior * 0.60 * fonte_pt / 72.0
    return max(r_circulo, meia_largura + 0.05)


def desenhar_blob(ax, pontos, raios, cor, padding=0.30, alpha_fill=0.13):
    """
    Mancha suave envolvendo os nós de um campo. O contorno é o fecho
    convexo de círculos amostrados ao redor de cada nó — sempre tem área,
    inclusive quando os nós caem em linha reta (caso em que o fecho dos
    centros degenera e a mancha sumiria).
    """
    pontos = np.asarray(pontos, dtype=float)
    raios  = np.asarray(raios, dtype=float)

    ang = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    circulo = np.column_stack([np.cos(ang), np.sin(ang)])
    amostras = np.vstack([
        p + (r + padding) * circulo for p, r in zip(pontos, raios)
    ])

    try:
        hull     = ConvexHull(amostras)
        vertices = amostras[hull.vertices]
    except Exception:
        vertices = amostras

    # remove vértices consecutivos quase idênticos (quebrariam a spline)
    difs = np.linalg.norm(np.diff(vertices, axis=0), axis=1)
    vertices = vertices[np.r_[True, difs > 1e-6]]
    vertices = np.vstack([vertices, vertices[0]])

    try:
        k_sp = min(3, len(vertices) - 1)
        tck, _ = splprep([vertices[:, 0], vertices[:, 1]], s=0, per=True, k=k_sp)
        xs, ys = splev(np.linspace(0, 1, 300), tck)
        ax.fill(xs, ys, color=cor, alpha=alpha_fill, zorder=0)
        ax.plot(xs, ys, color=cor, alpha=alpha_fill + 0.22, linewidth=1.6, zorder=0)
    except Exception:
        ax.fill(vertices[:, 0], vertices[:, 1], color=cor, alpha=alpha_fill, zorder=0)


def compactar(posicoes, raios):
    """
    Encolhe o conjunto de círculos em direção ao centro até o par mais
    apertado encostar — remove vazios sem criar sobreposição (as distâncias
    escalam uniformemente, então nenhum par fica abaixo do seu mínimo).
    """
    chaves = list(posicoes.keys())
    if len(chaves) < 2:
        return posicoes
    centro = np.mean([posicoes[k] for k in chaves], axis=0)
    s_req = 0.0
    for a, b in itertools.combinations(chaves, 2):
        dist = float(np.linalg.norm(posicoes[a] - posicoes[b]))
        if dist < 1e-9:
            return posicoes
        s_req = max(s_req, (raios[a] + raios[b]) / dist)
    if 0.0 < s_req < 1.0:
        posicoes = {k: centro + (posicoes[k] - centro) * s_req for k in chaves}
    return posicoes


def empacotar_circulos(posicoes, raios, iters=350, atracao=0.05):
    """
    Arranjo compacto de círculos: a cada passo, atrai todos para o
    centroide e desfaz as sobreposições. Ao contrário do escalonamento
    uniforme (que preserva a forma), isto consegue "dobrar" um arranjo
    em linha num aglomerado 2D — evita grafos em corrente diagonal.
    """
    chaves = list(posicoes.keys())
    if len(chaves) < 2:
        return posicoes
    rng = np.random.default_rng(42)

    def separar():
        moveu = False
        for i in range(len(chaves)):
            for j in range(i + 1, len(chaves)):
                a, b = chaves[i], chaves[j]
                delta = posicoes[b] - posicoes[a]
                dist = float(np.linalg.norm(delta))
                minimo = raios[a] + raios[b]
                if dist < 1e-6:
                    delta = rng.normal(size=2) * 0.1
                    dist = float(np.linalg.norm(delta))
                if dist < minimo:
                    empurra = (minimo - dist) / 2
                    direcao = delta / dist
                    posicoes[a] = posicoes[a] - direcao * empurra
                    posicoes[b] = posicoes[b] + direcao * empurra
                    moveu = True
        return moveu

    for _ in range(iters):
        centroide = np.mean([posicoes[k] for k in chaves], axis=0)
        for k in chaves:
            posicoes[k] = posicoes[k] + (centroide - posicoes[k]) * atracao
        separar()

    # passe final sem atração: garante que nenhuma sobreposição restou
    for _ in range(120):
        if not separar():
            break
    return posicoes


def afastar_sobrepostos(posicoes, raios, iters=250, passo=0.5):
    """
    Remove sobreposição entre círculos (posições e raios em polegadas).
    posicoes: dict chave -> np.array([x, y]); raios: dict chave -> float.
    """
    chaves = list(posicoes.keys())
    rng = np.random.default_rng(42)
    for _ in range(iters):
        moveu = False
        for i in range(len(chaves)):
            for j in range(i + 1, len(chaves)):
                a, b = chaves[i], chaves[j]
                delta = posicoes[b] - posicoes[a]
                dist = float(np.linalg.norm(delta))
                minimo = raios[a] + raios[b]
                if dist < 1e-6:
                    delta = rng.normal(size=2) * 0.05
                    dist = float(np.linalg.norm(delta))
                if dist < minimo:
                    empurra = (minimo - dist) * passo
                    direcao = delta / dist
                    posicoes[a] = posicoes[a] - direcao * empurra / 2
                    posicoes[b] = posicoes[b] + direcao * empurra / 2
                    moveu = True
        if not moveu:
            break
    return posicoes


# ── NLP: classe gramatical, vetores e fusão de sinônimos ─────────────────────

def carregar_nlp():
    try:
        import spacy
        nlp = spacy.load(MODELO_SPACY)
        logging.info(f"Modelo {MODELO_SPACY} carregado (vetores semânticos ativos).")
        return nlp
    except Exception as e:
        logging.warning(
            f"Não foi possível carregar {MODELO_SPACY} ({e}). "
            "Seguindo sem filtro gramatical e sem fusão de sinônimos."
        )
        return None


def mapear_pos(nlp, textos):
    """POS majoritário de cada lema, medido no contexto real das falas."""
    pos_map = {}
    for doc in nlp.pipe(textos, batch_size=64):
        for tok in doc:
            lema = tok.lemma_.lower().strip()
            if lema:
                pos_map.setdefault(lema, Counter())[tok.pos_] += 1
    return {lema: c.most_common(1)[0][0] for lema, c in pos_map.items()}


def pos_do_termo(termo, pos_map, nlp):
    if termo in pos_map:
        return pos_map[termo]
    if nlp is not None:
        doc = nlp(termo)
        if len(doc):
            return doc[0].pos_
    return "NOUN"


def vetor_unitario(nlp, termo):
    lex = nlp.vocab[termo]
    if lex.has_vector and lex.vector_norm > 0:
        return lex.vector / lex.vector_norm
    return None


def fundir_sinonimos(termos, freq, vetores, limiar):
    """
    Une termos de mesmo sentido em conceitos (union-find guloso por
    similaridade decrescente). Retorna:
      termo2conceito: termo -> rótulo do conceito
      conceitos: rótulo -> {"membros": [...], "freq": int, "vetor": np.array|None}
    """
    pai = {t: t for t in termos}

    def find(t):
        while pai[t] != t:
            pai[t] = pai[pai[t]]
            t = pai[t]
        return t

    com_vetor = [t for t in termos if vetores.get(t) is not None]
    sim_par = {}
    pares = []
    for a, b in itertools.combinations(com_vetor, 2):
        sim = float(np.dot(vetores[a], vetores[b]))
        sim_par[frozenset((a, b))] = sim
        if sim >= limiar:
            pares.append((sim, a, b))
    pares.sort(reverse=True)

    membros_de = {t: {t} for t in termos}
    for sim, a, b in pares:
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        # fusão exigente: TODOS os pares entre os dois grupos precisam ser
        # similares — evita que "quase sinônimos" encadeados arrastem
        # termos de sentido diferente para dentro do conceito
        cruzados = [
            sim_par.get(frozenset((x, y)), -1.0)
            for x in membros_de[ra] for y in membros_de[rb]
        ]
        if min(cruzados) < limiar:
            continue
        pai[rb] = ra
        membros_de[ra] |= membros_de[rb]
        logging.info(f"    sinônimos fundidos: {a} + {b} (sim={sim:.2f})")

    grupos = {}
    for t in termos:
        grupos.setdefault(find(t), []).append(t)

    termo2conceito, conceitos = {}, {}
    for membros in grupos.values():
        membros = sorted(membros, key=lambda t: -freq[t])
        rotulo = membros[0]
        soma_freq = sum(freq[t] for t in membros)

        vets = [vetores[t] for t in membros if vetores.get(t) is not None]
        if vets:
            pesos = np.array([freq[t] for t in membros if vetores.get(t) is not None], dtype=float)
            v = np.average(np.array(vets), axis=0, weights=pesos)
            norma = np.linalg.norm(v)
            v = v / norma if norma > 0 else None
        else:
            v = None

        for t in membros:
            termo2conceito[t] = rotulo
        # freq = soma (frequência real do conceito, vai para CSV/JSON);
        # freq_display = termo mais forte — um nó fundido não deve parecer
        # maior/mais importante do que qualquer palavra única do corpus
        conceitos[rotulo] = {
            "membros": membros,
            "freq": soma_freq,
            "freq_display": freq[membros[0]],
            "vetor": v,
        }

    return termo2conceito, conceitos


# ── Campos semânticos (clustering híbrido) ────────────────────────────────────

def matriz_similaridade(nomes, conceitos, cooc):
    """
    Similaridade híbrida entre conceitos:
      - semântica: cosseno dos vetores dos conceitos
      - contextual: cosseno dos perfis de co-ocorrência
        (conceitos que aparecem junto das mesmas palavras pertencem
         ao mesmo campo, mesmo sem co-ocorrer entre si)
    """
    n = len(nomes)
    idx = {c: i for i, c in enumerate(nomes)}

    M = np.zeros((n, n))
    for (a, b), w in cooc.items():
        if a in idx and b in idx:
            M[idx[a], idx[b]] = w
            M[idx[b], idx[a]] = w

    normas = np.linalg.norm(M, axis=1)
    S_ctx = np.full((n, n), np.nan)
    for i in range(n):
        for j in range(n):
            if normas[i] > 0 and normas[j] > 0:
                S_ctx[i, j] = float(np.dot(M[i], M[j]) / (normas[i] * normas[j]))

    S_emb = np.full((n, n), np.nan)
    for i, a in enumerate(nomes):
        for j, b in enumerate(nomes):
            va, vb = conceitos[a]["vetor"], conceitos[b]["vetor"]
            if va is not None and vb is not None:
                S_emb[i, j] = float(np.dot(va, vb))

    S = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            partes, pesos = [], []
            if not np.isnan(S_emb[i, j]):
                partes.append(S_emb[i, j]); pesos.append(PESO_SEMANTICO)
            if not np.isnan(S_ctx[i, j]):
                partes.append(S_ctx[i, j]); pesos.append(1 - PESO_SEMANTICO)
            S[i, j] = np.average(partes, weights=pesos) if partes else 0.0

    S = (S + S.T) / 2
    np.fill_diagonal(S, 1.0)
    return S


def detectar_campos(nomes, S, min_campos, max_campos):
    """
    Clustering hierárquico com escolha automática do nº de campos (silhueta),
    restrito à faixa [min_campos, max_campos] para manter a leitura possível.
    Campos de um único termo são absorvidos; campos gigantes são divididos
    para que nenhum tópico "engula" a conversa inteira.
    """
    n = len(nomes)
    D = np.clip(1.0 - S, 0.0, 2.0)
    np.fill_diagonal(D, 0.0)

    if n <= min_campos:
        return {c: 0 for c in nomes}

    k_min = min(min_campos, n - 1)
    k_max = min(max_campos, n - 1)

    def agrupar(dist, k, linkage="complete"):
        return AgglomerativeClustering(
            n_clusters=k, metric="precomputed", linkage=linkage
        ).fit_predict(dist)

    # testa as duas estratégias de linkage em toda a faixa de k;
    # "complete" tende a equilibrar os campos, "average" a aglomerar
    candidatos = []
    for linkage in ("complete", "average"):
        for k in range(k_min, k_max + 1):
            labels_k = agrupar(D, k, linkage)
            try:
                score = silhouette_score(D, labels_k, metric="precomputed")
            except Exception:
                score = -1.0
            maior_frac = max(Counter(labels_k).values()) / n
            candidatos.append((linkage, k, labels_k, score, maior_frac))

    # prefere soluções em que nenhum campo "engole" a conversa (≤45% dos
    # conceitos); entre quase empatadas na silhueta, prefere MAIS campos
    equilibrados = [c for c in candidatos if c[4] <= 0.45]
    universo = equilibrados if equilibrados else candidatos
    melhor = max(c[3] for c in universo)
    linkage_e, k_escolhido, labels, score_e, _ = max(
        (c for c in universo if c[3] >= melhor - 0.04), key=lambda c: c[1]
    )
    labels = labels.copy()
    logging.info(
        f"    campos por silhueta: {k_escolhido} "
        f"(linkage={linkage_e}, score={score_e:.2f})"
    )

    def absorver_solitarios(labels):
        for _ in range(n):
            tamanhos = Counter(labels)
            solitarios = [c for c, t in tamanhos.items() if t == 1]
            if not solitarios or len(tamanhos) <= min_campos:
                break
            c_alvo = solitarios[0]
            i_solo = int(np.where(labels == c_alvo)[0][0])
            melhor_c, melhor_sim = None, -2.0
            for c in tamanhos:
                if c == c_alvo:
                    continue
                membros = np.where(labels == c)[0]
                sim = float(np.mean(S[i_solo, membros]))
                if sim > melhor_sim:
                    melhor_c, melhor_sim = c, sim
            labels[i_solo] = melhor_c
        return labels

    labels = absorver_solitarios(labels)

    # divide campos que concentram quase tudo (mais de ~45% dos conceitos)
    limite_tamanho = max(6, int(np.ceil(0.45 * n)))
    proximo_id = int(labels.max()) + 1
    for _ in range(max_campos):
        tamanhos = Counter(labels)
        maior_c, maior_t = tamanhos.most_common(1)[0]
        if maior_t <= limite_tamanho or len(tamanhos) >= max_campos:
            break
        idx_membros = np.where(labels == maior_c)[0]
        sub_labels = agrupar(D[np.ix_(idx_membros, idx_membros)], 2)
        for pos_local_i, novo in zip(idx_membros, sub_labels):
            if novo == 1:
                labels[pos_local_i] = proximo_id
        proximo_id += 1

    labels = absorver_solitarios(labels)

    # renumera por tamanho (campo 0 = maior)
    ordem = [c for c, _ in Counter(labels).most_common()]
    renum = {c: i for i, c in enumerate(ordem)}
    return {nome: renum[labels[i]] for i, nome in enumerate(nomes)}


# ── Grafo por falante ─────────────────────────────────────────────────────────

def gerar_grafo_falante(falante, df_f, nlp, cfg):
    d = dir_falante(falante)

    df_f = df_f[df_f["texto_processado"].str.strip().str.len() > 0].reset_index(drop=True)
    if len(df_f) < 5:
        logging.warning(f"{falante}: corpus muito pequeno para grafo de similitude.")
        return

    top_termos     = cfg.get("top_termos_grafo", 35)
    min_cooc       = cfg.get("min_cooc", 3)
    min_freq_termo = cfg.get("min_freq_termo", 3)
    sim_fusao      = cfg.get("sim_fusao", SIM_FUSAO_PADRAO)
    min_campos     = cfg.get("min_campos", MIN_CAMPOS_PADRAO)
    max_campos     = cfg.get("max_campos", MAX_CAMPOS_PADRAO)
    pos_campo      = set(POS_CAMPO_PADRAO)
    if cfg.get("incluir_verbos", False):
        pos_campo |= {"VERB"}

    # ── 1. Seleção de termos: substantivos/adjetivos mais frequentes ─────────
    todos_tokens = [t for fala in df_f["texto_processado"] for t in fala.split()]
    freq_global  = Counter(todos_tokens)

    pos_map = mapear_pos(nlp, df_f["texto"].fillna("").tolist()) if nlp is not None else {}

    def candidatos_com(freq_min):
        if nlp is not None:
            return [
                t for t, c in freq_global.most_common()
                if c >= freq_min and pos_do_termo(t, pos_map, nlp) in pos_campo
            ]
        return [t for t, c in freq_global.most_common() if c >= freq_min]

    # falantes com pouca fala não repetem palavras o suficiente para a
    # frequência mínima padrão: relaxa progressivamente até juntar termos
    # suficientes para um grafo legível
    termos = []
    for freq_min in sorted({min_freq_termo, 2, 1}, reverse=True):
        termos = candidatos_com(freq_min)[:top_termos]
        if len(termos) >= 8:
            break
    if len(termos) < 2:
        logging.warning(f"{falante}: poucos termos após filtro gramatical — ignorado.")
        return
    logging.info(f"  {falante}: {len(termos)} termos candidatos (substantivos/adjetivos)")

    # ── 2. Fusão de sinônimos em conceitos ────────────────────────────────────
    vetores = {t: (vetor_unitario(nlp, t) if nlp is not None else None) for t in termos}
    termo2conceito, conceitos = fundir_sinonimos(termos, freq_global, vetores, sim_fusao)

    # ── 3. Co-ocorrência entre conceitos (por fala) ───────────────────────────
    cooc = Counter()
    for fala in df_f["texto_processado"]:
        presentes = {termo2conceito[t] for t in fala.split() if t in termo2conceito}
        for par in itertools.combinations(sorted(presentes), 2):
            cooc[par] += 1

    G = nx.Graph()
    for nome, info in conceitos.items():
        G.add_node(nome, freq=info["freq"], freq_display=info["freq_display"],
                   membros=info["membros"])
    for (a, b), w in cooc.items():
        G.add_edge(a, b, weight=w)

    # remove conceitos sem nenhuma co-ocorrência — mas só quando sobra
    # grafo suficiente; num corpus pequeno os isolados são o que existe
    isolados = list(nx.isolates(G))
    if G.number_of_nodes() - len(isolados) >= 4:
        G.remove_nodes_from(isolados)
    if G.number_of_nodes() < 2:
        logging.warning(f"{falante}: menos de 2 conceitos — sem grafo.")
        return

    # ── 4. Campos semânticos ──────────────────────────────────────────────────
    nomes = list(G.nodes())
    S = matriz_similaridade(nomes, conceitos, cooc)
    campo_de = detectar_campos(nomes, S, min_campos, max_campos)
    n_campos = len(set(campo_de.values()))
    logging.info(f"  {falante}: {len(nomes)} conceitos em {n_campos} campos de significado")

    nos_por_campo = {}
    for nome in nomes:
        nos_por_campo.setdefault(campo_de[nome], []).append(nome)

    # rótulo/centro do campo = termo mais forte (frequência × conexões).
    # Conceitos fundidos (vários termos no nó) podem aparecer como termos,
    # mas o destaque central do campo é sempre uma palavra única.
    forca = {n: G.nodes[n]["freq"] * (1 + G.degree(n, weight="weight")) for n in nomes}

    def escolher_central(ns):
        simples = [n for n in ns if len(G.nodes[n]["membros"]) == 1]
        return max(simples or ns, key=lambda n: forca[n])

    rotulo_campo = {c: escolher_central(ns) for c, ns in nos_por_campo.items()}
    cores_campo  = {c: PALETA[c % len(PALETA)] for c in nos_por_campo}

    # ── 5. Esqueleto: árvore geradora máxima + arestas extras fortes ──────────
    # extras só DENTRO do mesmo campo: reforçam a coesão interna do tópico
    # sem cruzar o desenho de linhas entre campos distantes
    arvore = nx.maximum_spanning_tree(G, weight="weight")
    extras = sorted(
        (e for e in G.edges(data=True)
         if not arvore.has_edge(e[0], e[1]) and campo_de[e[0]] == campo_de[e[1]]),
        key=lambda e: -e[2]["weight"],
    )
    limite_extras = max(3, int(0.4 * G.number_of_nodes()))
    extras = [e for e in extras if e[2]["weight"] >= min_cooc][:limite_extras]

    G_draw = nx.Graph()
    G_draw.add_nodes_from(G.nodes(data=True))
    G_draw.add_edges_from(arvore.edges(data=True), tipo="arvore")
    G_draw.add_edges_from(((a, b, dict(dt, tipo="extra")) for a, b, dt in extras))

    # ── 6. Tamanhos (nó, fonte, raio de colisão) ─────────────────────────────
    freqs = [G.nodes[n]["freq_display"] for n in nomes]
    f_min, f_max = min(freqs), max(freqs)

    rotulo_no = {}
    for n in nomes:
        membros = G.nodes[n]["membros"]
        rotulo_no[n] = "\n".join(membros[:3]) if len(membros) > 1 else n

    size_pt  = {n: escala_sqrt(G.nodes[n]["freq_display"], f_min, f_max, NODE_MIN_PT, NODE_MAX_PT) for n in nomes}
    fonte_pt = {n: escala_sqrt(G.nodes[n]["freq_display"], f_min, f_max, FONTE_MIN_PT, FONTE_MAX_PT) for n in nomes}
    raio_no  = {n: raio_efetivo(size_pt[n], rotulo_no[n], fonte_pt[n]) + FOLGA_NOS for n in nomes}

    # ── 7. Layout em dois níveis (unidades em polegadas) ──────────────────────
    # 7a. arranjo interno de cada campo
    pos_local, raio_campo = {}, {}
    for c, ns in nos_por_campo.items():
        sub = G.subgraph(ns)
        if len(ns) == 1:
            local = {ns[0]: np.zeros(2)}
        else:
            alvo = 0.75 * np.sqrt(len(ns)) * float(np.mean([raio_no[n] for n in ns])) * 2.2
            bruto = nx.spring_layout(sub, weight="weight", iterations=300, seed=42)
            local = {n: np.asarray(p, dtype=float) for n, p in bruto.items()}
            centro = np.mean(list(local.values()), axis=0)
            escala_max = max(np.linalg.norm(p - centro) for p in local.values()) + 1e-9
            local = {n: (p - centro) / escala_max * alvo for n, p in local.items()}
            raios_ns = {n: raio_no[n] for n in ns}
            local = afastar_sobrepostos(local, raios_ns)
            local = compactar(local, raios_ns)
            centroide = np.mean(list(local.values()), axis=0)
            local = {n: p - centroide for n, p in local.items()}
        pos_local[c] = local
        raio_campo[c] = max(np.linalg.norm(p) + raio_no[n] for n, p in local.items())

    # 7b. campos como blocos: próximos se conversam muito, sem se sobrepor
    meta = nx.Graph()
    meta.add_nodes_from(nos_por_campo)
    for (a, b), w in cooc.items():
        ca, cb = campo_de.get(a), campo_de.get(b)
        if ca is not None and cb is not None and ca != cb:
            meta.add_edge(ca, cb, weight=meta.get_edge_data(ca, cb, {"weight": 0})["weight"] + w)

    # começa com os campos quase sobrepostos e só afasta o necessário:
    # o resultado é um mosaico compacto em que campos que conversam
    # entre si ficam vizinhos, sem grandes vazios
    escala_meta = 0.9 * max(raio_campo.values())
    centro_meta = nx.spring_layout(meta, weight="weight", iterations=300, seed=42)
    centros = {c: np.asarray(p, dtype=float) * escala_meta for c, p in centro_meta.items()}
    raios_meta = {c: raio_campo[c] + FOLGA_CAMPOS / 2 for c in centros}
    centros = empacotar_circulos(centros, raios_meta)

    pos = {}
    for c, ns in nos_por_campo.items():
        for n in ns:
            pos[n] = centros[c] + pos_local[c][n]

    # 7c. passe final: nenhuma sobreposição residual entre campos vizinhos
    pos = afastar_sobrepostos(pos, raio_no, iters=120, passo=0.35)

    # ── 8. Renderização (1 unidade de dado = 1 polegada) ─────────────────────
    xs = [pos[n][0] for n in nomes]
    ys = [pos[n][1] for n in nomes]
    rs = [raio_no[n] for n in nomes]
    x0 = min(x - r for x, r in zip(xs, rs)) - 0.7
    x1 = max(x + r for x, r in zip(xs, rs)) + 0.7
    y0 = min(y - r for y, r in zip(ys, rs)) - 2.3   # espaço para a legenda
    y1 = max(y + r for y, r in zip(ys, rs)) + 1.4   # espaço para o título

    fig_w, fig_h = x1 - x0, y1 - y0
    escala_fig = min(1.0, 30.0 / fig_w, 26.0 / fig_h)

    fig = plt.figure(figsize=(fig_w * escala_fig, fig_h * escala_fig))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_facecolor("white")
    ax.axis("off")

    halo = [mpatheffects.withStroke(linewidth=3, foreground="white")]

    for c, ns in nos_por_campo.items():
        desenhar_blob(ax, [pos[n] for n in ns], [raio_no[n] for n in ns], cores_campo[c])

    pesos = [dt["weight"] for _, _, dt in G_draw.edges(data=True)] or [1]
    p_min, p_max = min(pesos), max(pesos)
    for a, b, dt in G_draw.edges(data=True):
        t = (dt["weight"] - p_min) / (p_max - p_min + 1e-9)
        if dt.get("tipo") == "extra":
            ax.plot(*zip(pos[a], pos[b]), color="#c0c0c0",
                    linewidth=0.8 + 1.0 * t, alpha=0.35, zorder=1)
        elif campo_de[a] != campo_de[b]:
            # ligação entre campos: presente, mas discreta, para não
            # embaralhar a leitura dos campos
            ax.plot(*zip(pos[a], pos[b]), color="#9a9a9a",
                    linewidth=1.0 + 1.8 * t, alpha=0.30 + 0.25 * t, zorder=1)
        else:
            ax.plot(*zip(pos[a], pos[b]), color="#8a8a8a",
                    linewidth=1.3 + 2.7 * t, alpha=0.55 + 0.35 * t, zorder=1)

    for n in nomes:
        c = campo_de[n]
        central = (n == rotulo_campo[c])
        ax.scatter(*pos[n], s=size_pt[n],
                   color=clarear(cores_campo[c], 0.70),
                   edgecolors=escurecer(cores_campo[c], 0.45 if central else 0.15),
                   linewidths=3.0 if central else 1.6,
                   alpha=0.97, zorder=3)
        # negrito só para centros de campo e palavras únicas muito frequentes;
        # conceitos fundidos nunca ganham destaque tipográfico
        fundido = len(G.nodes[n]["membros"]) > 1
        ax.text(*pos[n], rotulo_no[n],
                fontsize=fonte_pt[n] + (1.5 if central else 0),
                fontweight="bold" if central or (fonte_pt[n] > 14 and not fundido) else "normal",
                ha="center", va="center", color="#1a1a1a",
                path_effects=halo, zorder=5, linespacing=1.05)

    # título de cada campo acima da mancha
    for c, ns in nos_por_campo.items():
        cx = float(np.mean([pos[n][0] for n in ns]))
        cy = max(pos[n][1] + raio_no[n] for n in ns) + 0.42
        ax.text(cx, cy, rotulo_campo[c].upper(),
                fontsize=13, fontweight="bold",
                ha="center", va="bottom",
                color=escurecer(cores_campo[c], 0.30),
                path_effects=halo, zorder=6)

    def resumo_campo(c):
        ordenados = sorted(nos_por_campo[c], key=lambda n: -G.nodes[n]["freq"])
        exemplo = ", ".join(ordenados[:3])
        return f"Campo {c + 1} · {rotulo_campo[c]}  ({len(nos_por_campo[c])} conceitos: {exemplo}…)"

    patches = [mpatches.Patch(color=cores_campo[c], label=resumo_campo(c))
               for c in sorted(nos_por_campo)]
    ax.legend(handles=patches, loc="lower left", fontsize=10,
              framealpha=0.9, title="Campos de significado", title_fontsize=11)

    ax.text((x0 + x1) / 2, y1 - 0.35,
            f"{falante} — Campos de significado (grafo de similitude)",
            fontsize=15, ha="center", va="top", color="#222222")

    caminho_png = os.path.join(d, "04_grafo_similitude.png")
    fig.savefig(caminho_png, dpi=DPI, facecolor="white")
    plt.close(fig)
    logging.info(f"  -> {caminho_png}")

    # ── 9. CSV por campo ──────────────────────────────────────────────────────
    linhas = []
    for c in sorted(nos_por_campo):
        for nome in sorted(nos_por_campo[c], key=lambda n: -G.nodes[n]["freq"]):
            for termo in G.nodes[nome]["membros"]:
                linhas.append({
                    "comunidade":  f"campo_{c + 1}",
                    "termo":       termo,
                    "frequencia":  freq_global[termo],
                    "grau":        G.degree(nome),
                    "conceito":    nome,
                    "rotulo_campo": rotulo_campo[c],
                })
    pd.DataFrame(linhas).to_csv(os.path.join(d, "04_comunidades_termos.csv"), index=False)

    # ── 10. JSON para o grafo interativo da interface ─────────────────────────
    dados = {
        "participante": falante,
        "nos": [
            {
                "id": rotulo_no[n].replace("\n", " / "),
                "frequencia": int(G.nodes[n]["freq"]),
                "comunidade": int(campo_de[n]),
                "central": bool(n == rotulo_campo[campo_de[n]]),
            }
            for n in nomes
        ],
        "arestas": [
            {"origem": rotulo_no[a].replace("\n", " / "),
             "destino": rotulo_no[b].replace("\n", " / "),
             "peso": int(dt["weight"])}
            for a, b, dt in G_draw.edges(data=True)
        ],
        "comunidades": [
            {"id": int(c), "rotulo": rotulo_campo[c], "cor": cores_campo[c],
             "tamanho": len(nos_por_campo[c])}
            for c in sorted(nos_por_campo)
        ],
    }
    with open(os.path.join(d, "05_grafo_dados.json"), "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    progress(5, "Lendo falas processadas…")
    df = pd.read_csv(INPUT_CSV)
    df["texto_processado"] = df["texto_processado"].fillna("")

    entrevistados, config = resolver_entrevistados(df)
    df_filtrado = filtrar_df(df, entrevistados)
    cfg = config.get("clustering", {})

    logging.info(f"[grafo_similitude] {len(df_filtrado)} falas | entrevistados: {entrevistados}")

    progress(15, "Carregando modelo de linguagem…")
    nlp = carregar_nlp()

    for i, falante in enumerate(entrevistados):
        df_f = df_filtrado[df_filtrado["falante"] == falante]
        logging.info(f"\n-- {falante.upper()} ({len(df_f)} falas) --")
        progress(20 + int(75 * i / max(len(entrevistados), 1)),
                 f"Gerando campos de significado de {falante}…")
        gerar_grafo_falante(falante, df_f, nlp, cfg)

    progress(100, "Grafos de similitude concluídos.")
    print("\n[grafo_similitude] Concluido.")
    for falante in entrevistados:
        print(f"  outputs/{falante.replace(' ', '_')}/  ->  "
              f"04_grafo_similitude, 04_comunidades_termos, 05_grafo_dados")


if __name__ == "__main__":
    main()
