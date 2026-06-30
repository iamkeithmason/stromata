-- Author draft state: pipeline-created stubs that haven't been reviewed yet.
-- Draft authors are hidden from the public site until promoted to non-draft.
ALTER TABLE authors
  ADD COLUMN draft BOOLEAN NOT NULL DEFAULT false;
