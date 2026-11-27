import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/api/client';

// areas hardly ever change, so cache them for the whole session
export function useAreas() {
  return useQuery({
    queryKey: ['meta', 'areas'],
    queryFn: () => call(api.meta.areas.$get()),
    staleTime: Infinity,
  });
}
