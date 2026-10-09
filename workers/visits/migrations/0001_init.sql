-- The visit counter keeps counts, never people. Four small tables, all keyed so a repeat is an
-- update, not a new row.

-- One row per visitor per day: a one-way hash of the network and the browser, keyed by a secret
-- and the date. It exists only to count a visitor once a day, so the daily run deletes it after a day.
CREATE TABLE visitors (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,
  PRIMARY KEY (day, vid)
) WITHOUT ROWID;

-- Every counted page view.
CREATE TABLE views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, path)
) WITHOUT ROWID;

-- The first visit of each visitor each day, with what the request said about them. This is the
-- table that answers "who": countries, devices, browsers, and where they came from.
CREATE TABLE arrivals (
  day TEXT NOT NULL,
  landing TEXT NOT NULL,
  country TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  device TEXT NOT NULL,
  source TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, landing, country, browser, os, device, source)
) WITHOUT ROWID;

-- Requests that were not people (crawlers, scripts, hosting networks), counted by reason only.
CREATE TABLE filtered (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, reason)
) WITHOUT ROWID;
