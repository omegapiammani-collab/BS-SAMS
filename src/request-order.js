// Keep each type together in its first-seen order, then order its applications by date.
export function orderRequests(requests) {
  const groups = new Map();
  for (const request of requests) {
    if (!groups.has(request.type)) groups.set(request.type, []);
    groups.get(request.type).push(request);
  }
  return [...groups.values()].flatMap((group) =>
    group.sort((a, b) => a.date.localeCompare(b.date)),
  );
}
