import type { Metadata } from "next";
import { Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BoardThemeProvider } from "@/components/BoardThemeProvider";

const display = Libre_Baskerville({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const ui = Source_Sans_3({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "stumpchess",
  description: "Play chess online. Forum, analysis, bots.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('stumpchess-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);var b=localStorage.getItem('stumpchess-board-theme');var map={club:['#ecd5b0','#b58863'],classic:['#f0d9b5','#b58863'],forest:['#e8f0d8','#6a8f5a'],ocean:['#dbe8f0','#5a7d9a'],slate:['#e8eaed','#6b7280'],walnut:['#e3c9a3','#7a5230'],ice:['#eef6ff','#7aa2c8'],rose:['#f5e0e4','#a86b7a']};var p=map[b]||map.club;document.documentElement.style.setProperty('--board-light',p[0]);document.documentElement.style.setProperty('--board-dark',p[1]);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${display.variable} ${ui.variable}`}>
        <ThemeProvider>
          <BoardThemeProvider>
            <Nav />
            <main className="shell py-4 sm:py-6 pb-14">{children}</main>
          </BoardThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
