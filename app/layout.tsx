import { ReactNode } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./style.css";

export const metadata = {
  title: "MapGenius – Explore maps for Tribes 2",
  description: "Tribes 2 forever.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NuqsAdapter
          defaultOptions={{
            clearOnDefault: false,
          }}
        >
          {children}
        </NuqsAdapter>
      </body>
    </html>
  );
}
