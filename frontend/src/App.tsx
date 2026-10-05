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
           <h2>
            Climate risk doesn’t fall evenly. So who is most at risk and who is ready to respond?
          </h2>

          <h3>
            Some countries are facing much more climate pressure than others. And
            having the resources to prepare, adapt, and recover can make all the
            difference. Explore the map to see where the pressure is greatest, then
            compare countries to see where vulnerability and capacity fall out of balance.
          </h3>

          <button
            type="button"
            className="story-intro__cta"
            onClick={() => setHasEntered(true)}
          >
            Explore the story &nbsp; →
          </button>
          </div>
          <div className="story-intro__steps" aria-label="How to read the dashboard">
            <div> <span>01</span> <strong>See where the pressure is</strong> <small>Explore where climate vulnerability is highest</small> </div>
            <div>
              <span>02</span>
              <strong>Look at who is prepared</strong>
              <small>Compare countries by their ability to respond</small>
            </div>

            <div>
              <span>03</span>
              <strong>See where the two meet</strong>
              <small>Find the places facing the biggest challenge</small>
            </div>
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
