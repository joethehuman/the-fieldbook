import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
// Register owned semantic sizes so class merging never treats them as colors.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["label", "copy", "compact", "page"],
      spacing: ["control", "control-sm"],
    },
  },
});
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
