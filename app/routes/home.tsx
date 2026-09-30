import type { Route } from "./+types/home"

import { FileExplorer } from "~/features/file-explorer/ui/file-explorer"

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
  return <FileExplorer />
}
