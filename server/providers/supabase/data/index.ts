import "server-only";
import type { DataStore } from "../../../ports/data";
import { configurationData } from "./configuration";
import { contentData } from "./content";
import { learningData } from "./learning";
import { feedbackData } from "./feedback";
import { reportingData } from "./reporting";

export const supabaseData: DataStore = {
  ...configurationData,
  ...contentData,
  ...learningData,
  ...feedbackData,
  ...reportingData,
};
