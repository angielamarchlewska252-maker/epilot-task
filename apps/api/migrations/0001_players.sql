CREATE TABLE IF NOT EXISTS players (
  pk TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_guesses (
  pk TEXT PRIMARY KEY,
  guess_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  entry_price TEXT NOT NULL,
  created_at TEXT NOT NULL,
  eligible_at TEXT NOT NULL,
  FOREIGN KEY (pk) REFERENCES players (pk)
);

CREATE INDEX IF NOT EXISTS idx_active_guesses_due ON active_guesses (eligible_at);

CREATE TABLE IF NOT EXISTS guess_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pk TEXT NOT NULL,
  guess_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  entry_price TEXT NOT NULL,
  settlement_price TEXT NOT NULL,
  created_at TEXT NOT NULL,
  eligible_at TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('CORRECT', 'INCORRECT')),
  score_delta INTEGER NOT NULL CHECK (score_delta IN (1, -1)),
  FOREIGN KEY (pk) REFERENCES players (pk)
);

CREATE INDEX IF NOT EXISTS idx_guess_history_player ON guess_history (pk, id);

CREATE TRIGGER IF NOT EXISTS settle_guess
AFTER INSERT ON guess_history
BEGIN
  UPDATE players
  SET score = score + NEW.score_delta,
      updated_at = NEW.resolved_at
  WHERE pk = NEW.pk;
  DELETE FROM active_guesses
  WHERE pk = NEW.pk AND guess_id = NEW.guess_id;
END;
