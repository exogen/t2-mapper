import "./style.css";

export const metadata = {
  title: "MapGenius – Explore maps for Tribes 2",
  description: "Tribes 2 forever.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
