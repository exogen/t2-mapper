import "./style.css";

export const metadata = {
  title: "Tribes 2 Maps",
  description: "Be the map genius.",
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
