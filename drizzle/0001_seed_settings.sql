-- Fila única de `settings` (id = 1); `db:reset` y los tests la conservan.
INSERT INTO "settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
