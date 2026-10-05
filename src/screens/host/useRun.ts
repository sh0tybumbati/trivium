import { useCallback, useState } from 'react';
import { ApiError } from '../../lib/api';

/** Run an async action with busy/error state, so every button reports failures the same way. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError('') };
}
