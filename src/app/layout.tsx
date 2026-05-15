import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const suisseIntl = localFont({
  src: [
    { path: "../fonts/SuisseIntl-Thin.otf",    weight: "100", style: "normal" },
    { path: "../fonts/SuisseIntl-Regular.otf",  weight: "400", style: "normal" },
    { path: "../fonts/SuisseIntl-Medium.otf",   weight: "500", style: "normal" },
  ],
  variable: "--font-suisse",
  display: "swap",
});

export const metadata: Metadata = {
  title: "+Carton",
  description: "Product importer for +Carton",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${suisseIntl.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
