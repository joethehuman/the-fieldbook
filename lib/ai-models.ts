import type { AiModel } from "./ai";

/** Full compatible catalog, lowest combined base price first; unknowns last. */
export function aiModelChoices(models: AiModel[]): AiModel[] {
  const price = (model: AiModel) =>
    model.inputPerMillion === null || model.outputPerMillion === null
      ? Infinity
      : model.inputPerMillion + model.outputPerMillion;
  return [...models].sort(
    (a, b) => price(a) - price(b) || a.id.localeCompare(b.id),
  );
}
