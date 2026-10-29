-- Keep the translation and the generated audio so projects can be reopened, replayed and downloaded
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS translated_text TEXT,
  ADD COLUMN IF NOT EXISTS output_audio_path TEXT;
