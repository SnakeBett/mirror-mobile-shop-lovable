import { createFileRoute, redirect } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/produto/demo" });
  },
  head: () => ({
    meta: [
      { title: "Produto Demo" },
      { name: "description", content: "Página de demonstração do produto." },
      { property: "og:title", content: "Produto Demo" },
      { property: "og:description", content: "Página de demonstração do produto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
