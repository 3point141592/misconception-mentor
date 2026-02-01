"use client";

import { TabNavigation } from "@/components/TabNavigation";
import { AuthButton } from "@/components/AuthButton";
import { DemoModeBadge } from "@/components/DemoModeBadge";
import { SettingsPopover } from "@/components/SettingsPopover";
import { FocusModeToggle } from "@/components/FocusModeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslation } from "@/components/I18nProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      {/* Header - skip narration for all navigation/controls */}
      <header 
        className="sticky top-0 z-50 bg-paper-bg/80 backdrop-blur-md border-b border-paper-line"
        data-narration-skip="true"
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink font-handwriting">
                  {t("common.appTitle")}
                </h1>
                <p className="text-sm text-ink-muted">
                  {t("common.appSubtitle")}
                </p>
              </div>
              <DemoModeBadge />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSelector />
              <FocusModeToggle />
              <SettingsPopover />
              <AuthButton />
            </div>
          </div>
          <TabNavigation />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
