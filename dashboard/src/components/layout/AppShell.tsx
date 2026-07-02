import * as React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen bg-muted/20">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-6">
          {/* Round-2 performance: single Suspense boundary for every
              lazy route (router.tsx). Chunks are small and cached, so
              this flashes only on a page's very first visit. */}
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-[13px] text-steel">
                Loading…
              </div>
            }
          >
            <Outlet />
          </React.Suspense>
        </div>
      </main>
    </div>
  );
}
