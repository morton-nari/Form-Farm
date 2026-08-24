create table developer_credentials (
  id uuid primary key,
  user_id uuid not null,
  secret_hash text not null,
  display_name text not null,
  scope text not null default 'form-intelligence:read',
  environment text not null default 'development',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint developer_credentials_user_id_fk foreign key (user_id) references users (id)
    on delete restrict on update restrict,
  constraint developer_credentials_secret_hash_check check (secret_hash ~ '^[0-9a-f]{64}$'),
  constraint developer_credentials_display_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
  ),
  constraint developer_credentials_scope_check check (scope = 'form-intelligence:read'),
  constraint developer_credentials_environment_check check (environment = 'development'),
  constraint developer_credentials_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint developer_credentials_revoked_at_check check (
    revoked_at is null or revoked_at >= created_at
  ),
  constraint developer_credentials_last_used_at_check check (
    last_used_at is null or last_used_at >= created_at
  )
);

create unique index developer_credentials_secret_hash_uidx
  on developer_credentials (secret_hash);
create index developer_credentials_user_created_idx
  on developer_credentials (user_id, created_at desc, id asc);
create index developer_credentials_user_active_idx
  on developer_credentials (user_id, expires_at)
  where revoked_at is null;
create index developer_credentials_cleanup_idx
  on developer_credentials ((coalesce(revoked_at, expires_at)));
