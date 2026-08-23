"use client"

import { Dashboard } from "@/components/dashboard/dashboard"

// Thin composition layer. All session state, derived telemetry, playback and imports live in
// the useObdSession hook; the UI is assembled from focused feature components under
// components/dashboard/. See that hook and those components for the details.
export default function Page() {
  return <Dashboard />
}
