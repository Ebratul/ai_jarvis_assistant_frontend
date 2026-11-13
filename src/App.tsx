import { Suspense, lazy } from 'react'
import Boot from './components/Boot'
import CoreScene from './components/core/CoreScene'
import Hud from './components/hud/Hud'
import { Toasts } from './components/hud/Chrome'
import SettingsModal from './components/modals/SettingsModal'
import { CalendarModal, LogModal } from './components/modals/OtherModals'
import { useNono } from './lib/store'

const BrainView = lazy(() => import('./components/brain/BrainView'))

export default function App() {
  const view = useNono((s) => s.view)
  const modal = useNono((s) => s.modal)
  return (
    <>
      <div className="backdrop" />
      {view === 'hud' && <CoreScene />}
      {view === 'hud' && <Hud />}
      {view === 'brain' && (
        <Suspense fallback={<div className="brain-empty">Loading neural network…</div>}>
          <BrainView />
        </Suspense>
      )}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'calendar' && <CalendarModal />}
      {modal === 'log' && <LogModal />}
      <Toasts />
      <Boot />
    </>
  )
}
