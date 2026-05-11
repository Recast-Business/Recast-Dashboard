# Recast Dashboard - Upgrade Plan
**Prepared by Larry Recast  ·  April 2026  ·  CONFIDENTIAL**

---

## What This Document Is

This plan covers the full upgrade of the Recast Creator Dashboard from a scouting and roster tool into a complete agency operating system. It captures everything discussed across the planning sessions and the feedback from Harry, covering what needs to be built, how it should feel, the design inspiration behind it, the technical approach, and the phased build timeline.

---

## Background and Context

The dashboard was originally built to handle creator scouting and roster management. Bruno, Harry, Frazier and Max have all seen it and the response has been strong. The decision has been made to expand it into the central workspace for all of Recast's workflow.

Following Harry's input, the focus of the new build is campaign-based earnings tracking. The primary goal is a clear, real-time view of every campaign, the creators within it, what each creator is earning, Recast's commission on those earnings, and the current status of each deal. No unnecessary complexity, just precise and accessible tracking.

The key person being onboarded is Gustavo, who handles logins and all financial operations for Recast. His core need is visibility across all active campaigns and earnings without having to chase information across notes, spreadsheets, and messages.

The agreed timeline is a fully functional build delivered by end of this week, with refinement the following week.

**Tech stack confirmed:** React, TypeScript, Vite, Supabase, TailwindCSS, shadcn/ui, deployed on Vercel.

---

## Current State of the Dashboard

The live dashboard at recast-dashboard.vercel.app currently has five sections.

1. **Roster** - 746 plus creators, sortable and filterable by platform, tier, CCV, region, content type, and outreach status
2. **Scout** - live Twitch and Kick scouting with auto-scout, CCV lookup, and direct export to the master roster
3. **Potential** - starred creator shortlist from scout sessions
4. **Pipeline and Analytics** - deal pipeline tracking and performance analytics
5. **Brief Builder** - additional workspace for building and managing creator briefs

What it currently lacks is campaign tracking, earnings visibility, commission tracking, access control, and any financial overview. These are the gaps this upgrade fills.

---

## Design Philosophy

Before covering what to build, this section covers how it should feel. The dashboard is becoming the central operating system for Recast, used daily by people with different needs and different levels of technical comfort. The design has to serve all of them without being cluttered for any of them.

### The Core Principle

Every piece of data a user needs should be reachable in one click from their landing screen. If Gustavo has to navigate through three screens to find a creator's earnings within a campaign, the system has failed. Every screen should be designed by asking what this user needs the moment they log in, and whether it is immediately in front of them.

### Inspiration

**Attio** is the primary visual and structural reference. The data model connects people, companies, and deals in a single unified view, which maps directly onto Recast's structure of brands, creators, and campaigns. The interaction pattern is exactly what we are borrowing: a clean list or Kanban view at the top level, click into a campaign and a side panel or expanded view shows all creators and their earnings within it, without loading a new screen. Attio also has a proactive and queryable AI layer which is covered below.

**Bonsai** provides inspiration for how pipeline layout and detail views should feel. The way Bonsai surfaces deal and project details when you click into them is clean and accessible. A deal summary at the list level that expands into full detail in the same view is the pattern to carry into the campaign tracker.

**Stripe Dashboard** is the benchmark for financial data displayed simply. Payment timelines, status indicators, and earnings summaries done as cleanly as possible. The reference point for how earnings and commission figures should be presented.

**The agency operating system concept.** A left navigation with clear sections. A main workspace that changes by section. A notification feed showing what has changed recently. Clean navigation, no overlap between sections, every team member in their own lane.

### Rules Every Screen Must Follow

1. No screen should require explanation. If a user needs to be told what a screen does, redesign it.
2. Labels over icons alone. Every action should say what it does.
3. Status should always be visible without requiring a click.
4. Empty states should guide rather than confuse.
5. Alerts should be impossible to miss. Overdue or flagged items sit at the top in red with a count.
6. Mobile awareness. The layout should be readable on mobile even if not fully interactive.
7. Minimal manual input. The system calculates earnings and commission automatically from the deal structure wherever possible. Manual entry is a last resort, not a default.

### The Overriding Principle

This is a workflow tool, not a reporting tool. It should make people faster at their jobs, not just show them data. Every section should reduce the time someone spends on a task, not add to it.

---

## What Needs to Be Built

### 1. Role-Based Access Control

The permission layer goes in first. Everything new sits behind it.

| Role | Who | Access |
|------|-----|--------|
| Admin | Bruno, Harry, Max | Full access to everything |
| Partner | Frazier | Roster, Scout, Brief Builder, Campaign Tracker without financials |
| Finance | Gustavo | Campaign Tracker full access, Earnings, Commission, Cash Flow |

Permissions are set as above for now and can be adjusted once the build is live. Additional users can be added at any time. Supabase Auth handles login. Row-level security policies control what each role can read and write. The navigation adapts per role automatically.

---

### 2. Campaign Tracker

The centrepiece of the upgrade. Every campaign is brand-led. Creators sit underneath each campaign. A creator can appear across multiple campaigns simultaneously.

**Campaign level view:**

Each campaign card shows the brand name, the number of creators within it, total earnings across all creators, total Recast commission, and overall campaign status. Campaigns are filterable by brand, status, and date range.

**Creator level view within a campaign:**

