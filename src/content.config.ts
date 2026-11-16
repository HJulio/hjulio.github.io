import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    image: z.string().default("/blog-placeholder.svg"),
  }),
});

// One YAML file per album next to a folder of the same name holding the photos.
const albums = defineCollection({
  loader: glob({ pattern: "*.{yml,yaml}", base: "./src/content/albums" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      short_description: z.string().optional(),
      description: z.string().optional(),
      film: z.string().optional(),
      camera: z.string().optional(),
      cover: image(),
      copyright: z.string().optional(),
    }),
});

export const collections = { blog, albums };
