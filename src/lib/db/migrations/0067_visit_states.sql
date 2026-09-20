-- Visit states become system-neutral (see src/lib/booking-system/status.ts).
-- Rows written by the former built-in import kept the system's raw status
-- codes; they are translated once.
UPDATE `contact_visits` SET `ic_status` = CASE `ic_status`
  WHEN 'X' THEN 'completed'
  WHEN 'A' THEN 'started'
  WHEN 'N' THEN 'other'
  WHEN '8' THEN 'waiting'
  WHEN '6' THEN 'booked'
  WHEN 'CANCELLED' THEN 'cancelled'
  ELSE 'other'
END
WHERE `ic_status` <> ''
  AND `ic_status` NOT IN ('booked', 'waiting', 'started', 'completed', 'cancelled', 'other');
