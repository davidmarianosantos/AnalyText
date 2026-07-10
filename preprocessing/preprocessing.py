"""
preprocessing.py
=================
Módulo 1 – Pré-processamento de entrevistas para análise qualitativa
Projeto Extensionista Integrador III – UESC 2026.1
Discente: David Júnio Mariano dos Santos

Genérico para qualquer arquivo de entrevista no formato:
    Falante
    Texto da fala
    Falante
    Texto da fala
    ...

Detecção automática de:
  - Nomes de pessoas, locais e organizações via NER do spaCy (não hardcoded)
  - Erros de lematização (fallback para o texto original)

Customização sem editar código:
  - ./config/stopwords_config.json controla listas extras, exceções e
    o que o NER deve ou não excluir. Pensado para ser editado por uma
    interface (UI) futura, sem precisar mexer neste script.

Dependências:
    pip install pandas spacy
    python -m spacy download pt_core_news_lg
"""

import os
import re
import json
import logging
import pandas as pd
import spacy

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

INPUT_TXT     = "./data/entrevista.txt"
OUTPUT_CSV    = "./data/entrevista_processada.csv"
CONFIG_PATH   = "./config/stopwords_config.json"

# Advérbios ficam de fora: em entrevistas eles são quase só marcação de
# discurso (hoje, aí, assim, realmente) e não carregam tópico.
POS_PERMITIDOS = {"NOUN", "ADJ", "VERB"}

# Verbos semanticamente vazios — passam pelo filtro de POS mas nao
# carregam conteudo relevante para analise qualitativa de entrevistas.
# Vale para qualquer tópico de entrevista: são verbos de apoio, de
# discurso (o ato de conversar), de afeto genérico e de movimento.
VERBOS_VAZIOS = {
    # verbos-suporte / delexicalizados
    "ser", "estar", "tar", "ter", "fazer", "ir", "vir", "ver",
    "dar", "ficar", "poder", "querer", "precisar", "dever",
    "deixar", "passar", "trazer", "por", "colocar", "botar",
    "pegar", "tirar", "levar", "mandar", "receber", "usar", "mexer",
    # verbos de discurso/cognição genérica (mecânica da conversa)
    "falar", "dizer", "conversar", "perguntar", "achar", "pensar",
    "saber", "conhecer", "entender", "lembrar", "esquecer", "olhar",
    # afeto genérico (sentimento sem tópico)
    "gostar", "amar", "adorar", "odiar", "preferir",
    # movimento genérico
    "chegar", "sair", "voltar", "entrar", "andar",
    # aspecto/modalidade
    "comecar", "começar", "continuar", "acabar", "terminar",
    "tentar", "conseguir", "esperar", "acontecer", "parecer",
    "existir", "parar", "virar", "valer", "caber",
}

# Palavras genéricas de qualquer tópico (substantivos "curinga",
# adjetivos avaliativos, marcadores de discurso) — frequentes em toda
# fala espontânea e sem valor para identificar os temas da entrevista.
PALAVRAS_GENERICAS = {
    # substantivos curinga
    "coisa", "coisinha", "gente", "pessoa", "pessoal", "negócio",
    "troço", "exemplo", "vez", "jeito", "maneira", "tipo", "parte",
    "lado", "meio", "resto", "monte", "tanto", "pouquinho",
    "verdade", "mentira", "fato",
    # adjetivos avaliativos / tamanho genérico
    "bom", "ruim", "legal", "ótimo", "péssimo", "maravilhoso",
    "perfeito", "lindo", "bonito", "bonitinho", "feio", "bacana",
    "incrível", "grande", "pequeno", "novo", "velho", "último",
    # marcadores de discurso disfarçados de adjetivo
    "certo", "errado", "claro", "preciso", "óbvio",
}

# entidades NER do spaCy relevantes para exclusão automática de nomes próprios
# PER = pessoa, LOC = local, ORG = organização, MISC = diversos
ENTIDADES_NER = {"PER": "excluir_pessoas", "LOC": "excluir_locais", "ORG": "excluir_organizacoes"}

# terminações que costumam indicar erro de lematização em verbos coloquiais
TERMINACOES_SUSPEITAS = ("or", "igar", "uir", "ear")

