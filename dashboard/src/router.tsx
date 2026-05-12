import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { UnauthorizedPage } from "@/pages/Unauthorized";
import { FinancePage } from "@/pages/Finance";
import { OverviewPage } from "@/pages/Overview";
import { CalculatorPage } from "@/pages/Calculator";
import { CampaignsPage } from "@/pages/Campaigns";
import { RosterPage } from "@/pages/Roster";
import { TalentLedgerPage } from "@/pages/TalentLedger";
import { TalentDetailPage } from "@/pages/TalentDetail";
import { LeadsPage } from "@/pages/Leads";
import { PotentialPage } from "@/pages/Potential";
import { CreatorProfilePage } from "@/pages/CreatorProfile";
import { ScoutPage } from "@/pages/Scout";
import { BriefsPage } from "@/pages/Briefs";
import { ActivityPage } from "@/pages/Activity";
import { VendorsPage } from "@/pages/Vendors";
import { VendorDetailPage } from "@/pages/VendorDetail";
import { HousePage } from "@/pages/House";
import { TaxTrackerPage } from "@/pages/TaxTracker";
import { RoleRedirect } from "@/auth/RoleRedirect";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  {
    element: (
      <ProtectedRoute allow={["admin", "partner", "finance", "operator"]}>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <RoleRedirect /> },
      {
        path: "overview",
        element: (
          <ProtectedRoute allow={["admin", "finance"]}>
            <OverviewPage />
          </ProtectedRoute>
        ),
      },
      {
        // M-5: Calculator owns the math (renamed from Campaigns in nav).
        // Original /campaigns route stays alive below for any inbound links
        // that haven't migrated yet.
        path: "calculator",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance", "operator"]}>
            <CalculatorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "campaigns",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance", "operator"]}>
            <CampaignsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "finance",
        element: (
          <ProtectedRoute allow={["admin", "finance"]}>
            <FinancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "roster",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance", "operator"]}>
            <RosterPage />
          </ProtectedRoute>
        ),
      },
      // Round 3 C.2 + follow-up: /talents renders TalentLedgerPage —
      // the CRM/financial lens on signed creators (contact, legal,
      // address, commission tiers, signed agreements, completeness
      // audit). Restricted to admin + finance because the page
      // surfaces sensitive payment-prep data (legal name, business
      // name, address, tax-ID indicator, agreement URLs). All other
      // roles use /roster (Pipeline) for the operational lens
      // (twitch/kick handles, CCV, sign/unsign).
      {
        path: "talents",
        element: (
          <ProtectedRoute allow={["admin", "finance"]}>
            <TalentLedgerPage />
          </ProtectedRoute>
        ),
      },
      // R4.C: per-creator P&L detail. Same role gating as the list
      // (admin + finance) — the page surfaces full commission +
      // platform revenue history.
      {
        path: "talents/:id",
        element: (
          <ProtectedRoute allow={["admin", "finance"]}>
            <TalentDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "leads",
        element: (
          <ProtectedRoute allow={["admin", "partner", "operator"]}>
            <LeadsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "potential",
        element: (
          <ProtectedRoute allow={["admin", "partner", "operator"]}>
            <PotentialPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "creators/:id",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance", "operator"]}>
            <CreatorProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "scout",
        element: (
          <ProtectedRoute allow={["admin", "partner", "operator"]}>
            <ScoutPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "briefs",
        element: (
          <ProtectedRoute allow={["admin", "partner", "operator"]}>
            <BriefsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "activity",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance"]}>
            <ActivityPage />
          </ProtectedRoute>
        ),
      },
      // C4: Vendors index + detail. Both admin/partner/finance.
      // Falls under the "Ledgers" sidebar group.
      {
        path: "vendors",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance"]}>
            <VendorsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "vendors/:id",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance"]}>
            <VendorDetailPage />
          </ProtectedRoute>
        ),
      },
      // C5: Frazier's House — promoted from Finance tab to its own
      // top-level route under the Ledgers sidebar group.
      {
        path: "house",
        element: (
          <ProtectedRoute allow={["admin", "partner", "finance"]}>
            <HousePage />
          </ProtectedRoute>
        ),
      },
      // R4.B: Year-end tax tracker (1099 prep). Admin + finance
      // only — touches sensitive person-level tax data (W9 / 1099
      // links) so partners and operators don't see the route.
      {
        path: "tax",
        element: (
          <ProtectedRoute allow={["admin", "finance"]}>
            <TaxTrackerPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
