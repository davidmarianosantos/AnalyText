import re
import logging
import pandas as pd
import spacy

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
nlp = spacy.load("pt_core_news_sm")

INPUT_TXT   = "./data/entrevista.txt"
OUTPUT_CSV  = "./data/entrevista_processada.csv"


def carregar_falas(caminho: str) -> list[dict]:
    """Lê o arquivo de entrevista e retorna lista de dicts {id_fala, falante, texto}."""
    with open(caminho, encoding="utf-8-sig") as f:
        linhas = [l.strip() for l in f if l.strip()]

    if len(linhas) % 2 != 0:
        logging.warning("Número ímpar de linhas — última fala sem texto será ignorada.")
        linhas = linhas[:-1]

    return [
        {"id_fala": i + 1, "falante": falante, "texto": texto}
        for i, (falante, texto) in enumerate(zip(linhas[::2], linhas[1::2]))
    ]


def preprocessar(texto: str) -> str:
    """Lematiza e remove stopwords — limpeza feita após o pipeline do spaCy."""
    doc = nlp(texto)          # spaCy recebe o texto original
    tokens = [
        token.lemma_.lower()  # lema em minúsculo
        for token in doc
        if not token.is_stop
        and not token.is_punct
        and not token.like_num
        and len(token.text) > 2
    ]
    return " ".join(tokens)


falas = carregar_falas(INPUT_TXT)
df = pd.DataFrame(falas)

logging.info(f"{len(df)} falas carregadas | falantes: {df['falante'].nunique()}")

df["texto_processado"] = df["texto"].apply(preprocessar)

df.to_csv(OUTPUT_CSV, index=False)
logging.info(f"Salvo em {OUTPUT_CSV}")