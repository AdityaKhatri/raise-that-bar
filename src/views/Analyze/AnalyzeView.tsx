import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getAllSessions } from '../../db/sessions';
import { getAllExercises } from '../../db/exercises';
import type { Session, Exercise } from '../../types';
import { loadBodyModel, applyHeatmap, MUSCLE_REGIONS, type MuscleRegion } from './bodyModel';
import {
  computeAnalysis, normaliseScores, getDateRange, generatePrompt,
  getRegionLabel, type RangeKey, type AnalysisResult,
} from './analyzeEngine';
import { Topbar } from '../../components/Topbar/Topbar';
import { BodySvg } from './BodySvg';
import './Analyze.css';

// ─── Date filter chips ───────────────────────────────────────────────────────

const RANGE_CHIPS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3mo', label: '3 months' },
  { key: '6mo', label: '6 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

// ─── Three.js Body Viewer ────────────────────────────────────────────────────

function BodyViewer({
  scores,
  onTapMuscle,
}: {
  scores: Map<MuscleRegion, number>;
  onTapMuscle: (region: MuscleRegion, x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    body: THREE.Group;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    animId: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f7);

    // Grid helper — subtle, sits at the feet
    const grid = new THREE.GridHelper(6, 24, 0xd8d8dc, 0xe8e8ec);
    grid.position.y = -2.2;
    scene.add(grid);

    // Camera — centred on the model
    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 50);
    camera.position.set(0, 0.8, 4.0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Lights — soft and even for pastel colours
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -1, 4);
    scene.add(rimLight);

    // Controls — orbit only, no zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(0, 0.8, 0);
    controls.update();

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Animation loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      if (stateRef.current) stateRef.current.animId = animId;
      controls.update();
      renderer.render(scene, camera);
    }

    // Load GLB model asynchronously
    loadBodyModel().then(body => {
      if (cancelled) return;
      scene.add(body);
      animId = requestAnimationFrame(animate);
      stateRef.current = { renderer, scene, camera, controls, body, raycaster, pointer, animId };
    });

    // Resize handler
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      cancelAnimationFrame(stateRef.current?.animId ?? animId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Apply heatmap when scores change
  useEffect(() => {
    if (!stateRef.current) return;
    applyHeatmap(stateRef.current.body, scores);
  }, [scores]);

  // Click/tap handler for raycasting
  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const state = stateRef.current;
    if (!state) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else return;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);

    const intersects = state.raycaster.intersectObjects(state.body.children, true);
    for (const hit of intersects) {
      const name = hit.object.name as MuscleRegion;
      if (MUSCLE_REGIONS.includes(name)) {
        onTapMuscle(name, clientX, clientY);
        return;
      }
    }
  }, [onTapMuscle]);

  return (
    <div
      ref={containerRef}
      className="body-viewer"
      onClick={handleClick}
    />
  );
}

// ─── Muscle Tooltip ──────────────────────────────────────────────────────────

function MuscleTooltip({
  region,
  analysis,
  position,
  onClose,
  onDrillDown,
}: {
  region: MuscleRegion;
  analysis: AnalysisResult;
  position: { x: number; y: number };
  onClose: () => void;
  onDrillDown: () => void;
}) {
  const [now] = useState(() => Date.now());
  const stats = analysis.muscles.find(m => m.region === region);
  if (!stats) return null;

  const daysSince = stats.lastTrained
    ? Math.round((now - new Date(stats.lastTrained + 'T00:00:00').getTime()) / 86400000)
    : null;

  return (
    <div className="muscle-tooltip-overlay" onClick={onClose}>
      <div
        className="muscle-tooltip"
        style={{ top: Math.min(position.y, window.innerHeight - 160), left: Math.min(position.x, window.innerWidth - 200) }}
        onClick={e => e.stopPropagation()}
      >
        <div className="muscle-tooltip__title">{stats.label}</div>
        <div className="muscle-tooltip__stat">{stats.totalSets} sets</div>
        <div className="muscle-tooltip__stat">
          {daysSince != null ? `Last trained: ${daysSince === 0 ? 'today' : `${daysSince}d ago`}` : 'Not trained'}
        </div>
        <button className="muscle-tooltip__link" onClick={onDrillDown}>
          View exercises &rarr;
        </button>
      </div>
    </div>
  );
}

