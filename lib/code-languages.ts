export const codeLanguages = [
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["sql", "SQL"],
  ["bash", "Shell"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["java", "Java"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["go", "Go"],
  ["rust", "Rust"],
] as const;

const aliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  yml: "yaml",
  html: "xml",
  cs: "csharp",
  "c++": "cpp",
  rs: "rust",
  plaintext: "text",
  plain: "text",
  txt: "text",
  none: "text",
};

export function normalizeCodeLanguage(language: string) {
  const value = language.trim().toLowerCase();
  return value === "auto" ? "" : aliases[value] || value;
}

export function codeLanguageLabel(language: string) {
  const normalized = normalizeCodeLanguage(language);
  return (
    codeLanguages.find(([key]) => key === normalized)?.[1] ||
    (normalized === "text" || !normalized ? "Plain text" : language)
  );
}
