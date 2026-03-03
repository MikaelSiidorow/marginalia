import { defineMutators, defineMutator } from "@rocicorp/zero";
import * as v from "valibot";
import { zql } from "./schema";

export const mutators = defineMutators({
  project: {
    create: defineMutator(
      v.object({
        id: v.string(),
        repoFullName: v.string(),
        defaultBranch: v.string(),
        entryFile: v.string(),
      }),
      async ({ tx, ctx, args }) => {
        const now = Date.now();
        await tx.mutate.project.insert({
          id: args.id,
          ownerId: ctx.userID,
          repoFullName: args.repoFullName,
          defaultBranch: args.defaultBranch,
          entryFile: args.entryFile,
          createdAt: now,
          updatedAt: now,
        });
        await tx.mutate.projectMember.insert({
          id: crypto.randomUUID(),
          projectId: args.id,
          userId: ctx.userID,
          role: "owner",
          invitedAt: now,
        });
      },
    ),
    update: defineMutator(
      v.object({
        id: v.string(),
        entryFile: v.optional(v.string()),
        defaultBranch: v.optional(v.string()),
      }),
      async ({ tx, ctx, args }) => {
        const proj = await tx.run(
          zql.project.where("id", args.id).where("ownerId", ctx.userID).one(),
        );
        if (!proj) return;
        await tx.mutate.project.update({
          id: args.id,
          ...(args.entryFile !== undefined && { entryFile: args.entryFile }),
          ...(args.defaultBranch !== undefined && { defaultBranch: args.defaultBranch }),
          updatedAt: Date.now(),
        });
      },
    ),
    delete: defineMutator(v.object({ id: v.string() }), async ({ tx, ctx, args }) => {
      const proj = await tx.run(
        zql.project.where("id", args.id).where("ownerId", ctx.userID).one(),
      );
      if (!proj) return;
      await tx.mutate.project.delete({ id: args.id });
    }),
  },
  comment: {
    create: defineMutator(
      v.object({
        id: v.string(),
        projectId: v.string(),
        anchorType: v.picklist(["source", "pdf"]),
        anchorFile: v.optional(v.nullable(v.string())),
        anchorLine: v.optional(v.nullable(v.number())),
        anchorText: v.optional(v.nullable(v.string())),
        anchorPage: v.optional(v.nullable(v.number())),
        anchorRect: v.optional(
          v.nullable(
            v.object({
              x: v.number(),
              y: v.number(),
              width: v.number(),
              height: v.number(),
            }),
          ),
        ),
        body: v.pipe(v.string(), v.minLength(1)),
        suggestion: v.optional(v.nullable(v.string())),
      }),
      async ({ tx, ctx, args }) => {
        // Verify membership
        const member = await tx.run(
          zql.projectMember.where("projectId", args.projectId).where("userId", ctx.userID).one(),
        );
        if (!member) return;
        const now = Date.now();
        await tx.mutate.comment.insert({
          id: args.id,
          projectId: args.projectId,
          authorId: ctx.userID,
          anchorType: args.anchorType,
          anchorFile: args.anchorFile ?? null,
          anchorLine: args.anchorLine ?? null,
          anchorText: args.anchorText ?? null,
          anchorPage: args.anchorPage ?? null,
          anchorRect: args.anchorRect ?? null,
          body: args.body,
          suggestion: args.suggestion ?? null,
          resolved: false,
          resolvedBy: null,
          createdAt: now,
          updatedAt: now,
        });
      },
    ),
    resolve: defineMutator(
      v.object({ id: v.string(), projectId: v.string() }),
      async ({ tx, ctx, args }) => {
        const member = await tx.run(
          zql.projectMember.where("projectId", args.projectId).where("userId", ctx.userID).one(),
        );
        if (!member) return;
        await tx.mutate.comment.update({
          id: args.id,
          resolved: true,
          resolvedBy: ctx.userID,
          updatedAt: Date.now(),
        });
      },
    ),
    delete: defineMutator(v.object({ id: v.string() }), async ({ tx, ctx, args }) => {
      const cmt = await tx.run(
        zql.comment.where("id", args.id).where("authorId", ctx.userID).one(),
      );
      if (!cmt) return;
      await tx.mutate.comment.delete({ id: args.id });
    }),
  },
});
