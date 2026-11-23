-- Allow public to read and delete callback log entries (no auth in this app)
CREATE POLICY "Public can read callback log"
  ON public.telegram_callback_log FOR SELECT
  USING (true);

CREATE POLICY "Public can delete callback log"
  ON public.telegram_callback_log FOR DELETE
  USING (true);