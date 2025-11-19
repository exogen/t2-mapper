import { ReactNode } from "react";
import "./style.css";

export const metadata = {
  title: "MapGenius – Explore maps for Tribes 2",
  description: "Tribes 2 forever.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
