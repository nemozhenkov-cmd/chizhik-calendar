# Развёртывание базы

На проекте saeywokxwhrvfrwdrmjx схема уже применена и проверена.

Для другого нового проекта выполните по порядку: schema.sql → statsMigration.sql → policyMigration.sql → anonMigration.sql.

Эти файлы — последовательные установочные снимки. Для повторного применения к уже настроенной базе они не предназначены. Реальная история миграций сохранена в Supabase.

Функция visit: deploy supabase/functions/visit/index.ts с включённой проверкой JWT; в исходнике обновить допустимый origin при смене домена. Никаких bootstrap-функций и скрытого входа администратора нет.

Уведомления: после основной схемы применены `push-setup.sql` и `push-scheduler.sql`; функция `calendar-push` развёрнута с проверкой JWT. pg_cron включён; pg_net установлен в `extensions`. Закрытые таблицы подписок и ключей не выданы ролям anon/authenticated. Исходники не содержат private VAPID key или worker-token. Чужие приложения Supabase не менялись.

Проверка advisors не выявила новых замечаний безопасности для уведомлений. Сохраняется ранее существовавшая рекомендация Auth: [защита от скомпрометированных паролей](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) отключена; настройка вне объёма этого изменения.
