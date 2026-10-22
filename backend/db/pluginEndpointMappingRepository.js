'use strict';

const { query, withTransaction } = require('./pool');
const {
  compareRegistryToMappings,
  mappingSetFingerprint,
} = require('../lib/pluginRegistryNormalization');

function safeSchemaName(value) {
  const schema = String(value || 'autoflow').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Unsafe PostgreSQL schema name '${schema}'.`);
  }
  return schema;
}

function createPluginEndpointMappingRepository(options = {}) {
  const queryFn = options.queryFn || query;
  const transactionFn = options.transactionFn || withTransaction;
  const schema = safeSchemaName(options.schema || 'autoflow');

  async function listEngineVersionCountsWith(executor) {
    const result = await executor.query(
      `
        SELECT
          engine_version AS "engineVersion",
          count(*)::integer AS "mappingCount",
          count(*) FILTER (WHERE enabled = true AND deprecated = false)::integer
            AS "activeMappingCount",
          count(*) FILTER (WHERE schema_status = 'VERIFIED')::integer
            AS "verifiedSchemaCount",
          max(updated_at) AS "lastUpdatedAt"
        FROM ${schema}.plugin_endpoint_mapping
        GROUP BY engine_version
        ORDER BY engine_version
      `
    );
    return result.rows;
  }

  async function listMappingsWith(executor, engineVersion) {
    const result = await executor.query(
      `
        SELECT
          id::text AS id,
          engine_version AS "engineVersion",
          engine_context_path AS "engineContextPath",
          plugin_id AS "pluginId",
          plugin_name AS "pluginName",
          category,
          action_id AS "actionId",
          action_name AS "actionName",
          http_method AS "httpMethod",
          canonical_path AS "canonicalPath",
          legacy_path AS "legacyPath",
          request_content_types AS "requestContentTypes",
          response_content_types AS "responseContentTypes",
          body_type AS "bodyType",
          schema_status AS "schemaStatus",
          input_schema_json AS "inputSchemaJson",
          output_schema_json AS "outputSchemaJson",
          response_contract_version AS "responseContractVersion",
          authentication_type AS "authenticationType",
          artifact_behavior AS "artifactBehavior",
          timeout_ms AS "timeoutMs",
          retry_policy_json AS "retryPolicyJson",
          enabled,
          deprecated,
          source_registry_sha256 AS "sourceRegistrySha256",
          metadata,
          row_version AS "rowVersion",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM ${schema}.plugin_endpoint_mapping
        WHERE engine_version = $1
        ORDER BY plugin_id, action_id
      `,
      [engineVersion]
    );
    return result.rows;
  }

  async function listEngineVersionCounts() {
    return listEngineVersionCountsWith({ query: queryFn });
  }

  async function listMappings(engineVersion) {
    return listMappingsWith({ query: queryFn }, engineVersion);
  }

  async function inspect(engineVersion) {
    const [versionCounts, mappings] = await Promise.all([
      listEngineVersionCounts(),
      listMappings(engineVersion),
    ]);
    return {
      schema,
      table: `${schema}.plugin_endpoint_mapping`,
      versionCounts,
      mappings,
      fingerprint: mappingSetFingerprint(mappings),
    };
  }

  async function insertDesired(client, record) {
    const result = await client.query(
      `
        INSERT INTO ${schema}.plugin_endpoint_mapping (
          engine_version,
          engine_context_path,
          plugin_id,
          plugin_name,
          category,
          action_id,
          action_name,
          http_method,
          canonical_path,
          legacy_path,
          request_content_types,
          response_content_types,
          body_type,
          schema_status,
          input_schema_json,
          output_schema_json,
          response_contract_version,
          authentication_type,
          artifact_behavior,
          timeout_ms,
          retry_policy_json,
          enabled,
          deprecated,
          source_registry_sha256,
          metadata
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,
          $15::jsonb,$16::jsonb,$17,$18,$19,$20,$21::jsonb,$22,$23,$24,$25::jsonb
        )
      `,
      [
        record.engineVersion,
        record.engineContextPath,
        record.pluginId,
        record.pluginName,
        record.category,
        record.actionId,
        record.actionName,
        record.httpMethod,
        record.canonicalPath,
        record.legacyPath,
        JSON.stringify(record.requestContentTypes),
        JSON.stringify(record.responseContentTypes),
        record.bodyType,
        record.schemaStatus,
        JSON.stringify(record.inputSchemaJson),
        JSON.stringify(record.outputSchemaJson),
        record.responseContractVersion,
        record.authenticationType,
        record.artifactBehavior,
        record.timeoutMs,
        JSON.stringify(record.retryPolicyJson),
        record.enabled,
        record.deprecated,
        record.sourceRegistrySha256,
        JSON.stringify(record.metadata),
      ]
    );
    return result.rowCount;
  }

  async function updateDesired(client, record) {
    const result = await client.query(
      `
        UPDATE ${schema}.plugin_endpoint_mapping
        SET
          engine_context_path = $4,
          plugin_name = $5,
          category = $6,
          action_name = $7,
          http_method = $8,
          canonical_path = $9,
          legacy_path = $10,
          request_content_types = $11::jsonb,
          response_content_types = $12::jsonb,
          body_type = $13,
          schema_status = $14,
          input_schema_json = $15::jsonb,
          output_schema_json = $16::jsonb,
          response_contract_version = $17,
          authentication_type = $18,
          artifact_behavior = $19,
          timeout_ms = $20,
          retry_policy_json = $21::jsonb,
          enabled = $22,
          deprecated = $23,
          source_registry_sha256 = $24,
          metadata = $25::jsonb
        WHERE engine_version = $1
          AND plugin_id = $2
          AND action_id = $3
      `,
      [
        record.engineVersion,
        record.pluginId,
        record.actionId,
        record.engineContextPath,
        record.pluginName,
        record.category,
        record.actionName,
        record.httpMethod,
        record.canonicalPath,
        record.legacyPath,
        JSON.stringify(record.requestContentTypes),
        JSON.stringify(record.responseContentTypes),
        record.bodyType,
        record.schemaStatus,
        JSON.stringify(record.inputSchemaJson),
        JSON.stringify(record.outputSchemaJson),
        record.responseContractVersion,
        record.authenticationType,
        record.artifactBehavior,
        record.timeoutMs,
        JSON.stringify(record.retryPolicyJson),
        record.enabled,
        record.deprecated,
        record.sourceRegistrySha256,
        JSON.stringify(record.metadata),
      ]
    );
    return result.rowCount;
  }

  async function updateProvenance(client, record) {
    const result = await client.query(
      `
        UPDATE ${schema}.plugin_endpoint_mapping
        SET source_registry_sha256 = $4
        WHERE engine_version = $1
          AND plugin_id = $2
          AND action_id = $3
      `,
      [
        record.engineVersion,
        record.pluginId,
        record.actionId,
        record.sourceRegistrySha256,
      ]
    );
    return result.rowCount;
  }

  async function retireMapping(client, existing, batchId) {
    const retirement = {
      registryRetiredAt: new Date().toISOString(),
      registryRetirementBatchId: batchId,
      registryRetiredBy: 'phase4b2-cli',
    };
    const result = await client.query(
      `
        UPDATE ${schema}.plugin_endpoint_mapping
        SET
          enabled = false,
          deprecated = true,
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
        WHERE engine_version = $1
          AND plugin_id = $2
          AND action_id = $3
      `,
      [
        existing.engineVersion,
        existing.pluginId,
        existing.actionId,
        JSON.stringify(retirement),
      ]
    );
    return result.rowCount;
  }

  async function insertRaw(client, row) {
    await client.query(
      `
        INSERT INTO ${schema}.plugin_endpoint_mapping (
          id,
          engine_version,
          engine_context_path,
          plugin_id,
          plugin_name,
          category,
          action_id,
          action_name,
          http_method,
          canonical_path,
          legacy_path,
          request_content_types,
          response_content_types,
          body_type,
          schema_status,
          input_schema_json,
          output_schema_json,
          response_contract_version,
          authentication_type,
          artifact_behavior,
          timeout_ms,
          retry_policy_json,
          enabled,
          deprecated,
          source_registry_sha256,
          metadata,
          row_version,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,
          $15,$16::jsonb,$17::jsonb,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,
          $26::jsonb,$27,$28::timestamptz,$29::timestamptz
        )
      `,
      [
        row.id,
        row.engineVersion,
        row.engineContextPath,
        row.pluginId,
        row.pluginName,
        row.category,
        row.actionId,
        row.actionName,
        row.httpMethod,
        row.canonicalPath,
        row.legacyPath,
        JSON.stringify(row.requestContentTypes || []),
        JSON.stringify(row.responseContentTypes || []),
        row.bodyType,
        row.schemaStatus,
        JSON.stringify(row.inputSchemaJson || {}),
        JSON.stringify(row.outputSchemaJson || {}),
        row.responseContractVersion,
        row.authenticationType,
        row.artifactBehavior,
        row.timeoutMs,
        JSON.stringify(row.retryPolicyJson || {}),
        row.enabled !== false,
        Boolean(row.deprecated),
        row.sourceRegistrySha256 || null,
        JSON.stringify(row.metadata || {}),
        Number(row.rowVersion || 0),
        row.createdAt,
        row.updatedAt,
      ]
    );
  }

  async function readMappings(input = {}) {
    const engineVersion = String(input.engineVersion || '').trim();
    if (!engineVersion) {
      throw new TypeError('readMappings requires engineVersion.');
    }
    const pluginId = input.pluginId ? String(input.pluginId).trim() : null;
    const search = String(input.search || '').trim();
    const includeDeprecated = Boolean(input.includeDeprecated);
    const limit = Math.min(2000, Math.max(1, Number(input.limit) || 500));
    const offset = Math.max(0, Number(input.offset) || 0);
    const params = [engineVersion, pluginId, includeDeprecated, search];

    const [countResult, mappingResult] = await Promise.all([
      queryFn(
        `
          SELECT
            count(*)::integer AS "totalMappings",
            count(*) FILTER (WHERE enabled = true AND deprecated = false)::integer
              AS "activeMappings",
            count(*) FILTER (WHERE schema_status = 'VERIFIED')::integer
              AS "verifiedSchemas",
            count(*) FILTER (WHERE schema_status = 'PLACEHOLDER')::integer
              AS "placeholderSchemas"
          FROM ${schema}.plugin_endpoint_mapping
          WHERE engine_version = $1
            AND ($2::text IS NULL OR plugin_id = $2)
            AND ($3::boolean = true OR deprecated = false)
            AND (
              $4::text = '' OR
              plugin_id ILIKE '%' || $4 || '%' OR
              plugin_name ILIKE '%' || $4 || '%' OR
              action_id ILIKE '%' || $4 || '%' OR
              action_name ILIKE '%' || $4 || '%' OR
              canonical_path ILIKE '%' || $4 || '%'
            )
        `,
        params
      ),
      queryFn(
        `
          SELECT
            engine_version AS "engineVersion",
            engine_context_path AS "engineContextPath",
            plugin_id AS "pluginId",
            plugin_name AS "pluginName",
            category,
            action_id AS "actionId",
            action_name AS "actionName",
            http_method AS "httpMethod",
            canonical_path AS "canonicalPath",
            legacy_path AS "legacyPath",
            request_content_types AS "requestContentTypes",
            response_content_types AS "responseContentTypes",
            body_type AS "bodyType",
            schema_status AS "schemaStatus",
            response_contract_version AS "responseContractVersion",
            authentication_type AS "authenticationType",
            artifact_behavior AS "artifactBehavior",
            timeout_ms AS "timeoutMs",
            enabled,
            deprecated,
            metadata,
            updated_at AS "updatedAt"
          FROM ${schema}.plugin_endpoint_mapping
          WHERE engine_version = $1
            AND ($2::text IS NULL OR plugin_id = $2)
            AND ($3::boolean = true OR deprecated = false)
            AND (
              $4::text = '' OR
              plugin_id ILIKE '%' || $4 || '%' OR
              plugin_name ILIKE '%' || $4 || '%' OR
              action_id ILIKE '%' || $4 || '%' OR
              action_name ILIKE '%' || $4 || '%' OR
              canonical_path ILIKE '%' || $4 || '%'
            )
          ORDER BY plugin_id, action_id
          LIMIT $5 OFFSET $6
        `,
        [...params, limit, offset]
      ),
    ]);

    const counts = countResult.rows[0] || {};
    const totalMappings = Number(counts.totalMappings || 0);
    const mappings = mappingResult.rows;
    return {
      schema,
      table: `${schema}.plugin_endpoint_mapping`,
      engineVersion,
      coverage: {
        totalMappings,
        activeMappings: Number(counts.activeMappings || 0),
        verifiedSchemas: Number(counts.verifiedSchemas || 0),
        placeholderSchemas: Number(counts.placeholderSchemas || 0),
        returnedMappings: mappings.length,
        hasMore: offset + mappings.length < totalMappings,
      },
      mappings,
    };
  }

  async function applyRegistrySnapshot(input) {
    const {
      engineVersion,
      desiredRecords,
      expectedDatabaseFingerprint,
      retireMissing = true,
      batchId,
    } = input;

    return transactionFn(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`autoflow.plugin_endpoint_mapping:${engineVersion}`]
      );

      const beforeRows = await listMappingsWith(client, engineVersion);
      const beforeFingerprint = mappingSetFingerprint(beforeRows);
      if (beforeFingerprint !== expectedDatabaseFingerprint) {
        const error = new Error(
          'plugin_endpoint_mapping changed after the dry-run plan was created. Create a fresh plan before applying.'
        );
        error.code = 'PLUGIN_ENDPOINT_MAPPING_STALE_PLAN';
        error.details = {
          expectedDatabaseFingerprint,
          actualDatabaseFingerprint: beforeFingerprint,
        };
        throw error;
      }

      const comparison = compareRegistryToMappings(desiredRecords, beforeRows);
      if (!retireMissing && comparison.retired.length > 0) {
        const error = new Error(
          `${comparison.retired.length} mapping(s) are missing from the live registry and retirement is disabled.`
        );
        error.code = 'PLUGIN_ENDPOINT_MAPPING_RETIREMENT_REQUIRED';
        throw error;
      }

      let inserted = 0;
      let updated = 0;
      let provenanceUpdated = 0;
      let retired = 0;

      for (const change of comparison.added) {
        inserted += await insertDesired(client, change.desired);
      }
      for (const change of comparison.changed) {
        updated += await updateDesired(client, change.desired);
      }
      for (const change of comparison.provenanceOnly) {
        const desired = desiredRecords.find(
          (record) =>
            record.engineVersion === change.engineVersion &&
            record.pluginId === change.pluginId &&
            record.actionId === change.actionId
        );
        provenanceUpdated += await updateProvenance(client, desired);
      }
      if (retireMissing) {
        for (const change of comparison.retired) {
          retired += await retireMapping(client, change.existing, batchId);
        }
      }

      const afterRows = await listMappingsWith(client, engineVersion);
      const afterComparison = compareRegistryToMappings(desiredRecords, afterRows);
      const afterProblems = {
        added: afterComparison.added.length,
        changed: afterComparison.changed.length,
        provenanceOnly: afterComparison.provenanceOnly.length,
        retired: afterComparison.retired.length,
      };
      if (Object.values(afterProblems).some((count) => count !== 0)) {
        const error = new Error(
          `Post-apply verification failed: ${JSON.stringify(afterProblems)}`
        );
        error.code = 'PLUGIN_ENDPOINT_MAPPING_POST_APPLY_VERIFICATION_FAILED';
        error.details = afterProblems;
        throw error;
      }

      return {
        engineVersion,
        batchId,
        beforeRows,
        beforeFingerprint,
        afterRows,
        afterFingerprint: mappingSetFingerprint(afterRows),
        comparisonBefore: comparison.summary,
        writes: {
          inserted,
          updated,
          provenanceUpdated,
          retired,
          total: inserted + updated + provenanceUpdated + retired,
        },
        verification: {
          activeDesiredMappings: desiredRecords.length,
          totalEngineVersionMappings: afterRows.length,
          remainingDifferences: afterProblems,
        },
      };
    });
  }

  async function replaceEngineVersionSnapshot(input) {
    const { engineVersion, rows, batchId } = input;
    return transactionFn(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`autoflow.plugin_endpoint_mapping:${engineVersion}`]
      );
      const beforeRows = await listMappingsWith(client, engineVersion);
      await client.query(
        `DELETE FROM ${schema}.plugin_endpoint_mapping WHERE engine_version = $1`,
        [engineVersion]
      );
      for (const row of rows) {
        await insertRaw(client, row);
      }
      const afterRows = await listMappingsWith(client, engineVersion);
      const expectedFingerprint = mappingSetFingerprint(rows);
      const actualFingerprint = mappingSetFingerprint(afterRows);
      if (actualFingerprint !== expectedFingerprint) {
        const error = new Error('Rollback snapshot verification failed.');
        error.code = 'PLUGIN_ENDPOINT_MAPPING_ROLLBACK_VERIFICATION_FAILED';
        error.details = { expectedFingerprint, actualFingerprint };
        throw error;
      }
      return {
        engineVersion,
        batchId,
        deleted: beforeRows.length,
        restored: afterRows.length,
        expectedFingerprint,
        actualFingerprint,
      };
    });
  }

  return {
    schema,
    listEngineVersionCounts,
    listMappings,
    inspect,
    readMappings,
    applyRegistrySnapshot,
    replaceEngineVersionSnapshot,
  };
}

module.exports = {
  safeSchemaName,
  createPluginEndpointMappingRepository,
};
