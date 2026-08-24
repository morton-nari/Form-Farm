import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';

import type { AuthenticatedActor } from '../application/ports/create-form-draft-transaction.js';
import type {
  AnalyzeDraftChangeImpact,
  CompareFormVersions,
  InspectForm,
} from '../application/forms/form-intelligence.js';

export const FORM_FARM_MCP_SERVER_NAME = 'form-farm';
export const FORM_FARM_MCP_SERVER_VERSION = '1.0.0';
export const FORM_FARM_MCP_PROTOCOL_VERSION = '2025-11-25';
export const MAXIMUM_MCP_CHANGE_SET_BYTES = 64 * 1024;
export const MCP_TOOL_TIMEOUT_MILLISECONDS = 10_000;

const identifier = z.string().regex(new RegExp(FORM_IDENTIFIER_PATTERN)).max(100);
const positiveInteger = z.number().int().positive();
const nonnegativeInteger = z.number().int().nonnegative();
const nullablePositiveInteger = positiveInteger.nullable();
const fieldType = z.enum([
  'text',
  'email',
  'password',
  'tel',
  'url',
  'textarea',
  'number',
  'date',
  'datetime',
  'time',
  'select',
  'radio',
  'multi-select',
  'checkbox',
  'checkbox-group',
]);
const fieldTypes = z.strictObject(
  Object.fromEntries(fieldType.options.map((type) => [type, nonnegativeInteger])) as {
    [K in (typeof fieldType.options)[number]]: typeof nonnegativeInteger;
  },
);
const definitionSummary = z.strictObject({
  formVersion: positiveInteger,
  schemaVersion: positiveInteger,
  sectionCount: nonnegativeInteger,
  fieldCount: nonnegativeInteger,
  validationRuleCount: nonnegativeInteger,
  fieldTypes,
});
const inspectionOutput = z.strictObject({
  formId: identifier,
  status: z.enum(['draft', 'published', 'archived']),
  latestVersion: nonnegativeInteger,
  currentPublishedVersion: nullablePositiveInteger,
  draftRevision: nullablePositiveInteger,
  draft: definitionSummary.nullable(),
  published: definitionSummary.nullable(),
});

const changeKind = z.enum(['added', 'removed', 'valueChanged']);
const semanticChange = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('formPresentationChanged'),
    property: z.enum(['title', 'description']),
  }),
  z.strictObject({
    type: z.literal('submissionPresentationChanged'),
    property: z.enum(['submitLabel', 'successMessage']),
  }),
  z.strictObject({
    type: z.literal('sectionAdded'),
    sectionId: identifier,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionRemoved'),
    sectionId: identifier,
    fromIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionMoved'),
    sectionId: identifier,
    fromIndex: nonnegativeInteger,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionPresentationChanged'),
    sectionId: identifier,
    property: z.enum(['title', 'description']),
  }),
  z.strictObject({
    type: z.literal('fieldAdded'),
    fieldId: identifier,
    fieldType,
    toSectionId: identifier,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldRemoved'),
    fieldId: identifier,
    fieldType,
    fromSectionId: identifier,
    fromIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldMoved'),
    fieldId: identifier,
    fromSectionId: identifier,
    toSectionId: identifier,
    fromIndex: nonnegativeInteger,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldTypeChanged'),
    fieldId: identifier,
    fromFieldType: fieldType,
    toFieldType: fieldType,
  }),
  z.strictObject({
    type: z.literal('fieldPresentationChanged'),
    fieldId: identifier,
    property: z.enum(['label', 'helpText', 'placeholder', 'autocomplete', 'rows']),
  }),
  z.strictObject({
    type: z.literal('fieldDefaultChanged'),
    fieldId: identifier,
    change: changeKind,
  }),
  z.strictObject({
    type: z.literal('fieldValidationChanged'),
    fieldId: identifier,
    ruleType: z.enum([
      'required',
      'minLength',
      'maxLength',
      'min',
      'max',
      'integer',
      'earliest',
      'latest',
      'minSelections',
      'maxSelections',
      'accepted',
    ]),
    change: changeKind,
  }),
  z.strictObject({
    type: z.literal('choiceOptionAdded'),
    fieldId: identifier,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionRemoved'),
    fieldId: identifier,
    fromIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionMoved'),
    fieldId: identifier,
    fromIndex: nonnegativeInteger,
    toIndex: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionPresentationChanged'),
    fieldId: identifier,
    optionIndex: nonnegativeInteger,
    property: z.enum(['label', 'disabled']),
  }),
]);
const semanticDiff = z.strictObject({
  diffVersion: z.literal(1),
  formId: identifier,
  fromFormVersion: positiveInteger,
  toFormVersion: positiveInteger,
  changes: z.array(semanticChange).max(1_000),
  totalChangeCount: nonnegativeInteger,
  truncated: z.boolean(),
});
const impactFinding = z.strictObject({
  code: z.enum([
    'presentation_changed',
    'submission_presentation_changed',
    'section_structure_changed',
    'section_presentation_changed',
    'field_added',
    'field_removed',
    'field_moved',
    'field_type_changed',
    'field_presentation_changed',
    'field_default_changed',
    'validation_added',
    'validation_removed',
    'validation_value_changed',
    'choice_option_added',
    'choice_option_removed',
    'choice_option_moved',
    'choice_option_presentation_changed',
  ]),
  risk: z.enum(['low', 'moderate', 'high']),
  classifications: z
    .array(
      z.enum([
        'presentation',
        'validation',
        'answer-contract',
        'structural',
        'potentially-destructive',
        'privacy-sensitive',
        'accessibility-sensitive',
        'compatibility',
      ]),
    )
    .max(8),
  changeCount: positiveInteger,
  explanation: z.string().max(500),
});
const impact = z.strictObject({
  impactVersion: z.literal(1),
  diffVersion: z.literal(1),
  formId: identifier,
  fromFormVersion: positiveInteger,
  toFormVersion: positiveInteger,
  analyzedChangeCount: nonnegativeInteger,
  risk: z.enum(['none', 'low', 'moderate', 'high']),
  classifications: z
    .array(
      z.enum([
        'presentation',
        'validation',
        'answer-contract',
        'structural',
        'potentially-destructive',
        'privacy-sensitive',
        'accessibility-sensitive',
        'compatibility',
      ]),
    )
    .max(8),
  findings: z.array(impactFinding).max(17),
  affectedSectionIds: z.array(identifier).max(200),
  affectedFieldIds: z.array(identifier).max(200),
  affectedIdentitiesTruncated: z.boolean(),
  historicalSubmissions: z.strictObject({
    status: z.literal('unaffected'),
    explanation: z.string().max(500),
  }),
  futureSubmissions: z.strictObject({
    answerContractChanged: z.boolean(),
    explanation: z.string().max(500),
  }),
  publication: z.strictObject({
    humanReviewRequired: z.boolean(),
    automaticPublicationAllowed: z.literal(false),
    explanation: z.string().max(500),
  }),
});
const impactOutput = z.strictObject({ draftRevision: positiveInteger, diff: semanticDiff, impact });

