-- P6: tag every Statcast event with the plate-coordinate reference frame used
-- when Savant recorded it.
--
-- The 2026 season changed Savant's plate_x / plate_z reference from the FRONT
-- of home plate (<=2025) to the MIDDLE of the plate (>=2026). Cross-season
-- pitch-zone overlays would silently mis-align by an inch or two without this
-- tag. Normalizing across alignments would require per-pitch trajectory math
-- (offset depends on velocity / movement) -- out of scope. Instead, the
-- PitchDistribution chart is required to filter to a single plate_alignment
-- at a time (already enforced by the per-season UI filter).

alter table web_statcast_events
  add column if not exists plate_alignment text;  -- 'front' (<=2025) | 'middle' (>=2026)

update web_statcast_events
   set plate_alignment = case
     when extract(year from game_date) >= 2026 then 'middle'
     else 'front'
   end
 where plate_alignment is null;

create index if not exists idx_web_statcast_plate_alignment
  on web_statcast_events (plate_alignment);
