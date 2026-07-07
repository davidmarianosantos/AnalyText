import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/state/useAppStore'

export default function ProgressoBar() {
  const { progresso } = useAppStore()
  const visivel = progresso && progresso.estagio !== 'ocioso' && progresso.estagio !== 'concluido'

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="absolute top-0 left-0 right-0 z-30 px-5 py-2.5 flex items-center gap-3 glass"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--brand-700)', borderTopColor: 'var(--brand-400)' }} />
          <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {progresso?.mensagem}
          </span>
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, var(--brand-500), var(--brand-300))' }}
              animate={{ width: `${progresso?.percentual ?? 0}%` }}
              transition={{ ease: 'easeOut', duration: 0.4 }}
            />
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {progresso?.percentual ?? 0}%
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
