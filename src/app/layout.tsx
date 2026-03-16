import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coby",
  description: "Coby LINE Bot 時程管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

