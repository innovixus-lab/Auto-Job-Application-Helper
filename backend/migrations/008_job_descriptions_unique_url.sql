ALTER TABLE job_descriptions
  ADD CONSTRAINT job_descriptions_user_url_unique UNIQUE (user_id, source_url);
