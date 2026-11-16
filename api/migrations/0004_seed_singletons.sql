-- Singleton rows the original Supabase migrations inserted (functions read them by id = 1).
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.telegram_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.engine_params (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
