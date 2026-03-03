import { defineQueries, defineQuery } from "@rocicorp/zero";
import * as v from "valibot";
import { zql } from "./schema";

export const queries = defineQueries({
  project: {
    /** All projects the current user is a member of */
    mine: defineQuery(({ ctx }) =>
      zql.projectMember
        .where("userId", ctx.userID)
        .related("project", (q) => q.related("members").related("versions")),
    ),
    /** Single project — verified via membership */
    byId: defineQuery(v.object({ id: v.string() }), ({ args, ctx }) =>
      zql.projectMember
        .where("userId", ctx.userID)
        .where("projectId", args.id)
        .related("project", (q) =>
          q
            .related("members", (m) => m.related("user"))
            .related("versions")
            .related("comments", (c) => c.related("author").orderBy("createdAt", "asc")),
        ),
    ),
  },
  comment: {
    /** All comments for a project */
    byProject: defineQuery(v.object({ projectId: v.string() }), ({ args }) =>
      zql.comment.where("projectId", args.projectId).related("author").orderBy("createdAt", "asc"),
    ),
  },
  inAppNotification: {
    mine: defineQuery(({ ctx }) =>
      zql.inAppNotification.where("userId", ctx.userID).orderBy("createdAt", "desc"),
    ),
    unread: defineQuery(({ ctx }) =>
      zql.inAppNotification
        .where("userId", ctx.userID)
        .where("read", false)
        .orderBy("createdAt", "desc"),
    ),
  },
});
