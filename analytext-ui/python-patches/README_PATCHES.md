# Patches necessários nos scripts Python existentes

Estas são as ÚNICAS mudanças necessárias nos scripts que vocês já têm
(`analise_padroes.py`, `clustering_falas.py`, `grafo_similitude.py`,
`preprocessing.py`). Nenhuma lógica de análise muda — só adicionamos:

1. Linhas `PROGRESS:<pct>:<mensagem>` no stdout, que o Electron já sabe
   interpretar (ver `electron/pythonBridge.ts`) e transformar em barra de
   progresso na UI.
2. No `grafo_similitude.py`, a exportação de um JSON com nós/arestas/
   comunidades — hoje ele só gera o PNG, mas a interface precisa dos dados
   estruturados para o grafo ser interativo (zoom, pan, clique no nó,
   destaque de comunidade), não apenas uma imagem estática.

---

## 1. Progresso (todos os scripts)

No topo de cada script, adicionar:

```python
def progress(pct: int, msg: str):
    print(f"PROGRESS:{pct}:{msg}", flush=True)
```

E chamar `progress(...)` nos pontos-chave do script (início de cada etapa
numerada que já existe — 01, 02, 03... — e ao final). Exemplo dentro do loop
por entrevistado em `analise_padroes.py`:

```python
for i, falante in enumerate(entrevistados):
    progress(int(100 * i / len(entrevistados)), f"Analisando {falante}…")
    ...
```

## 2. Exportar dados do grafo (`grafo_similitude.py`)

Ao final da função que monta o grafo por entrevistado — depois que o grafo
`G` (networkx), a partição de comunidades `partition` (dict termo -> id da
comunidade) e as frequências `freqs` (dict termo -> contagem) já existem —
adicionar:

```python
import json

def exportar_grafo_json(G, partition: dict, freqs: dict, central_por_comunidade: dict,
                         cores: dict, falante: str, caminho_saida: str):
    """
    Exporta a estrutura do grafo para a interface renderizar de forma
    interativa (zoom, pan, seleção de nó, destaque de comunidade).

    central_por_comunidade: dict {id_comunidade: termo_central}
    cores: dict {id_comunidade: "#hex"}
    """
    nos = [
        {
            "id": termo,
            "frequencia": int(freqs.get(termo, 1)),
            "comunidade": int(partition[termo]),
            "central": termo == central_por_comunidade.get(partition[termo]),
        }
        for termo in G.nodes()
    ]

    arestas = [
        {
            "origem": u,
            "destino": v,
            "peso": float(G[u][v].get("weight", 1)),
        }
        for u, v in G.edges()
    ]

    comunidades_ids = sorted(set(partition.values()))
    comunidades = [
        {
            "id": int(cid),
            "rotulo": central_por_comunidade.get(cid, f"Categoria {cid}"),
            "cor": cores.get(cid, "#2f6fed"),
            "tamanho": sum(1 for c in partition.values() if c == cid),
        }
        for cid in comunidades_ids
    ]

    dados = {"participante": falante, "nos": nos, "arestas": arestas, "comunidades": comunidades}

    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
```

E chamar isso junto da linha que já salva o PNG (`fig.savefig(caminho_png, ...)`):

```python
exportar_grafo_json(
    G, partition, freqs, central_por_comunidade, cores_por_comunidade,
    falante, os.path.join(d, "05_grafo_dados.json"),
)
```

Os nomes exatos das variáveis (`partition`, `freqs`, `cores_por_comunidade`,
`central_por_comunidade`) podem precisar de pequenos ajustes para bater com
os nomes reais usados no script — a lógica e o formato de saída são o que
importa, e é exatamente o formato que `DadosGrafo` (em `src/types/index.ts`)
espera no frontend.

## 3. Depois de gerar tudo: `gerar_manifesto.py`

Novo script (incluído em `python-patches/analysis/gerar_manifesto.py`),
roda por último e lê o que os três scripts produziram em `./outputs/<Nome>/`,
gerando `./outputs/manifest.json`. É o único arquivo que a interface lê para
montar a seção "Resultados" — por isso a divisão entre os três scripts nunca
aparece para o usuário.
