
import React, { useState } from "react";
import "./AdvanceRestClientEditor.css";

type Pair = {
  headerKey: string;
  headerValue: string;
  type?: "text" | "file";
};

type Auth = {
  type: string;
  token: string;
  username: string;
  password: string;
};

export type RestConfig = {
  url: string;
  httpMethod: string;
  authorization: Auth;
  headers: Pair[];
  requestBody: {
    bodyType: string;
    bodyFormat: string;
    rawContent: string;
    formData: Pair[];
    graphQlQuery: string;
    graphQlVariables: string;
    urlEncoded: Pair[];
  };
  settings: {
    timeoutInSeconds: number;
    ignoreSslVerification: boolean;
  };
  responseFields: {
    responseStatus: string;
    responseTime: string;
    getResponseBody: string;
  };
  rowData: {
    test_case_id: string;
    environment: string;
  };
};

type Props = {
  value: RestConfig;
  onChange: (next: RestConfig) => void;
};

const tabs = [
  "Params",
  "Authorization",
  "Headers",
  "Body",
  "Settings",
  "Response"
] as const;

type Tab = (typeof tabs)[number];

function PairEditor({
  rows,
  onChange,
  allowFiles = false
}: {
  rows: Pair[];
  onChange: (rows: Pair[]) => void;
  allowFiles?: boolean;
}) {
  const update = (index: number, patch: Partial<Pair>) => {
    onChange(rows.map((r, i) =>
      i === index ? { ...r, ...patch } : r
    ));
  };

  return (
    <div className="rest-pairs">
      {rows.map((row, index) => (
        <div className="rest-pair" key={index}>
          <input
            placeholder="Key"
            value={row.headerKey}
            onChange={e =>
              update(index, { headerKey: e.target.value })
            }
          />

          <input
            placeholder="Value"
            value={row.headerValue}
            onChange={e =>
              update(index, { headerValue: e.target.value })
            }
          />

          {allowFiles && (
            <select
              value={row.type || "text"}
              onChange={e =>
                update(index, {
                  type: e.target.value as "text" | "file"
                })
              }
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
          )}

          <button
            type="button"
            onClick={() =>
              onChange(rows.filter((_, i) => i !== index))
            }
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="rest-add"
        onClick={() =>
          onChange([
            ...rows,
            {
              headerKey: "",
              headerValue: "",
              type: "text"
            }
          ])
        }
      >
        + Add Row
      </button>
    </div>
  );
}

export default function AdvanceRestClientEditor({
  value,
  onChange
}: Props) {
  const [tab, setTab] = useState<Tab>("Params");

  const update = (patch: Partial<RestConfig>) =>
    onChange({ ...value, ...patch });

  const updateBody = (
    patch: Partial<RestConfig["requestBody"]>
  ) =>
    update({
      requestBody: { ...value.requestBody, ...patch }
    });

  const updateAuth = (patch: Partial<Auth>) =>
    update({
      authorization: { ...value.authorization, ...patch }
    });

  const params = (() => {
    try {
      return Array.from(
        new URL(value.url).searchParams.entries()
      ).map(([headerKey, headerValue]) => ({
        headerKey,
        headerValue
      }));
    } catch {
      return [] as Pair[];
    }
  })();

  const updateParams = (rows: Pair[]) => {
    try {
      const url = new URL(value.url);
      url.search = "";

      rows.forEach(row => {
        if (row.headerKey.trim()) {
          url.searchParams.append(
            row.headerKey,
            row.headerValue
          );
        }
      });

      update({ url: url.toString() });
    } catch {
      // Enter a valid absolute URL before editing params.
    }
  };

  const body = value.requestBody;
  const method = value.httpMethod.toUpperCase();
  const showBody = !["GET", "HEAD"].includes(method);

  return (
    <div className="rest-editor">
      <div className="rest-heading">
        <strong>Advanced REST Client</strong>
        <span>HTTP Request Configuration</span>
      </div>

      <div className="rest-url-row">
        <select
          value={method}
          onChange={e =>
            update({ httpMethod: e.target.value })
          }
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map(
            m => <option key={m}>{m}</option>
          )}
        </select>

        <input
          value={value.url}
          placeholder="https://api.example.com/users"
          onChange={e => update({ url: e.target.value })}
        />
      </div>

      <div className="rest-tabs">
        {tabs.map(t => (
          <button
            type="button"
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rest-content">
        {tab === "Params" && (
          <>
            <h4>Query Parameters</h4>
            <PairEditor
              rows={params}
              onChange={updateParams}
            />
          </>
        )}

        {tab === "Authorization" && (
          <>
            <label>Authorization Type</label>
            <select
              value={value.authorization.type}
              onChange={e =>
                updateAuth({ type: e.target.value })
              }
            >
              <option>None</option>
              <option>Bearer Token</option>
              <option>Basic Auth</option>
            </select>

            {value.authorization.type ===
              "Bearer Token" && (
              <>
                <label>Bearer Token</label>
                <input
                  type="password"
                  value={value.authorization.token}
                  onChange={e =>
                    updateAuth({ token: e.target.value })
                  }
                />
              </>
            )}

            {value.authorization.type ===
              "Basic Auth" && (
              <>
                <label>Username</label>
                <input
                  value={value.authorization.username}
                  onChange={e =>
                    updateAuth({
                      username: e.target.value
                    })
                  }
                />

                <label>Password</label>
                <input
                  type="password"
                  value={value.authorization.password}
                  onChange={e =>
                    updateAuth({
                      password: e.target.value
                    })
                  }
                />
              </>
            )}
          </>
        )}

        {tab === "Headers" && (
          <>
            <h4>Request Headers</h4>
            <PairEditor
              rows={value.headers}
              onChange={headers => update({ headers })}
            />
          </>
        )}

        {tab === "Body" && (
          <>
            {!showBody ? (
              <p>
                No request body is required for GET.
              </p>
            ) : (
              <>
                <label>Body Type</label>
                <select
                  value={body.bodyType}
                  onChange={e =>
                    updateBody({
                      bodyType: e.target.value
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="JSON">Raw</option>
                  <option value="form-data">
                    Form Data
                  </option>
                  <option value="x-www-form-urlencoded">
                    x-www-form-urlencoded
                  </option>
                  <option value="GraphQL(Beta)">
                    GraphQL
                  </option>
                </select>

                {body.bodyType === "JSON" && (
                  <>
                    <label>Raw Format</label>
                    <select
                      value={body.bodyFormat}
                      onChange={e =>
                        updateBody({
                          bodyFormat: e.target.value
                        })
                      }
                    >
                      {["JSON", "XML", "HTML", "plain"].map(
                        f => <option key={f}>{f}</option>
                      )}
                    </select>

                    <label>Request Body</label>
                    <textarea
                      rows={10}
                      value={body.rawContent}
                      onChange={e =>
                        updateBody({
                          rawContent: e.target.value
                        })
                      }
                    />
                  </>
                )}

                {body.bodyType === "form-data" && (
                  <PairEditor
                    rows={body.formData}
                    allowFiles
                    onChange={formData =>
                      updateBody({ formData })
                    }
                  />
                )}

                {body.bodyType ===
                  "x-www-form-urlencoded" && (
                  <PairEditor
                    rows={body.urlEncoded}
                    onChange={urlEncoded =>
                      updateBody({ urlEncoded })
                    }
                  />
                )}

                {body.bodyType === "GraphQL(Beta)" && (
                  <>
                    <label>GraphQL Query</label>
                    <textarea
                      rows={7}
                      value={body.graphQlQuery}
                      onChange={e =>
                        updateBody({
                          graphQlQuery: e.target.value
                        })
                      }
                    />

                    <label>Variables (JSON)</label>
                    <textarea
                      rows={5}
                      value={body.graphQlVariables}
                      onChange={e =>
                        updateBody({
                          graphQlVariables: e.target.value
                        })
                      }
                    />
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === "Settings" && (
          <>
            <label>Timeout (seconds)</label>
            <input
              type="number"
              min={1}
              value={value.settings.timeoutInSeconds}
              onChange={e =>
                update({
                  settings: {
                    ...value.settings,
                    timeoutInSeconds:
                      Math.max(1, Number(e.target.value) || 1)
                  }
                })
              }
            />

            <label className="rest-checkbox">
              <input
                type="checkbox"
                checked={
                  value.settings.ignoreSslVerification
                }
                onChange={e =>
                  update({
                    settings: {
                      ...value.settings,
                      ignoreSslVerification:
                        e.target.checked
                    }
                  })
                }
              />
              Ignore SSL Verification
            </label>
            <small>
              Use SSL verification for production APIs.
            </small>
          </>
        )}

        {tab === "Response" && (
          <>
            {(
              [
                ["responseStatus", "Status Field"],
                ["responseTime", "Response Time Field"],
                ["getResponseBody", "Response Body Field"]
              ] as const
            ).map(([key, label]) => (
              <React.Fragment key={key}>
                <label>{label}</label>
                <input
                  value={value.responseFields[key]}
                  onChange={e =>
                    update({
                      responseFields: {
                        ...value.responseFields,
                        [key]: e.target.value
                      }
                    })
                  }
                />
              </React.Fragment>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
