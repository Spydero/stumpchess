"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  BOARD_THEME_STORAGE_KEY,
  BOARD_THEMES,
  applyBoardThemeCss,
  boardThemeById,
  type BoardTheme,
  type BoardThemeId,
} from "@/lib/board-theme";

const BoardThemeContext = createContext<{
  boardTheme: BoardTheme;
  setBoardThemeId: (id: BoardThemeId) => void;
  themes: BoardTheme[];
}>({
  boardTheme: BOARD_THEMES[0],
  setBoardThemeId: () => {},
  themes: BOARD_THEMES,
});

export function BoardThemeProvider({ children }: { children: ReactNode }) {
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(BOARD_THEMES[0]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(BOARD_THEME_STORAGE_KEY);
    const theme = boardThemeById(stored);
    setBoardTheme(theme);
    applyBoardThemeCss(theme);
    setReady(true);
  }, []);

  function setBoardThemeId(id: BoardThemeId) {
    const theme = boardThemeById(id);
    setBoardTheme(theme);
    localStorage.setItem(BOARD_THEME_STORAGE_KEY, theme.id);
    applyBoardThemeCss(theme);
  }

  if (!ready) return <>{children}</>;

  return (
    <BoardThemeContext.Provider value={{ boardTheme, setBoardThemeId, themes: BOARD_THEMES }}>
      {children}
    </BoardThemeContext.Provider>
  );
}

export function useBoardTheme() {
  return useContext(BoardThemeContext);
}
