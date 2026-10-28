import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trama",
  description: "Chat de entrada de Trama",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El nonce de la CSP lo genera src/proxy.ts en cada request. Leer las
  // cabeceras hace que la página se renderice por request, que es lo que la
  // CSP con nonce necesita (ADR-0005).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // next-themes escribe la clase del tema en <html> antes de hidratar.
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
