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
import { PaymentsPage } from "@/pages/Payments";
import { RoleRedirect } from "@/auth/RoleRedirect";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  {
    element: (
      <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <RoleRedirect /> },
      {
        path: "overview",
        element: (
          <ProtectedRoute allow={["admin", "accounting"]}>
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
          // R5 follow-up (roles audit): partner removed from
          // /calculator router to match the sidebar (which dropped
          // partner in Sweep 8 — partners don't price deals, the
          // tool was visual noise in their nav). Sidebar + router
          // are now aligned.
          <ProtectedRoute allow={["admin", "accounting", "operator"]}>
            <CalculatorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "campaigns",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
            <CampaignsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "finance",
        element: (
          // R5 follow-up (roles audit): partner added for read-only
          // access. Sidebar already showed Invoice to partners but
          // the router blocked them — fixed mismatch. Write actions
          // (Add Talent, edit/delete invoices) are gated inside the
          // grid components so partner sees data only.
          <ProtectedRoute allow={["admin", "partner", "accounting"]}>
            <FinancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "roster",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
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
          <ProtectedRoute allow={["admin", "accounting"]}>
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
          <ProtectedRoute allow={["admin", "accounting"]}>
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
          <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
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
          <ProtectedRoute allow={["admin", "partner", "accounting"]}>
            <ActivityPage />
          </ProtectedRoute>
        ),
      },
      // C4: Vendors index + detail. Both admin/partner/finance.
      // Falls under the "Ledgers" sidebar group.
      {
        path: "vendors",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting"]}>
            <VendorsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "vendors/:id",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting"]}>
            <VendorDetailPage />
          </ProtectedRoute>
        ),
      },
      // C5: Frazier's House — promoted from Finance tab to its own
      // top-level route under the Ledgers sidebar group.
      {
        path: "house",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting"]}>
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
          <ProtectedRoute allow={["admin", "accounting"]}>
            <TaxTrackerPage />
          </ProtectedRoute>
        ),
      },
      // R5 Sweep 5: Unified payments log. Admin + finance only —
      // surfaces every payment_receipts row this year across vendors,
      // campaigns, talent, and house. Partners are excluded because
      // talent earnings receipts contain commission detail.
      {
        path: "payments",
        element: (
          <ProtectedRoute allow={["admin", "accounting"]}>
            <PaymentsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
