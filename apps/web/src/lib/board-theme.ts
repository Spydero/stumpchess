export type BoardThemeId =
  | "club"
  | "classic"
  | "forest"
  | "ocean"
  | "slate"
  | "walnut"
  | "ice"
  | "rose";

export type BoardTheme = {
  id: BoardThemeId;
  label: string;
  light: string;
  dark: string;
};

export const BOARD_THEMES: BoardTheme[] = [
  { id: "club", label: "Club", light: "#ecd5b0", dark: "#b58863" },
  { id: "classic", label: "Classic", light: "#f0d9b5", dark: "#b58863" },
  { id: "forest", label: "Forest", light: "#e8f0d8", dark: "#6a8f5a" },
  { id: "ocean", label: "Ocean", light: "#dbe8f0", dark: "#5a7d9a" },
  { id: "slate", label: "Slate", light: "#e8eaed", dark: "#6b7280" },
  { id: "walnut", label: "Walnut", light: "#e3c9a3", dark: "#7a5230" },
  { id: "ice", label: "Ice", light: "#eef6ff", dark: "#7aa2c8" },
  { id: "rose", label: "Rose", light: "#f5e0e4", dark: "#a86b7a" },
];

export const BOARD_THEME_STORAGE_KEY = "stumpchess-board-theme";

export function boardThemeById(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) || BOARD_THEMES[0];
}

export function applyBoardThemeCss(theme: BoardTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--board-light", theme.light);
  document.documentElement.style.setProperty("--board-dark", theme.dark);
}
