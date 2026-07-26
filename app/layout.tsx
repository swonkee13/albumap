import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "albumap — the album production hub",
  description:
    "The place a band organizes making a record: recording grid, audio ideas, comments, and who's behind.",
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
