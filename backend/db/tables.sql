-- Tables of the OpenRider backend, for PostgreSQL (see tables.sqlite.sql for SQLite)

CREATE TABLE "TRACKS" (
    "ID" SERIAL NOT NULL PRIMARY KEY,
    -- Track file, see api.php
    "CODE" BYTEA NOT NULL,
    -- Base64 PNG, without the data URL prefix
    "THUMBNAIL" TEXT
);

CREATE TABLE "GHOSTS" (
    "ID" SERIAL NOT NULL PRIMARY KEY,
    "GHOSTSTRING" TEXT NOT NULL,
    "TRACKID" INT NOT NULL,
    -- Race time, in physics ticks (50 per second)
    "TIME" INT NOT NULL,
    CONSTRAINT fk_track FOREIGN KEY ("TRACKID") REFERENCES "TRACKS" ("ID")
);

CREATE INDEX idx_ghosts_track ON "GHOSTS" ("TRACKID");
