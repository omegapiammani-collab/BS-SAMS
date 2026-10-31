// Keep focused fields below a dialog's sticky heading and above its action bar.
export function focusAndReveal(element) {
  if (!element) return;
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  )
    if (parent.tagName === "DETAILS") parent.open = true;
  element.focus({ preventScroll: true });
  const dialog = element.closest("dialog");
  if (dialog) {
    const header = dialog.querySelector(".modal-head");
    const offset = (header?.getBoundingClientRect().height || 0) + 24;
    dialog.scrollTo({
      top:
        dialog.scrollTop +
        element.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top -
        offset,
      behavior: "instant",
    });
  } else element.scrollIntoView({ block: "center", behavior: "instant" });
}
