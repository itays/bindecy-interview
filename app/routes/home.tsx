import type { Route } from "./+types/home"

import { ProjectOverview } from "~/components/project-overview/project-overview"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Project overview | Northstar" },
    {
      name: "description",
      content: "Browse and preview the files in the Northstar campaign.",
    },
  ]
}

export default function Home() {
  return <ProjectOverview />
}
