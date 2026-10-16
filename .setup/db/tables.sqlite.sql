-- Tables of the OpenRider backend, for SQLite 3.35 or later (RETURNING support)

CREATE TABLE "TRACKS" (
    "ID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CODE" TEXT NOT NULL,
    -- Base64 PNG, without the data URL prefix
    "THUMBNAIL" TEXT
);

CREATE TABLE "GHOSTS" (
    "ID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "GHOSTSTRING" TEXT NOT NULL,
    "TRACKID" INTEGER NOT NULL REFERENCES "TRACKS" ("ID"),
    -- Race time, in physics ticks (50 per second)
    "TIME" INTEGER NOT NULL
);

CREATE INDEX idx_ghosts_track ON "GHOSTS" ("TRACKID");
