alter table auth_rate_limits drop constraint auth_rate_limits_scope_check;
alter table auth_rate_limits add constraint auth_rate_limits_scope_check check (
  scope in (
    'registration-source',
    'registration-account',
    'login-source',
    'login-account',
    'developer-credential-source',
    'developer-credential-actor',
    'developer-credential-authentication'
  )
);
