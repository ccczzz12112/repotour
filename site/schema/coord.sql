-- RepoTour 模型资源协调器租约表（经站点数据库迁移流程提交，不打进 Function ZIP）
CREATE TABLE app.coord (
  key text PRIMARY KEY,
  version integer NOT NULL DEFAULT 0,
  holder text NOT NULL DEFAULT '',
  expires_at bigint NOT NULL DEFAULT 0,
  value text
);