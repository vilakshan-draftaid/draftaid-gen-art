import { useEffect, useState } from 'react';
import SymbolGrid from './SymbolGrid.jsx';
import ShapeGrid from './ShapeGrid.jsx';
import HeroTab from './HeroTab.jsx';
import Showreel from './Showreel.jsx';
import DrawingTab from './DrawingTab.jsx';
import CursorGrid from './CursorGrid.jsx';
import PartsGrid from './PartsGrid.jsx';
import AxisView from './AxisView.jsx';
import TetrisGrid from './TetrisGrid.jsx';
import IntegrationsGrid from './IntegrationsGrid.jsx';
import PuzzleGrid from './PuzzleGrid.jsx';
import IsoPuzzle from './IsoPuzzle.jsx';

const TABS = [
  { id: 'grid', label: 'Symbol grid' },
  { id: 'shape', label: 'Pixel shape' },
  { id: 'hero', label: 'Hero' },
  { id: 'reel', label: 'Showreel' },
  { id: 'drawing', label: 'Drawing window' },
  { id: 'cursor', label: 'Cursor grid' },
  { id: 'parts', label: 'Shape grid' },
  { id: 'axis', label: 'Axis view' },
  { id: 'tetris', label: 'Tetris' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'puzzle', label: 'Puzzle' },
  // A group: its sub-tabs show under it while one of them is open
  { id: 'iso', label: 'Iso pieces', children: [
    { id: 'iso-step', label: 'Step' },
    { id: 'iso-puzzle', label: 'Puzzle' },
  ] },
];
const IDS = TABS.flatMap((t) => (t.children ? t.children.map((c) => c.id) : [t.id]));
const read = () => (IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'grid');

export default function App() {
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return (
    <>
      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => {
          const link = (id, label, cls) => (
            <a key={id} href={`#${id}`} className={cls} aria-current={tab === id ? 'page' : undefined}
               onClick={(e) => { e.preventDefault(); setTab(id); history.replaceState(null, '', `#${id}`); }}>
              {label}
            </a>
          );
          if (!t.children) return link(t.id, t.label);
          // The group opens its first sub-tab; the sub-tabs list while it's open
          const open = t.children.some((c) => c.id === tab);
          return [
            <a key={t.id} href={`#${t.children[0].id}`} className={open ? 'tab-group open' : 'tab-group'}
               onClick={(e) => { e.preventDefault(); if (!open) { setTab(t.children[0].id); history.replaceState(null, '', `#${t.children[0].id}`); } }}>
              {t.label}
            </a>,
            ...(open ? t.children.map((c) => link(c.id, c.label, 'tab-sub')) : []),
          ];
        })}
      </nav>
      {tab === 'grid' ? <SymbolGrid /> : tab === 'shape' ? <ShapeGrid /> : tab === 'hero' ? <HeroTab /> : tab === 'reel' ? <Showreel /> : tab === 'drawing' ? <DrawingTab /> : tab === 'cursor' ? <CursorGrid /> : tab === 'axis' ? <AxisView /> : tab === 'tetris' ? <TetrisGrid /> : tab === 'integrations' ? <IntegrationsGrid /> : tab === 'puzzle' ? <PuzzleGrid /> : tab === 'iso-puzzle' ? <IsoPuzzle key="puzzle" /> : tab === 'iso-step' ? <IsoPuzzle key="step" logos={false} /> : <PartsGrid />}
    </>
  );
}
