import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    image: z.string().default("/blog-placeholder.svg"),
  }),
});


const albums = defineCollection({
  type: "data",
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      film: z.string().optional(),
      camera: z.string().optional(),
      cover: image(),
      copyright: z.string().optional(),
    }),
});

export const collections = { blog, albums };
