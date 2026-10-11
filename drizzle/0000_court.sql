CREATE TABLE sessions (token_hash TEXT PRIMARY KEY NOT NULL, actor TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE groups (id TEXT PRIMARY KEY NOT NULL, invite TEXT UNIQUE NOT NULL, document TEXT NOT NULL, version INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE mutations (id TEXT PRIMARY KEY NOT NULL, actor TEXT NOT NULL, group_id TEXT NOT NULL, created_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE request_limits (source TEXT PRIMARY KEY NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL);
