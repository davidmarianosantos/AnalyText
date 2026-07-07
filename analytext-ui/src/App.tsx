import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import ProjectsView from './views/ProjectsView'
import DataPrepView from './views/DataPrepView'
import ResultsView from './views/ResultsView'
import ProgressoBar from './components/ProgressoBar'
import { useAppStore } from './state/useAppStore'

const variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
}

export default function App() {
  const { secaoAtiva } = useAppStore()

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}
    >
      <Sidebar />

      <main className="flex-1 overflow-hidden relative">
        <ProgressoBar />

        <AnimatePresence mode="wait">
          {secaoAtiva === 'projetos' && (
            <motion.div key="projetos" className="h-full" {...variants} transition={{ duration: 0.18 }}>
              <ProjectsView />
            </motion.div>
          )}
          {secaoAtiva === 'preparacao' && (
            <motion.div key="preparacao" className="h-full" {...variants} transition={{ duration: 0.18 }}>
              <DataPrepView />
            </motion.div>
          )}
          {secaoAtiva === 'resultados' && (
            <motion.div key="resultados" className="h-full" {...variants} transition={{ duration: 0.18 }}>
              <ResultsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
