export const childAssistanceType = "เงินสงเคราะห์เด็กในครอบครัวยากจน";
export const allowsChildren = (request) =>
  Number(request.category) === 0 && request.type === childAssistanceType;
export const childTitles = ["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว", "อื่น ๆ"];
export const newChild = () => ({
  id: crypto.randomUUID(),
  title: "เด็กชาย",
  first: "",
  last: "",
  nationalId: "",
  birth: "",
  disabilities: [],
});
export function removedChildren(next, previous) {
  const retained = new Map(
    next.requests.map((request) => [
      request.id,
      new Set((request.children || []).map((child) => child.id)),
    ]),
  );
  return previous.requests.flatMap((request) =>
    (request.children || [])
      .filter((child) => !retained.get(request.id)?.has(child.id))
      .map((child) => child.id),
  );
}
// Drafts permit incomplete values, but never malformed nested data.
export function validChildrenShape(children) {
  return (
    children === undefined ||
    (Array.isArray(children) &&
      children.length <= 100 &&
      new Set(children.map((child) => child?.id)).size === children.length &&
      children.every(
        (child) =>
          child &&
          typeof child === "object" &&
          !Array.isArray(child) &&
          typeof child.id === "string" &&
          child.id.length > 0 &&
          child.id.length <= 100 &&
          ["title", "first", "last", "nationalId", "birth"].every(
            (key) => typeof child[key] === "string" && child[key].length <= 100,
          ) &&
          !Object.hasOwn(child, "marital") &&
          !Object.hasOwn(child, "phone") &&
          Array.isArray(child.disabilities) &&
          child.disabilities.length <= 7 &&
          child.disabilities.every((value) => typeof value === "string"),
      ))
  );
}
