import "./globals.css";

export const metadata = {
  title: "Persona Dialogue System",
  description: "Character AI chat experience inspired by Persona.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}