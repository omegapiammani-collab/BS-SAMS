export function matchesRequestFilters(request, filters = {}) {
  if (
    filters.cat !== undefined &&
    filters.cat !== "" &&
    String(request.category) !== String(filters.cat)
  )
    return false;
  if (filters.requestFrom && !(request.date >= filters.requestFrom))
    return false;
  if (filters.requestTo && !(request.date <= filters.requestTo)) return false;
  if (filters.receivedFrom || filters.receivedTo)
    return (request.payments || []).some(
      (payment) =>
        (!filters.receivedFrom || payment.date >= filters.receivedFrom) &&
        (!filters.receivedTo || payment.date <= filters.receivedTo),
    );
  return true;
}
