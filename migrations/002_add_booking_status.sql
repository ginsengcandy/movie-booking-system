ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_status_check'
      AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('CONFIRMED', 'CANCELLED'));
  END IF;
END $$;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_showtime_id_seat_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_confirmed_showtime_seat
  ON bookings(showtime_id, seat_id)
  WHERE status = 'CONFIRMED';
