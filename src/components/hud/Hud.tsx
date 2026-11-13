import { ActivityPanel, GrowthPanel, SignalPanel, SystemPanel } from './LeftPanels'
import { AgendaPanel, AlertsPanel, RecentPanel, ShortcutsPanel } from './RightPanels'
import { CenterOverlay, Dock, TopBar } from './Chrome'

export default function Hud() {
  return (
    <div className="hud">
      <TopBar />
      <aside className="col left">
        <SystemPanel />
        <SignalPanel />
        <GrowthPanel />
        <ActivityPanel />
      </aside>
      <main className="center">
        <CenterOverlay />
      </main>
      <aside className="col right">
        <AlertsPanel />
        <RecentPanel />
        <ShortcutsPanel />
        <AgendaPanel />
      </aside>
      <Dock />
    </div>
  )
}
