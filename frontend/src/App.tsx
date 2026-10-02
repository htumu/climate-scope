import { useState } from 'react'
import ChoroplethMap from './components/ChoroplethMap'
import BubbleScatterPlot from './components/BubbleScatterPlot'
import { formatMetric, METRIC_GUIDE } from './utils'
import './App.css'

type View = 'choropleth' | 'scatter'

const VIEWS: { id: View; label: string }[] = [
  { id: 'choropleth', label: 'Global exposure' },
  { id: 'scatter',    label: 'Readiness gap' },
]

function App() {
  const [activeView, setActiveView] = useState<View>('choropleth')
  const [hasEntered, setHasEntered] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div>
          <h1 className="app-header__title">Climate Scope</h1>
        </div>

        <div className="app-header__right">
          {hasEntered ? (
            <nav className="view-nav" aria-label="Visualization selector">
              {VIEWS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`view-nav__btn${activeView === id ? ' view-nav__btn--active' : ''}`}
                  onClick={() => setActiveView(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : null}

          {hasEntered && (
            <button
              className="app-header__help"
              type="button"
              aria-label="Help"
              title="Metric descriptions"
              onClick={() => setShowHelp(true)}
            >
              ?
            </button>
          )}
        </div>
      </header>

      <main className={`app-content${hasEntered ? ' app-content--dashboard' : ' app-content--entry'}`}>
        {!hasEntered ? (
          <section className="story-intro story-intro--entry">
          <div className="story-intro__copy">
            <p className="story-kicker">The central question</p>
            <h2>Who faces the most climate risk, and who has the capacity to respond?</h2>
            <p>
              Climate harm is not only about exposure. It becomes most urgent when
              high vulnerability meets low readiness. Use the map to see the global
              pattern, then move to the gap view to compare countries directly.
            </p>
            <button type="button" className="story-intro__cta" onClick={() => setHasEntered(true)}>
              Explore the data <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="story-intro__steps" aria-label="How to read the dashboard">
            <div><span>01</span><strong>Locate pressure</strong><small>Where vulnerability is concentrated</small></div>
            <div><span>02</span><strong>Compare capacity</strong><small>Whether readiness keeps pace</small></div>
            <div><span>03</span><strong>Find the gap</strong><small>Where action matters most</small></div>
          </div>
          </section>
        ) : null}

        {hasEntered && activeView === 'choropleth' && (
          <div className="section-card">
            <ChoroplethMap />
          </div>
        )}

        {hasEntered && activeView === 'scatter' && (
          <div className="section-card">
            <BubbleScatterPlot />
          </div>
        )}

      </main>

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal__header">
              <h2>Metric Descriptions</h2>
              <button
                className="help-modal__close"
                onClick={() => setShowHelp(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="help-modal__intro">
              ND-GAIN scores are comparative indicators, not percentages. For risk,
              lower is better; for readiness, higher is better.
            </p>
            <ul className="help-modal__list">
              {Object.entries(METRIC_GUIDE).map(([key, guide]) => (
                <li key={key}>
                  <div className="metric-guide__heading">
                    <strong>{formatMetric(key)}</strong>
                    <span>{guide.scale}</span>
                  </div>
                  <p>{guide.description}</p>
                  <div className={`metric-guide__scale${guide.higherIsBetter ? ' metric-guide__scale--higher' : ' metric-guide__scale--lower'}`}>
                    <span>{guide.lowerLabel}</span>
                    <span>{guide.higherLabel}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
