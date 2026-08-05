import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalogo Facil",
  description: "Catalogo web com carrinho e pedidos enviados pelo WhatsApp.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
