export default function SectionHeader({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[20px] font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
        {titulo}
      </h1>
      <p className="text-[13.5px] max-w-[560px]" style={{ color: 'var(--text-secondary)' }}>
        {descricao}
      </p>
    </div>
  )
}