// ─── Drill-down sheet ────────────────────────────────────────────────────────

function DrillDownSheet({
  region,
  analysis,
  onClose,
}: {
  region: MuscleRegion;
  analysis: AnalysisResult;
  onClose: () => void;
}) {
  const exercises = analysis.regionExercises.get(region) ?? [];

  return (
    <div className="drilldown-overlay" onClick={onClose}>
      <div className="drilldown-sheet" onClick={e => e.stopPropagation()}>
        <div className="drilldown-header">
          <span className="drilldown-title">{getRegionLabel(region)}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {exercises.length === 0 ? (
          <p className="drilldown-empty">No exercises hit this muscle in the selected range.</p>
        ) : (
          <div className="drilldown-list">
            {exercises.map(ex => (
              <div key={ex.name} className="drilldown-row">
                <span className="drilldown-row__name">{ex.name}</span>
                <span className="drilldown-row__sets">{ex.sets} sets</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function AnalyzeView({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tooltip, setTooltip] = useState<{ region: MuscleRegion; x: number; y: number } | null>(null);
  const [drillDown, setDrillDown] = useState<MuscleRegion | null>(null);
  const [copied, setCopied] = useState(false);
  const [bodyView, setBodyView] = useState<'svg' | '3d'>('svg');
  const [now] = useState(() => Date.now());

  // Load data once
  useEffect(() => {
    Promise.all([getAllSessions(), getAllExercises()]).then(([s, e]) => {
      setSessions(s);
      setExercises(e);
      setLoaded(true);
    });
  }, []);

  // Compute analysis
  const { from, to } = useMemo(() => getDateRange(range, customFrom, customTo), [range, customFrom, customTo]);

  const analysis = useMemo(() => {
    if (!loaded) return null;
    return computeAnalysis(sessions, exercises, from, to);
  }, [sessions, exercises, from, to, loaded]);

  const heatmapScores = useMemo(() => {
    if (!analysis) return new Map<MuscleRegion, number>();
    return normaliseScores(analysis.muscles);
  }, [analysis]);

  // Copy prompt
  const handleCopy = useCallback(async () => {
    if (!analysis) return;
    const prompt = generatePrompt(analysis, exercises, from, to);
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [analysis, exercises, from, to]);

  const handleTapMuscle = useCallback((region: MuscleRegion, x: number, y: number) => {
    setTooltip({ region, x, y });
  }, []);

  return (
    <div className="analyze-view">
      <Topbar title="Analyze" onBack={onBack} />

      <div className="analyze-scroll">
        {/* Date range filter */}
        <div className="analyze-chips">
          {RANGE_CHIPS.map(c => (
            <button
              key={c.key}
              className={`analyze-chip${range === c.key ? ' active' : ''}`}
              onClick={() => setRange(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="analyze-custom-range">
            <input
              type="date"
              className="input"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
            <span className="analyze-custom-range__sep">to</span>
            <input
              type="date"
              className="input"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
          </div>
        )}

        {!loaded && (
          <p className="analyze-loading">Loading data...</p>
        )}

        {loaded && analysis && (
          <>
            {/* Body viewer */}
            <section className="analyze-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className="analyze-section__title" style={{ margin: 0 }}>Muscle Activation</h2>
                <div className="body-toggle">
                  <button
                    className={`body-toggle__btn${bodyView === 'svg' ? ' active' : ''}`}
                    onClick={() => setBodyView('svg')}
                  >SVG</button>
                  <button
                    className={`body-toggle__btn${bodyView === '3d' ? ' active' : ''}`}
                    onClick={() => setBodyView('3d')}
                  >3D</button>
                </div>
              </div>
              {bodyView === '3d' ? (
                <>
                  <BodyViewer scores={heatmapScores} onTapMuscle={handleTapMuscle} />
                  <p className="analyze-hint">Drag to rotate. Tap a muscle for details.</p>
                </>
              ) : (
                <>
                  <BodySvg
                    scores={heatmapScores}
                    onTapMuscle={(region) => setDrillDown(region)}
                  />
                  <p className="analyze-hint">Tap a muscle for details.</p>
                </>
              )}
            </section>

            {/* Muscle ranking table */}
            <section className="analyze-section">
              <h2 className="analyze-section__title">Muscle Ranking</h2>
              <div className="muscle-table">
                <div className="muscle-table__head">
                  <span>Muscle</span>
                  <span>Sets</span>
                  <span>Last</span>
                </div>
                {analysis.muscles.map(m => {
                  const daysSince = m.lastTrained
                    ? Math.round((now - new Date(m.lastTrained + 'T00:00:00').getTime()) / 86400000)
                    : null;
                  return (
                    <div
                      key={m.region}
                      className={`muscle-table__row${m.score === 0 ? ' neglected' : ''}`}
                      onClick={() => setDrillDown(m.region)}
                    >
                      <span className="muscle-table__name">{m.label}</span>
                      <span className="muscle-table__sets">{m.totalSets}</span>
                      <span className="muscle-table__last">
                        {daysSince != null ? (daysSince === 0 ? 'today' : `${daysSince}d`) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Neglected muscles */}
            {analysis.neglected.length > 0 && (
              <section className="analyze-section">
                <h2 className="analyze-section__title">Not Targeted</h2>
                <div className="neglected-list">
                  {analysis.neglected.map(r => (
                    <span key={r} className="neglected-tag">{getRegionLabel(r)}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Cardio summary */}
            <section className="analyze-section">
              <h2 className="analyze-section__title">Cardio</h2>
              <div className="cardio-grid">
                <div className="cardio-stat">
                  <span className="cardio-stat__value">{analysis.cardio.sessions}</span>
                  <span className="cardio-stat__label">sessions</span>
                </div>
                <div className="cardio-stat">
                  <span className="cardio-stat__value">{formatDuration(analysis.cardio.totalTimeSec)}</span>
                  <span className="cardio-stat__label">total time</span>
                </div>
                <div className="cardio-stat">
                  <span className="cardio-stat__value">{formatDistance(analysis.cardio.totalDistanceM)}</span>
                  <span className="cardio-stat__label">distance</span>
                </div>
              </div>
            </section>

            {/* Training summary */}
            <section className="analyze-section">
              <h2 className="analyze-section__title">Training Summary</h2>
              <div className="cardio-grid">
                <div className="cardio-stat">
                  <span className="cardio-stat__value">{analysis.totalDaysTrained}</span>
                  <span className="cardio-stat__label">days trained</span>
                </div>
                <div className="cardio-stat">
                  <span className="cardio-stat__value">{analysis.totalSessions}</span>
                  <span className="cardio-stat__label">sessions</span>
                </div>
                <div className="cardio-stat">
                  <span className="cardio-stat__value">
                    {(analysis.totalSessions / analysis.weeksInRange).toFixed(1)}
                  </span>
                  <span className="cardio-stat__label">per week</span>
                </div>
              </div>
            </section>

            {/* Copy prompt */}
            <section className="analyze-section">
              <button className="analyze-copy-btn" onClick={handleCopy}>
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy AI Prompt
                  </>
                )}
              </button>
              <p className="analyze-hint">
                Paste into ChatGPT, Gemini, or your preferred AI for personalised recommendations.
              </p>
            </section>
          </>
        )}
      </div>

      {/* Tooltip overlay */}
      {tooltip && analysis && (
        <MuscleTooltip
          region={tooltip.region}
          analysis={analysis}
          position={{ x: tooltip.x, y: tooltip.y }}
          onClose={() => setTooltip(null)}
          onDrillDown={() => { setDrillDown(tooltip.region); setTooltip(null); }}
        />
      )}

      {/* Drill-down sheet */}
      {drillDown && analysis && (
        <DrillDownSheet
          region={drillDown}
          analysis={analysis}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
