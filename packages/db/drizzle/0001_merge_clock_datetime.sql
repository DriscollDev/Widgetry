-- F5.1 + F5.2: Clock and Date/Time become one widget type.
--
-- They were two types that differed only in which parts of the same instant
-- they printed, and neither had a config schema at all - every row of both
-- carries `{}`. The merged type's `display` field now chooses between them, so
-- the rows need that field filled in with whatever each one was ALREADY
-- showing. Without this they would all fall to the schema default and half of
-- them would silently change what they display.
--
-- Order is load-bearing: the clock backfill has to run while the datetime rows
-- are still datetime, or they would be caught by the first statement and
-- labelled 'time', losing the date they have always shown.
--
-- Forward-only (CLAUDE.md, Eng §14.2). Additive in the sense that matters: the
-- `widgets_widget_type_check` constraint is NOT touched, so 'datetime' remains
-- a legal value and the old code keeps running against the new data during a
-- deploy. The id is retired in the registry instead - hidden from the catalog,
-- still parsed, still rendered - and can be dropped from the constraint in some
-- later release, or never.

-- A clock showed the time and nothing else.
UPDATE widgets
   SET config = jsonb_set(config, '{display}', '"time"', true)
 WHERE widget_type = 'clock'
   AND NOT jsonb_exists(config, 'display');
--> statement-breakpoint

-- A Date & Time widget showed both, and becomes a clock that is set to do so.
UPDATE widgets
   SET widget_type = 'clock',
       config = jsonb_set(config, '{display}', '"both"', true)
 WHERE widget_type = 'datetime';
