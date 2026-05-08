import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/router";
import { ConfirmProvider } from "@/hooks/useConfirm";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="bottom-right" />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
