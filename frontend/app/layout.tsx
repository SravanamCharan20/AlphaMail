import "./globals.css";
import { UserProvider } from "./utils/userContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen app-bg">
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
