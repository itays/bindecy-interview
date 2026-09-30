import type { Config } from "@react-router/dev/config"

export default {
  // SPA mode: the brief requires pure client-side React. The root route is
  // still rendered at build time into build/client/index.html.
  ssr: false,
} satisfies Config
