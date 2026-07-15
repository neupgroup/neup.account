UPDATE "authz_permission"
SET
  "scope_for" = '["for_brand", "for_individual", "for_dependent", "for_subBrand"]'::json,
  "scope_level" = '["assignable", "publiclyEnrollable", "selfAssigned", "rootManaged", "publiclyRequestable", "requestableToOwner"]'::json,
  "approval_policy" = 'none'
WHERE
  "app_id" = 'neup.account'
  AND (
    "id" IN (
      'cap-appmanage-13-application-user-updatebasics',
      'cap-def-application-user-updatebasics'
    )
    OR "name" = 'application.user.updateBasics'
  );
