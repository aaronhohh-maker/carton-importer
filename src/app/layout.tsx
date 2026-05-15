import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const neueMontreal = localFont({
  src: [
    { path: "../fonts/NeueMontreal-Light.woff",   weight: "300", style: "normal" },
    { path: "../fonts/NeueMontreal-Regular.woff",  weight: "400", style: "normal" },
    { path: "../fonts/NeueMontreal-Medium.woff",   weight: "500", style: "normal" },
  ],
  variable: "--font-neue-montreal",
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
    <html lang="en" className={`${neueMontreal.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
