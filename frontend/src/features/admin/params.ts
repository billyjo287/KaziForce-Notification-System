import { useSearchParams } from 'react-router';

/** "Any" in a filter dropdown (no filter). */
export const ANY = 'any';

/** Filters live in the address (?channel=sms&page=2), so Back and shared links keep them. */
export function useParamSetter() {
  const [params, setParams] = useSearchParams();
  return {
    params,
    set: (key: string, value: string | undefined) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      setParams(next);
    },
  };
}
