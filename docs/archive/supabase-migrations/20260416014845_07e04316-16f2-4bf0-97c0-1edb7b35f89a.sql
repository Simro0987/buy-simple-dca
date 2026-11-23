
CREATE TABLE IF NOT EXISTS telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO telegram_bot_state (id, update_offset) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS telegram_callback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  callback_data text NOT NULL,
  action_type text NOT NULL,
  token text,
  profit_pct numeric,
  chat_id bigint NOT NULL,
  message_id bigint,
  status text NOT NULL DEFAULT 'processed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_callback_log_action ON telegram_callback_log (action_type);
CREATE INDEX idx_callback_log_token ON telegram_callback_log (token);

ALTER TABLE telegram_bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_callback_log ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_callback_log;
