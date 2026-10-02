import type { AiModel } from "./ai";

/** A small, price-ordered menu, retaining the operator's saved selections. */
export function aiModelChoices(
  models: AiModel[],
  ...selected: string[]
): AiModel[] {
  const priced = models.filter(
    (model) =>
      model.inputPerMillion !== null && model.outputPerMillion !== null,
  );
  priced.sort(
    (a, b) =>
      a.inputPerMillion! +
        a.outputPerMillion! -
        (b.inputPerMillion! + b.outputPerMillion!) || a.id.localeCompare(b.id),
  );
  const choices = (priced.length ? priced : models).slice(0, 6);
  for (const id of selected) {
    const model = models.find((entry) => entry.id === id);
    if (model && !choices.some((entry) => entry.id === id)) choices.push(model);
  }
  return choices;
}
