-- Contact requests from the site's form. The contact Worker (workers/contact) binds this database
-- too: it keeps a copy of every request before emailing it, so that none is lost if the email
-- fails, and records what happened to the email. The founders read them on the dashboard. The
-- daily run deletes them after 180 days (README, "Contact backend").
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  needs TEXT NOT NULL,
  timeline TEXT NOT NULL,
  message TEXT NOT NULL,
  page TEXT NOT NULL,
  delivery TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX requests_by_day ON requests (day);

-- Submissions that were refused before anything was kept, counted by reason only: details that
-- failed the checks, or a script's submission. Nothing about who sent them is stored.
CREATE TABLE attempts (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, reason)
) WITHOUT ROWID;