# Correções conhecidas de erros de lematização do spaCy pt_core_news_lg
# em verbos irregulares — mapeamento direto, sem heurística de string.
# A raiz desses lemas errados costuma bater com a raiz do texto original
# (ex: "cresço" -> lema errado "cresçor"), então nenhuma heurística baseada
# em comparação de raiz consegue detectá-los. Lista pequena e cumulativa:
# adicione aqui sempre que detectar um novo erro nos dados.
CORRECOES_LEMA = {
    "ouçor":        "ouço",
    "peguar":       "pegar",
    "veer":         "ver",
    "vejor":        "ver",
    "vejo":         "ver",
    "fazir":        "fazer",
    "cresçor":      "crescer",
    "lembror":      "lembrar",
    "consigar":     "conseguir",
    "fotor":        "fotografar",
    "identifiquar": "identificar",
    "corriger":     "corrigir",
    "corrir":       "corrigir",
    "achor":        "achar",
    "mostror":      "mostrar",
    "ficor":        "ficar",
    "fiquei":       "ficar",
    "sintar":       "sentir",
    "percebar":     "perceber",
    "percebi":      "perceber",
    "compreer":     "compreender",
    "comprer":      "comprar",
    "compro":       "comprar",
    "agradeçar":    "agradecer",
    "entendi":      "entender",
    "entendo":      "entender",
    "puder":        "poder",
    "diga":         "dizer",
    "disser":       "dizer",
    "dou":          "dar",
    "venho":        "vir",
    "vier":         "vir",
    "vim":          "vir",
    "trago":        "trazer",
    "busco":        "buscar",
    "saí":          "sair",
}


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO
# ══════════════════════════════════════════════════════════════════════════════

def carregar_config(caminho: str) -> dict:
    """
    Carrega config externa editável (ex: por uma interface).
    Se o arquivo não existir, cria um padrão vazio — a aplicação
    nunca quebra por falta de config.
    """
    default = {
        "stopwords_extras": [],
        "palavras_protegidas": [],   # nunca remover, mesmo se NER marcar como nome
        "siglas_manter": [],         # siglas que devem permanecer (ex: ONG, sigla de instituição)
        "excluir_pessoas": True,
        "excluir_locais": False,
        "excluir_organizacoes": False,
    }
    if not os.path.exists(caminho):
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(default, f, ensure_ascii=False, indent=2)
        logging.info(f"Config padrão criada em {caminho}")
        return default

    with open(caminho, encoding="utf-8") as f:
        config = json.load(f)
    # garante que todas as chaves existam, mesmo em config antiga
    for k, v in default.items():
        config.setdefault(k, v)
    return config


# ══════════════════════════════════════════════════════════════════════════════
# CARREGAMENTO DAS FALAS
# ══════════════════════════════════════════════════════════════════════════════

