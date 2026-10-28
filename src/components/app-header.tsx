import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold">Trama</h1>
        <span className="text-xs tracking-wide text-muted-foreground uppercase">
          Chat de entrada
        </span>
      </div>
      <ThemeToggle />
    </header>
  );
}
