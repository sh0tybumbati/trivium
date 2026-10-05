import { Component, useEffect, useState, type ReactNode } from 'react';
import { Landing } from './screens/Landing';
import { Player } from './screens/Player';
import { BigScreen } from './screens/BigScreen';
import { Host } from './screens/Host';
import { Button, Frame, Logo } from './ui/Deco';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path.replace(/\/+$/, '') || '/';
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Frame className="max-w-md" inner="p-8 text-center">
          <Logo size="sm" />
          <p className="mt-4 text-lg">Something went wrong on this screen.</p>
          <p className="mt-1 text-sm text-mute">Reloading usually fixes it. The game itself is safe on the server.</p>
          <Button className="mt-6" onClick={() => location.reload()}>Reload</Button>
        </Frame>
      </div>
    );
  }
}

export function App() {
  const path = usePath();
  let screen: ReactNode;
  if (path === '/play') screen = <Player />;
  else if (path === '/screen') screen = <BigScreen />;
  else if (path === '/host') screen = <Host />;
  else screen = <Landing />;
  return <Boundary>{screen}</Boundary>;
}