def carregar_falas(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8-sig") as f:
        linhas = [l.strip() for l in f if l.strip()]

    if len(linhas) % 2 != 0:
        logging.warning("Número ímpar de linhas — última fala ignorada.")
        linhas = linhas[:-1]

    return [
        {"id_fala": i + 1, "falante": falante, "texto": texto}
        for i, (falante, texto) in enumerate(zip(linhas[::2], linhas[1::2]))
    ]


# ══════════════════════════════════════════════════════════════════════════════
# DETECÇÃO AUTOMÁTICA DE ENTIDADES NOMEADAS (NER)
# ══════════════════════════════════════════════════════════════════════════════

def coletar_entidades_para_excluir(docs, nlp, config: dict) -> set[str]:
    """
    Varre o corpus inteiro com o NER do spaCy e identifica automaticamente
    nomes de pessoas, locais e organizações — sem qualquer lista fixa.
    Respeita a configuração (ex: usuário pode optar por manter locais).
    """
    entidades = set()
    for doc in docs:
        for ent in doc.ents:
            tipo_config = ENTIDADES_NER.get(ent.label_)
            if tipo_config and config.get(tipo_config, False):
                # o span inteiro só é excluído se parecer nome próprio de
                # fato (palavras capitalizadas). O NER em fala transcrita
                # marca verbos comuns em minúscula como "pessoa"
                # ("planejo", "anoto") — sem esta checagem, essas palavras
                # sumiriam do corpus inteiro.
                if all(t.pos_ == "PROPN" and t.text.istitle()
                       for t in ent if t.text.isalpha()):
                    entidades.add(ent.text.lower().strip())
                # também adiciona cada token da entidade composta
                # (ex: "Maria Silva" → "maria", "silva"), mas SÓ os que o
                # tagger confirma como nome próprio: o NER erra bastante em
                # fala coloquial e, sem essa checagem, palavras comuns
                # apanhadas num span errado ("páscoa", "tia", "planejo")
                # seriam excluídas do corpus inteiro.
                for token in ent:
                    if token.pos_ == "PROPN":
                        entidades.add(token.text.lower().strip())
    return entidades


# ══════════════════════════════════════════════════════════════════════════════
# LEMATIZAÇÃO COM FALLBACK SEGURO
# ══════════════════════════════════════════════════════════════════════════════

def lema_seguro(token) -> str:
    """
    Usa o lema do spaCy, corrigindo erros conhecidos de lematização em
    verbos irregulares via CORRECOES_LEMA (mapeamento direto e confiável).

    Por que não usar heurística de comparação de raiz: nos erros reais do
    spaCy pt_core_news_lg, a raiz do lema errado costuma ser idêntica à
    raiz do texto original (ex: "cresço" -> "cresçor"), porque o modelo
    erra a terminação/vogal temática, não a raiz. Uma heurística baseada
    em "raízes diferentes = erro" não detecta esse padrão e deixa passar
    o lema errado. O mapeamento direto é mais confiável, ainda que exija
    manutenção manual à medida que novos erros forem encontrados.
    """
    lema = token.lemma_.lower().strip()
    return CORRECOES_LEMA.get(lema, lema)


# ══════════════════════════════════════════════════════════════════════════════
# PRÉ-PROCESSAMENTO
# ══════════════════════════════════════════════════════════════════════════════

# Lemas de verbo descartados pela regra de sanidade (lema de verbo em
# português termina em "r") — coletados para auditoria no final do pipeline.
LEMAS_VERBO_DESCARTADOS = set()


def preprocessar(doc, config: dict, entidades_excluir: set[str]) -> str:
    stopwords_extras = set(config.get("stopwords_extras", []))
    palavras_protegidas = set(config.get("palavras_protegidas", []))
    siglas_manter = set(config.get("siglas_manter", []))

    tokens = []
    for token in doc:
        lema = lema_seguro(token)
        texto_original = token.text.lower().strip()

        # palavras protegidas pulam todos os filtros (configurável pelo usuário)
        if lema in palavras_protegidas or texto_original in palavras_protegidas:
            tokens.append(lema)
            continue

        if token.is_stop:           continue
        if token.is_punct:          continue
        if token.like_num:          continue
        if token.is_space:          continue
        if len(lema) <= 2:          continue

        if token.pos_ not in POS_PERMITIDOS:
            continue

        if lema in stopwords_extras:
            continue

        # palavras genéricas de qualquer tópico (curinga/avaliativas)
        if lema in PALAVRAS_GENERICAS:
            continue

        # verbos semanticamente vazios (nao carregam conteudo relevante)
        if token.pos_ == "VERB" and lema in VERBOS_VAZIOS:
            continue

        # sanidade: lema de verbo em português sempre termina em "r"
        # (falar, dizer, pôr). Se não termina, a lematização falhou e a
        # forma flexionada escaparia de todos os filtros ("entendi",
        # "fiquei"). Descarta e registra para alimentar CORRECOES_LEMA.
        if token.pos_ == "VERB" and not lema.endswith("r"):
            LEMAS_VERBO_DESCARTADOS.add(lema)
            continue

        # exclusão automática de nomes detectados via NER
        if lema in entidades_excluir or texto_original in entidades_excluir:
            continue

        # siglas: mantém só as configuradas, descarta outras maiúsculas
        if token.text.isupper() and len(token.text) <= 5:
            if lema not in siglas_manter and texto_original not in siglas_manter:
                continue

        tokens.append(lema)

    return " ".join(tokens)


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def main():
    config = carregar_config(CONFIG_PATH)
    nlp = spacy.load("pt_core_news_lg")

    falas = carregar_falas(INPUT_TXT)
    df = pd.DataFrame(falas)
    logging.info(f"{len(df)} falas | falantes: {df['falante'].nunique()}")

    # processa todos os textos de uma vez (mais eficiente que loop linha a linha)
    docs = list(nlp.pipe(df["texto"].tolist()))

    # detecta nomes automaticamente a partir do corpus inteiro
    entidades_excluir = coletar_entidades_para_excluir(docs, nlp, config)
    if entidades_excluir:
        logging.info(f"Entidades detectadas e marcadas para exclusão: {sorted(entidades_excluir)}")

    df["texto_processado"] = [
        preprocessar(doc, config, entidades_excluir) for doc in docs
    ]

    vazias = (df["texto_processado"].str.strip() == "").sum()
    if vazias:
        logging.warning(f"{vazias} falas ficaram vazias após pré-processamento.")

    # auditoria: lemas que ainda terminam de forma suspeita e NÃO estão
    # no dicionário de correções — candidatos a novos erros do modelo.
    todos_lemas = set(" ".join(df["texto_processado"]).split())
    suspeitos = sorted(
        l for l in todos_lemas
        if l.endswith(TERMINACOES_SUSPEITAS) and l not in CORRECOES_LEMA.values()
    )
    if suspeitos:
        logging.warning(
            f"Possíveis lemas com erro de lematização (revisar manualmente): {suspeitos}\n"
            f"  Se forem erros, adicione ao dicionário CORRECOES_LEMA no topo do script."
        )

    if LEMAS_VERBO_DESCARTADOS:
        logging.warning(
            "Verbos com lematização falhada descartados (forma flexionada "
            f"virou lema): {sorted(LEMAS_VERBO_DESCARTADOS)}\n"
            "  Se algum for relevante, adicione a correção em CORRECOES_LEMA."
        )

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(df[["falante", "texto", "texto_processado"]].to_string())
    logging.info(f"Salvo em {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
