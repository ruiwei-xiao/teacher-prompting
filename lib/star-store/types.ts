/**
 * Star preference record shapes for personal starring.
 * Physical models: user_stars (Postgres) / .data/stars.json (JSON fallback).
 */

export type StarRecord = {
  userId: string;
  appId: string;
  /** ISO-8601 timestamp; refreshed on every star (including re-star). */
  starredAt: string;
};

export type StarsFileData = {
  stars: StarRecord[];
};
