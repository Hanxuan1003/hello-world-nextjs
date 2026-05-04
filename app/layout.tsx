import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crackd Caption Playground",
  description: "Generate captions from images and vote on saved caption cards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
