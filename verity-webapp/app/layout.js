import "./globals.css";

export const metadata = {
  title: "Verity — SEO & AI visibility",
  description:
    "Audit content, research keywords, compare competitors, and track how AI answer engines cite your site.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
