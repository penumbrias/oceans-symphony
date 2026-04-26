import { useQuery } from "@tanstack/react-query";
import { getFronters, getFrontHistory } from "@/lib/simplyPlural";

export function useFronters(token, systemId) {
  return useQuery({
    queryKey: ["sp-fronters", systemId],
    queryFn: () => getFronters(token, systemId),
    enabled: !!token && !!systemId,
    refetchInterval: 30000,
    initialData: { members: [], custom: [] },
    // These are real network requests — only run when online, don't retry
    networkMode: 'online',
    retry: 0,
  });
}

export function useFrontHistory(token, systemId) {
  return useQuery({
    queryKey: ["sp-front-history", systemId],
    queryFn: () => getFrontHistory(token, systemId),
    enabled: !!token && !!systemId,
    initialData: [],
    networkMode: 'online',
    retry: 0,
  });
}