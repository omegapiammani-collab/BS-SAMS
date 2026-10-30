ALTER TABLE audit ADD COLUMN actor_username TEXT;
CREATE INDEX audit_action_page ON audit(action,id DESC);
CREATE INDEX audit_date_page ON audit(created_at,id DESC);
CREATE INDEX audit_target_page ON audit(target,id DESC);
