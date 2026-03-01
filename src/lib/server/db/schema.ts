import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// better-auth tables (managed by better-auth, do not insert/update directly)
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp().notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  password: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

// Notification tables (managed by @mikstack/notifications)
export const notificationDelivery = pgTable("notification_delivery", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text().references(() => user.id, { onDelete: "set null" }),
  type: text().notNull(),
  channel: text().notNull(),
  status: text({ enum: ["pending", "sent", "delivered", "failed"] })
    .notNull()
    .default("pending"),
  content: jsonb(),
  error: text(),
  retryOf: text(),
  retriesLeft: integer().notNull().default(0),
  recipientEmail: text(),
  externalId: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const inAppNotification = pgTable("in_app_notification", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text().notNull(),
  title: text().notNull(),
  body: text(),
  url: text(),
  icon: text(),
  read: boolean().notNull().default(false),
  createdAt: timestamp().notNull().defaultNow(),
});

export const notificationPreference = pgTable("notification_preference", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  notificationType: text().notNull(),
  channel: text().notNull(),
  enabled: boolean().notNull(),
  updatedAt: timestamp().notNull().defaultNow(),
});

// Application tables

export const project = pgTable("project", {
  id: text().primaryKey(),
  ownerId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  repoFullName: text().notNull(),
  defaultBranch: text().notNull(),
  entryFile: text().notNull(),
  webhookSecret: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const projectRelations = relations(project, ({ one, many }) => ({
  owner: one(user, { fields: [project.ownerId], references: [user.id] }),
  members: many(projectMember),
  versions: many(repoVersion),
  comments: many(comment),
}));

export const projectMember = pgTable("project_member", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text({ enum: ["owner", "reviewer"] }).notNull(),
  invitedAt: timestamp().notNull(),
});

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
  project: one(project, { fields: [projectMember.projectId], references: [project.id] }),
  user: one(user, { fields: [projectMember.userId], references: [user.id] }),
}));

export const repoVersion = pgTable("repo_version", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  branch: text().notNull(),
  commitSha: text().notNull(),
  commitMessage: text().notNull(),
  changedFiles: jsonb().$type<string[]>(),
  createdAt: timestamp().notNull(),
});

export const repoVersionRelations = relations(repoVersion, ({ one }) => ({
  project: one(project, { fields: [repoVersion.projectId], references: [project.id] }),
}));

export const comment = pgTable("comment", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  authorId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  anchorType: text({ enum: ["source", "pdf"] }).notNull(),
  anchorFile: text(),
  anchorLine: integer(),
  anchorText: text(),
  anchorPage: integer(),
  anchorRect: jsonb().$type<{ x: number; y: number; width: number; height: number }>(),
  body: text().notNull(),
  suggestion: text(),
  resolved: boolean().notNull(),
  resolvedBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const commentRelations = relations(comment, ({ one }) => ({
  project: one(project, { fields: [comment.projectId], references: [project.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

export const userRelations = relations(user, ({ many }) => ({
  projects: many(project),
  memberships: many(projectMember),
  comments: many(comment),
}));
