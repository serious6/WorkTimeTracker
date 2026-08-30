ALTER TABLE work_settings ADD COLUMN break_threshold_minutes INTEGER NOT NULL DEFAULT 360;
ALTER TABLE work_settings ADD COLUMN required_break_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE work_settings ADD COLUMN long_break_threshold_minutes INTEGER NOT NULL DEFAULT 540;
ALTER TABLE work_settings ADD COLUMN required_long_break_minutes INTEGER NOT NULL DEFAULT 45;
ALTER TABLE work_settings ADD COLUMN min_break_block_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE work_settings ADD COLUMN max_continuous_work_minutes INTEGER NOT NULL DEFAULT 360;
ALTER TABLE work_settings ADD COLUMN max_daily_work_minutes INTEGER NOT NULL DEFAULT 600;
ALTER TABLE work_settings ADD COLUMN min_rest_minutes INTEGER NOT NULL DEFAULT 660;
