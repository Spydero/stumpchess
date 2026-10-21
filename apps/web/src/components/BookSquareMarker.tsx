"use client";

import {
  createContext,
  forwardRef,
  memo,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CustomSquareProps, Square } from "react-chessboard/dist/chessboard/types";

type BookMarkerState = {
  target: Square | null;
};

const BookMarkerCtx = createContext<BookMarkerState>({ target: null });

/**
 * Stable customSquare: Book glyph on the last book move's to-square.
 * Never recreate this type per render.
 */
export const BookSquare = memo(
  forwardRef<HTMLDivElement, CustomSquareProps>(function BookSquare(
    { children, square, style },
    ref
  ) {
    const { target } = useContext(BookMarkerCtx);
    const show = Boolean(target && square === target);

    return (
      <div ref={ref} style={{ ...style, position: "relative" }}>
        {children}
        {show ? (
          <div
            className="book-square-glyph"
            style={
              {
                top: "2%",
                right: "2%",
                width: "38%",
                height: "38%",
                minWidth: 14,
                minHeight: 14,
              } as CSSProperties
            }
            title="Book move"
            aria-label="Book move"
          >
            <svg width="55%" height="55%" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M2.5 1.5A1.5 1.5 0 0 1 4 0h9.5A.5.5 0 0 1 14 .5v13a.5.5 0 0 1-.5.5H4a1 1 0 0 0-1 1h10.5a.5.5 0 0 1 0 1H2.5A1.5 1.5 0 0 1 1 14V2.5A1.5 1.5 0 0 1 2.5 1.5ZM4 1a.5.5 0 0 0-.5.5v11.086A1.99 1.99 0 0 1 4 12h9V1H4Z" />
            </svg>
          </div>
        ) : null}
      </div>
    );
  })
);
BookSquare.displayName = "BookSquare";

export function BookSquareProvider({
  target,
  children,
}: {
  target?: Square | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ target: target ?? null }), [target]);
  return <BookMarkerCtx.Provider value={value}>{children}</BookMarkerCtx.Provider>;
}
