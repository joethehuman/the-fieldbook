export type SiteSettings = {
  name: string;
  tagline: string;
  logoUrl: string;
  accent: string;
  access: "public" | "private";
  registration: "open" | "closed";
};
export const defaultSettings: SiteSettings = {
  name: "Fieldbook",
  tagline: "A shared place to get better.",
  logoUrl: "",
  accent: "#0069ff",
  access: "public",
  registration: "open",
};
