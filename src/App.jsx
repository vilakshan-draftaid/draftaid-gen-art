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
  { id: 'iso-puzzle', label: 'Iso puzzle' },
];
const read = () => (TABS.some((t) => `#${t.id}` === location.hash) ? location.hash.slice(1) : 'grid');

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
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}
             onClick={(e) => { e.preventDefault(); setTab(t.id); history.replaceState(null, '', `#${t.id}`); }}>
            {t.label}
          </a>
        ))}
      </nav>
      {tab === 'grid' ? <SymbolGrid /> : tab === 'shape' ? <ShapeGrid /> : tab === 'hero' ? <HeroTab /> : tab === 'reel' ? <Showreel /> : tab === 'drawing' ? <DrawingTab /> : tab === 'cursor' ? <CursorGrid /> : tab === 'axis' ? <AxisView /> : tab === 'tetris' ? <TetrisGrid /> : tab === 'integrations' ? <IntegrationsGrid /> : tab === 'puzzle' ? <PuzzleGrid /> : tab === 'iso-puzzle' ? <IsoPuzzle /> : <PartsGrid />}
    </>
  );
}
