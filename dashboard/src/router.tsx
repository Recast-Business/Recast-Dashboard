import * as React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { UnauthorizedPage } from "@/pages/Unauthorized";
import { RoleRedirect } from "@/auth/RoleRedirect";

// Round-2 performance (friction audit #16 + bundle-size warning):
// every page below is code-split via React.lazy, so login no longer
// downloads the entire app up front — each page's chunk loads on
// first visit and is cached after. The Suspense boundary lives in
// AppShell around the <Outlet/>, so all lazy children share one
// fallback. Login/Unauthorized stay static: Login IS the entry
// screen (lazy would slow first paint), Unauthorized is tiny.
//
// Pages use named exports, hence the .then(m => ({default: ...}))
// dance — React.lazy only understands default exports.
/* eslint-disable react-refresh/only-export-components */
const OverviewPage = React.lazy(() => import("@/pages/Overview").then((m) => ({ default: m.OverviewPage })));
const CalculatorPage = React.lazy(() => import("@/pages/Calculator").then((m) => ({ default: m.CalculatorPage })));
const CampaignsPage = React.lazy(() => import("@/pages/Campaigns").then((m) => ({ default: m.CampaignsPage })));
const FinancePage = React.lazy(() => import("@/pages/Finance").then((m) => ({ default: m.FinancePage })));
const RosterPage = React.lazy(() => import("@/pages/Roster").then((m) => ({ default: m.RosterPage })));
const TalentLedgerPage = React.lazy(() => import("@/pages/TalentLedger").then((m) => ({ default: m.TalentLedgerPage })));
const TalentDetailPage = React.lazy(() => import("@/pages/TalentDetail").then((m) => ({ default: m.TalentDetailPage })));
const CreatorProfilePage = React.lazy(() => import("@/pages/CreatorProfile").then((m) => ({ default: m.CreatorProfilePage })));
const BriefsPage = React.lazy(() => import("@/pages/Briefs").then((m) => ({ default: m.BriefsPage })));
const ActivityPage = React.lazy(() => import("@/pages/Activity").then((m) => ({ default: m.ActivityPage })));
const VendorsPage = React.lazy(() => import("@/pages/Vendors").then((m) => ({ default: m.VendorsPage })));
const VendorDetailPage = React.lazy(() => import("@/pages/VendorDetail").then((m) => ({ default: m.VendorDetailPage })));
const HousePage = React.lazy(() => import("@/pages/House").then((m) => ({ default: m.HousePage })));
const PaymentsPage = React.lazy(() => import("@/pages/Payments").then((m) => ({ default: m.PaymentsPage })));
const AdminPage = React.lazy(() => import("@/pages/Admin").then((m) => ({ default: m.AdminPage })));
const TasksPage = React.lazy(() => import("@/pages/Tasks").then((m) => ({ default: m.TasksPage })));

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
          // Partner rolled back off Workspace (Bruno feedback) —
          // admin + accounting only. Sidebar entry hidden in parallel
          // so the entries stay in sync.
          <ProtectedRoute allow={["admin", "accounting"]}>
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
        path: "creators/:id",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
            <CreatorProfilePage />
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
      // Vendors + House — admin + accounting only. Partner rolled
      // back off Workspace per Bruno feedback (Sidebar entry hidden
      // alongside these route guards).
      {
        path: "vendors",
        element: (
          <ProtectedRoute allow={["admin", "accounting"]}>
            <VendorsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "vendors/:id",
        element: (
          <ProtectedRoute allow={["admin", "accounting"]}>
            <VendorDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "house",
        element: (
          <ProtectedRoute allow={["admin", "accounting"]}>
            <HousePage />
          </ProtectedRoute>
        ),
      },
      // Bruno: Tax tracker no longer a top-level route — folded into
      // the bottom of /payments as a section since it's only touched
      // once a year. Old /tax route removed; the section component
      // lives at @/components/finance/TaxTrackerSection.
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
      // Self-serve user management. Admin only — the admin_* RPCs it
      // calls re-verify the caller's role server-side, so this route
      // guard is UX, not the security boundary.
      {
        path: "admin",
        element: (
          <ProtectedRoute allow={["admin"]}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      // Round 3: shared team task board — every role. It's a
      // coordination surface, not a finance one, so partner keeps
      // access even though the rest of Workspace is hidden for them.
      {
        path: "tasks",
        element: (
          <ProtectedRoute allow={["admin", "partner", "accounting", "operator"]}>
            <TasksPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
