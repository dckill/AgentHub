-- Retire product surfaces that are outside the current Claude Code/Codex scope.
-- Fail closed when legacy rows exist so deployment cannot silently destroy data.
DO $$
DECLARE
    has_rows BOOLEAN;
BEGIN
    IF to_regclass('"UserRelationship"') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM "UserRelationship" LIMIT 1)' INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION 'UserRelationship contains data; export or explicitly resolve it before applying this migration';
        END IF;
    END IF;

    IF to_regclass('"UserFeedItem"') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM "UserFeedItem" LIMIT 1)' INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION 'UserFeedItem contains data; export or explicitly resolve it before applying this migration';
        END IF;
    END IF;

    IF to_regclass('"VoiceConversation"') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM "VoiceConversation" LIMIT 1)' INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION 'VoiceConversation contains data; export or explicitly resolve it before applying this migration';
        END IF;
    END IF;
END $$;

DROP TABLE IF EXISTS "UserRelationship";
DROP TABLE IF EXISTS "UserFeedItem";
DROP TABLE IF EXISTS "VoiceConversation";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "feedSeq";
DROP TYPE IF EXISTS "RelationshipStatus";
