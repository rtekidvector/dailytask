/** Tiny pub/sub: routes announce what changed, the SSE endpoint tells browsers to refetch it. No data travels over it. */
export type Topic = "tasks" | "team" | "links" | "meta" | "inbox" | "leaves" | "resources";
export function createBus() {
  const subs = new Set<(t: Topic) => void>();
  return {
    emit: (t: Topic) => subs.forEach(f => f(t)),
    subscribe(f: (t: Topic) => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type Bus = ReturnType<typeof createBus>;
