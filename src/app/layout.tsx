import type { Metadata } from "next";
import { Inter, Patrick_Hand } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { DelightProvider } from "@/components/DelightProvider";
import { AvatarProvider } from "@/components/AvatarProvider";
import { NarrationProvider } from "@/components/NarrationBlock";
import { I18nProvider } from "@/components/I18nProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const patrickHand = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-patrick-hand",
});

export const metadata: Metadata = {
  title: "Misconception Mentor",
  description: "Math practice that identifies and fixes your misconceptions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${patrickHand.variable} font-sans antialiased`}>
        <I18nProvider>
          <AuthProvider>
            <DelightProvider>
              <NarrationProvider>
                <AvatarProvider>
                  {children}
                </AvatarProvider>
              </NarrationProvider>
            </DelightProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
