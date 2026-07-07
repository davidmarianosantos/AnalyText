import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Search, Download, X, Circle } from 'lucide-react'
import type { DadosGrafo, NoGrafo } from '@/types'

interface SimNode extends d3.SimulationNodeDatum, NoGrafo {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  peso: number
}

const PALETA = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)',
                'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']

export default function SimilarityGraph({ projetoId, participante }: { projetoId: string; participante: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dados, setDados] = useState<DadosGrafo | null>(null)
  const [busca, setBusca] = useState('')
  const [comunidadesOcultas, setComunidadesOcultas] = useState<Set<number>>(new Set())
  const [noSelecionado, setNoSelecionado] = useState<NoGrafo | null>(null)

  useEffect(() => {
    window.api.obterDadosGrafo(projetoId, participante).then(setDados)
    setNoSelecionado(null)
    setBusca('')
    setComunidadesOcultas(new Set())
  }, [projetoId, participante])

  const corDaComunidade = (id: number) =>
    dados?.comunidades.find((c) => c.id === id)?.cor || PALETA[id % PALETA.length]

  const vizinhos = useMemo(() => {
    if (!noSelecionado || !dados) return []
    return dados.arestas
      .filter((a) => a.origem === noSelecionado.id || a.destino === noSelecionado.id)
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 8)
      .map((a) => (a.origem === noSelecionado.id ? a.destino : a.origem))
  }, [noSelecionado, dados])

  /* ─────────────────────────── Renderização D3 ─────────────────────────── */
  useEffect(() => {
    if (!dados || !svgRef.current || !containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const root = svg.append('g')
    const gHulls = root.append('g')
    const gLinks = root.append('g')
    const gNodes = root.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (ev) => root.attr('transform', ev.transform))
    svg.call(zoom)

    const nodes: SimNode[] = dados.nos.map((n) => ({ ...n }))
    const links: SimLink[] = dados.arestas.map((a) => ({ source: a.origem, target: a.destino, peso: a.peso }))

    const extentFreq = d3.extent(nodes, (n) => n.frequencia) as [number, number]
    const raio = d3.scaleSqrt().domain([extentFreq[0] || 1, extentFreq[1] || 1]).range([7, 30])

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.25))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>((d) => raio(d.frequencia) + 14))

    const link = gLinks.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--border-strong)')
      .attr('stroke-opacity', (d) => Math.min(0.65, 0.15 + d.peso * 0.05))
      .attr('stroke-width', (d) => Math.min(3, 0.6 + d.peso * 0.25))

    const node = gNodes.selectAll('g.no')
      .data(nodes)
      .join('g')
      .attr('class', 'no')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (ev, d) => { d.fx = d.x; d.fy = d.y })
          .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y })
          .on('end', (ev, d) => { d.fx = null; d.fy = null }),
      )
      .on('click', (_ev, d) => setNoSelecionado(d))

    node.append('circle')
      .attr('r', (d) => raio(d.frequencia))
      .attr('fill', (d) => corDaComunidade(d.comunidade))
      .attr('fill-opacity', 0.85)
      .attr('stroke', (d) => (d.central ? '#fff' : 'none'))
      .attr('stroke-width', (d) => (d.central ? 2.5 : 0))

    node.append('text')
      .text((d) => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .attr('fill', '#0a1322')
      .attr('font-weight', (d) => (d.central ? 700 : 500))
      .style('font-size', (d) => `${Math.max(8, Math.min(13, raio(d.frequencia) * 0.62))}px`)
      .style('pointer-events', 'none')

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)

      // Blobs de comunidade — convex hull suavizado por padding radial
      const porComunidade = d3.group(nodes, (d) => d.comunidade)
      gHulls.selectAll('path').remove()
      porComunidade.forEach((membros, comId) => {
        if (membros.length < 2) return
        const pontos: [number, number][] = membros.flatMap((m) => {
          const r = raio(m.frequencia) + 18
          return d3.range(0, 360, 45).map((ang) => {
            const rad = (ang * Math.PI) / 180
            return [m.x! + r * Math.cos(rad), m.y! + r * Math.sin(rad)] as [number, number]
          })
        })
        const hull = d3.polygonHull(pontos)
        if (!hull) return
        const lineGen = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.85))
        gHulls.append('path')
          .attr('d', lineGen(hull))
          .attr('fill', corDaComunidade(comId))
          .attr('fill-opacity', 0.1)
          .attr('stroke', corDaComunidade(comId))
          .attr('stroke-opacity', 0.35)
          .attr('stroke-width', 1.5)
      })
    })

    return () => { sim.stop() }
  }, [dados])

  /* ──────────────────── Destaque por busca / comunidades ocultas ──────────────────── */
  useEffect(() => {
    if (!svgRef.current) return
    const termo = busca.trim().toLowerCase()
    d3.select(svgRef.current).selectAll('g.no').each(function (d: any) {
      const escondidoPorComunidade = comunidadesOcultas.has(d.comunidade)
      const escondidoPorBusca = termo.length > 0 && !d.id.toLowerCase().includes(termo)
      d3.select(this).transition().duration(150)
        .style('opacity', escondidoPorComunidade || escondidoPorBusca ? 0.08 : 1)
    })
  }, [busca, comunidadesOcultas, dados])

  function toggleComunidade(id: number) {
    setComunidadesOcultas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function baixarImagem() {
    if (!svgRef.current) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svgRef.current)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `grafo_similitude_${participante.replace(/\s+/g, '_')}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex">
      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ background: 'var(--surface-0)' }}>
        {/* Barra de ferramentas flutuante */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass" style={{ minWidth: 220 }}>
            <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar um termo no grafo…"
              className="bg-transparent outline-none text-[12.5px] flex-1"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto">
            {dados?.comunidades.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleComunidade(c.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium whitespace-nowrap glass transition-opacity"
                style={{ opacity: comunidadesOcultas.has(c.id) ? 0.4 : 1 }}
              >
                <Circle size={8} fill={c.cor} stroke="none" />
                {c.rotulo}
              </button>
            ))}
          </div>

          <button onClick={baixarImagem} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium glass shrink-0">
            <Download size={13} /> Baixar grafo
          </button>
        </div>

        <svg ref={svgRef} width="100%" height="100%" />

        {!dados && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Carregando grafo…</p>
          </div>
        )}
      </div>

      {/* Painel lateral de detalhes */}
      {noSelecionado && (
        <div className="w-[280px] shrink-0 p-5 overflow-y-auto scrollbar-thin"
          style={{ borderLeft: '1px solid var(--border-subtle)', background: 'var(--surface-1)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Conceito</p>
              <p className="text-[17px] font-semibold" style={{ color: 'var(--text-primary)' }}>{noSelecionado.id}</p>
            </div>
            <button onClick={() => setNoSelecionado(null)} className="p-1 rounded-md" style={{ background: 'var(--surface-3)' }}>
              <X size={13} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <div className="flex flex-col gap-3 mb-5">
            <Info label="Ocorrências na fala" valor={String(noSelecionado.frequencia)} />
            <Info
              label="Categoria temática"
              valor={dados?.comunidades.find((c) => c.id === noSelecionado.comunidade)?.rotulo ?? '—'}
              cor={corDaComunidade(noSelecionado.comunidade)}
            />
            {noSelecionado.central && (
              <p className="text-[11.5px] px-2.5 py-1.5 rounded-md" style={{ background: 'var(--surface-3)', color: 'var(--brand-300)' }}>
                Este é o termo mais representativo da categoria.
              </p>
            )}
          </div>

          <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Mais associados
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vizinhos.map((v) => (
              <span key={v} className="px-2.5 py-1 rounded-md text-[12px]" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-[13.5px] font-medium flex items-center gap-1.5" style={{ color: cor ?? 'var(--text-primary)' }}>
        {cor && <Circle size={8} fill={cor} stroke="none" />}
        {valor}
      </p>
    </div>
  )
}