export interface FormFarmMcpServices {
  readonly authenticate: () => Promise<AuthenticatedActor | undefined>;
  readonly inspectForm: InspectForm;
  readonly compareFormVersions: CompareFormVersions;
  readonly analyzeDraftChangeImpact: AnalyzeDraftChangeImpact;
}

export function createFormFarmMcpServer(services: FormFarmMcpServices): McpServer {
  const server = new McpServer(
    { name: FORM_FARM_MCP_SERVER_NAME, version: FORM_FARM_MCP_SERVER_VERSION },
    {
      instructions:
        'Read-only local Form Farm intelligence. Tools never persist or publish form changes.',
      supportedProtocolVersions: [FORM_FARM_MCP_PROTOCOL_VERSION],
    },
  );

  server.registerTool(
    'inspect_form',
    {
      description: 'Inspect a bounded structural and lifecycle summary of one owned form.',
      inputSchema: z.strictObject({ formId: identifier }),
      outputSchema: inspectionOutput,
      annotations: readOnlyAnnotations('Inspect form'),
    },
    async ({ formId }, context) =>
      execute(services, context.mcpReq.signal, (actor) =>
        services.inspectForm.execute(actor, formId),
      ),
  );

  server.registerTool(
    'compare_form_versions',
    {
      description:
        'Compare two exact immutable versions of one owned form using deterministic semantic diffing.',
      inputSchema: z.strictObject({
        formId: identifier,
        fromVersion: positiveInteger,
        toVersion: positiveInteger,
      }),
      outputSchema: semanticDiff,
      annotations: readOnlyAnnotations('Compare form versions'),
    },
    async ({ formId, fromVersion, toVersion }, context) =>
      execute(services, context.mcpReq.signal, (actor) =>
        services.compareFormVersions.execute(actor, formId, fromVersion, toVersion),
      ),
  );

  server.registerTool(
    'impact_analysis',
    {
      description:
        'Apply a versioned controlled change set in memory and return deterministic diff and impact; never saves or publishes.',
      inputSchema: z.strictObject({ formId: identifier, proposedChangeSet: z.json() }),
      outputSchema: impactOutput,
      annotations: readOnlyAnnotations('Analyze form change impact'),
    },
    async ({ formId, proposedChangeSet }, context) => {
      if (
        Buffer.byteLength(JSON.stringify(proposedChangeSet), 'utf8') > MAXIMUM_MCP_CHANGE_SET_BYTES
      ) {
        return safeError('invalid_input');
      }
      return execute(services, context.mcpReq.signal, (actor) =>
        services.analyzeDraftChangeImpact.execute(actor, formId, proposedChangeSet),
      );
    },
  );
  return server;
}

async function execute<T extends object>(
  services: FormFarmMcpServices,
  signal: AbortSignal,
  operation: (actor: AuthenticatedActor) => Promise<T>,
): Promise<CallToolResult> {
  try {
    const actor = await boundReadOnlyResponseLifecycle(services.authenticate(), signal);
    if (!actor) return safeError('unauthenticated');
    const value = await boundReadOnlyResponseLifecycle(operation(actor), signal);
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  } catch (error) {
    return safeError(
      error instanceof Error && error.name === 'ApplicationError'
        ? 'request_failed'
        : 'internal_error',
    );
  }
}

/**
 * Bounds only the MCP response lifecycle. Existing application/database read ports do not accept an
 * AbortSignal, so their underlying work may finish after this promise rejects. This helper is safe only for
 * non-mutating operations and must never be reused for a write or publication path.
 */
export function boundReadOnlyResponseLifecycle<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMilliseconds = MCP_TOOL_TIMEOUT_MILLISECONDS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      complete();
    };
    const abort = () => finish(() => reject(new Error('MCP read response cancelled.')));
    const timeout = setTimeout(
      () => finish(() => reject(new Error('MCP read response timeout.'))),
      timeoutMilliseconds,
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function safeError(
  code: 'unauthenticated' | 'invalid_input' | 'request_failed' | 'internal_error',
): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code } }) }] };
}

function readOnlyAnnotations(title: string) {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
}
