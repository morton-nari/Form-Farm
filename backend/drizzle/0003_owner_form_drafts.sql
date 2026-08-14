create table form_drafts (
  form_id text primary key,
  definition jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_drafts_form_id_fk foreign key (form_id) references forms (id)
    on delete restrict on update restrict,
  constraint form_drafts_revision_check check (revision between 1 and 9007199254740991),
  constraint form_drafts_definition_object_check check (jsonb_typeof(definition) = 'object'),
  constraint form_drafts_definition_identity_check check (
    definition->>'id' = form_id
    and (definition->>'schemaVersion')::integer > 0
    and (definition->>'formVersion')::integer > 0
  )
);

create index form_drafts_updated_at_idx on form_drafts (updated_at desc, form_id asc);
