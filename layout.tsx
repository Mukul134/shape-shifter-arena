import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shape Shifter Arena",
  description: "A 2–4 player browser arena brawler with dynamic AI-driven rules.",
  openGraph: {
    title: "Shape Shifter Arena",
    description: "A 2–4 player browser arena brawler with dynamic AI-driven rules.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0a0a14", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
