"""
selecao_falantes.py
===================
Utilitário compartilhado pelos scripts de análise.

Lê ./config/analise_config.json e resolve quais falantes analisar,
respeitando as listas 'entrevistados' e 'entrevistadores'.

A UI escreve esse JSON para controlar quem é analisado —
os scripts de análise não precisam saber que existe uma interface.
"""

import json
import logging
import os
import pandas as pd

CONFIG_PATH = "./config/analise_config.json"


def _carregar_config() -> dict:
    default = {
        "entrevistados": [],
        "entrevistadores": [],
        "analise_padroes": {
            "top_n_freq": 20,
            "top_n_ngram": 15,
            "gerar_nuvem": True,
        },
        "clustering": {
            "min_cooc": 3,
            "top_termos_grafo": 35,
        },
    }
    if not os.path.exists(CONFIG_PATH):
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(default, f, ensure_ascii=False, indent=2)
        logging.info(f"Config padrão criada em {CONFIG_PATH}")
        return default

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    for k, v in default.items():
        config.setdefault(k, v)
    return config


def resolver_entrevistados(df: pd.DataFrame) -> tuple[list[str], dict]:
    """
    Retorna (lista_de_entrevistados, config_completa).

    Regras de resolução:
      1. Se 'entrevistados' estiver preenchido na config → usa exatamente essa lista.
      2. Se 'entrevistadores' estiver preenchido → todos os falantes do CSV
         exceto os listados como entrevistadores.
      3. Se ambos estiverem vazios → todos os falantes do CSV (modo legado).

    Falantes configurados mas ausentes no CSV geram um aviso e são ignorados.
    """
    config = _carregar_config()
    todos_no_csv = df["falante"].unique().tolist()

    entrevistados_cfg  = [e.strip() for e in config.get("entrevistados", []) if e.strip()]
    entrevistadores_cfg = [e.strip() for e in config.get("entrevistadores", []) if e.strip()]

    if entrevistados_cfg:
        # modo explícito: só quem está na lista
        resultado = [f for f in entrevistados_cfg if f in todos_no_csv]
        faltando  = [f for f in entrevistados_cfg if f not in todos_no_csv]
        if faltando:
            logging.warning(
                f"Falantes em 'entrevistados' não encontrados no CSV: {faltando}"
            )
    elif entrevistadores_cfg:
        # modo exclusão: todos menos os entrevistadores
        resultado = [f for f in todos_no_csv if f not in entrevistadores_cfg]
        logging.info(
            f"Excluindo entrevistadores: {entrevistadores_cfg}"
        )
    else:
        # modo legado: todos
        resultado = todos_no_csv
        logging.info("Nenhum filtro de falante configurado — analisando todos.")

    if not resultado:
        raise ValueError(
            "Nenhum falante restou após aplicar a configuração. "
            "Verifique 'entrevistados' / 'entrevistadores' em analise_config.json."
        )

    logging.info(f"Entrevistados a analisar: {resultado}")
    return resultado, config


def filtrar_df(df: pd.DataFrame, entrevistados: list[str]) -> pd.DataFrame:
    """Filtra o DataFrame mantendo só as falas dos entrevistados selecionados."""
    return df[df["falante"].isin(entrevistados)].reset_index(drop=True)
