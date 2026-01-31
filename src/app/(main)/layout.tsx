import { TabNavigation } from "@/components/TabNavigation";
import { AuthButton } from "@/components/AuthButton";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-paper-bg/80 backdrop-blur-md border-b border-paper-line">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-ink font-handwriting">
                Misconception Mentor
              </h1>
              <p className="text-sm text-ink-muted">
                Grades 6–8 Math Practice
              </p>
            </div>
            <AuthButton />
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