Clicking into a campaign expands to show every creator attached to it. Each creator row displays their earnings for the current period, the Recast commission figure calculated automatically from the deal structure, payment status, and any flags such as overdue or pending. A creator appearing in multiple campaigns shows up independently under each one with their own earnings and status per campaign.

**Earnings and commission calculation:**

The system calculates earnings automatically based on the deal structure defined for each creator within the campaign. Recast's commission is calculated automatically on top of that. Manual input is kept to a minimum. Where a deal structure allows full automation, no manual entry is required. Where variables exist that cannot be automated, the system prompts for only the specific missing input rather than requiring a full manual entry.

**Deal structure builder:**

Each creator's deal within a campaign is configured using modular components that can be combined in any arrangement. The available components are a flat fee for simple monthly or one-off amounts, a per-post rate for content deals with variable pricing, a per-stream rate for live session deals, a revenue share with optional minimum guarantee, a tiered bonus triggered by hitting a threshold, a daily log for deals tracked day by day, a weekly cap with rollover rules, and a CPM rate based on views or impressions. Any combination of these can be stacked on a single creator deal and the system handles the calculation.

**Real-time earnings integration:**

For deals like the Fanatics ad overlay campaign where earnings are driven by live CCV figures, the dashboard can pull real-time data rather than relying on manual input. If the overlay platform exposes an API with earnings or impression data that feed can connect directly. As a fallback the dashboard pulls live CCV from Twitch and Kick using the existing scouting infrastructure and calculates the earnings figure automatically using the deal rate. This means earnings across all creators on the overlay campaign update in real time without anyone having to enter a number.

**Status definitions:**

Active means the deal is live and earnings are tracking. Pending means the deal is agreed but not yet started. Awaiting Payment means earnings have been calculated and payment has not arrived. Overdue means payment is past the expected date. Completed means the campaign has ended.

---

### 3. Gustavo's Finance Hub

A dedicated landing page accessible only via Gustavo's login. This is what he sees the moment he logs in.

The Finance Hub shows a cash flow overview for the current month and next, all active campaigns with their earnings and commission totals, any overdue or awaiting payment flags surfaced at the top, and a breakdown of Recast's total commission across all live campaigns. Clean and uncluttered. Gustavo does not see the roster, scout tools, or brief builder. His view is earnings, commission, and payment status across all campaigns.

---

### 4. Enhanced Brief Builder

The existing Brief Builder connects to real campaign data.

Each card links to a campaign record in the Campaign Tracker. Cards display the expected deal value and current status. Moving a card to Exclusive automatically creates a campaign record in the tracker so nothing falls through the gap between pipeline and live deal.

---

### 5. Activity Feed and Notifications

A panel visible to Admin and Finance roles showing recent activity. New campaign added, creator added to campaign, earnings updated, payment status changed, and overdue flags all appear here in real time.

---

### 6. AI Layer (Phase 2)

Inspired by Attio's Ask AI feature and the proactive workflow surfacing seen in Linear, the dashboard will have an AI layer that operates in two ways.

The first is reactive. Any user can ask questions in plain English and get instant answers from the data. Gustavo can type "which creators are overdue for payment this week" and get an immediate answer. Bruno can type "show me all creators on the Fanatics campaign earning above 10K this month" without touching a filter.

The second is proactive. The AI surfaces important information automatically without being asked. It flags that a creator who normally receives payment on the 1st has not been paid by the 10th. It alerts that three creators on a campaign have earnings logged but no payment received. It suggests creators from the roster who match the profile of top performers in an existing campaign.

The AI layer is built using the OpenAI or Anthropic API on top of the existing Supabase backend. It is scoped to Phase 2 because it relies on the data model being solid first. The AI is only as useful as the data it reads.

---

## Build Phases

### Phase 1 - This Week (Full Build)

The target is a fully functional dashboard delivered by end of this week, ready for Gustavo and the partners to use and stress test with real data.

1. Supabase Auth with role-based logins for Bruno, Harry, Gustavo, Frazier, and Max
2. Campaign Tracker with campaign cards, creator-level earnings and commission views, and automatic calculation from deal structures
3. Modular deal structure builder covering all component types
4. Real-time CCV-based earnings calculation for ad overlay deals
5. Gustavo's Finance Hub as his landing page with cash flow overview and overdue flags
6. Activity feed and notifications for Admin and Finance roles
7. Brief Builder connected to Campaign Tracker

### Phase 2 - Next Week (Refinement and AI)

1. AI query layer and proactive surfacing of flags and insights
2. Real-time API integration with overlay platform if access is confirmed
3. Adjustments to campaign structure, deal components, and views based on live usage feedback
4. Performance and stability checks before wider rollout
5. Additional user logins as needed

---

## Confirmed Decisions

1. Email addresses for Supabase Auth accounts still to be provided for Bruno, Harry, Frazier, Gustavo, and Max
2. Gustavo can create and manage campaigns as well as track earnings
3. All figures displayed in USD
4. Invoice creation is out of scope. Focus is purely on tracking
5. Campaigns are brand-led. Creators can appear across multiple campaigns simultaneously
6. Earnings and commission calculated automatically from deal structure wherever possible. Manual input minimised
7. Additional users beyond the initial five are possible and the permission system accommodates new logins easily

---

*Recast Dashboard Upgrade Plan  ·  Larry Recast  ·  April 2026  ·  Confidential*
