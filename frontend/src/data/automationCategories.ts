import { AutomationCategory } from '../types/workflow';

export const automationCategories: AutomationCategory[] = [
  {
    "id": "workflow-control-001",
    "name": "Workflow Control",
    "icon": "Workflow",
    "color": "bg-slate-500",
    "description": "Start, end, loop, break, and continue controls for workflow execution.",
    "metadata": {
      "tags": [
        "workflow-control",
        "start",
        "end",
        "loop",
        "foreach",
        "while"
      ],
      "featured": true,
      "popularityScore": 100,
      "order": 10,
      "group": "Workflow Control"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "workflow-start",
        "category": "workflow-control-001",
        "name": "Start",
        "description": "Workflow starting node",
        "icon": "PlayCircle",
        "logo": "start.png",
        "color": "bg-emerald-500",
        "tags": [
          "start",
          "entry",
          "begin"
        ],
        "complexity": "basic",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "api": undefined,
        "properties": {},
        "propertyConfig": {}
      },
      {
        "type": "workflow-end",
        "category": "workflow-control-001",
        "name": "End",
        "description": "Workflow ending node",
        "icon": "Flag",
        "logo": "end.png",
        "color": "bg-rose-500",
        "tags": [
          "end",
          "finish",
          "stop"
        ],
        "complexity": "basic",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "api": undefined,
        "properties": {},
        "propertyConfig": {}
      },
      {
        "type": "workflow-for-each",
        "category": "workflow-control-001",
        "name": "For Each",
        "description": "Execute the connected Body path once for every item in an array, dataset, or object collection.",
        "icon": "Repeat2",
        "logo": "for_each.png",
        "color": "bg-indigo-500",
        "tags": ["loop", "foreach", "collection", "iterate"],
        "complexity": "intermediate",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "executionMode": "passthrough",
        "availability": { "state": "available" },
        "api": undefined,
        "properties": {
          "collection": "",
          "maxIterations": 10000
        },
        "propertyConfig": {
          "collection": {
            "type": "string",
            "label": "Collection",
            "required": true,
            "uiType": "textarea",
            "placeholder": "Bind an array/dataset, e.g. {{previous.rows}}",
            "description": "Array, dataset rows/data, object, JSON array, or binding to an upstream collection.",
            "group": "Loop"
          },
          "maxIterations": {
            "type": "number",
            "label": "Maximum Iterations",
            "required": true,
            "uiType": "input",
            "description": "Safety guard. V1 allows 1 to 10,000 iterations.",
            "group": "Safety"
          }
        },
        "outputSchema": {
          "version": "1.0",
          "fields": [
            { "path": "currentItem", "label": "Current Item", "kind": "any", "visibility": "primary" },
            { "path": "currentIndex", "label": "Current Index", "kind": "number", "visibility": "primary" },
            { "path": "currentKey", "label": "Current Key", "kind": "any", "visibility": "secondary", "optional": true },
            { "path": "iteration", "label": "Iteration", "kind": "number", "visibility": "primary" },
            { "path": "total", "label": "Total Items", "kind": "number", "visibility": "secondary" },
            { "path": "results", "label": "Iteration Results", "kind": "array", "visibility": "secondary" },
            { "path": "done", "label": "Loop Completed", "kind": "boolean", "visibility": "secondary" }
          ]
        },
        "outputPorts": [
          { "id": "body", "label": "Body", "payloadPath": "body", "kind": "any", "isDefault": true, "tone": "primary" },
          { "id": "done", "label": "Done", "payloadPath": "results", "kind": "array", "optional": true, "tone": "neutral" }
        ]
      },
      {
        "type": "workflow-while",
        "category": "workflow-control-001",
        "name": "While",
        "description": "Execute the Body path while a safe workflow expression evaluates true.",
        "icon": "RefreshCw",
        "logo": "while.png",
        "color": "bg-cyan-500",
        "tags": ["loop", "while", "condition", "iterate"],
        "complexity": "intermediate",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "executionMode": "passthrough",
        "availability": { "state": "available" },
        "api": undefined,
        "properties": {
          "condition": "",
          "maxIterations": 1000
        },
        "propertyConfig": {
          "condition": {
            "type": "string",
            "label": "Condition",
            "required": true,
            "uiType": "textarea",
            "placeholder": "{{iteration}} <= 10",
            "description": "Safe expression evaluated before each iteration. Supports comparisons, contains, startsWith and endsWith.",
            "group": "Loop"
          },
          "maxIterations": {
            "type": "number",
            "label": "Maximum Iterations",
            "required": true,
            "uiType": "input",
            "description": "Hard safety guard against an infinite loop (1 to 10,000).",
            "group": "Safety"
          }
        },
        "outputSchema": {
          "version": "1.0",
          "fields": [
            { "path": "iteration", "label": "Iteration", "kind": "number", "visibility": "primary" },
            { "path": "results", "label": "Iteration Results", "kind": "array", "visibility": "secondary" },
            { "path": "done", "label": "Loop Completed", "kind": "boolean", "visibility": "secondary" }
          ]
        },
        "outputPorts": [
          { "id": "body", "label": "Body", "payloadPath": "body", "kind": "any", "isDefault": true, "tone": "primary" },
          { "id": "done", "label": "Done", "payloadPath": "results", "kind": "array", "optional": true, "tone": "neutral" }
        ]
      },
      {
        "type": "workflow-repeat-until",
        "category": "workflow-control-001",
        "name": "Repeat Until",
        "description": "Execute the Body path at least once, then repeat until a safe workflow expression evaluates true.",
        "icon": "RotateCcw",
        "logo": "repeat_until.png",
        "color": "bg-violet-500",
        "tags": ["loop", "repeat", "until", "condition"],
        "complexity": "intermediate",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "executionMode": "passthrough",
        "availability": { "state": "available" },
        "api": undefined,
        "properties": {
          "condition": "",
          "maxIterations": 1000
        },
        "propertyConfig": {
          "condition": {
            "type": "string",
            "label": "Until Condition",
            "required": true,
            "uiType": "textarea",
            "placeholder": "{{previous.status}} === 'DONE'",
            "description": "Evaluated after the Body completes. The loop stops when this becomes true.",
            "group": "Loop"
          },
          "maxIterations": {
            "type": "number",
            "label": "Maximum Iterations",
            "required": true,
            "uiType": "input",
            "description": "Hard safety guard against an infinite loop (1 to 10,000).",
            "group": "Safety"
          }
        },
        "outputSchema": {
          "version": "1.0",
          "fields": [
            { "path": "iteration", "label": "Iteration", "kind": "number", "visibility": "primary" },
            { "path": "results", "label": "Iteration Results", "kind": "array", "visibility": "secondary" },
            { "path": "done", "label": "Loop Completed", "kind": "boolean", "visibility": "secondary" }
          ]
        },
        "outputPorts": [
          { "id": "body", "label": "Body", "payloadPath": "body", "kind": "any", "isDefault": true, "tone": "primary" },
          { "id": "done", "label": "Done", "payloadPath": "results", "kind": "array", "optional": true, "tone": "neutral" }
        ]
      },
      {
        "type": "workflow-break",
        "category": "workflow-control-001",
        "name": "Break",
        "description": "Exit the innermost active loop immediately and continue from that loop's Done path.",
        "icon": "CircleStop",
        "logo": "break.png",
        "color": "bg-amber-500",
        "tags": ["loop", "break", "exit-loop"],
        "complexity": "basic",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "executionMode": "passthrough",
        "availability": { "state": "available" },
        "api": undefined,
        "properties": {},
        "propertyConfig": {},
        "outputSchema": {
          "version": "1.0",
          "fields": [
            { "path": "signal", "label": "Signal", "kind": "string", "visibility": "primary" },
            { "path": "loopNodeId", "label": "Loop Node Id", "kind": "string", "visibility": "technical" }
          ]
        }
      },
      {
        "type": "workflow-continue",
        "category": "workflow-control-001",
        "name": "Continue",
        "description": "Skip the rest of the current iteration and advance the innermost active loop.",
        "icon": "SkipForward",
        "logo": "continue.png",
        "color": "bg-sky-500",
        "tags": ["loop", "continue", "next-iteration"],
        "complexity": "basic",
        "estimatedTime": 0,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": false,
        "timeout": 0,
        "isControlNode": true,
        "executionMode": "passthrough",
        "availability": { "state": "available" },
        "api": undefined,
        "properties": {},
        "propertyConfig": {},
        "outputSchema": {
          "version": "1.0",
          "fields": [
            { "path": "signal", "label": "Signal", "kind": "string", "visibility": "primary" },
            { "path": "loopNodeId", "label": "Loop Node Id", "kind": "string", "visibility": "technical" }
          ]
        }
      }
    ]
  },

  {
    "id": "microsoft-teams-010",
    "name": "Microsoft Teams",
    "icon": "MessageSquare",
    "color": "bg-sky-500",
    "description": "Microsoft Teams automation â€” teams, channels, chat, and meetings.",
    "metadata": {
      "tags": [
        "teams",
        "chat",
        "collaboration"
      ],
      "featured": true,
      "popularityScore": 95,
      "order": 40,
      "group": "Communication"
    },
    "ui": {
      "gradient": "from-sky-500/20 to-sky-600/10",
      "iconBg": "bg-sky-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "create-team",
        "category": "microsoft-teams-010",
        "name": "Create Team",
        "description": "Create a new Microsoft Team.",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "team"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/createTeam",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}",
            "description": "{{description}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": "",
          "description": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. Marketing",
            "group": "Team"
          },
          "description": {
            "type": "string",
            "label": "Description",
            "required": false,
            "uiType": "textarea",
            "placeholder": "What is this team for?",
            "group": "Team"
          }
        }
      },
      {
        "type": "create-channel",
        "category": "microsoft-teams-010",
        "name": "Create Channel",
        "description": "Create a channel inside a team.",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "channel"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/CreateChannel",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}",
            "channelName": "{{channelName}}",
            "channelType": "{{channelType}}",
            "description": "{{description}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": "",
          "channelName": "",
          "channelType": "standard",
          "description": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          },
          "channelName": {
            "type": "string",
            "label": "Channel Name",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. Announcements",
            "group": "Channel"
          },
          "channelType": {
            "type": "string",
            "label": "Channel Type",
            "required": false,
            "uiType": "select",
            "options": [
              "standard",
              "private",
              "shared"
            ],
            "description": "Standard is visible to all; private/shared restrict membership.",
            "group": "Channel"
          },
          "description": {
            "type": "string",
            "label": "Description",
            "required": false,
            "uiType": "textarea",
            "placeholder": "Optional channel description",
            "group": "Channel"
          }
        }
      },
      {
        "type": "get-channels",
        "category": "microsoft-teams-010",
        "name": "Get Channels",
        "description": "List all channels in a team.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "channels"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/getallchannel",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          }
        }
      },
      {
        "type": "add-member-channel",
        "category": "microsoft-teams-010",
        "name": "Add Member to Channel",
        "description": "Add one or more members to a channel.",
        "icon": "UserPlus",
        "color": "bg-slate-500",
        "tags": [
          "add",
          "member",
          "channel"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/addMembertochannel",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}",
            "channelName": "{{channelName}}",
            "emails": "{{emails}}",
            "role": "{{role}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": "",
          "channelName": "",
          "emails": [],
          "role": "member"
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          },
          "channelName": {
            "type": "string",
            "label": "Channel Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing channel",
            "group": "Channel"
          },
          "emails": {
            "type": "array",
            "label": "Member Emails",
            "required": true,
            "uiType": "user-list",
            "options": [],
            "description": "People to add. Type an email and press Enter.",
            "group": "Channel"
          },
          "role": {
            "type": "string",
            "label": "Role",
            "required": false,
            "uiType": "select",
            "options": [
              "owner",
              "member"
            ],
            "description": "Owners can manage the channel; members cannot.",
            "group": "Channel"
          }
        }
      },
      {
        "type": "get-teams",
        "category": "microsoft-teams-010",
        "name": "Get Teams",
        "description": "List all teams you belong to.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "teams"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/getTeams",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          }
        }
      },
      {
        "type": "get-channels-with-teams",
        "category": "microsoft-teams-010",
        "name": "Get Channels with Teams",
        "description": "List channels grouped by team.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "channels",
          "teams"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/getchannelsteams",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          }
        }
      },
      {
        "type": "send-channel-message",
        "category": "microsoft-teams-010",
        "name": "Send Channel Message",
        "description": "Post a message to a channel.",
        "icon": "Send",
        "color": "bg-indigo-500",
        "tags": [
          "send",
          "channel",
          "message"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/send-chat",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}",
            "channelName": "{{channelName}}",
            "subject": "{{subject}}",
            "message": "{{message}}",
            "importance": "{{importance}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": "",
          "channelName": "",
          "subject": "",
          "message": "",
          "importance": "normal"
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          },
          "channelName": {
            "type": "string",
            "label": "Channel Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing channel",
            "group": "Channel"
          },
          "subject": {
            "type": "string",
            "label": "Subject",
            "required": false,
            "uiType": "input",
            "placeholder": "Optional subject",
            "group": "Channel"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "textarea",
            "placeholder": "Your messageâ€¦",
            "group": "Channel"
          },
          "importance": {
            "type": "string",
            "label": "Importance",
            "required": false,
            "uiType": "select",
            "options": [
              "normal",
              "high",
              "urgent"
            ],
            "group": "Channel"
          }
        }
      },
      {
        "type": "get-channel-members",
        "category": "microsoft-teams-010",
        "name": "Get Channel Members",
        "description": "List members of a channel.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "channel",
          "members"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/members/channel",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "teamName": "{{teamName}}",
            "channelName": "{{channelName}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "teamName": "",
          "channelName": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "teamName": {
            "type": "string",
            "label": "Team Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing team",
            "group": "Team"
          },
          "channelName": {
            "type": "string",
            "label": "Channel Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing channel",
            "group": "Channel"
          }
        }
      },
      {
        "type": "send-1to1-message",
        "category": "microsoft-teams-010",
        "name": "Send 1:1 Message",
        "description": "Send a direct message to a person.",
        "icon": "Send",
        "color": "bg-indigo-500",
        "tags": [
          "send",
          "direct",
          "message"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/send-chat-member",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "chatName": "{{chatName}}",
            "message": "{{message}}",
            "importance": "{{importance}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "chatName": "",
          "message": "",
          "importance": "normal"
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "chatName": {
            "type": "string",
            "label": "Recipient",
            "required": true,
            "uiType": "input",
            "placeholder": "Display name or email",
            "group": "Chat"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "textarea",
            "placeholder": "Your messageâ€¦",
            "group": "Chat"
          },
          "importance": {
            "type": "string",
            "label": "Importance",
            "required": false,
            "uiType": "select",
            "options": [
              "normal",
              "high",
              "urgent"
            ],
            "group": "Chat"
          }
        }
      },
      {
        "type": "get-chat-list",
        "category": "microsoft-teams-010",
        "name": "Get Chat List",
        "description": "List your 1:1 chats.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "chat",
          "list"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/chatlistuser",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          }
        }
      },
      {
        "type": "get-chat-groups",
        "category": "microsoft-teams-010",
        "name": "Get Chat Groups",
        "description": "List your group chats.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "chat",
          "groups"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/chat/groups",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          }
        }
      },
      {
        "type": "get-chat-group-details",
        "category": "microsoft-teams-010",
        "name": "Get Chat Group Details",
        "description": "Get details for one group chat.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "chat",
          "group"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/Singlechatgroup",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "chatName": "{{chatName}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "chatName": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "chatName": {
            "type": "string",
            "label": "Chat Name",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing group chat",
            "group": "Chat"
          }
        }
      },
      {
        "type": "create-chat-group",
        "category": "microsoft-teams-010",
        "name": "Create Chat Group",
        "description": "Create a new group chat.",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "chat",
          "group"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/create-chat-group",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "chatGroupName": "{{chatGroupName}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "chatGroupName": ""
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "chatGroupName": {
            "type": "string",
            "label": "Group Name",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. Project Falcon",
            "group": "Chat"
          }
        }
      },
      {
        "type": "add-members-group",
        "category": "microsoft-teams-010",
        "name": "Add Members to Group",
        "description": "Add members to an existing group chat.",
        "icon": "UserPlus",
        "color": "bg-slate-500",
        "tags": [
          "add",
          "members",
          "group"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/add-members",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "chatId": "{{chatId}}",
            "memberEmails": "{{memberEmails}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "chatId": "",
          "memberEmails": []
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "chatId": {
            "type": "string",
            "label": "Chat ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Existing chat ID",
            "group": "Chat"
          },
          "memberEmails": {
            "type": "array",
            "label": "Member Emails",
            "required": true,
            "uiType": "user-list",
            "options": [],
            "description": "People to add. Type an email and press Enter.",
            "group": "Chat"
          }
        }
      },
      {
        "type": "create-meeting",
        "category": "microsoft-teams-010",
        "name": "Create Meeting",
        "description": "Schedule a Teams meeting.",
        "icon": "Calendar",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "meeting"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/create-meeting",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "subject": "{{subject}}",
            "date": "{{date}}",
            "startDateTime": "{{startDateTime}}",
            "endDateTime": "{{endDateTime}}",
            "description": "{{description}}",
            "agenda": "{{agenda}}",
            "location": "{{location}}",
            "attendees": "{{attendees}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "subject": "",
          "date": "",
          "startDateTime": "",
          "endDateTime": "",
          "description": "",
          "agenda": "",
          "location": "",
          "attendees": []
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "subject": {
            "type": "string",
            "label": "Subject",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. Weekly Sync",
            "group": "Meeting"
          },
          "date": {
            "type": "date",
            "label": "Date",
            "required": true,
            "uiType": "date",
            "description": "Meeting day.",
            "group": "Meeting"
          },
          "startDateTime": {
            "type": "time",
            "label": "Start Time",
            "required": true,
            "uiType": "time",
            "description": "Local start time.",
            "group": "Meeting"
          },
          "endDateTime": {
            "type": "time",
            "label": "End Time",
            "required": true,
            "uiType": "time",
            "description": "Must be after the start time.",
            "group": "Meeting"
          },
          "description": {
            "type": "string",
            "label": "Description",
            "required": false,
            "uiType": "textarea",
            "placeholder": "Optional agenda/notes",
            "group": "Meeting"
          },
          "agenda": {
            "type": "string",
            "label": "Agenda",
            "required": false,
            "uiType": "input",
            "placeholder": "Optional",
            "group": "Meeting"
          },
          "location": {
            "type": "string",
            "label": "Location",
            "required": false,
            "uiType": "input",
            "placeholder": "Optional",
            "group": "Meeting"
          },
          "attendees": {
            "type": "array",
            "label": "Attendees",
            "required": true,
            "uiType": "user-list",
            "options": [],
            "description": "Invitees. Type an email and press Enter.",
            "group": "Meeting"
          }
        }
      },
      {
        "type": "get-chat-messages",
        "category": "microsoft-teams-010",
        "name": "Get Chat Messages",
        "description": "Fetch messages from a chat.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "chat",
          "messages"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/teams/list-chatmessages",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecretId": "{{clientSecretId}}",
            "refreshTokenId": "{{refreshTokenId}}",
            "chatId": "{{chatId}}",
            "chatName": "{{chatName}}",
            "top": "{{top}}"
          }
        },
        "properties": {
          "tenantId": "",
          "clientId": "",
          "clientSecretId": "",
          "refreshTokenId": "",
          "chatId": "",
          "chatName": "",
          "top": "25"
        },
        "propertyConfig": {
          "tenantId": {
            "type": "string",
            "label": "Tenant ID",
            "required": true,
            "uiType": "input",
            "placeholder": "e.g. 00000000-0000-0000-0000-000000000000",
            "description": "Microsoft Entra (Azure AD) tenant ID.",
            "group": "Authentication"
          },
          "clientId": {
            "type": "string",
            "label": "Client ID",
            "required": true,
            "uiType": "input",
            "placeholder": "Application (client) ID",
            "description": "App registration client ID.",
            "group": "Authentication"
          },
          "clientSecretId": {
            "type": "password",
            "label": "Client Secret",
            "required": true,
            "uiType": "input",
            "description": "App registration client secret. Stored securely.",
            "group": "Authentication"
          },
          "refreshTokenId": {
            "type": "password",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input",
            "description": "OAuth refresh token for the signed-in user.",
            "group": "Authentication"
          },
          "chatId": {
            "type": "string",
            "label": "Chat ID",
            "required": false,
            "uiType": "input",
            "placeholder": "Chat ID (or use name)",
            "group": "Chat"
          },
          "chatName": {
            "type": "string",
            "label": "Chat Name",
            "required": false,
            "uiType": "input",
            "placeholder": "Chat name (or use ID)",
            "group": "Chat"
          },
          "top": {
            "type": "string",
            "label": "Max Messages",
            "required": false,
            "uiType": "select",
            "options": [
              "10",
              "25",
              "50"
            ],
            "description": "How many recent messages to fetch.",
            "group": "Chat"
          }
        }
      }
    ]
  },

  {
  "id": "excel-automation-011",
  "name": "Excel Automation",
  "icon": "Sheet",
  "color": "bg-green-500",
  "description": "Read, write, search, and modify Excel files.",
  "metadata": {
    "tags": ["excel-automation", "automation"],
    "featured": true,
    "popularityScore": 90,
    "order": 20,
    "group": "Excel Plugin"
  },
  "ui": {
    "gradient": "from-slate-500/20 to-slate-600/10",
    "iconBg": "bg-slate-500/10",
    "borderGlow": true,
    "cardStyle": "premium"
  },
  "control": {
    "enabled": true,
    "version": "1.3.0"
  },
  "actions": [
    {
      "type": "open-read-workbook",
      "category": "excel-automation-011",
      "name": "Open Workbook",
      "description": "Read all sheets and data from a workbook",
      "icon": "Search",
      "color": "bg-blue-500",
      "tags": ["open", "workbook"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/read-workbook",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "read-sheet",
      "category": "excel-automation-011",
      "name": "Read Sheet",
      "description": "Read all data from a single sheet",
      "icon": "Search",
      "color": "bg-blue-500",
      "tags": ["read", "sheet"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/read-sheet",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "get-sheet-names",
      "category": "excel-automation-011",
      "name": "Get Sheet Names",
      "description": "Fetch sheet names",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": ["sheet", "names"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/sheets",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "read-cell",
      "category": "excel-automation-011",
      "name": "Read Cell",
      "description": "Read a cell value",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": ["read", "cell"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/read-cell",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "row": "{{row}}",
          "col": "{{col}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "row": "",
        "col": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "row": {
          "type": "number",
          "label": "Row (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "0 = header row, 1 = first data row"
        },
        "col": {
          "type": "number",
          "label": "Col (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "0 = column A"
        }
      }
    },
    {
      "type": "write-cell",
      "category": "excel-automation-011",
      "name": "Write Cell",
      "description": "Write a cell value (saves to the selected file)",
      "icon": "Edit3",
      "color": "bg-violet-500",
      "tags": ["write", "cell"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/write-cell",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "row": "{{row}}",
          "col": "{{col}}",
          "value": "{{value}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "row": "",
        "col": "",
        "value": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "row": {
          "type": "number",
          "label": "Row (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "0 = header row, 1 = first data row"
        },
        "col": {
          "type": "number",
          "label": "Col (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "0 = column A"
        },
        "value": {
          "type": "string",
          "label": "Value",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "apend-row",
      "category": "excel-automation-011",
      "name": "Append Row",
      "description": "Append a row after the last used row (saves to the selected file)",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": ["append", "row"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/append-row",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "values": "{{value}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "value": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "value": {
          "type": "string",
          "label": "Values",
          "required": true,
          "uiType": "input",
          "placeholder": "Alice, Tester, 65000"
        }
      }
    },
    {
      "type": "delete-row",
      "category": "excel-automation-011",
      "name": "Delete Row",
      "description": "Delete a row and shift rows up (saves to the selected file)",
      "icon": "Trash2",
      "color": "bg-red-500",
      "tags": ["delete", "row"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/delete-row",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "rowIndex": "{{rowIndex}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "rowIndex": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "rowIndex": {
          "type": "number",
          "label": "Row Index (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "1 = first data row"
        }
      }
    },
    {
      "type": "find",
      "category": "excel-automation-011",
      "name": "Find",
      "description": "Find a cell value",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": ["find"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/find-cell",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "searchValue": "{{searchValue}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "searchValue": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "searchValue": {
          "type": "string",
          "label": "Search Value",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "replace",
      "category": "excel-automation-011",
      "name": "Replace",
      "description": "Replace every matching cell value in a sheet (saves to the selected file)",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": ["replace"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/replace-cell-file",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "findValue": "{{findValue}}",
          "replaceValue": "{{replaceValue}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "findValue": "",
        "replaceValue": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "findValue": {
          "type": "string",
          "label": "Find Value",
          "required": true,
          "uiType": "input"
        },
        "replaceValue": {
          "type": "string",
          "label": "Replace Value",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "go-to-cell",
      "category": "excel-automation-011",
      "name": "Go to Cell",
      "description": "Read a cell by its address (e.g. B2)",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": ["go", "to", "cell"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/go-to-cell",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "cellAddress": "{{cellAddress}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "cellAddress": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "cellAddress": {
          "type": "string",
          "label": "Cell Address",
          "required": true,
          "uiType": "input",
          "placeholder": "B2"
        }
      }
    },
    {
      "type": "rewrite-row",
      "category": "excel-automation-011",
      "name": "Rewrite Row",
      "description": "Rewrite an entire row (saves to the selected file)",
      "icon": "Edit3",
      "color": "bg-violet-500",
      "tags": ["rewrite", "row"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/write-row",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "rowNumber": "{{rowNo}}",
          "rowData": "{{rowData}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "rowNo": "",
        "rowData": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "rowNo": {
          "type": "number",
          "label": "Row No (1-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "2 = first data row"
        },
        "rowData": {
          "type": "object",
          "label": "Row Data",
          "required": true,
          "uiType": "input",
          "placeholder": "John, IT, 8000"
        }
      }
    },
    {
      "type": "get-column-names",
      "category": "excel-automation-011",
      "name": "Get Column Names",
      "description": "Fetch column names",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": ["get", "column", "names"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/columns",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "clear-cell",
      "category": "excel-automation-011",
      "name": "Clear Cell",
      "description": "Clear a cell (saves to the selected file)",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": ["clear", "cell"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/clear-cell-file",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "row": "{{row}}",
          "col": "{{col}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "row": "",
        "col": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "row": {
          "type": "number",
          "label": "Row (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "1 = first data row"
        },
        "col": {
          "type": "number",
          "label": "Col (0-based)",
          "required": true,
          "uiType": "input",
          "placeholder": "0 = column A"
        }
      }
    },
    {
      "type": "create-sheet",
      "category": "excel-automation-011",
      "name": "Create Sheet",
      "description": "Add a new sheet to the workbook (returns the updated file)",
      "icon": "Plus",
      "color": "bg-green-500",
      "tags": ["create", "sheet"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/create-sheet",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "New Sheet Name",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "rename-sheet",
      "category": "excel-automation-011",
      "name": "Rename Sheet",
      "description": "Rename an existing sheet (returns the updated file)",
      "icon": "Edit3",
      "color": "bg-violet-500",
      "tags": ["rename", "sheet"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/rename-sheet",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}",
          "newSheetName": "{{newSheetName}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": "",
        "newSheetName": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Current Sheet Name",
          "required": true,
          "uiType": "input"
        },
        "newSheetName": {
          "type": "string",
          "label": "New Sheet Name",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "delete-sheet",
      "category": "excel-automation-011",
      "name": "Delete Sheet",
      "description": "Delete a sheet from the workbook (returns the updated file)",
      "icon": "Trash2",
      "color": "bg-red-500",
      "tags": ["delete", "sheet"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/excel/delete-sheet",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "sheetName": "{{sheetName}}"
        }
      },
      "properties": {
        "file": null,
        "sheetName": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "sheetName": {
          "type": "string",
          "label": "Sheet Name",
          "required": true,
          "uiType": "input"
        }
      }
    }
  ]
},
  {
    "id": "google-drive-012",
    "name": "Google Drive",
    "icon": "Cloud",
    "color": "bg-blue-500",
    "description": "Automate Google Drive operations like folders, files, sharing, and search.",
    "metadata": {
      "tags": [
        "google-drive",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 30,
      "group": "Google Drive Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "create-folder",
        "category": "google-drive-012",
        "name": "Create Folder",
        "description": "Create Folder action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/create-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}"
          }
        },
        "properties": {
          "name": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "search",
        "category": "google-drive-012",
        "name": "Search",
        "description": "Search action",
        "icon": "Circle",
        "color": "bg-sky-500",
        "tags": [
          "search"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/search",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}"
          }
        },
        "properties": {
          "name": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete",
        "category": "google-drive-012",
        "name": "Delete",
        "description": "Delete action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/delete",
          "method": "DELETE",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}"
          }
        },
        "properties": {
          "name": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload",
        "category": "google-drive-012",
        "name": "Upload",
        "description": "Upload action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/upload",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "holderName": "{{holderName}}",
            "file": "{{file}}"
          }
        },
        "properties": {
          "holderName": "",
          "file": null
        },
        "propertyConfig": {
          "holderName": {
            "type": "string",
            "label": "Holder Name",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "download",
        "category": "google-drive-012",
        "name": "Download",
        "description": "Download action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/download",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "fileName": "{{fileName}}"
          }
        },
        "properties": {
          "fileName": null
        },
        "propertyConfig": {
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "move",
        "category": "google-drive-012",
        "name": "Move",
        "description": "Move action",
        "icon": "MoveRight",
        "color": "bg-amber-500",
        "tags": [
          "move"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/move",
          "method": "PUT",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}",
            "destinationFolder": "{{destinationFolder}}"
          }
        },
        "properties": {
          "name": "",
          "destinationFolder": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          },
          "destinationFolder": {
            "type": "string",
            "label": "Destination Folder",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "rename",
        "category": "google-drive-012",
        "name": "Rename",
        "description": "Rename action",
        "icon": "Edit3",
        "color": "bg-slate-500",
        "tags": [
          "rename"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/rename",
          "method": "PUT",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "oldName": "{{oldName}}",
            "newName": "{{newName}}"
          }
        },
        "properties": {
          "oldName": "",
          "newName": ""
        },
        "propertyConfig": {
          "oldName": {
            "type": "string",
            "label": "Old Name",
            "required": true,
            "uiType": "input"
          },
          "newName": {
            "type": "string",
            "label": "New Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "share",
        "category": "google-drive-012",
        "name": "Share",
        "description": "Share action",
        "icon": "Share2",
        "color": "bg-indigo-500",
        "tags": [
          "share"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/share",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}",
            "email": "{{email}}",
            "role": "{{role}}"
          }
        },
        "properties": {
          "name": "",
          "email": "",
          "role": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          },
          "email": {
            "type": "string",
            "label": "Email",
            "required": true,
            "uiType": "input"
          },
          "role": {
            "type": "string",
            "label": "Role",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "copy",
        "category": "google-drive-012",
        "name": "Copy",
        "description": "Copy action",
        "icon": "Copy",
        "color": "bg-pink-500",
        "tags": [
          "copy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/copy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "sourceName": "{{sourceName}}",
            "newName": "{{newName}}",
            "targetFolderName": "{{targetFolderName}}"
          }
        },
        "properties": {
          "sourceName": "",
          "newName": "",
          "targetFolderName": ""
        },
        "propertyConfig": {
          "sourceName": {
            "type": "string",
            "label": "Source Name",
            "required": true,
            "uiType": "input"
          },
          "newName": {
            "type": "string",
            "label": "New Name",
            "required": true,
            "uiType": "input"
          },
          "targetFolderName": {
            "type": "string",
            "label": "Target Folder Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-children",
        "category": "google-drive-012",
        "name": "List Children",
        "description": "List Children action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "children"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/list-children",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "folderName": "{{folderName}}"
          }
        },
        "properties": {
          "folderName": ""
        },
        "propertyConfig": {
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "sharing-info",
        "category": "google-drive-012",
        "name": "Sharing - Info",
        "description": "Sharing - Info action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "sharing",
          "info"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/drive/sharing-info",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "fileName": "{{fileName}}"
          }
        },
        "properties": {
          "fileName": null
        },
        "propertyConfig": {
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          }
        }
      }
    ]
  },
  {
    "id": "onedrive-013",
    "name": "OneDrive",
    "icon": "Cloud",
    "color": "bg-sky-500",
    "description": "Automate OneDrive folder and file operations.",
    "metadata": {
      "tags": [
        "onedrive",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 40,
      "group": "Onedrive Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": false,
      "version": "1.0.0",
      "availability": {
        "state": "unavailable",
        "code": "BACKEND_CONNECTOR_NOT_INSTALLED",
        "reason": "Backend connector not installed"
      }
    },
    "actions": [
      {
        "type": "create",
        "category": "onedrive-013",
        "name": "Create",
        "description": "Create action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/create-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "parentPath": "{{parentPath}}",
            "folderName": "{{folderName}}"
          }
        },
        "properties": {
          "parentPath": "",
          "folderName": ""
        },
        "propertyConfig": {
          "parentPath": {
            "type": "string",
            "label": "Parent Path",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload",
        "category": "onedrive-013",
        "name": "Upload",
        "description": "Upload action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/upload",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "parentPath": "{{parentPath}}",
            "file": "{{file}}"
          }
        },
        "properties": {
          "parentPath": "",
          "file": null
        },
        "propertyConfig": {
          "parentPath": {
            "type": "string",
            "label": "Parent Path",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "download",
        "category": "onedrive-013",
        "name": "Download",
        "description": "Download action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/download",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "filePath": "{{filePath}}"
          }
        },
        "properties": {
          "filePath": null
        },
        "propertyConfig": {
          "filePath": {
            "type": "file",
            "label": "File Path",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "move",
        "category": "onedrive-013",
        "name": "Move",
        "description": "Move action",
        "icon": "MoveRight",
        "color": "bg-amber-500",
        "tags": [
          "move"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/move",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "sourcePath": "{{sourcePath}}",
            "file": "{{file}}",
            "destinationFolderPath": "{{destinationFolderPath}}"
          }
        },
        "properties": {
          "sourcePath": null,
          "file": null,
          "destinationFolderPath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "file",
            "label": "Source Path",
            "required": true,
            "uiType": "file"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          },
          "destinationFolderPath": {
            "type": "string",
            "label": "Destination Folder Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "rename",
        "category": "onedrive-013",
        "name": "Rename",
        "description": "Rename action",
        "icon": "Edit3",
        "color": "bg-slate-500",
        "tags": [
          "rename"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/rename",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "filePath": "{{filePath}}",
            "newName": "{{newName}}"
          }
        },
        "properties": {
          "filePath": null,
          "newName": ""
        },
        "propertyConfig": {
          "filePath": {
            "type": "file",
            "label": "File Path",
            "required": true,
            "uiType": "file"
          },
          "newName": {
            "type": "string",
            "label": "New Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete",
        "category": "onedrive-013",
        "name": "Delete",
        "description": "Delete action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/delete",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "filePath": "{{filePath}}"
          }
        },
        "properties": {
          "filePath": null
        },
        "propertyConfig": {
          "filePath": {
            "type": "file",
            "label": "File Path",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "list-children",
        "category": "onedrive-013",
        "name": "List Children",
        "description": "List Children action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "children"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/list",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "folderPath": "{{folderPath}}"
          }
        },
        "properties": {
          "folderPath": ""
        },
        "propertyConfig": {
          "folderPath": {
            "type": "string",
            "label": "Folder Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "search",
        "category": "onedrive-013",
        "name": "Search",
        "description": "Search action",
        "icon": "Circle",
        "color": "bg-sky-500",
        "tags": [
          "search"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/search",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "keyword": "{{keyword}}"
          }
        },
        "properties": {
          "keyword": ""
        },
        "propertyConfig": {
          "keyword": {
            "type": "string",
            "label": "Keyword",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "copy",
        "category": "onedrive-013",
        "name": "Copy",
        "description": "Copy action",
        "icon": "Copy",
        "color": "bg-pink-500",
        "tags": [
          "copy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/copy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "sourcePath": "{{sourcePath}}",
            "destinationPath": "{{destinationPath}}",
            "newName": "{{newName}}"
          }
        },
        "properties": {
          "sourcePath": null,
          "destinationPath": "",
          "newName": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "file",
            "label": "Source Path",
            "required": true,
            "uiType": "file"
          },
          "destinationPath": {
            "type": "string",
            "label": "Destination Path",
            "required": true,
            "uiType": "input"
          },
          "newName": {
            "type": "string",
            "label": "New Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "share",
        "category": "onedrive-013",
        "name": "Share",
        "description": "Share action",
        "icon": "Share2",
        "color": "bg-indigo-500",
        "tags": [
          "share"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/onedrive/share",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "sourcePath": "{{sourcePath}}",
            "recipients": [
              "{{item}}"
            ],
            "role": "{{role}}"
          }
        },
        "properties": {
          "sourcePath": null,
          "recipients": [],
          "role": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "file",
            "label": "Source Path",
            "required": true,
            "uiType": "file"
          },
          "recipients": {
            "type": "array",
            "label": "Recipients",
            "required": true,
            "uiType": "json-editor"
          },
          "role": {
            "type": "string",
            "label": "Role",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "json-automation-014",
    "name": "JSON Processing",
    "icon": "Braces",
    "color": "bg-emerald-500",
    "description": "Process JSON input and output files.",
    "metadata": {
      "tags": [
        "json-processing",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 50,
      "group": "Json Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      // {
      //   "type": "json-input",
      //   "category": "json-automation-014",
      //   "name": "JSON Input",
      //   "description": "JSON Input action",
      //   "icon": "FileJson",
      //   "color": "bg-slate-500",
      //   "tags": [
      //     "json",
      //     "input"
      //   ],
      //   "complexity": "basic",
      //   "estimatedTime": 1000,
      //   "supportsStreaming": false,
      //   "requiresAuth": false,
      //   "retryable": true,
      //   "timeout": 60000,
      //   "api": {
      //     "url": "http://localhost:8080/engine/json/input",
      //     "method": "POST",
      //     "headers": {
      //       "Content-Type": "application/json"
      //     },
      //     "body": {
      //       "filePath": "{{filePath}}",
      //       "readAsUrl": "{{readAsUrl}}",
      //       "ignoreEmptyFile": "{{ignoreEmptyFile}}",
      //       "ignoreMissingPath": "{{ignoreMissingPath}}",
      //       "limit": "{{limit}}",
      //       "includeFilename": "{{includeFilename}}",
      //       "includeRowNumber": "{{includeRowNumber}}",
      //       "fields": [
      //         {
      //           "name": "{{name}}",
      //           "attribute": "{{attribute}}",
      //           "type": "{{type}}"
      //         }
      //       ]
      //     }
      //   },
      //   "properties": {
      //     "filePath": null,
      //     "readAsUrl": false,
      //     "ignoreEmptyFile": false,
      //     "ignoreMissingPath": false,
      //     "limit": 0,
      //     "includeFilename": false,
      //     "includeRowNumber": false,
      //     "fields": []
      //   },
      //   "propertyConfig": {
      //     "filePath": {
      //       "type": "file",
      //       "label": "File Path",
      //       "required": true,
      //       "uiType": "file"
      //     },
      //     "readAsUrl": {
      //       "type": "boolean",
      //       "label": "Read As Url",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "ignoreEmptyFile": {
      //       "type": "boolean",
      //       "label": "Ignore Empty File",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "ignoreMissingPath": {
      //       "type": "boolean",
      //       "label": "Ignore Missing Path",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "limit": {
      //       "type": "number",
      //       "label": "Limit",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "includeFilename": {
      //       "type": "boolean",
      //       "label": "Include Filename",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "includeRowNumber": {
      //       "type": "boolean",
      //       "label": "Include Row Number",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "fields": {
      //       "type": "array",
      //       "label": "Fields",
      //       "required": true,
      //       "uiType": "json-editor"
      //     }
      //   }
      // },
      {
  "type": "json-input",
  "category": "json-automation-014",
  "name": "JSON Input",
  "description": "JSON Input action",
  "icon": "FileJson",
  "color": "bg-slate-500",
  "tags": [
    "json",
    "input"
  ],
  "complexity": "basic",
  "estimatedTime": 1000,
  "supportsStreaming": false,
  "requiresAuth": false,
  "retryable": true,
  "timeout": 60000,
  "api": {
    "url": "http://localhost:8080/engine/json/input",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "filePath": "{{filePath}}",
      "readAsUrl": "{{readAsUrl}}",
      "ignoreEmptyFile": "{{ignoreEmptyFile}}",
      "ignoreMissingPath": "{{ignoreMissingPath}}",
      "limit": "{{limit}}",
      "includeFilename": "{{includeFilename}}",
      "includeRowNumber": "{{includeRowNumber}}",
      "fields": "{{fields}}"
    }
  },
  "properties": {
    "filePath": "",
    "readAsUrl": false,
    "ignoreEmptyFile": false,
    "ignoreMissingPath": false,
    "limit": 10,
    "includeFilename": false,
    "includeRowNumber": false,
    "fields": []
  },
  "propertyConfig": {
    "filePath": {
      "type": "string",
      "label": "Source File Path / URL",
      "required": true,
      "uiType": "input",
      "placeholder": "D:/sample_employees.json or https://example.com/sample.json"
    },
    "readAsUrl": {
      "type": "boolean",
      "label": "Read As Url",
      "required": false,
      "uiType": "input"
    },
    "ignoreEmptyFile": {
      "type": "boolean",
      "label": "Ignore Empty File",
      "required": false,
      "uiType": "input"
    },
    "ignoreMissingPath": {
      "type": "boolean",
      "label": "Ignore Missing Path",
      "required": false,
      "uiType": "input"
    },
    "limit": {
      "type": "number",
      "label": "Limit",
      "required": false,
      "uiType": "input",
      "min": 1
    },
    "includeFilename": {
      "type": "boolean",
      "label": "Include Filename",
      "required": false,
      "uiType": "input"
    },
    "includeRowNumber": {
      "type": "boolean",
      "label": "Include Row Number",
      "required": false,
      "uiType": "input"
    },
    "fields": {
      "type": "array",
      "label": "Fields",
      "required": true,
      "uiType": "json-editor"
    }
  }
},
      // {
      //   "type": "json-output",
      //   "category": "json-automation-014",
      //   "name": "JSON Output",
      //   "description": "JSON Output action",
      //   "icon": "FileJson",
      //   "color": "bg-slate-500",
      //   "tags": [
      //     "json",
      //     "output"
      //   ],
      //   "complexity": "basic",
      //   "estimatedTime": 1000,
      //   "supportsStreaming": false,
      //   "requiresAuth": false,
      //   "retryable": true,
      //   "timeout": 60000,
      //   "api": {
      //     "url": "http://localhost:8080/engine/json/output",
      //     "method": "POST",
      //     "headers": {
      //       "Content-Type": "application/json"
      //     },
      //     "body": {
      //       "operation": "{{operation}}",
      //       "jsonBlockName": "{{jsonBlockName}}",
      //       "fileName": "{{fileName}}",
      //       "append": "{{append}}",
      //       "includeDateInFileName": "{{includeDateInFileName}}",
      //       "data": [
      //         {
      //           "emp_id": "{{emp_id}}",
      //           "emp_name": "{{emp_name}}",
      //           "salary": "{{salary}}"
      //         }
      //       ]
      //     }
      //   },
      //   "properties": {
      //     "operation": "",
      //     "jsonBlockName": "",
      //     "fileName": null,
      //     "append": false,
      //     "includeDateInFileName": false,
      //     "data": []
      //   },
      //   "propertyConfig": {
      //     "operation": {
      //       "type": "string",
      //       "label": "Operation",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "jsonBlockName": {
      //       "type": "string",
      //       "label": "Json Block Name",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "fileName": {
      //       "type": "file",
      //       "label": "File Name",
      //       "required": true,
      //       "uiType": "file"
      //     },
      //     "append": {
      //       "type": "boolean",
      //       "label": "Append",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "includeDateInFileName": {
      //       "type": "boolean",
      //       "label": "Include Date In File Name",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "data": {
      //       "type": "array",
      //       "label": "Data",
      //       "required": true,
      //       "uiType": "json-editor"
      //     }
      //   }
      // }

      {
  "type": "json-output",
  "category": "json-automation-014",
  "name": "JSON Output",
  "description": "JSON Output action",
  "icon": "FileJson",
  "color": "bg-slate-500",
  "tags": [
    "json",
    "output"
  ],
  "complexity": "basic",
  "estimatedTime": 1000,
  "supportsStreaming": false,
  "requiresAuth": false,
  "retryable": true,
  "timeout": 60000,
  "api": {
    "url": "http://localhost:8080/engine/json/output",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "operation": "{{operation}}",
      "jsonBlockName": "{{jsonBlockName}}",
      "fileName": "{{fileName}}",
      "append": "{{append}}",
      "includeDateInFileName": "{{includeDateInFileName}}",
      "data": "{{data}}"
    }
  },
  "properties": {
    "operation": "OUTPUT_ONLY",
    "jsonBlockName": "data",
    "fileName": "",
    "append": false,
    "includeDateInFileName": false,
    "data": []
  },
  "propertyConfig": {
    "operation": {
      "type": "string",
      "label": "Operation",
      "required": true,
      "uiType": "input",
      "placeholder": "OUTPUT_ONLY | WRITE_ONLY | BOTH"
    },
    "jsonBlockName": {
      "type": "string",
      "label": "Json Block Name",
      "required": true,
      "uiType": "input",
      "placeholder": "data"
    },
    "fileName": {
      "type": "string",
      "label": "Output File Name / Path",
      "required": true,
      "uiType": "input",
      "placeholder": "D:/output.json"
    },
    "append": {
      "type": "boolean",
      "label": "Append",
      "required": false,
      "uiType": "input"
    },
    "includeDateInFileName": {
      "type": "boolean",
      "label": "Include Date In File Name",
      "required": false,
      "uiType": "input"
    },
    "data": {
      "type": "array",
      "label": "Data",
      "required": true,
      "uiType": "json-editor"
    }
  }
}
    ]
  },
  // {
  //   "id": "xml-automation-015",
  //   "name": "XML Processing",
  //   "icon": "FileCode",
  //   "color": "bg-cyan-500",
  //   "description": "Read, stream, write, join, modify, and validate XML files.",
  //   "metadata": {
  //     "tags": [
  //       "xml-processing",
  //       "automation"
  //     ],
  //     "featured": true,
  //     "popularityScore": 90,
  //     "order": 60,
  //     "group": "Xml Plugin"
  //   },
  //   "ui": {
  //     "gradient": "from-slate-500/20 to-slate-600/10",
  //     "iconBg": "bg-slate-500/10",
  //     "borderGlow": true,
  //     "cardStyle": "premium"
  //   },
  //   "control": {
  //     "enabled": true,
  //     "version": "1.0.0"
  //   },
  //   "actions": [
  //     {
  //       "type": "read",
  //       "category": "xml-automation-015",
  //       "name": "Read",
  //       "description": "Read action",
  //       "icon": "Search",
  //       "color": "bg-cyan-500",
  //       "tags": [
  //         "read"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/read",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "multipart/form-data"
  //         },
  //         "bodyType": "form-data",
  //         "body": {
  //           "file": "{{file}}"
  //         }
  //       },
  //       "properties": {
  //         "file": null
  //       },
  //       "propertyConfig": {
  //         "file": {
  //           "type": "file",
  //           "label": "File",
  //           "required": true,
  //           "uiType": "file"
  //         }
  //       }
  //     },
  //     {
  //       "type": "stream-stax",
  //       "category": "xml-automation-015",
  //       "name": "Stream(STAX)",
  //       "description": "Stream(STAX) action",
  //       "icon": "Database",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "stream(stax)"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/stream",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "multipart/form-data"
  //         },
  //         "bodyType": "form-data",
  //         "body": {
  //           "file": "{{file}}"
  //         }
  //       },
  //       "properties": {
  //         "file": null
  //       },
  //       "propertyConfig": {
  //         "file": {
  //           "type": "file",
  //           "label": "File",
  //           "required": true,
  //           "uiType": "file"
  //         }
  //       }
  //     },
  //     {
  //       "type": "write",
  //       "category": "xml-automation-015",
  //       "name": "Write",
  //       "description": "Write action",
  //       "icon": "Edit3",
  //       "color": "bg-violet-500",
  //       "tags": [
  //         "write"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/write",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "rootElement": "{{rootElement}}",
  //           "records": [
  //             {
  //               "id": "{{id}}",
  //               "name": "{{name}}",
  //               "department": "{{department}}"
  //             }
  //           ]
  //         }
  //       },
  //       "properties": {
  //         "rootElement": "",
  //         "records": []
  //       },
  //       "propertyConfig": {
  //         "rootElement": {
  //           "type": "string",
  //           "label": "Root Element",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "records": {
  //           "type": "array",
  //           "label": "Records",
  //           "required": true,
  //           "uiType": "json-editor"
  //         }
  //       }
  //     },
  //     {
  //       "type": "join",
  //       "category": "xml-automation-015",
  //       "name": "Join",
  //       "description": "Join action",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "join"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/join",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "multipart/form-data"
  //         },
  //         "bodyType": "form-data",
  //         "body": {
  //           "Key": "{{Key}}",
  //           "file1": "{{file1}}",
  //           "file2": "{{file2}}"
  //         }
  //       },
  //       "properties": {
  //         "Key": "",
  //         "file1": null,
  //         "file2": null
  //       },
  //       "propertyConfig": {
  //         "Key": {
  //           "type": "string",
  //           "label": "Key",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "file1": {
  //           "type": "file",
  //           "label": "File1",
  //           "required": true,
  //           "uiType": "file"
  //         },
  //         "file2": {
  //           "type": "file",
  //           "label": "File2",
  //           "required": true,
  //           "uiType": "file"
  //         }
  //       }
  //     },
  //     {
  //       "type": "add-node",
  //       "category": "xml-automation-015",
  //       "name": "Add-node",
  //       "description": "Add-node action",
  //       "icon": "Plus",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "add",
  //         "node"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/add-node",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "multipart/form-data"
  //         },
  //         "bodyType": "form-data",
  //         "body": {
  //           "Key": "{{Key}}",
  //           "file": "{{file}}",
  //           "parentTag": "{{parentTag}}",
  //           "newNodeName": "{{newNodeName}}",
  //           "newNodeValue": "{{newNodeValue}}"
  //         }
  //       },
  //       "properties": {
  //         "Key": "",
  //         "file": null,
  //         "parentTag": "",
  //         "newNodeName": "",
  //         "newNodeValue": ""
  //       },
  //       "propertyConfig": {
  //         "Key": {
  //           "type": "string",
  //           "label": "Key",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "file": {
  //           "type": "file",
  //           "label": "File",
  //           "required": true,
  //           "uiType": "file"
  //         },
  //         "parentTag": {
  //           "type": "string",
  //           "label": "Parent Tag",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "newNodeName": {
  //           "type": "string",
  //           "label": "New Node Name",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "newNodeValue": {
  //           "type": "string",
  //           "label": "New Node Value",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "validate",
  //       "category": "xml-automation-015",
  //       "name": "Validate",
  //       "description": "Validate action",
  //       "icon": "ShieldCheck",
  //       "color": "bg-red-500",
  //       "tags": [
  //         "validate"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/xml/validate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "multipart/form-data"
  //         },
  //         "bodyType": "form-data",
  //         "body": {
  //           "Key": "{{Key}}",
  //           "xmlFile": "{{xmlFile}}",
  //           "xsdFile": "{{xsdFile}}"
  //         }
  //       },
  //       "properties": {
  //         "Key": "",
  //         "xmlFile": null,
  //         "xsdFile": null
  //       },
  //       "propertyConfig": {
  //         "Key": {
  //           "type": "string",
  //           "label": "Key",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "xmlFile": {
  //           "type": "file",
  //           "label": "Xml File",
  //           "required": true,
  //           "uiType": "file"
  //         },
  //         "xsdFile": {
  //           "type": "file",
  //           "label": "Xsd File",
  //           "required": true,
  //           "uiType": "file"
  //         }
  //       }
  //     }
  //   ]
  // },
// {
//   "id": "xml-automation-015",
//   "name": "XML Processing",
//   "icon": "FileCode",
//   "color": "bg-cyan-500",
//   "description": "Read, stream, write, join, modify, and validate XML files.",
//   "metadata": {
//     "tags": ["xml-processing", "automation"],
//     "featured": true,
//     "popularityScore": 90,
//     "order": 60,
//     "group": "Xml Plugin"
//   },
//   "ui": {
//     "gradient": "from-slate-500/20 to-slate-600/10",
//     "iconBg": "bg-slate-500/10",
//     "borderGlow": true,
//     "cardStyle": "premium"
//   },
//   "control": {
//     "enabled": true,
//     "version": "1.0.0"
//   },
//   "actions": [
//     {
//       "type": "read",
//       "category": "xml-automation-015",
//       "name": "Read",
//       "description": "Read action",
//       "icon": "Search",
//       "color": "bg-cyan-500",
//       "tags": ["read"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/read",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "stream-stax",
//       "category": "xml-automation-015",
//       "name": "Stream(STAX)",
//       "description": "Stream(STAX) action",
//       "icon": "Database",
//       "color": "bg-slate-500",
//       "tags": ["stream(stax)"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/stream",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "write",
//       "category": "xml-automation-015",
//       "name": "Write",
//       "description": "Write action",
//       "icon": "Edit3",
//       "color": "bg-violet-500",
//       "tags": ["write"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/write",
//         "method": "POST",
//         "headers": {
//           "Content-Type": "application/json"
//         },
//         "body": {
//           "rootElement": "{{rootElement}}",
//           "records": "{{records}}"
//         }
//       },
//       "properties": {
//         "rootElement": "",
//         "records": []
//       },
//       "propertyConfig": {
//         "rootElement": {
//           "type": "string",
//           "label": "Root Element",
//           "required": true,
//           "uiType": "input"
//         },
//         "records": {
//           "type": "array",
//           "label": "Records",
//           "required": true,
//           "uiType": "json-editor"
//         }
//       }
//     },
//     {
//       "type": "join",
//       "category": "xml-automation-015",
//       "name": "Join",
//       "description": "Join action",
//       "icon": "Circle",
//       "color": "bg-slate-500",
//       "tags": ["join"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/join",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file1": "{{file1}}",
//           "file2": "{{file2}}"
//         }
//       },
//       "properties": {
//         "file1": null,
//         "file2": null
//       },
//       "propertyConfig": {
//         "file1": {
//           "type": "file",
//           "label": "File1",
//           "required": true,
//           "uiType": "file"
//         },
//         "file2": {
//           "type": "file",
//           "label": "File2",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "add-node",
//       "category": "xml-automation-015",
//       "name": "Add-node",
//       "description": "Add-node action",
//       "icon": "Plus",
//       "color": "bg-slate-500",
//       "tags": ["add", "node"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/add-node",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}",
//           "parentTag": "{{parentTag}}",
//           "newNodeName": "{{newNodeName}}",
//           "newNodeValue": "{{newNodeValue}}"
//         }
//       },
//       "properties": {
//         "file": null,
//         "parentTag": "",
//         "newNodeName": "",
//         "newNodeValue": ""
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         },
//         "parentTag": {
//           "type": "string",
//           "label": "Parent Tag",
//           "required": true,
//           "uiType": "input"
//         },
//         "newNodeName": {
//           "type": "string",
//           "label": "New Node Name",
//           "required": true,
//           "uiType": "input"
//         },
//         "newNodeValue": {
//           "type": "string",
//           "label": "New Node Value",
//           "required": true,
//           "uiType": "input"
//         }
//       }
//     },
//     {
//       "type": "validate",
//       "category": "xml-automation-015",
//       "name": "Validate",
//       "description": "Validate action",
//       "icon": "ShieldCheck",
//       "color": "bg-red-500",
//       "tags": ["validate"],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/xml/validate",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "xmlFile": "{{xmlFile}}",
//           "xsdFile": "{{xsdFile}}"
//         }
//       },
//       "properties": {
//         "xmlFile": null,
//         "xsdFile": null
//       },
//       "propertyConfig": {
//         "xmlFile": {
//           "type": "file",
//           "label": "Xml File",
//           "required": true,
//           "uiType": "file"
//         },
//         "xsdFile": {
//           "type": "file",
//           "label": "Xsd File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     }
//   ]
// },
{
  "id": "xml-automation-015",
  "name": "XML Processing",
  "icon": "FileCode",
  "color": "bg-cyan-500",
  "description": "Read, stream, write, join, modify, and validate XML files.",
  "metadata": {
    "tags": ["xml-processing", "automation"],
    "featured": true,
    "popularityScore": 90,
    "order": 60,
    "group": "Xml Plugin"
  },
  "ui": {
    "gradient": "from-slate-500/20 to-slate-600/10",
    "iconBg": "bg-slate-500/10",
    "borderGlow": true,
    "cardStyle": "premium"
  },
  "control": {
    "enabled": true,
    "version": "1.0.0"
  },
  "actions": [
    {
      "type": "read",
      "category": "xml-automation-015",
      "name": "Read",
      "description": "Read XML file",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": ["read"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/read",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "XML File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "stream-stax",
      "category": "xml-automation-015",
      "name": "Stream(STAX)",
      "description": "Stream XML file using StAX",
      "icon": "Database",
      "color": "bg-slate-500",
      "tags": ["stream(stax)"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/stream",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "XML File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "write",
      "category": "xml-automation-015",
      "name": "Write",
      "description": "Write XML from records",
      "icon": "Edit3",
      "color": "bg-violet-500",
      "tags": ["write"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/write",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "rootElement": "{{rootElement}}",
          "records": "{{records}}"
        }
      },
      "properties": {
        "rootElement": "employees",
        "records": [
          {
            "id": "1",
            "name": "Krishna",
            "department": "RPA"
          }
        ]
      },
      "propertyConfig": {
        "rootElement": {
          "type": "string",
          "label": "Root Element",
          "placeholder": "employees",
          "required": true,
          "uiType": "input"
        },
        "records": {
          "type": "array",
          "label": "Records",
          "required": true,
          "uiType": "json-editor"
        }
      }
    },
    {
      "type": "join",
      "category": "xml-automation-015",
      "name": "Join",
      "description": "Join two XML files",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": ["join"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/join",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file1": "{{file1}}",
          "file2": "{{file2}}"
        }
      },
      "properties": {
        "file1": null,
        "file2": null
      },
      "propertyConfig": {
        "file1": {
          "type": "file",
          "label": "File 1",
          "required": true,
          "uiType": "file"
        },
        "file2": {
          "type": "file",
          "label": "File 2",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "add-node",
      "category": "xml-automation-015",
      "name": "Add-node",
      "description": "Add a new node into XML",
      "icon": "Plus",
      "color": "bg-slate-500",
      "tags": ["add", "node"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/add-node",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}",
          "parentTag": "{{parentTag}}",
          "newNodeName": "{{newNodeName}}",
          "newNodeValue": "{{newNodeValue}}"
        }
      },
      "properties": {
        "file": null,
        "parentTag": "employees",
        "newNodeName": "department",
        "newNodeValue": "RPA"
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "XML File",
          "required": true,
          "uiType": "file"
        },
        "parentTag": {
          "type": "string",
          "label": "Parent Tag",
          "placeholder": "employees",
          "required": true,
          "uiType": "input"
        },
        "newNodeName": {
          "type": "string",
          "label": "New Node Name",
          "placeholder": "department",
          "required": true,
          "uiType": "input"
        },
        "newNodeValue": {
          "type": "string",
          "label": "New Node Value",
          "placeholder": "RPA",
          "required": true,
          "uiType": "input"
        }
      }
    },
    {
      "type": "validate",
      "category": "xml-automation-015",
      "name": "Validate",
      "description": "Validate XML against XSD",
      "icon": "ShieldCheck",
      "color": "bg-red-500",
      "tags": ["validate"],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/xml/validate",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "xmlFile": "{{xmlFile}}",
          "xsdFile": "{{xsdFile}}"
        }
      },
      "properties": {
        "xmlFile": null,
        "xsdFile": null
      },
      "propertyConfig": {
        "xmlFile": {
          "type": "file",
          "label": "XML File",
          "required": true,
          "uiType": "file"
        },
        "xsdFile": {
          "type": "file",
          "label": "XSD File",
          "required": true,
          "uiType": "file"
        }
      }
    }
  ]
},
  {
    "id": "web-gui-016",
    "name": "Web GUI Automation",
    "icon": "Monitor",
    "color": "bg-purple-500",
    "description": "Automate browser actions, element handling, page controls, and data extraction.",
    "metadata": {
      "tags": [
        "web-gui-automation",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 70,
      "group": "Gui Automations"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "start-browser",
        "category": "web-gui-016",
        "name": "Start Browser",
        "description": "Start Browser action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "start",
          "browser"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/start",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "startNode": "{{startNode}}",
            "browser": "{{browser}}",
            "url": "{{url}}",
            "incognito": "{{incognito}}",
            "pageLoadTimeout": "{{pageLoadTimeout}}",
            "delay": "{{delay}}",
            "clearInstance": "{{clearInstance}}"
          }
        },
        "properties": {
          "browserName": "",
          "startNode": false,
          "browser": "",
          "url": "",
          "incognito": false,
          "pageLoadTimeout": 0,
          "delay": 0,
          "clearInstance": false
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "startNode": {
            "type": "boolean",
            "label": "Start Node",
            "required": false,
            "uiType": "input"
          },
          "browser": {
            "type": "select",
            "label": "Browser",
            "required": true,
            "uiType": "select",
            "options": [
              "chrome",
              "edge",
              "firefox"
            ]
          },
          "url": {
            "type": "string",
            "label": "Url",
            "required": true,
            "uiType": "input"
          },
          "incognito": {
            "type": "boolean",
            "label": "Incognito",
            "required": false,
            "uiType": "input"
          },
          "pageLoadTimeout": {
            "type": "number",
            "label": "Page Load Timeout",
            "required": true,
            "uiType": "input"
          },
          "delay": {
            "type": "number",
            "label": "Delay",
            "required": true,
            "uiType": "input"
          },
          "clearInstance": {
            "type": "boolean",
            "label": "Clear Instance",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "exit-browser",
        "category": "web-gui-016",
        "name": "Exit Browser",
        "description": "Exit Browser action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "exit",
          "browser"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/exit",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}"
          }
        },
        "properties": {
          "browserName": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "set-value-action",
        "category": "web-gui-016",
        "name": "Set Value Action",
        "description": "Set Value Action action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "set",
          "value",
          "action"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/setvalue/action",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "iframeIndices": [
              "{{item}}"
            ],
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "inputText": "{{inputText}}",
            "verifyEnteredText": "{{verifyEnteredText}}",
            "clearBeforeSet": "{{clearBeforeSet}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "iframeIndices": [],
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "inputText": "",
          "verifyEnteredText": false,
          "clearBeforeSet": false
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "iframeIndices": {
            "type": "array",
            "label": "Iframe Indices",
            "required": true,
            "uiType": "json-editor"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "inputText": {
            "type": "string",
            "label": "Input Text",
            "required": true,
            "uiType": "input"
          },
          "verifyEnteredText": {
            "type": "boolean",
            "label": "Verify Entered Text",
            "required": false,
            "uiType": "input"
          },
          "clearBeforeSet": {
            "type": "boolean",
            "label": "Clear Before Set",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "mouse-action",
        "category": "web-gui-016",
        "name": "Mouse Action",
        "description": "Mouse Action action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "mouse",
          "action"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/mouse-action",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "actionType": "{{actionType}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}"
          }
        },
        "properties": {
          "browserName": "",
          "actionType": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "single_click",
              "right_click",
              "double_click",
              "mouse_down",
              "mouse_up"
            ]
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-value",
        "category": "web-gui-016",
        "name": "Get Value",
        "description": "Get Value action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "value"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/getvalue",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "iframeIndices": [],
            "iframeXpath": "{{iframeXpath}}",
            "iframeId": "{{iframeId}}",
            "failIfErrorOccur": "{{failIfErrorOccur}}",
            "outputField": "{{outputField}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "iframeIndices": [],
          "iframeXpath": "",
          "iframeId": "",
          "failIfErrorOccur": false,
          "outputField": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "iframeIndices": {
            "type": "array",
            "label": "Iframe Indices",
            "required": true,
            "uiType": "json-editor"
          },
          "iframeXpath": {
            "type": "string",
            "label": "Iframe Xpath",
            "required": true,
            "uiType": "input"
          },
          "iframeId": {
            "type": "string",
            "label": "Iframe Id",
            "required": true,
            "uiType": "input"
          },
          "failIfErrorOccur": {
            "type": "boolean",
            "label": "Fail If Error Occur",
            "required": false,
            "uiType": "input"
          },
          "outputField": {
            "type": "string",
            "label": "Output Field",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "save-as-pdf",
        "category": "web-gui-016",
        "name": "Save as PDF",
        "description": "Save as PDF action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "save",
          "as",
          "pdf"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/save-pdf",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "saveAsFilename": "{{saveAsFilename}}",
            "addFilenameToResult": "{{addFilenameToResult}}",
            "settings": {
              "layout": "{{layout}}",
              "headerAndFooter": "{{headerAndFooter}}",
              "backgroundGraphics": "{{backgroundGraphics}}"
            }
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "saveAsFilename": null,
          "addFilenameToResult": false,
          "settings": {
            "layout": "",
            "headerAndFooter": false,
            "backgroundGraphics": false
          }
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "saveAsFilename": {
            "type": "file",
            "label": "Save As Filename",
            "required": true,
            "uiType": "file"
          },
          "addFilenameToResult": {
            "type": "boolean",
            "label": "Add Filename To Result",
            "required": false,
            "uiType": "input"
          },
          "settings": {
            "type": "object",
            "label": "Settings",
            "required": true,
            "layout": {
              "type": "select",
              "label": "Layout",
              "required": true,
              "uiType": "select",
              "options": [
                "portrait",
                "landscape"
              ]
            },
            "headerAndFooter": {
              "type": "boolean",
              "label": "Header And Footer",
              "required": false,
              "uiType": "input"
            },
            "backgroundGraphics": {
              "type": "boolean",
              "label": "Background Graphics",
              "required": false,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "keyboard-action",
        "category": "web-gui-016",
        "name": "Keyboard Action",
        "description": "Keyboard Action action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "keyboard",
          "action"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/special-key",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "actionType": "{{actionType}}",
            "keys": "{{keys}}"
          }
        },
        "properties": {
          "browserName": "",
          "actionType": "",
          "keys": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "key_press",
              "key_release",
              "default"
            ]
          },
          "keys": {
            "type": "string",
            "label": "Keys",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "coordinate-action",
        "category": "web-gui-016",
        "name": "Coordinate Action",
        "description": "Coordinate Action action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "coordinate",
          "action"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/coordinate-action",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserNames": "{{browserNames}}",
            "actionType": "{{actionType}}",
            "x": "{{x}}",
            "y": "{{y}}",
            "value": "{{value}}"
          }
        },
        "properties": {
          "browserNames": "",
          "actionType": "",
          "x": 0,
          "y": 0,
          "value": ""
        },
        "propertyConfig": {
          "browserNames": {
            "type": "string",
            "label": "Browser Names",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "CLICK_AT",
              "RIGHT_CLICK_AT",
              "MIDDLE_CLICK_AT",
              "DOUBLE_CLICK_AT",
              "HOVER_AT",
              "DRAG_DROP_AT",
              "SET_VALUE_AT_CURRENT_POSITION",
              "GET_VALUE_FROM_CURRENT_POSITION"
            ]
          },
          "x": {
            "type": "number",
            "label": "X",
            "required": true,
            "uiType": "input"
          },
          "y": {
            "type": "number",
            "label": "Y",
            "required": true,
            "uiType": "input"
          },
          "value": {
            "type": "string",
            "label": "Value",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-coordinates",
        "category": "web-gui-016",
        "name": "Get Coordinates",
        "description": "Get Coordinates action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "coordinates"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/coordinates?browserNames=myBrowser1",
          "method": "GET",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "requestBody": "{{requestBody}}"
          }
        },
        "properties": {
          "requestBody": ""
        },
        "propertyConfig": {
          "requestBody": {
            "type": "textarea",
            "label": "Request Body",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "capture-coordinates",
        "category": "web-gui-016",
        "name": "Capture Coordinates",
        "description": "Capture Coordinates action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "capture",
          "coordinates"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/capture",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserNames": "{{browserNames}}"
          }
        },
        "properties": {
          "browserNames": ""
        },
        "propertyConfig": {
          "browserNames": {
            "type": "string",
            "label": "Browser Names",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "navigate-url",
        "category": "web-gui-016",
        "name": "Navigate URL",
        "description": "Navigate URL action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "navigate",
          "url"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/navigate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "webUrl": "{{webUrl}}"
          }
        },
        "properties": {
          "browserName": "",
          "webUrl": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "webUrl": {
            "type": "string",
            "label": "Web Url",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "wait-until",
        "category": "web-gui-016",
        "name": "Wait Until",
        "description": "Wait Until action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "wait",
          "until"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/waitUntil",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "expectedCondition": "{{expectedCondition}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "iframeIndices": [],
            "iframeXpath": "{{iframeXpath}}",
            "iframeId": "{{iframeId}}"
          }
        },
        "properties": {
          "browserName": "",
          "expectedCondition": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "iframeIndices": [],
          "iframeXpath": "",
          "iframeId": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "expectedCondition": {
            "type": "select",
            "label": "Expected Condition",
            "required": true,
            "uiType": "select",
            "options": [
              "element present",
              "element visible",
              "element invisible",
              "element to be clickable",
              "text to be present in element",
              "text to be present in element value",
              "alert present",
              "element selected"
            ]
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "iframeIndices": {
            "type": "array",
            "label": "Iframe Indices",
            "required": true,
            "uiType": "json-editor"
          },
          "iframeXpath": {
            "type": "string",
            "label": "Iframe Xpath",
            "required": true,
            "uiType": "input"
          },
          "iframeId": {
            "type": "string",
            "label": "Iframe Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download-image",
        "category": "web-gui-016",
        "name": "Download Image",
        "description": "Download Image action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "image"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/downloadImage",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "iframeIndices": [],
            "iframeXpath": "{{iframeXpath}}",
            "iframeId": "{{iframeId}}",
            "outputFilePath": "{{outputFilePath}}",
            "addFileNameToResult": "{{addFileNameToResult}}"
          }
        },
        "properties": {
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "iframeIndices": [],
          "iframeXpath": "",
          "iframeId": "",
          "outputFilePath": null,
          "addFileNameToResult": false
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "iframeIndices": {
            "type": "array",
            "label": "Iframe Indices",
            "required": true,
            "uiType": "json-editor"
          },
          "iframeXpath": {
            "type": "string",
            "label": "Iframe Xpath",
            "required": true,
            "uiType": "input"
          },
          "iframeId": {
            "type": "string",
            "label": "Iframe Id",
            "required": true,
            "uiType": "input"
          },
          "outputFilePath": {
            "type": "file",
            "label": "Output File Path",
            "required": true,
            "uiType": "file"
          },
          "addFileNameToResult": {
            "type": "boolean",
            "label": "Add File Name To Result",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "web-file-upload",
        "category": "web-gui-016",
        "name": "Web File Upload",
        "description": "Web File Upload action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "web",
          "file",
          "upload"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/webfile-upload",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "filePath": "{{filePath}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}"
          }
        },
        "properties": {
          "browserName": "",
          "filePath": null,
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "filePath": {
            "type": "file",
            "label": "File Path",
            "required": true,
            "uiType": "file"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "web-page-scroll",
        "category": "web-gui-016",
        "name": "Web Page Scroll",
        "description": "Web Page Scroll action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "web",
          "page",
          "scroll"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/web-page-scroll",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "iframeIndices": [],
            "iframeXpath": "{{iframeXpath}}",
            "iframeId": "{{iframeId}}"
          }
        },
        "properties": {
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "iframeIndices": [],
          "iframeXpath": "",
          "iframeId": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "iframeIndices": {
            "type": "array",
            "label": "Iframe Indices",
            "required": true,
            "uiType": "json-editor"
          },
          "iframeXpath": {
            "type": "string",
            "label": "Iframe Xpath",
            "required": true,
            "uiType": "input"
          },
          "iframeId": {
            "type": "string",
            "label": "Iframe Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "set-delay",
        "category": "web-gui-016",
        "name": "Set Delay",
        "description": "Set Delay action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "set",
          "delay"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/setDelay",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}",
            "delayInMilliseconds": "{{delayInMilliseconds}}"
          }
        },
        "properties": {
          "browserName": "",
          "delayInMilliseconds": 0
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "delayInMilliseconds": {
            "type": "number",
            "label": "Delay In Milliseconds",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-all-table-data",
        "category": "web-gui-016",
        "name": "Get All Table Data",
        "description": "Get All Table Data action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "all",
          "table",
          "data"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/get-table",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "timeoutSeconds": "{{timeoutSeconds}}",
            "outputField": "{{outputField}}",
            "actionType": "{{actionType}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "timeoutSeconds": 0,
          "outputField": "",
          "actionType": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "timeoutSeconds": {
            "type": "number",
            "label": "Timeout Seconds",
            "required": true,
            "uiType": "input"
          },
          "outputField": {
            "type": "string",
            "label": "Output Field",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "getAllTableData",
              "getRowData",
              "getColumnData",
              "getCellData",
              "getRowCount",
              "getColumnCount"
            ]
          }
        }
      },
      {
        "type": "get-table-sungle-cell",
        "category": "web-gui-016",
        "name": "get-table_sungle_cell",
        "description": "get-table_sungle_cell action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "table",
          "sungle",
          "cell"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/get-cell",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "actionType": "{{actionType}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "rowIndex": "{{rowIndex}}",
            "columnIndexes": [
              "{{item}}"
            ],
            "timeoutSeconds": "{{timeoutSeconds}}",
            "outputField": "{{outputField}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "actionType": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": "",
          "rowIndex": "",
          "columnIndexes": [],
          "timeoutSeconds": "",
          "outputField": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "getAllTableData",
              "getRowData",
              "getColumnData",
              "getCellData",
              "getRowCount",
              "getColumnCount"
            ]
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "string",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "rowIndex": {
            "type": "string",
            "label": "Row Index",
            "required": true,
            "uiType": "input"
          },
          "columnIndexes": {
            "type": "array",
            "label": "Column Indexes",
            "required": true,
            "uiType": "json-editor"
          },
          "timeoutSeconds": {
            "type": "string",
            "label": "Timeout Seconds",
            "required": true,
            "uiType": "input"
          },
          "outputField": {
            "type": "string",
            "label": "Output Field",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "multi-column-get-table",
        "category": "web-gui-016",
        "name": "Multi_column_get-table",
        "description": "Multi_column_get-table action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "multi",
          "column",
          "get",
          "table"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/get-table",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "actionType": "{{actionType}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "rowIndex": "{{rowIndex}}",
            "columnIndexes": [
              "{{item}}"
            ],
            "timeoutSeconds": "{{timeoutSeconds}}",
            "outputField": "{{outputField}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "actionType": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "rowIndex": 0,
          "columnIndexes": [],
          "timeoutSeconds": 0,
          "outputField": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "select",
            "label": "Action Type",
            "required": true,
            "uiType": "select",
            "options": [
              "getAllTableData",
              "getRowData",
              "getColumnData",
              "getCellData",
              "getRowCount",
              "getColumnCount"
            ]
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "rowIndex": {
            "type": "number",
            "label": "Row Index",
            "required": true,
            "uiType": "input"
          },
          "columnIndexes": {
            "type": "array",
            "label": "Column Indexes",
            "required": true,
            "uiType": "json-editor"
          },
          "timeoutSeconds": {
            "type": "number",
            "label": "Timeout Seconds",
            "required": true,
            "uiType": "input"
          },
          "outputField": {
            "type": "string",
            "label": "Output Field",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "inject-javascripts",
        "category": "web-gui-016",
        "name": "Inject_javascripts",
        "description": "Inject_javascripts action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "inject",
          "javascripts"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/inject-javascript",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "javaScript": "{{javaScript}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "javaScript": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "javaScript": {
            "type": "textarea",
            "label": "Java Script",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "js-events",
        "category": "web-gui-016",
        "name": "JS_Events",
        "description": "JS_Events action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "js",
          "events"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/dispatch-js-event",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "action": "{{action}}",
            "actionType": "{{actionType}}",
            "bubbles": "{{bubbles}}",
            "cancelable": "{{cancelable}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "action": "",
          "actionType": "",
          "bubbles": false,
          "cancelable": false
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          },
          "actionType": {
            "type": "string",
            "label": "Action Type",
            "required": true,
            "uiType": "input"
          },
          "bubbles": {
            "type": "boolean",
            "label": "Bubbles",
            "required": false,
            "uiType": "input"
          },
          "cancelable": {
            "type": "boolean",
            "label": "Cancelable",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-element-attribute",
        "category": "web-gui-016",
        "name": "Get_Element_Attribute",
        "description": "Get_Element_Attribute action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "element",
          "attribute"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/element-attribute",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "attributes": [
              {
                "type": "{{type}}",
                "name": "{{name}}",
                "outputFieldName": "{{outputFieldName}}"
              }
            ]
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "attributes": []
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "attributes": {
            "type": "array",
            "label": "Attributes",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "get-current-windowsinfo",
        "category": "web-gui-016",
        "name": "Get_Current_WindowsInfo",
        "description": "Get_Current_WindowsInfo action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "current",
          "windowsinfo"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/current-info",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "windowTitleField": "{{windowTitleField}}",
            "pageUrlField": "{{pageUrlField}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "windowTitleField": "",
          "pageUrlField": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "windowTitleField": {
            "type": "string",
            "label": "Window Title Field",
            "required": true,
            "uiType": "input"
          },
          "pageUrlField": {
            "type": "string",
            "label": "Page Url Field",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-alertplugin",
        "category": "web-gui-016",
        "name": "Get_AlertPlugin",
        "description": "Get_AlertPlugin action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "alertplugin"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/Alert-handle",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "alertType": "{{alertType}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "alertType": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "alertType": {
            "type": "select",
            "label": "Alert Type",
            "required": true,
            "uiType": "select",
            "options": [
              "accept",
              "dismiss",
              "getText",
              "sendKeys"
            ]
          }
        }
      },
      {
        "type": "frame-locator",
        "category": "web-gui-016",
        "name": "Frame_Locator",
        "description": "Frame_Locator action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "frame",
          "locator"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/frame-locator",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "searchFrameBy": "{{searchFrameBy}}",
            "value": "{{value}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "searchFrameBy": "",
          "value": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "searchFrameBy": {
            "type": "select",
            "label": "Search Frame By",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "title",
              "element"
            ]
          },
          "value": {
            "type": "string",
            "label": "Value",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "combobox-actions",
        "category": "web-gui-016",
        "name": "ComboBox_Actions",
        "description": "ComboBox_Actions action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "combobox",
          "actions"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/combo-box-action",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "technology": "{{technology}}",
            "browserName": "{{browserName}}",
            "criteria": "{{criteria}}",
            "criteriaValue": "{{criteriaValue}}",
            "elementIndex": "{{elementIndex}}",
            "selectionBy": "{{selectionBy}}",
            "selectionValue": "{{selectionValue}}"
          }
        },
        "properties": {
          "technology": "",
          "browserName": "",
          "criteria": "",
          "criteriaValue": "",
          "elementIndex": 0,
          "selectionBy": "",
          "selectionValue": ""
        },
        "propertyConfig": {
          "technology": {
            "type": "string",
            "label": "Technology",
            "required": true,
            "uiType": "input"
          },
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          },
          "criteria": {
            "type": "select",
            "label": "Criteria",
            "required": true,
            "uiType": "select",
            "options": [
              "id",
              "name",
              "xpath",
              "css",
              "className",
              "tagName",
              "linkText",
              "partialLinkText"
            ]
          },
          "criteriaValue": {
            "type": "string",
            "label": "Criteria Value",
            "required": true,
            "uiType": "input"
          },
          "elementIndex": {
            "type": "number",
            "label": "Element Index",
            "required": true,
            "uiType": "input"
          },
          "selectionBy": {
            "type": "select",
            "label": "Selection By",
            "required": true,
            "uiType": "select",
            "options": [
              "index",
              "value",
              "visibleText"
            ]
          },
          "selectionValue": {
            "type": "string",
            "label": "Selection Value",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "close-window",
        "category": "web-gui-016",
        "name": "close-window",
        "description": "close-window action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "close",
          "window"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/automation/close-window",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "browserName": "{{browserName}}"
          }
        },
        "properties": {
          "browserName": ""
        },
        "propertyConfig": {
          "browserName": {
            "type": "string",
            "label": "Browser Name",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "data-transform-017",
    "name": "Data Transformation",
    "icon": "Shuffle",
    "color": "bg-violet-500",
    "description": "Transform, reshape, sort, split, and compute values across rows of data.",
    "metadata": {
      "tags": [
        "data-transformation",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 80,
      "group": "Data Transform"
    },
    "ui": {
      "gradient": "from-violet-500/20 to-violet-600/10",
      "iconBg": "bg-violet-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "calculator",
        "category": "data-transform-017",
        "name": "Calculate Field",
        "description": "Compute a new field from a math expression over existing numeric fields.",
        "icon": "Calculator",
        "color": "bg-violet-500",
        "tags": [
          "calculator",
          "math",
          "compute"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/calculator",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "fieldName": "{{fieldName}}",
            "expression": "{{expression}}"
          }
        },
        "properties": {
          "data": [
            {
              "price": 100,
              "quantity": 2
            }
          ],
          "fieldName": "total",
          "expression": "price * quantity"
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "fieldName": {
            "type": "string",
            "label": "New Field Name",
            "required": true,
            "uiType": "input",
            "placeholder": "total",
            "description": "Column that will hold the calculated result."
          },
          "expression": {
            "type": "string",
            "label": "Expression",
            "required": true,
            "uiType": "input",
            "placeholder": "price * quantity",
            "description": "Math over existing numeric columns, e.g. price * quantity."
          }
        }
      },
      {
        "type": "rename",
        "category": "data-transform-017",
        "name": "Rename Field",
        "description": "Rename a field on every row.",
        "icon": "Edit3",
        "color": "bg-violet-500",
        "tags": [
          "rename",
          "field"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/rename",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "oldField": "{{oldField}}",
            "newField": "{{newField}}"
          }
        },
        "properties": {
          "data": [
            {
              "name": "Ada",
              "age": 36
            }
          ],
          "oldField": "name",
          "newField": "fullName"
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "oldField": {
            "type": "string",
            "label": "Field To Rename",
            "required": true,
            "uiType": "field-select",
            "placeholder": "Select a field",
            "description": "Existing field to rename."
          },
          "newField": {
            "type": "string",
            "label": "New Field Name",
            "required": true,
            "uiType": "input",
            "placeholder": "fullName",
            "description": "New name for the field."
          }
        }
      },
      {
        "type": "sequence",
        "category": "data-transform-017",
        "name": "Add Sequence",
        "description": "Add an incrementing number to each row.",
        "icon": "ListOrdered",
        "color": "bg-violet-500",
        "tags": [
          "sequence",
          "index"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/sequence",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "fieldName": "{{fieldName}}",
            "startValue": "{{startValue}}"
          }
        },
        "properties": {
          "data": [
            {
              "name": "Ada"
            },
            {
              "name": "Grace"
            }
          ],
          "fieldName": "rowNumber",
          "startValue": 1
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "fieldName": {
            "type": "string",
            "label": "New Field Name",
            "required": true,
            "uiType": "input",
            "placeholder": "rowNumber",
            "description": "Column that will hold the sequence number."
          },
          "startValue": {
            "type": "number",
            "label": "Start Value",
            "required": false,
            "uiType": "input",
            "min": 0,
            "placeholder": "1",
            "description": "First number in the sequence (defaults to 1)."
          }
        }
      },
      {
        "type": "sort",
        "category": "data-transform-017",
        "name": "Sort Rows",
        "description": "Sort all rows by a field, ascending or descending.",
        "icon": "ArrowUpDown",
        "color": "bg-violet-500",
        "tags": [
          "sort",
          "order"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/sort",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "field": "{{field}}",
            "direction": "{{direction}}"
          }
        },
        "properties": {
          "data": [
            {
              "name": "Ada",
              "age": 36
            },
            {
              "name": "Grace",
              "age": 45
            }
          ],
          "field": "age",
          "direction": "ASC"
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "field": {
            "type": "string",
            "label": "Sort By Field",
            "required": true,
            "uiType": "field-select",
            "placeholder": "Select a field",
            "description": "Field to sort the rows by."
          },
          "direction": {
            "type": "select",
            "label": "Direction",
            "required": true,
            "options": [
              "ASC",
              "DESC"
            ],
            "description": "Ascending or descending order."
          }
        }
      },
      {
        "type": "split",
        "category": "data-transform-017",
        "name": "Split Field",
        "description": "Split a text field into multiple fields using a delimiter.",
        "icon": "Split",
        "color": "bg-violet-500",
        "tags": [
          "split",
          "text"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/split",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "field": "{{field}}",
            "delimiter": "{{delimiter}}",
            "newFields": "{{newFields}}"
          }
        },
        "properties": {
          "data": [
            {
              "fullName": "Ada Lovelace"
            }
          ],
          "field": "fullName",
          "delimiter": " ",
          "newFields": [
            "firstName",
            "lastName"
          ]
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "field": {
            "type": "string",
            "label": "Field To Split",
            "required": true,
            "uiType": "field-select",
            "placeholder": "Select a field",
            "description": "Text field to split."
          },
          "delimiter": {
            "type": "string",
            "label": "Delimiter",
            "required": true,
            "uiType": "input",
            "placeholder": " ",
            "description": "Character(s) to split on, e.g. a space or comma."
          },
          "newFields": {
            "type": "array",
            "label": "New Field Names",
            "required": true,
            "uiType": "json-editor",
            "rows": 3,
            "description": "Names for each part, in order, e.g. [\"firstName\", \"lastName\"]."
          }
        }
      },
      {
        "type": "string-operation",
        "category": "data-transform-017",
        "name": "Text Operation",
        "description": "Apply a text transformation (uppercase, trim, replace and more) to a field.",
        "icon": "Type",
        "color": "bg-violet-500",
        "tags": [
          "string",
          "text",
          "operation"
        ],
        "complexity": "basic",
        "estimatedTime": 500,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/data-transform/string-operation",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": "{{data}}",
            "field": "{{field}}",
            "operation": "{{operation}}",
            "argument": "{{argument}}"
          }
        },
        "properties": {
          "data": [
            {
              "text": "  hello world  "
            }
          ],
          "field": "text",
          "operation": "TRIM",
          "argument": ""
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Sample Data",
            "required": false,
            "uiType": "json-editor",
            "rows": 6,
            "description": "Rows normally come from the previous step. Add a couple here to preview the result and to pick fields below."
          },
          "field": {
            "type": "string",
            "label": "Field",
            "required": true,
            "uiType": "field-select",
            "placeholder": "Select a field",
            "description": "Text field to transform."
          },
          "operation": {
            "type": "select",
            "label": "Operation",
            "required": true,
            "options": [
              "UPPERCASE",
              "LOWERCASE",
              "TRIM",
              "CAPITALIZE",
              "REVERSE",
              "LENGTH",
              "SUBSTRING",
              "REPLACE"
            ],
            "description": "Text transformation to apply."
          },
          "argument": {
            "type": "string",
            "label": "Argument",
            "required": false,
            "uiType": "input",
            "placeholder": "e.g. 0,5 or world,there",
            "description": "Only used by SUBSTRING (start or start,end) and REPLACE (search,replacement)."
          }
        }
      }
    ]
  },
{
    "id": "file-operations-040",
    "name": "File Operations",
    "icon": "FileText",
    "color": "bg-orange-500",
    "description": "Create, read, write, move, copy, list, convert, and delete local files and directories.",
    "metadata": {
      "tags": [
        "file",
        "operations"
      ],
      "featured": false,
      "popularityScore": 85,
      "order": 40,
      "group": "File Operations"
    },
    "ui": {
      "gradient": "from-orange-500/20 to-orange-600/10",
      "iconBg": "bg-orange-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "create-folder",
        "category": "file-operations-040",
        "name": "Create Folder",
        "description": "Create a folder (and any missing parent folders).",
        "icon": "FolderPlus",
        "color": "bg-blue-500",
        "tags": [
          "create-folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "createdir",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Folder Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports",
            "description": "Absolute path of the folder to create. Missing parent folders are created too."
          }
        }
      },
      {
        "type": "write-into-file",
        "category": "file-operations-040",
        "name": "Write to File",
        "description": "Write text to a file (Excel-aware for .xlsx/.xls).",
        "icon": "Save",
        "color": "bg-blue-500",
        "tags": [
          "write-into-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "write",
            "sourcePath": "{{sourcePath}}",
            "content": "{{content}}"
          }
        },
        "properties": {
          "sourcePath": "",
          "content": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "File Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports\\notes.txt",
            "description": "File to write. Created if missing. A .xlsx/.xls path writes an Excel workbook."
          },
          "content": {
            "type": "textarea",
            "label": "Content",
            "required": true,
            "uiType": "input",
            "placeholder": "Text to writeâ€¦",
            "description": "For .xlsx/.xls, each line becomes a row and commas become columns."
          }
        }
      },
      {
        "type": "read-file",
        "category": "file-operations-040",
        "name": "Read File",
        "description": "Read a file and return its text and metadata.",
        "icon": "FileText",
        "color": "bg-cyan-500",
        "tags": [
          "read-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "read",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "File Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports\\notes.txt",
            "description": "File to read. Any type; text is extracted via Tika."
          }
        }
      },
      {
        "type": "create-file",
        "category": "file-operations-040",
        "name": "Create File",
        "description": "Create an empty file inside a folder.",
        "icon": "FilePlus",
        "color": "bg-blue-500",
        "tags": [
          "create-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "create",
            "sourcePath": "{{sourcePath}}",
            "fileName": "{{fileName}}"
          }
        },
        "properties": {
          "sourcePath": "",
          "fileName": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Target Folder",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports",
            "description": "Folder the new file is created in (created if missing)."
          },
          "fileName": {
            "type": "string",
            "label": "File Name",
            "required": true,
            "uiType": "input",
            "placeholder": "report.txt",
            "description": "Name of the file to create inside the target folder."
          }
        }
      },
      {
        "type": "check-file-exists",
        "category": "file-operations-040",
        "name": "Check File Exists",
        "description": "Check whether a file or folder exists.",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "check-file-exists"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "exists",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports\\notes.txt",
            "description": "File or folder path to check."
          }
        }
      },
      {
        "type": "check-file-details",
        "category": "file-operations-040",
        "name": "Check File Details",
        "description": "Get size, type, timestamps, and access flags for a path.",
        "icon": "Info",
        "color": "bg-cyan-500",
        "tags": [
          "check-file-details"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "info",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports\\notes.txt",
            "description": "File or folder to inspect."
          }
        }
      },
      {
        "type": "list-files",
        "category": "file-operations-040",
        "name": "List Files",
        "description": "List the entries in a directory.",
        "icon": "List",
        "color": "bg-cyan-500",
        "tags": [
          "list-files"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "list",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Directory Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\reports",
            "description": "Folder whose entries are listed."
          }
        }
      },
      {
        "type": "move-file",
        "category": "file-operations-040",
        "name": "Move File",
        "description": "Move a file to a new location.",
        "icon": "FolderInput",
        "color": "bg-indigo-500",
        "tags": [
          "move-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "move",
            "sourcePath": "{{sourcePath}}",
            "destinationPath": "{{destinationPath}}"
          }
        },
        "properties": {
          "sourcePath": "",
          "destinationPath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Source Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\a.txt",
            "description": "File to move."
          },
          "destinationPath": {
            "type": "string",
            "label": "Destination Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\moved\\a.txt",
            "description": "New path. Parent folders are created; an existing target is overwritten."
          }
        }
      },
      {
        "type": "check-file-type",
        "category": "file-operations-040",
        "name": "Check File Type",
        "description": "Detect a file's MIME type.",
        "icon": "FileType",
        "color": "bg-cyan-500",
        "tags": [
          "check-file-type"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "detecttype",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "File Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\file.bin",
            "description": "File whose MIME type is detected."
          }
        }
      },
      {
        "type": "get-text-from-file",
        "category": "file-operations-040",
        "name": "Extract Text",
        "description": "Extract plain text from a file.",
        "icon": "FileText",
        "color": "bg-cyan-500",
        "tags": [
          "get-text-from-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "extracttext",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "File Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\report.pdf",
            "description": "File to extract plain text from."
          }
        }
      },
      {
        "type": "convert-file",
        "category": "file-operations-040",
        "name": "Convert File",
        "description": "Convert a file ('txt' extracts text; otherwise copies).",
        "icon": "RefreshCw",
        "color": "bg-indigo-500",
        "tags": [
          "convert-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "convert",
            "sourcePath": "{{sourcePath}}",
            "destinationPath": "{{destinationPath}}",
            "content": "{{content}}"
          }
        },
        "properties": {
          "sourcePath": "",
          "destinationPath": "",
          "content": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Source Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\report.pdf",
            "description": "File to convert."
          },
          "destinationPath": {
            "type": "string",
            "label": "Destination Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\report.txt",
            "description": "Output file path. Parent folders are created."
          },
          "content": {
            "type": "string",
            "label": "Target Format",
            "required": false,
            "uiType": "input",
            "placeholder": "txt",
            "description": "Target format. 'txt' extracts text to the destination; any other value copies the file."
          }
        }
      },
      {
        "type": "copy-file",
        "category": "file-operations-040",
        "name": "Copy File",
        "description": "Copy a file to a new location.",
        "icon": "Copy",
        "color": "bg-indigo-500",
        "tags": [
          "copy-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "copy",
            "sourcePath": "{{sourcePath}}",
            "destinationPath": "{{destinationPath}}"
          }
        },
        "properties": {
          "sourcePath": "",
          "destinationPath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Source Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\a.txt",
            "description": "File to copy."
          },
          "destinationPath": {
            "type": "string",
            "label": "Destination Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\copy\\a.txt",
            "description": "Copy target. Parent folders are created; an existing target is overwritten."
          }
        }
      },
      {
        "type": "delete-file",
        "category": "file-operations-040",
        "name": "Delete File",
        "description": "Delete a file.",
        "icon": "Trash2",
        "color": "bg-rose-500",
        "tags": [
          "delete-file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "delete",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "File Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\a.txt",
            "description": "File to delete."
          }
        }
      },
      {
        "type": "delete-directory",
        "category": "file-operations-040",
        "name": "Delete Directory",
        "description": "Delete a directory and its contents.",
        "icon": "FolderMinus",
        "color": "bg-rose-500",
        "tags": [
          "delete-directory"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/files/operate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "operationType": "deletedir",
            "sourcePath": "{{sourcePath}}"
          }
        },
        "properties": {
          "sourcePath": ""
        },
        "propertyConfig": {
          "sourcePath": {
            "type": "string",
            "label": "Directory Path",
            "required": true,
            "uiType": "input",
            "placeholder": "D:\\data\\old",
            "description": "Folder to delete, including its contents (recursive)."
          }
        }
      }
    ]
  },


  {
    "id": "sftp-019",
    "name": "SFTP Plugins",
    "icon": "Server",
    "color": "bg-amber-500",
    "description": "Automate SFTP connection and file transfers.",
    "metadata": {
      "tags": [
        "sftp-plugins",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 100,
      "group": "Sftp Plugins"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "sftp-connect-test",
        "category": "sftp-019",
        "name": "sftp/connect/test",
        "description": "sftp/connect/test action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "sftp",
          "connect",
          "test"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/connect/test",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-directory",
        "category": "sftp-019",
        "name": "Create Directory",
        "description": "Create Directory action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "directory"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/directory/create",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload-file",
        "category": "sftp-019",
        "name": "upload file",
        "description": "upload file action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/upload/file",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "localFilePath": "{{localFilePath}}",
            "remoteFilePath": "{{remoteFilePath}}",
            "overwrite": "{{overwrite}}",
            "createDirectory": "{{createDirectory}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "localFilePath": null,
          "remoteFilePath": null,
          "overwrite": false,
          "createDirectory": false
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "localFilePath": {
            "type": "file",
            "label": "Local File Path",
            "required": true,
            "uiType": "file"
          },
          "remoteFilePath": {
            "type": "file",
            "label": "Remote File Path",
            "required": true,
            "uiType": "file"
          },
          "overwrite": {
            "type": "boolean",
            "label": "Overwrite",
            "required": false,
            "uiType": "input"
          },
          "createDirectory": {
            "type": "boolean",
            "label": "Create Directory",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "directory-lsit",
        "category": "sftp-019",
        "name": "Directory Lsit",
        "description": "Directory Lsit action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "directory",
          "lsit"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/directory/list",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remoteDirectory": "{{remoteDirectory}}",
            "recursive": "{{recursive}}",
            "includeHidden": "{{includeHidden}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remoteDirectory": "",
          "recursive": false,
          "includeHidden": false
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remoteDirectory": {
            "type": "string",
            "label": "Remote Directory",
            "required": true,
            "uiType": "input"
          },
          "recursive": {
            "type": "boolean",
            "label": "Recursive",
            "required": false,
            "uiType": "input"
          },
          "includeHidden": {
            "type": "boolean",
            "label": "Include Hidden",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "rename-file",
        "category": "sftp-019",
        "name": "Rename File",
        "description": "Rename File action",
        "icon": "Edit3",
        "color": "bg-slate-500",
        "tags": [
          "rename",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/file/rename",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}",
            "newPath": "{{newPath}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": "",
          "newPath": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          },
          "newPath": {
            "type": "string",
            "label": "New Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-file",
        "category": "sftp-019",
        "name": "Delete File",
        "description": "Delete File action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/file/delete",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download-file",
        "category": "sftp-019",
        "name": "Download file",
        "description": "Download file action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/download/file",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remoteFilePath": "{{remoteFilePath}}",
            "localFilePath": "{{localFilePath}}",
            "overwrite": "{{overwrite}}",
            "preserveTimestamp": "{{preserveTimestamp}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remoteFilePath": null,
          "localFilePath": null,
          "overwrite": false,
          "preserveTimestamp": false
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remoteFilePath": {
            "type": "file",
            "label": "Remote File Path",
            "required": true,
            "uiType": "file"
          },
          "localFilePath": {
            "type": "file",
            "label": "Local File Path",
            "required": true,
            "uiType": "file"
          },
          "overwrite": {
            "type": "boolean",
            "label": "Overwrite",
            "required": false,
            "uiType": "input"
          },
          "preserveTimestamp": {
            "type": "boolean",
            "label": "Preserve Timestamp",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "copy-path-remote-to-local",
        "category": "sftp-019",
        "name": "copy path remote to local",
        "description": "copy path remote to local action",
        "icon": "Copy",
        "color": "bg-pink-500",
        "tags": [
          "copy",
          "path",
          "remote",
          "to"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/copy/remote-to-local",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}",
            "localPath": "{{localPath}}",
            "overwrite": "{{overwrite}}",
            "preserveTimestamp": "{{preserveTimestamp}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": "",
          "localPath": "",
          "overwrite": false,
          "preserveTimestamp": false
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          },
          "localPath": {
            "type": "string",
            "label": "Local Path",
            "required": true,
            "uiType": "input"
          },
          "overwrite": {
            "type": "boolean",
            "label": "Overwrite",
            "required": false,
            "uiType": "input"
          },
          "preserveTimestamp": {
            "type": "boolean",
            "label": "Preserve Timestamp",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "file-exisiting",
        "category": "sftp-019",
        "name": "File Exisiting",
        "description": "File Exisiting action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "file",
          "exisiting"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/file/exists",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "file-info",
        "category": "sftp-019",
        "name": "File Info",
        "description": "File Info action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "file",
          "info"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/file/info",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remotePath": "{{remotePath}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remotePath": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remotePath": {
            "type": "string",
            "label": "Remote Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "batch-download",
        "category": "sftp-019",
        "name": "Batch Download",
        "description": "Batch Download action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "batch",
          "download"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/batch/download",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "localDirectory": "{{localDirectory}}",
            "overwrite": "{{overwrite}}",
            "preserveTimestamp": "{{preserveTimestamp}}",
            "files": [
              {
                "remotePath": "{{remotePath}}",
                "localFilename": "{{localFilename}}"
              }
            ]
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "localDirectory": "",
          "overwrite": false,
          "preserveTimestamp": false,
          "files": []
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "localDirectory": {
            "type": "string",
            "label": "Local Directory",
            "required": true,
            "uiType": "input"
          },
          "overwrite": {
            "type": "boolean",
            "label": "Overwrite",
            "required": false,
            "uiType": "input"
          },
          "preserveTimestamp": {
            "type": "boolean",
            "label": "Preserve Timestamp",
            "required": false,
            "uiType": "input"
          },
          "files": {
            "type": "array",
            "label": "Files",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "upload-batch",
        "category": "sftp-019",
        "name": "Upload Batch",
        "description": "Upload Batch action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "batch"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sftp/batch/upload",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "remoteDirectory": "{{remoteDirectory}}",
            "overwrite": "{{overwrite}}",
            "createDirectory": "{{createDirectory}}",
            "files": [
              {
                "localPath": "{{localPath}}",
                "remoteFilename": "{{remoteFilename}}"
              }
            ]
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "remoteDirectory": "",
          "overwrite": false,
          "createDirectory": false,
          "files": []
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "remoteDirectory": {
            "type": "string",
            "label": "Remote Directory",
            "required": true,
            "uiType": "input"
          },
          "overwrite": {
            "type": "boolean",
            "label": "Overwrite",
            "required": false,
            "uiType": "input"
          },
          "createDirectory": {
            "type": "boolean",
            "label": "Create Directory",
            "required": false,
            "uiType": "input"
          },
          "files": {
            "type": "array",
            "label": "Files",
            "required": true,
            "uiType": "json-editor"
          }
        }
      }
    ]
  },
  {
    "id": "zohodesk-020",
    "name": "Zoho Desk",
    "icon": "Headphones",
    "color": "bg-orange-500",
    "description": "Automate Zoho Desk ticket operations.",
    "metadata": {
      "tags": [
        "zoho-desk",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 110,
      "group": "Zohodesk"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "refresh-token",
        "category": "zohodesk-020",
        "availability": {
          "state": "unavailable",
          "code": "CONNECTION_AUTH_HELPER",
          "reason": "Authentication is managed through connector connection settings and is not a workflow action."
        },
        "name": "Refresh-Token",
        "description": "Refresh-Token action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "refresh",
          "token"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "https://accounts.zoho.in/oauth/v2/token",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "body": "{{body}}",
            "Key": "{{Key}}",
            "grant_type": "{{grant_type}}",
            "client_id": "{{client_id}}",
            "client_secret": "{{client_secret}}",
            "redirect_uri": "{{redirect_uri}}",
            "code": "{{code}}"
          }
        },
        "properties": {
          "body": "",
          "Key": "",
          "grant_type": "",
          "client_id": "",
          "client_secret": "",
          "redirect_uri": "",
          "code": ""
        },
        "propertyConfig": {
          "body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          },
          "Key": {
            "type": "string",
            "label": "Key",
            "required": true,
            "uiType": "input"
          },
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "client_id": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "client_secret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "redirect_uri": {
            "type": "string",
            "label": "Redirect Uri",
            "required": true,
            "uiType": "input"
          },
          "code": {
            "type": "string",
            "label": "Code",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-ticket",
        "category": "zohodesk-020",
        "name": "Create-Ticket",
        "description": "Create-Ticket action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "ticket"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/create-ticket",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "subject": "{{subject}}",
            "description": "{{description}}",
            "email": "{{email}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "subject": "",
          "description": "",
          "email": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "subject": {
            "type": "string",
            "label": "Subject",
            "required": true,
            "uiType": "input"
          },
          "description": {
            "type": "string",
            "label": "Description",
            "required": true,
            "uiType": "input"
          },
          "email": {
            "type": "string",
            "label": "Email",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-tickets",
        "category": "zohodesk-020",
        "name": "Get-Tickets",
        "description": "Get-Tickets action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "tickets"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/get-tickets",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "status": "{{status}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "status": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "status": {
            "type": "string",
            "label": "Status",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "update-ticket",
        "category": "zohodesk-020",
        "name": "Update-Ticket",
        "description": "Update-Ticket action",
        "icon": "Edit3",
        "color": "bg-violet-500",
        "tags": [
          "update",
          "ticket"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/update-ticket",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "ticketId": "{{ticketId}}",
            "status": "{{status}}",
            "priority": "{{priority}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "ticketId": "",
          "status": "",
          "priority": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "ticketId": {
            "type": "string",
            "label": "Ticket Id",
            "required": true,
            "uiType": "input"
          },
          "status": {
            "type": "string",
            "label": "Status",
            "required": true,
            "uiType": "input"
          },
          "priority": {
            "type": "string",
            "label": "Priority",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-ticket",
        "category": "zohodesk-020",
        "name": "Delete-Ticket",
        "description": "Delete-Ticket action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "ticket"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/delete-ticket",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "ticketId": "{{ticketId}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "ticketId": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "ticketId": {
            "type": "string",
            "label": "Ticket Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload-attachment",
        "category": "zohodesk-020",
        "name": "Upload-Attachment",
        "description": "Upload-Attachment action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "attachment"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/upload-attachment",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "Key": "{{Key}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "ticketId": "{{ticketId}}",
            "file": "{{file}}"
          }
        },
        "properties": {
          "Key": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "ticketId": "",
          "file": null
        },
        "propertyConfig": {
          "Key": {
            "type": "string",
            "label": "Key",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "ticketId": {
            "type": "string",
            "label": "Ticket Id",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "download-attachment",
        "category": "zohodesk-020",
        "name": "Download-Attachment",
        "description": "Download-Attachment action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "attachment"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/zohodesk/download-attachment",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "orgId": "{{orgId}}",
            "ticketId": "{{ticketId}}",
            "attachmentId": "{{attachmentId}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "orgId": "",
          "ticketId": "",
          "attachmentId": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "orgId": {
            "type": "string",
            "label": "Org Id",
            "required": true,
            "uiType": "input"
          },
          "ticketId": {
            "type": "string",
            "label": "Ticket Id",
            "required": true,
            "uiType": "input"
          },
          "attachmentId": {
            "type": "string",
            "label": "Attachment Id",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "sharepoint-021",
    "name": "SharePoint",
    "icon": "Share2",
    "color": "bg-teal-500",
    "description": "Automate SharePoint document operations.",
    "metadata": {
      "tags": [
        "sharepoint",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 120,
      "group": "Sharepoint"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "creds",
        "category": "sharepoint-021",
        "availability": {
          "state": "unavailable",
          "code": "CONNECTION_AUTH_HELPER",
          "reason": "Authentication is managed through connector connection settings and is not a workflow action."
        },
        "name": "Creds",
        "description": "Creds action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "creds"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "https://login.microsoftonline.com/b292bf8e-4b06-4865-b248-a1d099b8c151/oauth2/v2.0/token",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "body": "{{body}}",
            "Key": "{{Key}}",
            "client_id": "{{client_id}}",
            "client_secret": "{{client_secret}}",
            "scope": "{{scope}}",
            "grant_type": "{{grant_type}}"
          }
        },
        "properties": {
          "body": "",
          "Key": "",
          "client_id": "",
          "client_secret": "",
          "scope": "",
          "grant_type": ""
        },
        "propertyConfig": {
          "body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          },
          "Key": {
            "type": "string",
            "label": "Key",
            "required": true,
            "uiType": "input"
          },
          "client_id": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "client_secret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "scope": {
            "type": "string",
            "label": "Scope",
            "required": true,
            "uiType": "input"
          },
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "creds2",
        "category": "sharepoint-021",
        "availability": {
          "state": "unavailable",
          "code": "ACTION_NOT_CERTIFIED",
          "reason": "Prototype SharePoint list action is not certified for workflow use."
        },
        "name": "Creds2",
        "description": "Creds2 action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "creds2"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "https://graph.microsoft.com/v1.0/sites/{{YOUR_SITE_ID}}/lists",
          "method": "GET",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "Authorization": "{{Authorization}}",
            "Token": "{{Token}}"
          }
        },
        "properties": {
          "Authorization": "",
          "Token": ""
        },
        "propertyConfig": {
          "Authorization": {
            "type": "string",
            "label": "Authorization",
            "required": true,
            "uiType": "input"
          },
          "Token": {
            "type": "textarea",
            "label": "Token",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "login",
        "category": "sharepoint-021",
        "name": "Login",
        "description": "Login action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "login"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/login",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "tenantId": "{{tenantId}}"
          }
        },
        "properties": {
          "clientId": "",
          "clientSecret": "",
          "tenantId": ""
        },
        "propertyConfig": {
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-site-id",
        "category": "sharepoint-021",
        "name": "get-site-id",
        "description": "get-site-id action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "site",
          "id"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/get-site-id",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "{{name}}"
          }
        },
        "properties": {
          "name": ""
        },
        "propertyConfig": {
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "site-content",
        "category": "sharepoint-021",
        "name": "site-content",
        "description": "site-content action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "site",
          "content"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/site-content",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}"
          }
        },
        "properties": {
          "siteId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "textarea",
            "label": "Site Id",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "create-folder",
        "category": "sharepoint-021",
        "name": "create-folder",
        "description": "create-folder action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/create-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "parentId": "{{parentId}}",
            "name": "{{name}}"
          }
        },
        "properties": {
          "driveId": "",
          "parentId": "",
          "name": ""
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "parentId": {
            "type": "string",
            "label": "Parent Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-library",
        "category": "sharepoint-021",
        "name": "create-library",
        "description": "create-library action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "library"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/create-library",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "name": "{{name}}"
          }
        },
        "properties": {
          "siteId": "",
          "name": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-library",
        "category": "sharepoint-021",
        "name": "delete-library",
        "description": "delete-library action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "library"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/delete-library",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "listId": "{{listId}}"
          }
        },
        "properties": {
          "siteId": "",
          "listId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "listId": {
            "type": "string",
            "label": "List Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "search",
        "category": "sharepoint-021",
        "name": "search",
        "description": "search action",
        "icon": "Circle",
        "color": "bg-sky-500",
        "tags": [
          "search"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/search",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "query": "{{query}}"
          }
        },
        "properties": {
          "siteId": "",
          "query": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "query": {
            "type": "string",
            "label": "Query",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "share",
        "category": "sharepoint-021",
        "name": "share",
        "description": "share action",
        "icon": "Share2",
        "color": "bg-indigo-500",
        "tags": [
          "share"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/share",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "fileName": "{{fileName}}",
            "emails": [
              "{{item}}"
            ],
            "role": "{{role}}"
          }
        },
        "properties": {
          "siteId": "",
          "fileName": null,
          "emails": [],
          "role": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          },
          "emails": {
            "type": "array",
            "label": "Emails",
            "required": true,
            "uiType": "json-editor"
          },
          "role": {
            "type": "string",
            "label": "Role",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "sharing-info",
        "category": "sharepoint-021",
        "name": "sharing-info",
        "description": "sharing-info action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "sharing",
          "info"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/sharing-info",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "fileName": "{{fileName}}"
          }
        },
        "properties": {
          "siteId": "",
          "fileName": null
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "upload",
        "category": "sharepoint-021",
        "name": "upload",
        "description": "upload action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/upload",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "body": "{{body}}",
            "driveId": "{{driveId}}",
            "parentId": "{{parentId}}",
            "file": "{{file}}"
          }
        },
        "properties": {
          "body": "",
          "driveId": "",
          "parentId": "",
          "file": null
        },
        "propertyConfig": {
          "body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          },
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "parentId": {
            "type": "string",
            "label": "Parent Id",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "get-folder-items",
        "category": "sharepoint-021",
        "name": "get-folder-items",
        "description": "get-folder-items action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "folder",
          "items"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/get-folder-items",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "parentId": "{{parentId}}"
          }
        },
        "properties": {
          "driveId": "",
          "parentId": ""
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "parentId": {
            "type": "string",
            "label": "Parent Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download",
        "category": "sharepoint-021",
        "name": "download",
        "description": "download action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/download",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "body": "{{body}}",
            "driveId": "{{driveId}}",
            "itemId": "{{itemId}}"
          }
        },
        "properties": {
          "body": "",
          "driveId": "",
          "itemId": ""
        },
        "propertyConfig": {
          "body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          },
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "itemId": {
            "type": "string",
            "label": "Item Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-list-items",
        "category": "sharepoint-021",
        "name": "get-list-items",
        "description": "get-list-items action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "list",
          "items"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/get-list-items",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "listId": "{{listId}}"
          }
        },
        "properties": {
          "siteId": "",
          "listId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "listId": {
            "type": "string",
            "label": "List Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-list-columns",
        "category": "sharepoint-021",
        "name": "get-list-columns",
        "description": "get-list-columns action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "list",
          "columns"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/get-list-columns",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "listId": "{{listId}}"
          }
        },
        "properties": {
          "siteId": "",
          "listId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "listId": {
            "type": "string",
            "label": "List Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-list-item",
        "category": "sharepoint-021",
        "name": "delete-list-item",
        "description": "delete-list-item action",
        "icon": "Trash2",
        "color": "bg-teal-500",
        "tags": [
          "delete",
          "list",
          "item"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/delete-list-item",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "listId": "{{listId}}",
            "itemId": "{{itemId}}"
          }
        },
        "properties": {
          "siteId": "",
          "listId": "",
          "itemId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "listId": {
            "type": "string",
            "label": "List Id",
            "required": true,
            "uiType": "input"
          },
          "itemId": {
            "type": "string",
            "label": "Item Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-list-column",
        "category": "sharepoint-021",
        "name": "delete-list-column",
        "description": "delete-list-column action",
        "icon": "Trash2",
        "color": "bg-teal-500",
        "tags": [
          "delete",
          "list",
          "column"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/delete-list-column",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "siteId": "{{siteId}}",
            "listId": "{{listId}}",
            "columnId": "{{columnId}}"
          }
        },
        "properties": {
          "siteId": "",
          "listId": "",
          "columnId": ""
        },
        "propertyConfig": {
          "siteId": {
            "type": "string",
            "label": "Site Id",
            "required": true,
            "uiType": "input"
          },
          "listId": {
            "type": "string",
            "label": "List Id",
            "required": true,
            "uiType": "input"
          },
          "columnId": {
            "type": "string",
            "label": "Column Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "rename",
        "category": "sharepoint-021",
        "name": "rename",
        "description": "rename action",
        "icon": "Edit3",
        "color": "bg-slate-500",
        "tags": [
          "rename"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/rename",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "itemId": "{{itemId}}",
            "newName": "{{newName}}"
          }
        },
        "properties": {
          "driveId": "",
          "itemId": "",
          "newName": ""
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "itemId": {
            "type": "string",
            "label": "Item Id",
            "required": true,
            "uiType": "input"
          },
          "newName": {
            "type": "string",
            "label": "New Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "move",
        "category": "sharepoint-021",
        "name": "move",
        "description": "move action",
        "icon": "MoveRight",
        "color": "bg-amber-500",
        "tags": [
          "move"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/move",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "fileName": "{{fileName}}",
            "sourceFolderId": "{{sourceFolderId}}",
            "parentId": "{{parentId}}"
          }
        },
        "properties": {
          "driveId": "",
          "fileName": null,
          "sourceFolderId": "",
          "parentId": ""
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          },
          "sourceFolderId": {
            "type": "string",
            "label": "Source Folder Id",
            "required": true,
            "uiType": "input"
          },
          "parentId": {
            "type": "string",
            "label": "Parent Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "copy",
        "category": "sharepoint-021",
        "name": "copy",
        "description": "copy action",
        "icon": "Copy",
        "color": "bg-pink-500",
        "tags": [
          "copy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/copy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "fileName": "{{fileName}}",
            "sourceFolderId": "{{sourceFolderId}}",
            "parentId": "{{parentId}}"
          }
        },
        "properties": {
          "driveId": "",
          "fileName": null,
          "sourceFolderId": "",
          "parentId": ""
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          },
          "sourceFolderId": {
            "type": "string",
            "label": "Source Folder Id",
            "required": true,
            "uiType": "input"
          },
          "parentId": {
            "type": "string",
            "label": "Parent Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete",
        "category": "sharepoint-021",
        "name": "delete",
        "description": "delete action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/sharepoint/delete",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "driveId": "{{driveId}}",
            "sourceFolderId": "{{sourceFolderId}}",
            "fileName": "{{fileName}}"
          }
        },
        "properties": {
          "driveId": "",
          "sourceFolderId": "",
          "fileName": null
        },
        "propertyConfig": {
          "driveId": {
            "type": "string",
            "label": "Drive Id",
            "required": true,
            "uiType": "input"
          },
          "sourceFolderId": {
            "type": "string",
            "label": "Source Folder Id",
            "required": true,
            "uiType": "input"
          },
          "fileName": {
            "type": "file",
            "label": "File Name",
            "required": true,
            "uiType": "file"
          }
        }
      }
    ]
  },
  {
    "id": "amazon-s3-022",
    "name": "Amazon S3",
    "icon": "Cloud",
    "color": "bg-yellow-500",
    "description": "Automate AWS S3 bucket and object operations.",
    "metadata": {
      "tags": [
        "amazon-s3",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 130,
      "group": "Amazon S3"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "testconnection",
        "category": "amazon-s3-022",
        "name": "TestConnection",
        "description": "TestConnection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "testconnection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-bucket",
        "category": "amazon-s3-022",
        "name": "create-bucket",
        "description": "create-bucket action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "bucket"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/create-bucket",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-bucket",
        "category": "amazon-s3-022",
        "name": "delete-bucket",
        "description": "delete-bucket action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "bucket"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/delete-bucket",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-buckets",
        "category": "amazon-s3-022",
        "name": "list-buckets",
        "description": "list-buckets action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "buckets"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/list-buckets",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-bucket-policy",
        "category": "amazon-s3-022",
        "name": "get-bucket-policy",
        "description": "get-bucket-policy action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "bucket",
          "policy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/get-bucket-policy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "set-bucket-policy",
        "category": "amazon-s3-022",
        "name": "set-bucket-policy",
        "description": "set-bucket-policy action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "set",
          "bucket",
          "policy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/set-bucket-policy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "bucketPolicy": "{{bucketPolicy}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "bucketPolicy": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "bucketPolicy": {
            "type": "textarea",
            "label": "Bucket Policy",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "add-bucket-tag",
        "category": "amazon-s3-022",
        "name": "add-bucket-tag",
        "description": "add-bucket-tag action",
        "icon": "Plus",
        "color": "bg-slate-500",
        "tags": [
          "add",
          "bucket",
          "tag"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/add-bucket-tag",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "tagKey": "{{tagKey}}",
            "tagValue": "{{tagValue}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "tagKey": "",
          "tagValue": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "tagKey": {
            "type": "string",
            "label": "Tag Key",
            "required": true,
            "uiType": "input"
          },
          "tagValue": {
            "type": "string",
            "label": "Tag Value",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-object-versions",
        "category": "amazon-s3-022",
        "name": "list-object-versions",
        "description": "list-object-versions action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "object",
          "versions"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/list-object-versions",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "prefix": "{{prefix}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "prefix": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "prefix": {
            "type": "string",
            "label": "Prefix",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload-directory",
        "category": "amazon-s3-022",
        "name": "upload-directory",
        "description": "upload-directory action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "directory"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/upload-directory",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "bucketName": "{{bucketName}}",
            "files": [
              "{{item}}"
            ]
          },
          "bodyType": "form-data"
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "bucketName": "",
          "files": []
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "files": {
            "type": "array",
            "label": "Files",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "upload-file",
        "category": "amazon-s3-022",
        "name": "upload-file",
        "description": "upload-file action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/upload-file",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "bucketName": "{{bucketName}}",
            "file": "{{file}}"
          },
          "bodyType": "form-data"
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "bucketName": "",
          "file": null
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      },
      {
        "type": "copy-file",
        "category": "amazon-s3-022",
        "name": "copy-file",
        "description": "copy-file action",
        "icon": "Copy",
        "color": "bg-pink-500",
        "tags": [
          "copy",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/copy-file",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "sourceBucket": "{{sourceBucket}}",
            "sourceKey": "{{sourceKey}}",
            "destinationBucket": "{{destinationBucket}}",
            "destinationKey": "{{destinationKey}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "sourceBucket": "",
          "sourceKey": "",
          "destinationBucket": "",
          "destinationKey": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "sourceBucket": {
            "type": "string",
            "label": "Source Bucket",
            "required": true,
            "uiType": "input"
          },
          "sourceKey": {
            "type": "string",
            "label": "Source Key",
            "required": true,
            "uiType": "input"
          },
          "destinationBucket": {
            "type": "string",
            "label": "Destination Bucket",
            "required": true,
            "uiType": "input"
          },
          "destinationKey": {
            "type": "string",
            "label": "Destination Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-folder",
        "category": "amazon-s3-022",
        "name": "create-folder",
        "description": "create-folder action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/create-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "folderName": "{{folderName}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "folderName": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-bucket-policy",
        "category": "amazon-s3-022",
        "name": "delete-bucket-policy",
        "description": "delete-bucket-policy action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "bucket",
          "policy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/delete-bucket-policy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-file",
        "category": "amazon-s3-022",
        "name": "delete-file",
        "description": "delete-file action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/delete-file",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "keyName": "{{keyName}}",
            "versionId": "{{versionId}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "keyName": "",
          "versionId": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "keyName": {
            "type": "string",
            "label": "Key Name",
            "required": true,
            "uiType": "input"
          },
          "versionId": {
            "type": "string",
            "label": "Version Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download-file",
        "category": "amazon-s3-022",
        "name": "download-file",
        "description": "download-file action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/download-file",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "keyName": "{{keyName}}",
            "outputFolderPath": "{{outputFolderPath}}",
            "versionId": "{{versionId}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "keyName": "",
          "outputFolderPath": "",
          "versionId": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "keyName": {
            "type": "string",
            "label": "Key Name",
            "required": true,
            "uiType": "input"
          },
          "outputFolderPath": {
            "type": "string",
            "label": "Output Folder Path",
            "required": true,
            "uiType": "input"
          },
          "versionId": {
            "type": "string",
            "label": "Version Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download-folder",
        "category": "amazon-s3-022",
        "name": "download-folder",
        "description": "download-folder action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/aws/s3/download-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "bucketName": "{{bucketName}}",
            "keyName": "{{keyName}}",
            "outputFolderPath": "{{outputFolderPath}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": "",
          "bucketName": "",
          "keyName": "",
          "outputFolderPath": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "bucketName": {
            "type": "string",
            "label": "Bucket Name",
            "required": true,
            "uiType": "input"
          },
          "keyName": {
            "type": "string",
            "label": "Key Name",
            "required": true,
            "uiType": "input"
          },
          "outputFolderPath": {
            "type": "string",
            "label": "Output Folder Path",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "amazon-ec2-023",
    "name": "Amazon EC2",
    "icon": "Server",
    "color": "bg-red-500",
    "description": "Automate AWS EC2 instance operations.",
    "metadata": {
      "tags": [
        "amazon-ec2",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 140,
      "group": "Amazon Ec2"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "testconnection",
        "category": "amazon-ec2-023",
        "name": "TestConnection",
        "description": "TestConnection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "testconnection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "region": "{{region}}",
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}"
          }
        },
        "properties": {
          "region": "",
          "accessKey": "",
          "secretKey": ""
        },
        "propertyConfig": {
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "start-instance",
        "category": "amazon-ec2-023",
        "name": "start-instance",
        "description": "start-instance action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "start",
          "instance"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance/start",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "instance-launch",
        "category": "amazon-ec2-023",
        "name": "instance/launch",
        "description": "instance/launch action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "instance",
          "launch"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance/launch",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}",
            "amiId": "{{amiId}}",
            "instanceType": "{{instanceType}}",
            "keyName": "{{keyName}}",
            "subnetId": "{{subnetId}}",
            "minCount": "{{minCount}}",
            "maxCount": "{{maxCount}}",
            "instanceName": "{{instanceName}}",
            "securityGroupId": "{{securityGroupId}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": "",
          "amiId": "",
          "instanceType": "",
          "keyName": "",
          "subnetId": "",
          "minCount": 0,
          "maxCount": 0,
          "instanceName": "",
          "securityGroupId": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "amiId": {
            "type": "string",
            "label": "Ami Id",
            "required": true,
            "uiType": "input"
          },
          "instanceType": {
            "type": "string",
            "label": "Instance Type",
            "required": true,
            "uiType": "input"
          },
          "keyName": {
            "type": "string",
            "label": "Key Name",
            "required": true,
            "uiType": "input"
          },
          "subnetId": {
            "type": "string",
            "label": "Subnet Id",
            "required": true,
            "uiType": "input"
          },
          "minCount": {
            "type": "number",
            "label": "Min Count",
            "required": true,
            "uiType": "input"
          },
          "maxCount": {
            "type": "number",
            "label": "Max Count",
            "required": true,
            "uiType": "input"
          },
          "instanceName": {
            "type": "string",
            "label": "Instance Name",
            "required": true,
            "uiType": "input"
          },
          "securityGroupId": {
            "type": "string",
            "label": "Security Group Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "instance-properties",
        "category": "amazon-ec2-023",
        "name": "instance-properties",
        "description": "instance-properties action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "instance",
          "properties"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance-proprties",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "instance-delete",
        "category": "amazon-ec2-023",
        "name": "instance/delete",
        "description": "instance/delete action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "instance",
          "delete"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance/delete",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "modify-attribute",
        "category": "amazon-ec2-023",
        "name": "modify-attribute",
        "description": "modify-attribute action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "modify",
          "attribute"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance/modify-attribute",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}",
            "instanceType": "{{instanceType}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": "",
          "instanceType": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "instanceType": {
            "type": "string",
            "label": "Instance Type",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "instance-stop",
        "category": "amazon-ec2-023",
        "name": "instance/stop",
        "description": "instance/stop action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "instance",
          "stop"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance/stop",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-regions",
        "category": "amazon-ec2-023",
        "name": "get _regions",
        "description": "get _regions action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "regions"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/regions",
          "method": "GET",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {}
        },
        "properties": {},
        "propertyConfig": {}
      },
      {
        "type": "reboot-instance",
        "category": "amazon-ec2-023",
        "name": "reboot-instance",
        "description": "reboot-instance action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "reboot",
          "instance"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/reboot-instance",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "release-elastic-ip",
        "category": "amazon-ec2-023",
        "name": "release-elastic-ip",
        "description": "release-elastic-ip action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "release",
          "elastic",
          "ip"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/release-elastic-ip",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "allocationId": "{{allocationId}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "allocationId": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "allocationId": {
            "type": "string",
            "label": "Allocation Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "instance-properties-by-id",
        "category": "amazon-ec2-023",
        "name": "instance-properties-by-id",
        "description": "instance-properties-by-id action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "instance",
          "properties",
          "by",
          "id"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance-properties-by-id",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "instanceId": "{{instanceId}}",
            "region": "{{region}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "instanceId": "",
          "region": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-volumes",
        "category": "amazon-ec2-023",
        "name": "get-volumes",
        "description": "get-volumes action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "volumes"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/get-volumes",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "volumeIds": [
              "{{item}}"
            ]
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "volumeIds": []
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "volumeIds": {
            "type": "array",
            "label": "Volume Ids",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "instance-types",
        "category": "amazon-ec2-023",
        "name": "instance-types",
        "description": "instance-types action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "instance",
          "types"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/instance-types",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-elastic-ips",
        "category": "amazon-ec2-023",
        "name": "get-elastic-ips",
        "description": "get-elastic-ips action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "elastic",
          "ips"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/get-elastic-ips",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "allocationIds": [
              "{{item}}"
            ],
            "publicIps": [
              "{{item}}"
            ],
            "filters": [
              {
                "key": "{{key}}",
                "value": "{{value}}"
              }
            ]
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "allocationIds": [],
          "publicIps": [],
          "filters": []
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "allocationIds": {
            "type": "array",
            "label": "Allocation Ids",
            "required": true,
            "uiType": "json-editor"
          },
          "publicIps": {
            "type": "array",
            "label": "Public Ips",
            "required": true,
            "uiType": "json-editor"
          },
          "filters": {
            "type": "array",
            "label": "Filters",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "create-keypair",
        "category": "amazon-ec2-023",
        "name": "create-keypair",
        "description": "create-keypair action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "keypair"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/create-keypair",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "keyPairName": "{{keyPairName}}",
            "localFilePath": "{{localFilePath}}",
            "keyPairType": "{{keyPairType}}",
            "tags": [
              {
                "key": "{{key}}",
                "value": "{{value}}"
              }
            ]
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "keyPairName": "",
          "localFilePath": null,
          "keyPairType": "",
          "tags": []
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "keyPairName": {
            "type": "string",
            "label": "Key Pair Name",
            "required": true,
            "uiType": "input"
          },
          "localFilePath": {
            "type": "file",
            "label": "Local File Path",
            "required": true,
            "uiType": "file"
          },
          "keyPairType": {
            "type": "string",
            "label": "Key Pair Type",
            "required": true,
            "uiType": "input"
          },
          "tags": {
            "type": "array",
            "label": "Tags",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "attach-volume",
        "category": "amazon-ec2-023",
        "name": "attach-volume",
        "description": "attach-volume action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "attach",
          "volume"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/ec2/attach-volume",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessKey": "{{accessKey}}",
            "secretKey": "{{secretKey}}",
            "region": "{{region}}",
            "volumeId": "{{volumeId}}",
            "instanceId": "{{instanceId}}",
            "device": "{{device}}"
          }
        },
        "properties": {
          "accessKey": "",
          "secretKey": "",
          "region": "",
          "volumeId": "",
          "instanceId": "",
          "device": ""
        },
        "propertyConfig": {
          "accessKey": {
            "type": "string",
            "label": "Access Key",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "region": {
            "type": "string",
            "label": "Region",
            "required": true,
            "uiType": "input"
          },
          "volumeId": {
            "type": "string",
            "label": "Volume Id",
            "required": true,
            "uiType": "input"
          },
          "instanceId": {
            "type": "string",
            "label": "Instance Id",
            "required": true,
            "uiType": "input"
          },
          "device": {
            "type": "string",
            "label": "Device",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "docker-024",
    "name": "Docker",
    "icon": "Container",
    "color": "bg-slate-500",
    "description": "Automate Docker container and image operations.",
    "metadata": {
      "tags": [
        "docker",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 150,
      "group": "Docker"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "test-connection",
        "category": "docker-024",
        "name": "Test Connection",
        "description": "Test Connection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "test",
          "connection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-images",
        "category": "docker-024",
        "name": "List/images",
        "description": "List/images action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "images"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/images",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-containers",
        "category": "docker-024",
        "name": "list-containers",
        "description": "list-containers action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "containers"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/list-containers",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-containers",
        "category": "docker-024",
        "name": "create-containers",
        "description": "create-containers action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "containers"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/create-containers",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "imageName": "{{imageName}}",
            "containerName": "{{containerName}}",
            "command": [
              "{{item}}"
            ]
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "imageName": "",
          "containerName": "",
          "command": []
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "imageName": {
            "type": "string",
            "label": "Image Name",
            "required": true,
            "uiType": "input"
          },
          "containerName": {
            "type": "string",
            "label": "Container Name",
            "required": true,
            "uiType": "input"
          },
          "command": {
            "type": "array",
            "label": "Command",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "delete-container",
        "category": "docker-024",
        "name": "delete-container",
        "description": "delete-container action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/delete-container",
          "method": "DELETE",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "containerId": "{{containerId}}",
            "removeContainerForcefully": "{{removeContainerForcefully}}",
            "removeAnonymousVolumes": "{{removeAnonymousVolumes}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "containerId": "",
          "removeContainerForcefully": false,
          "removeAnonymousVolumes": false,
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "removeContainerForcefully": {
            "type": "boolean",
            "label": "Remove Container Forcefully",
            "required": false,
            "uiType": "input"
          },
          "removeAnonymousVolumes": {
            "type": "boolean",
            "label": "Remove Anonymous Volumes",
            "required": false,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "start-container",
        "category": "docker-024",
        "name": "start-container",
        "description": "start-container action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "start",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/start-container",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "containerId": "{{containerId}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "containerId": "",
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "inspect-container",
        "category": "docker-024",
        "name": "inspect-container",
        "description": "inspect-container action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "inspect",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/inspect-container",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "containerId": "{{containerId}}",
            "includeSizeOfContainer": "{{includeSizeOfContainer}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "containerId": "",
          "includeSizeOfContainer": false,
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "includeSizeOfContainer": {
            "type": "boolean",
            "label": "Include Size Of Container",
            "required": false,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "commit-container",
        "category": "docker-024",
        "name": "commit-container",
        "description": "commit-container action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "commit",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/commit-container",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "newImageName": "{{newImageName}}",
            "containerId": "{{containerId}}",
            "author": "{{author}}",
            "message": "{{message}}",
            "pause": "{{pause}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "newImageName": "",
          "containerId": "",
          "author": "",
          "message": "",
          "pause": false
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "newImageName": {
            "type": "string",
            "label": "New Image Name",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "author": {
            "type": "string",
            "label": "Author",
            "required": true,
            "uiType": "input"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "input"
          },
          "pause": {
            "type": "boolean",
            "label": "Pause",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-image",
        "category": "docker-024",
        "name": "delete-image",
        "description": "delete-image action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "image"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/delete-image",
          "method": "DELETE",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "imageId": "{{imageId}}",
            "removeImageForcefully": "{{removeImageForcefully}}",
            "removeUntaggedParentImages": "{{removeUntaggedParentImages}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "imageId": "",
          "removeImageForcefully": false,
          "removeUntaggedParentImages": false,
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "imageId": {
            "type": "string",
            "label": "Image Id",
            "required": true,
            "uiType": "input"
          },
          "removeImageForcefully": {
            "type": "boolean",
            "label": "Remove Image Forcefully",
            "required": false,
            "uiType": "input"
          },
          "removeUntaggedParentImages": {
            "type": "boolean",
            "label": "Remove Untagged Parent Images",
            "required": false,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "update-container",
        "category": "docker-024",
        "name": "update-container",
        "description": "update-container action",
        "icon": "Edit3",
        "color": "bg-violet-500",
        "tags": [
          "update",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/update-container",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "containerId": "{{containerId}}",
            "removeImageForcefully": "{{removeImageForcefully}}",
            "removeUntaggedParentImages": "{{removeUntaggedParentImages}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "containerId": "",
          "removeImageForcefully": false,
          "removeUntaggedParentImages": false,
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "removeImageForcefully": {
            "type": "boolean",
            "label": "Remove Image Forcefully",
            "required": false,
            "uiType": "input"
          },
          "removeUntaggedParentImages": {
            "type": "boolean",
            "label": "Remove Untagged Parent Images",
            "required": false,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "stop-container",
        "category": "docker-024",
        "name": "stop-container",
        "description": "stop-container action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "stop",
          "container"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/docker/stop-container",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "configurationType": "{{configurationType}}",
            "serverName": "{{serverName}}",
            "port": "{{port}}",
            "containerId": "{{containerId}}",
            "waitBeforeForceStop": "{{waitBeforeForceStop}}",
            "maxWaitForResponse": "{{maxWaitForResponse}}"
          }
        },
        "properties": {
          "configurationType": "",
          "serverName": "",
          "port": 0,
          "containerId": "",
          "waitBeforeForceStop": 0,
          "maxWaitForResponse": 0
        },
        "propertyConfig": {
          "configurationType": {
            "type": "string",
            "label": "Configuration Type",
            "required": true,
            "uiType": "input"
          },
          "serverName": {
            "type": "string",
            "label": "Server Name",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "containerId": {
            "type": "string",
            "label": "Container Id",
            "required": true,
            "uiType": "input"
          },
          "waitBeforeForceStop": {
            "type": "number",
            "label": "Wait Before Force Stop",
            "required": true,
            "uiType": "input"
          },
          "maxWaitForResponse": {
            "type": "number",
            "label": "Max Wait For Response",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "rest-integration-025",
    "name": "REST Integration",
    "icon": "Plug",
    "color": "bg-indigo-500",
    "description": "Advanced REST client automation for JSON, form-data, GraphQL, and x-www-form-urlencoded requests.",
    "metadata": {
      "tags": [
        "rest-integration",
        "rest-client",
        "http",
        "graphql",
        "form-data",
        "urlencoded"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 160,
      "group": "Rest Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "2.0.0"
    },
    "actions": [
      {
        "type": "advance-rest-client",
        "category": "rest-integration-025",
        "name": "advance-rest_client",
        "description": "REST client action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "advance",
          "rest",
          "client",
          "http",
          "json",
          "form-data",
          "graphql",
          "urlencoded"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/RestClient/advance-rest-client",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "url": "{{url}}",
            "httpMethod": "{{httpMethod}}",
            "authorization": {
              "type": "{{type}}",
              "token": "{{token}}",
              "username": "{{username}}",
              "password": "{{password}}"
            },
            "headers": [
              {
                "headerKey": "{{headerKey}}",
                "headerValue": "{{headerValue}}"
              }
            ],
            "requestBody": {
              "bodyType": "{{bodyType}}",
              "bodyFormat": "{{bodyFormat}}",
              "rawContent": "{{rawContent}}",
              "formData": "{{formData}}",
              "graphQlQuery": "{{graphQlQuery}}",
              "graphQlVariables": "{{graphQlVariables}}",
              "urlEncoded": "{{urlEncoded}}"
            },
            "settings": {
              "ignoreSslVerification": "{{ignoreSslVerification}}",
              "timeoutInSeconds": "{{timeoutInSeconds}}"
            },
            "responseFields": {
              "responseStatus": "{{responseStatus}}",
              "responseTime": "{{responseTime}}",
              "getResponseBody": "{{getResponseBody}}"
            },
            "rowData": {
              "test_case_id": "{{test_case_id}}",
              "environment": "{{environment}}"
            }
          }
        },
        "properties": {
          "url": "https://postman-echo.com/post",
          "httpMethod": "POST",
          "requestBody": {
            "bodyType": "JSON",
            "bodyFormat": "JSON",
            "rawContent": "{ \"name\":\"ABC\", \"city\":\"Mumbai\" }",
            "formData": [
              {
                "headerKey": "username",
                "headerValue": "abc123",
                "type": "text"
              },
              {
                "headerKey": "password",
                "headerValue": "12345",
                "type": "text"
              },
              {
                "headerKey": "file",
                "headerValue": "D:/test.pdf",
                "type": "file"
              }
            ],
            "graphQlQuery": "query { country(code:\"IN\") { name capital } }",
            "graphQlVariables": "{}",
            "urlEncoded": [
              {
                "headerKey": "email",
                "headerValue": "test@gmail.com"
              },
              {
                "headerKey": "token",
                "headerValue": "abc123"
              }
            ]
          },
          "authorization": {
            "type": "Bearer Token",
            "token": "test-token",
            "username": "",
            "password": ""
          },
          "headers": [
            {
              "headerKey": "Content-Type",
              "headerValue": "application/json"
            },
            {
              "headerKey": "Accept",
              "headerValue": "application/json"
            }
          ],
          "settings": {
            "timeoutInSeconds": 60,
            "ignoreSslVerification": false
          },
          "responseFields": {
            "responseStatus": "api_status_code",
            "responseTime": "api_execution_time",
            "getResponseBody": "api_response_data"
          },
          "rowData": {
            "test_case_id": "TC_001",
            "environment": "Localhost"
          }
        },
        "propertyConfig": {
          "url": {
            "type": "string",
            "label": "Url",
            "required": true,
            "uiType": "input"
          },
          "httpMethod": {
            "type": "string",
            "label": "Http Method",
            "required": true,
            "uiType": "input"
          },
          "requestBody": {
            "type": "object",
            "label": "Request Body",
            "required": true,
            "uiType": "json-editor",
            "bodyType": {
              "type": "select",
              "label": "Body Type",
              "required": true,
              "uiType": "input",
              "options": [
                "JSON",
                "form-data",
                "x-www-form-urlencoded",
                "GraphQL(Beta)"
              ]
            },
            "bodyFormat": {
              "type": "select",
              "label": "Body Format",
              "required": true,
              "uiType": "input",
              "options": [
                "JSON",
                "XML",
                "HTML",
                "plain"
              ]
            },
            "rawContent": {
              "type": "textarea",
              "label": "Raw Content",
              "required": true,
              "uiType": "textarea",
              "rows": 6
            },
            "formData": {
              "type": "array",
              "label": "Form Data",
              "required": false,
              "uiType": "json-editor"
            },
            "graphQlQuery": {
              "type": "textarea",
              "label": "GraphQL Query",
              "required": false,
              "uiType": "textarea",
              "rows": 5
            },
            "graphQlVariables": {
              "type": "textarea",
              "label": "GraphQL Variables",
              "required": false,
              "uiType": "textarea",
              "rows": 4
            },
            "urlEncoded": {
              "type": "array",
              "label": "URL Encoded",
              "required": false,
              "uiType": "json-editor"
            }
          },
          "authorization": {
            "label": "Authorization",
            "required": true,
            "uiType": "json-editor",
            "type": {
              "type": "select",
              "label": "Type",
              "required": true,
              "uiType": "input",
              "options": [
                "None",
                "Bearer Token",
                "Basic Auth"
              ]
            },
            "token": {
              "type": "string",
              "label": "Token",
              "required": false,
              "uiType": "input"
            },
            "username": {
              "type": "string",
              "label": "Username",
              "required": false,
              "uiType": "input"
            },
            "password": {
              "type": "string",
              "label": "Password",
              "required": false,
              "uiType": "input"
            }
          },
          "headers": {
            "type": "array",
            "label": "Headers",
            "required": true,
            "uiType": "json-editor"
          },
          "settings": {
            "type": "object",
            "label": "Settings",
            "required": true,
            "uiType": "json-editor",
            "ignoreSslVerification": {
              "type": "boolean",
              "label": "Ignore SSL Verification",
              "required": false,
              "uiType": "input"
            },
            "timeoutInSeconds": {
              "type": "number",
              "label": "Timeout In Seconds",
              "required": true,
              "uiType": "input"
            }
          },
          "responseFields": {
            "type": "object",
            "label": "Response Fields",
            "required": true,
            "uiType": "json-editor",
            "responseStatus": {
              "type": "string",
              "label": "Response Status",
              "required": true,
              "uiType": "input"
            },
            "responseTime": {
              "type": "string",
              "label": "Response Time",
              "required": true,
              "uiType": "input"
            },
            "getResponseBody": {
              "type": "string",
              "label": "Get Response Body",
              "required": true,
              "uiType": "input"
            }
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "test_case_id": {
              "type": "string",
              "label": "Test Case Id",
              "required": true,
              "uiType": "input"
            },
            "environment": {
              "type": "string",
              "label": "Environment",
              "required": true,
              "uiType": "input"
            }
          }
        }
      }
    ]
  },
  {
    "id": "totp-generator-026",
    "name": "TOTP Generator",
    "icon": "ShieldCheck",
    "color": "bg-pink-500",
    "description": "Generate QR codes and TOTP tokens.",
    "metadata": {
      "tags": [
        "totp-generator",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 170,
      "group": "Totp Generator"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "generate-totp",
        "category": "totp-generator-026",
        "name": "generate-totp",
        "description": "generate-totp action",
        "icon": "ShieldCheck",
        "color": "bg-pink-500",
        "tags": [
          "generate",
          "totp"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/otp/generate-totp",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "issuer": "{{issuer}}",
            "email": "{{email}}",
            "secretKey": "{{secretKey}}",
            "outputField": "{{outputField}}"
          }
        },
        "properties": {
          "issuer": "",
          "email": "",
          "secretKey": "",
          "outputField": ""
        },
        "propertyConfig": {
          "issuer": {
            "type": "string",
            "label": "Issuer",
            "required": true,
            "uiType": "input"
          },
          "email": {
            "type": "string",
            "label": "Email",
            "required": true,
            "uiType": "input"
          },
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "outputField": {
            "type": "string",
            "label": "Output Field",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "generate-qr",
        "category": "totp-generator-026",
        "name": "generate-qr",
        "description": "generate-qr action",
        "icon": "Circle",
        "color": "bg-pink-500",
        "tags": [
          "generate",
          "qr"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/otp/generate-qr",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "secretKey": "{{secretKey}}",
            "issuer": "{{issuer}}",
            "email": "{{email}}"
          }
        },
        "properties": {
          "secretKey": "",
          "issuer": "",
          "email": ""
        },
        "propertyConfig": {
          "secretKey": {
            "type": "string",
            "label": "Secret Key",
            "required": true,
            "uiType": "input"
          },
          "issuer": {
            "type": "string",
            "label": "Issuer",
            "required": true,
            "uiType": "input"
          },
          "email": {
            "type": "string",
            "label": "Email",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
//  {
//   "id": "text-processing-027",
//   "name": "Text Processing",
//   "icon": "FileText",
//   "color": "bg-fuchsia-500",
//   "description": "Process and transform text, text files, and CSV files.",
//   "metadata": {
//     "tags": [
//       "text-processing",
//       "automation"
//     ],
//     "featured": true,
//     "popularityScore": 90,
//     "order": 180,
//     "group": "Text Plugin"
//   },
//   "ui": {
//     "gradient": "from-slate-500/20 to-slate-600/10",
//     "iconBg": "bg-slate-500/10",
//     "borderGlow": true,
//     "cardStyle": "premium"
//   },
//   "control": {
//     "enabled": true,
//     "version": "1.0.0"
//   },
//   "actions": [
//     {
//       "type": "output-file-input",
//       "category": "text-processing-027",
//       "name": "Output File Input",
//       "description": "Create a text file with content",
//       "icon": "Circle",
//       "color": "bg-slate-500",
//       "tags": [
//         "output",
//         "file",
//         "input"
//       ],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/api/TextFile/createfile",
//         "method": "POST",
//         "headers": {
//           "Content-Type": "application/json"
//         },
//         "body": {
//           "fileName": "{{fileName}}",
//           "extension": "{{extension}}",
//           "content": "{{content}}"
//         }
//       },
//       "properties": {
//         "fileName": "",
//         "extension": "",
//         "content": ""
//       },
//       "propertyConfig": {
//         "fileName": {
//           "type": "string",
//           "label": "File Name",
//           "required": true,
//           "uiType": "input",
//           "placeholder": "sample.txt"
//         },
//         "extension": {
//           "type": "string",
//           "label": "Extension",
//           "required": true,
//           "uiType": "input",
//           "placeholder": ".txt"
//         },
//         "content": {
//           "type": "string",
//           "label": "Content",
//           "required": true,
//           "uiType": "textarea"
//         }
//       }
//     },
//     {
//       "type": "text-file-input",
//       "category": "text-processing-027",
//       "name": "Text File Input",
//       "description": "Upload and process a text file",
//       "icon": "FileText",
//       "color": "bg-slate-500",
//       "tags": [
//         "text",
//         "file",
//         "input"
//       ],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/api/TextFile/upload",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "rows-count",
//       "category": "text-processing-027",
//       "name": "Rows Count",
//       "description": "Count rows in a text file",
//       "icon": "Circle",
//       "color": "bg-slate-500",
//       "tags": [
//         "rows",
//         "count"
//       ],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/api/TextFile/rows-count",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "csv-file-input",
//       "category": "text-processing-027",
//       "name": "CSV File Input",
//       "description": "Upload and read a CSV file",
//       "icon": "FileSpreadsheet",
//       "color": "bg-slate-500",
//       "tags": [
//         "csv",
//         "file",
//         "input"
//       ],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/api/TextFile/csvfile-read",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     },
//     {
//       "type": "gzip-csv-file",
//       "category": "text-processing-027",
//       "name": "Gzip CSV File",
//       "description": "Process gzipped CSV file",
//       "icon": "FileSpreadsheet",
//       "color": "bg-slate-500",
//       "tags": [
//         "gzip",
//         "csv",
//         "file"
//       ],
//       "complexity": "basic",
//       "estimatedTime": 1000,
//       "supportsStreaming": false,
//       "requiresAuth": false,
//       "retryable": true,
//       "timeout": 60000,
//       "api": {
//         "url": "http://localhost:8080/engine/api/TextFile/gzip-csvfile",
//         "method": "POST",
//         "bodyType": "form-data",
//         "body": {
//           "file": "{{file}}"
//         }
//       },
//       "properties": {
//         "file": null
//       },
//       "propertyConfig": {
//         "file": {
//           "type": "file",
//           "label": "File",
//           "required": true,
//           "uiType": "file"
//         }
//       }
//     }
//   ]
// },

{
  "id": "text-processing-027",
  "name": "Text Processing",
  "icon": "FileText",
  "color": "bg-fuchsia-500",
  "description": "Process and transform text, text files, and CSV files.",
  "metadata": {
    "tags": [
      "text-processing",
      "automation"
    ],
    "featured": true,
    "popularityScore": 90,
    "order": 180,
    "group": "Text Plugin"
  },
  "ui": {
    "gradient": "from-slate-500/20 to-slate-600/10",
    "iconBg": "bg-slate-500/10",
    "borderGlow": true,
    "cardStyle": "premium"
  },
  "control": {
    "enabled": true,
    "version": "1.0.0"
  },
  "actions": [
    {
      "type": "output-file-input",
      "category": "text-processing-027",
      "name": "Output File Input",
      "description": "Create a text file with content",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": [
        "output",
        "file",
        "input"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/TextFile/createfile",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "fileName": "{{fileName}}",
          "extension": "{{extension}}",
          "content": "{{content}}"
        }
      },
      "properties": {
        "fileName": "",
        "extension": "",
        "content": ""
      },
      "propertyConfig": {
        "fileName": {
          "type": "string",
          "label": "File Name",
          "required": true,
          "uiType": "input",
          "placeholder": "sample.txt"
        },
        "extension": {
          "type": "string",
          "label": "Extension",
          "required": true,
          "uiType": "input",
          "placeholder": ".txt"
        },
        "content": {
          "type": "string",
          "label": "Content",
          "required": true,
          "uiType": "textarea"
        }
      }
    },
    {
      "type": "text-file-input",
      "category": "text-processing-027",
      "name": "Text File Input",
      "description": "Upload and process a text file",
      "icon": "FileText",
      "color": "bg-slate-500",
      "tags": [
        "text",
        "file",
        "input"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/TextFile/upload",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "rows-count",
      "category": "text-processing-027",
      "name": "Rows Count",
      "description": "Count rows in a text file",
      "icon": "Circle",
      "color": "bg-slate-500",
      "tags": [
        "rows",
        "count"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/TextFile/rows-count",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        }
      }
    },
    {
      "type": "csv-file-input",
      "category": "text-processing-027",
      "name": "CSV File Input",
      "description": "Upload and read a CSV file",
      "icon": "FileSpreadsheet",
      "color": "bg-slate-500",
      "tags": [
        "csv",
        "file",
        "input"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/TextFile/csvfile-read",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null,
        "delimiter": ",",
        "encoding": "UTF-8",
        "headerPresent": true,
        "includeFileName": false,
        "rowNumberField": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "delimiter": {
          "type": "string",
          "label": "Delimiter",
          "required": false,
          "uiType": "input",
          "default": ",",
          "placeholder": ","
        },
        "encoding": {
          "type": "string",
          "label": "Encoding",
          "required": false,
          "uiType": "select",
          "options": ["UTF-8", "ISO-8859-1", "US-ASCII", "UTF-16"],
          "default": "UTF-8"
        },
        "headerPresent": {
          "type": "boolean",
          "label": "File has header row",
          "required": false,
          "uiType": "checkbox",
          "default": true
        },
        "includeFileName": {
          "type": "boolean",
          "label": "Include file name in each row",
          "required": false,
          "uiType": "checkbox",
          "default": false
        },
        "rowNumberField": {
          "type": "string",
          "label": "Row number field name (empty to omit)",
          "required": false,
          "uiType": "input",
          "placeholder": "RowNumber"
        }
      }
    },
    {
      "type": "gzip-csv-file",
      "category": "text-processing-027",
      "name": "Gzip CSV File",
      "description": "Process gzipped CSV file",
      "icon": "FileSpreadsheet",
      "color": "bg-slate-500",
      "tags": [
        "gzip",
        "csv",
        "file"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/TextFile/gzip-csvfile",
        "method": "POST",
        "bodyType": "form-data",
        "body": {
          "file": "{{file}}"
        }
      },
      "properties": {
        "file": null,
        "delimiter": ",",
        "encoding": "UTF-8",
        "headerPresent": true,
        "includeFileName": false,
        "rowNumberField": ""
      },
      "propertyConfig": {
        "file": {
          "type": "file",
          "label": "File",
          "required": true,
          "uiType": "file"
        },
        "delimiter": {
          "type": "string",
          "label": "Delimiter",
          "required": false,
          "uiType": "input",
          "default": ",",
          "placeholder": ","
        },
        "encoding": {
          "type": "string",
          "label": "Encoding",
          "required": false,
          "uiType": "select",
          "options": ["UTF-8", "ISO-8859-1", "US-ASCII", "UTF-16"],
          "default": "UTF-8"
        },
        "headerPresent": {
          "type": "boolean",
          "label": "File has header row",
          "required": false,
          "uiType": "checkbox",
          "default": true
        },
        "includeFileName": {
          "type": "boolean",
          "label": "Include file name in each row",
          "required": false,
          "uiType": "checkbox",
          "default": false
        },
        "rowNumberField": {
          "type": "string",
          "label": "Row number field name (empty to omit)",
          "required": false,
          "uiType": "input",
          "placeholder": "RowNumber"
        }
      }
    }
  ]
},
  {
    "id": "java-filter-flow-028",
    "name": "Java Filter and Flow",
    "icon": "Filter",
    "color": "bg-emerald-500",
    "description": "Java data filtering and flow control.",
    "metadata": {
      "tags": [
        "java-filter-and-flow",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 190,
      "group": "Java Filter And Flow"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "evaluate",
        "category": "java-filter-flow-028",
        "name": "Evaluate",
        "description": "Evaluate action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "evaluate"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/evaluate",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "condition": "{{condition}}"
          }
        },
        "properties": {
          "condition": ""
        },
        "propertyConfig": {
          "condition": {
            "type": "string",
            "label": "Condition",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "xecute-ui-filter",
        "category": "java-filter-flow-028",
        "name": "xecute-ui-filter",
        "description": "xecute-ui-filter action",
        "icon": "Filter",
        "color": "bg-emerald-500",
        "tags": [
          "xecute",
          "ui",
          "filter"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/execute-ui-filter",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "leftField": "{{leftField}}",
            "operator": "{{operator}}",
            "value": {
              "type": "{{type}}",
              "value": "{{value}}"
            },
            "rowData": {
              "name": "{{name}}",
              "age": "{{age}}",
              "product": "{{product}}"
            }
          }
        },
        "properties": {
          "leftField": "",
          "operator": "",
          "value": {
            "type": "",
            "value": ""
          },
          "rowData": {
            "name": "",
            "age": 0,
            "product": ""
          }
        },
        "propertyConfig": {
          "leftField": {
            "type": "string",
            "label": "Left Field",
            "required": true,
            "uiType": "input"
          },
          "operator": {
            "type": "string",
            "label": "Operator",
            "required": true,
            "uiType": "input"
          },
          "value": {
            "type": {
              "type": "string",
              "label": "Type",
              "required": true,
              "uiType": "input"
            },
            "label": "Value",
            "required": true,
            "uiType": "json-editor",
            "value": {
              "type": "string",
              "label": "Value",
              "required": true,
              "uiType": "input"
            }
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "name": {
              "type": "string",
              "label": "Name",
              "required": true,
              "uiType": "input"
            },
            "age": {
              "type": "number",
              "label": "Age",
              "required": true,
              "uiType": "input"
            },
            "product": {
              "type": "string",
              "label": "Product",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "samplerows",
        "category": "java-filter-flow-028",
        "name": "SampleRows",
        "description": "SampleRows action",
        "icon": "Circle",
        "color": "bg-cyan-500",
        "tags": [
          "samplerows"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/sample-rows",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "linesRange": "{{linesRange}}",
            "lineNrFieldname": "{{lineNrFieldname}}",
            "currentLineNumber": "{{currentLineNumber}}",
            "rowData": {
              "name": "{{name}}",
              "product": "{{product}}"
            }
          }
        },
        "properties": {
          "linesRange": "",
          "lineNrFieldname": "",
          "currentLineNumber": 0,
          "rowData": {
            "name": "",
            "product": ""
          }
        },
        "propertyConfig": {
          "linesRange": {
            "type": "string",
            "label": "Lines Range",
            "required": true,
            "uiType": "input"
          },
          "lineNrFieldname": {
            "type": "string",
            "label": "Line Nr Fieldname",
            "required": true,
            "uiType": "input"
          },
          "currentLineNumber": {
            "type": "number",
            "label": "Current Line Number",
            "required": true,
            "uiType": "input"
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "name": {
              "type": "string",
              "label": "Name",
              "required": true,
              "uiType": "input"
            },
            "product": {
              "type": "string",
              "label": "Product",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "abortcheck",
        "category": "java-filter-flow-028",
        "name": "AbortCheck",
        "description": "AbortCheck action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "abortcheck"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/abort-check",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "action": "{{action}}",
            "abortThreshold": "{{abortThreshold}}",
            "abortMessage": "{{abortMessage}}",
            "alwaysLogRows": "{{alwaysLogRows}}",
            "currentErrorCount": "{{currentErrorCount}}",
            "rowData": {
              "item": "{{item}}"
            }
          }
        },
        "properties": {
          "action": "",
          "abortThreshold": 0,
          "abortMessage": "",
          "alwaysLogRows": false,
          "currentErrorCount": 0,
          "rowData": {
            "item": ""
          }
        },
        "propertyConfig": {
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          },
          "abortThreshold": {
            "type": "number",
            "label": "Abort Threshold",
            "required": true,
            "uiType": "input"
          },
          "abortMessage": {
            "type": "string",
            "label": "Abort Message",
            "required": true,
            "uiType": "input"
          },
          "alwaysLogRows": {
            "type": "boolean",
            "label": "Always Log Rows",
            "required": false,
            "uiType": "input"
          },
          "currentErrorCount": {
            "type": "number",
            "label": "Current Error Count",
            "required": true,
            "uiType": "input"
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "item": {
              "type": "string",
              "label": "Item",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "block",
        "category": "java-filter-flow-028",
        "name": "block",
        "description": "block action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "block"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/block",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "passAllRows": "{{passAllRows}}",
            "cacheSize": "{{cacheSize}}",
            "allRows": [
              {
                "id": "{{id}}",
                "val": "{{val}}"
              }
            ]
          }
        },
        "properties": {
          "passAllRows": false,
          "cacheSize": 0,
          "allRows": []
        },
        "propertyConfig": {
          "passAllRows": {
            "type": "boolean",
            "label": "Pass All Rows",
            "required": false,
            "uiType": "input"
          },
          "cacheSize": {
            "type": "number",
            "label": "Cache Size",
            "required": true,
            "uiType": "input"
          },
          "allRows": {
            "type": "array",
            "label": "All Rows",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "appendstreams",
        "category": "java-filter-flow-028",
        "name": "AppendStreams",
        "description": "AppendStreams action",
        "icon": "Database",
        "color": "bg-slate-500",
        "tags": [
          "appendstreams"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/append-streams",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "headHopRows": [
              {
                "id": "{{id}}",
                "product_name": "{{product_name}}",
                "price": "{{price}}",
                "in_stock": "{{in_stock}}"
              }
            ],
            "tailHopRows": [
              {
                "id": "{{id}}",
                "product_name": "{{product_name}}",
                "price": "{{price}}",
                "in_stock": "{{in_stock}}"
              }
            ]
          }
        },
        "properties": {
          "stepName": "",
          "headHopRows": [],
          "tailHopRows": []
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "headHopRows": {
            "type": "array",
            "label": "Head Hop Rows",
            "required": true,
            "uiType": "json-editor"
          },
          "tailHopRows": {
            "type": "array",
            "label": "Tail Hop Rows",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "block-utnil-finish",
        "category": "java-filter-flow-028",
        "name": "block-utnil-finish",
        "description": "block-utnil-finish action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "block",
          "utnil",
          "finish"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/block-until-finish",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "watchSteps": [
              "{{item}}"
            ],
            "inputRows": [
              {
                "id": "{{id}}",
                "data": "{{data}}"
              }
            ],
            "isFinished": "{{isFinished}}"
          }
        },
        "properties": {
          "stepName": "",
          "watchSteps": [],
          "inputRows": [],
          "isFinished": false
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "watchSteps": {
            "type": "array",
            "label": "Watch Steps",
            "required": true,
            "uiType": "json-editor"
          },
          "inputRows": {
            "type": "array",
            "label": "Input Rows",
            "required": true,
            "uiType": "json-editor"
          },
          "isFinished": {
            "type": "boolean",
            "label": "Is Finished",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "detectempty",
        "category": "java-filter-flow-028",
        "name": "DetectEmpty",
        "description": "DetectEmpty action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "detectempty"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/detect-empty",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "inputStream": [],
            "fieldTemplate": {
              "id": "{{id}}",
              "name": "{{name}}",
              "price": "{{price}}"
            }
          }
        },
        "properties": {
          "stepName": "",
          "inputStream": [],
          "fieldTemplate": {
            "id": 0,
            "name": "",
            "price": 0
          }
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "inputStream": {
            "type": "array",
            "label": "Input Stream",
            "required": true,
            "uiType": "json-editor"
          },
          "fieldTemplate": {
            "type": "object",
            "label": "Field Template",
            "required": true,
            "uiType": "json-editor",
            "id": {
              "type": "number",
              "label": "Id",
              "required": true,
              "uiType": "input"
            },
            "name": {
              "type": "string",
              "label": "Name",
              "required": true,
              "uiType": "input"
            },
            "price": {
              "type": "number",
              "label": "Price",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "concatfields",
        "category": "java-filter-flow-028",
        "name": "ConcatFields",
        "description": "ConcatFields action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "concatfields"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/concat-fields",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "targetFieldName": "{{targetFieldName}}",
            "separator": "{{separator}}",
            "enclosure": "{{enclosure}}",
            "fieldsToConcat": [
              "{{item}}"
            ],
            "rowData": {
              "city": "{{city}}",
              "state": "{{state}}",
              "zip": "{{zip}}"
            }
          }
        },
        "properties": {
          "stepName": "",
          "targetFieldName": "",
          "separator": "",
          "enclosure": "",
          "fieldsToConcat": [],
          "rowData": {
            "city": "",
            "state": "",
            "zip": ""
          }
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "targetFieldName": {
            "type": "string",
            "label": "Target Field Name",
            "required": true,
            "uiType": "input"
          },
          "separator": {
            "type": "string",
            "label": "Separator",
            "required": true,
            "uiType": "input"
          },
          "enclosure": {
            "type": "string",
            "label": "Enclosure",
            "required": true,
            "uiType": "input"
          },
          "fieldsToConcat": {
            "type": "array",
            "label": "Fields To Concat",
            "required": true,
            "uiType": "json-editor"
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "city": {
              "type": "string",
              "label": "City",
              "required": true,
              "uiType": "input"
            },
            "state": {
              "type": "string",
              "label": "State",
              "required": true,
              "uiType": "input"
            },
            "zip": {
              "type": "string",
              "label": "Zip",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "streamlookup",
        "category": "java-filter-flow-028",
        "name": "StreamLookup",
        "description": "StreamLookup action",
        "icon": "Database",
        "color": "bg-slate-500",
        "tags": [
          "streamlookup"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/stream-lookup",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "lookupKeys": [
              {
                "field": "{{field}}",
                "lookupField": "{{lookupField}}"
              }
            ],
            "retrieveFields": [
              {
                "field": "{{field}}",
                "newName": "{{newName}}",
                "defaultValue": "{{defaultValue}}"
              }
            ],
            "primaryStream": [
              {
                "emp_id": "{{emp_id}}",
                "name": "{{name}}"
              }
            ],
            "lookupData": [
              {
                "id": "{{id}}",
                "department": "{{department}}"
              }
            ]
          }
        },
        "properties": {
          "stepName": "",
          "lookupKeys": [],
          "retrieveFields": [],
          "primaryStream": [],
          "lookupData": []
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "lookupKeys": {
            "type": "array",
            "label": "Lookup Keys",
            "required": true,
            "uiType": "json-editor"
          },
          "retrieveFields": {
            "type": "array",
            "label": "Retrieve Fields",
            "required": true,
            "uiType": "json-editor"
          },
          "primaryStream": {
            "type": "array",
            "label": "Primary Stream",
            "required": true,
            "uiType": "json-editor"
          },
          "lookupData": {
            "type": "array",
            "label": "Lookup Data",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "switchcase",
        "category": "java-filter-flow-028",
        "name": "SwitchCase",
        "description": "SwitchCase action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "switchcase"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/switch-case",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "fieldNameToSwitch": "{{fieldNameToSwitch}}",
            "useStringContains": "{{useStringContains}}",
            "caseValueDataType": "{{caseValueDataType}}",
            "caseValues": [
              {
                "value": "{{value}}",
                "targetStep": "{{targetStep}}"
              }
            ],
            "defaultTargetStep": "{{defaultTargetStep}}",
            "rowData": {
              "orderId": "{{orderId}}",
              "region": "{{region}}",
              "amount": "{{amount}}"
            }
          }
        },
        "properties": {
          "stepName": "",
          "fieldNameToSwitch": "",
          "useStringContains": false,
          "caseValueDataType": "",
          "caseValues": [],
          "defaultTargetStep": "",
          "rowData": {
            "orderId": 0,
            "region": "",
            "amount": 0
          }
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "fieldNameToSwitch": {
            "type": "string",
            "label": "Field Name To Switch",
            "required": true,
            "uiType": "input"
          },
          "useStringContains": {
            "type": "boolean",
            "label": "Use String Contains",
            "required": false,
            "uiType": "input"
          },
          "caseValueDataType": {
            "type": "string",
            "label": "Case Value Data Type",
            "required": true,
            "uiType": "input"
          },
          "caseValues": {
            "type": "array",
            "label": "Case Values",
            "required": true,
            "uiType": "json-editor"
          },
          "defaultTargetStep": {
            "type": "string",
            "label": "Default Target Step",
            "required": true,
            "uiType": "input"
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "orderId": {
              "type": "number",
              "label": "Order Id",
              "required": true,
              "uiType": "input"
            },
            "region": {
              "type": "string",
              "label": "Region",
              "required": true,
              "uiType": "input"
            },
            "amount": {
              "type": "number",
              "label": "Amount",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "filter-dummy",
        "category": "java-filter-flow-028",
        "name": "Filter/Dummy",
        "description": "Filter/Dummy action",
        "icon": "Filter",
        "color": "bg-emerald-500",
        "tags": [
          "filter",
          "dummy"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/dummy",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "rowData": {
              "status": "{{status}}",
              "retryCount": "{{retryCount}}",
              "payload": "{{payload}}"
            }
          }
        },
        "properties": {
          "stepName": "",
          "rowData": {
            "status": "",
            "retryCount": 0,
            "payload": ""
          }
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "rowData": {
            "type": "object",
            "label": "Row Data",
            "required": true,
            "uiType": "json-editor",
            "status": {
              "type": "string",
              "label": "Status",
              "required": true,
              "uiType": "input"
            },
            "retryCount": {
              "type": "number",
              "label": "Retry Count",
              "required": true,
              "uiType": "input"
            },
            "payload": {
              "type": "string",
              "label": "Payload",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "detectlastrow",
        "category": "java-filter-flow-028",
        "name": "detectLastRow",
        "description": "detectLastRow action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "detectlastrow"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/filter/detect-last-row",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "stepName": "{{stepName}}",
            "resultFieldname": "{{resultFieldname}}",
            "inputStream": [
              {
                "id": "{{id}}",
                "name": "{{name}}"
              }
            ]
          }
        },
        "properties": {
          "stepName": "",
          "resultFieldname": "",
          "inputStream": []
        },
        "propertyConfig": {
          "stepName": {
            "type": "string",
            "label": "Step Name",
            "required": true,
            "uiType": "input"
          },
          "resultFieldname": {
            "type": "string",
            "label": "Result Fieldname",
            "required": true,
            "uiType": "input"
          },
          "inputStream": {
            "type": "array",
            "label": "Input Stream",
            "required": true,
            "uiType": "json-editor"
          }
        }
      }
    ]
  },
  {
    "id": "jenkins-029",
    "name": "Jenkins",
    "icon": "Cog",
    "color": "bg-gray-500",
    "description": "Automate Jenkins CI/CD operations.",
    "metadata": {
      "tags": [
        "jenkins",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 200,
      "group": "Jenkings Plugins"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "test-connection",
        "category": "jenkins-029",
        "name": "test-connection",
        "description": "test-connection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "test",
          "connection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-folder",
        "category": "jenkins-029",
        "name": "create-folder",
        "description": "create-folder action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/create-folder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-job",
        "category": "jenkins-029",
        "name": "create-job",
        "description": "create-job action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "job"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/create-job",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}",
            "jobName": "{{jobName}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": "",
          "jobName": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "build-job",
        "category": "jenkins-029",
        "name": "build-job",
        "description": "build-job action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "build",
          "job"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/build-job",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}",
            "jobName": "{{jobName}}",
            "parameters": {}
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": "",
          "jobName": "",
          "parameters": {}
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          },
          "parameters": {
            "type": "object",
            "label": "Parameters",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "create-user",
        "category": "jenkins-029",
        "name": "create-user",
        "description": "create-user action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/create-user",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "newUsername": "{{newUsername}}",
            "password": "{{password}}",
            "fullName": "{{fullName}}",
            "email": "{{email}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "newUsername": "",
          "password": "",
          "fullName": "",
          "email": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "newUsername": {
            "type": "string",
            "label": "New Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "fullName": {
            "type": "string",
            "label": "Full Name",
            "required": true,
            "uiType": "input"
          },
          "email": {
            "type": "string",
            "label": "Email",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-builds",
        "category": "jenkins-029",
        "name": "get-builds",
        "description": "get-builds action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "builds"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/get-builds",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}",
            "jobName": "{{jobName}}",
            "build": "{{build}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": "",
          "jobName": "",
          "build": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          },
          "build": {
            "type": "string",
            "label": "Build",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-user",
        "category": "jenkins-029",
        "name": "delete-user",
        "description": "delete-user action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/delete-user",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "userName": "{{userName}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "userName": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "userName": {
            "type": "string",
            "label": "User Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "stop-build",
        "category": "jenkins-029",
        "name": "stop-build",
        "description": "stop-build action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "stop",
          "build"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/stop-build",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "jobName": "{{jobName}}",
            "build": "{{build}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "jobName": "",
          "build": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          },
          "build": {
            "type": "string",
            "label": "Build",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "console-output",
        "category": "jenkins-029",
        "name": "console-output",
        "description": "console-output action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "console",
          "output"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/console-output",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}",
            "jobName": "{{jobName}}",
            "buildId": "{{buildId}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": "",
          "jobName": "",
          "buildId": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          },
          "buildId": {
            "type": "string",
            "label": "Build Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-build",
        "category": "jenkins-029",
        "name": "delete-build",
        "description": "delete-build action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "build"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/delete-build",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}",
            "folderName": "{{folderName}}",
            "jobName": "{{jobName}}",
            "buildId": "{{buildId}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": "",
          "folderName": "",
          "jobName": "",
          "buildId": 0
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          },
          "folderName": {
            "type": "string",
            "label": "Folder Name",
            "required": true,
            "uiType": "input"
          },
          "jobName": {
            "type": "string",
            "label": "Job Name",
            "required": true,
            "uiType": "input"
          },
          "buildId": {
            "type": "number",
            "label": "Build Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-users",
        "category": "jenkins-029",
        "name": "list-users",
        "description": "list-users action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "users"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/jenkings/users",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "username": "{{username}}",
            "apiToken": "{{apiToken}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "username": "",
          "apiToken": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "apiToken": {
            "type": "string",
            "label": "Api Token",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "linux-operations-030",
    "name": "Linux Operations",
    "icon": "Terminal",
    "color": "bg-lime-500",
    "description": "Automate Linux terminal sessions and commands.",
    "metadata": {
      "tags": [
        "linux-operations",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 210,
      "group": "Linux Operations"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "connect",
        "category": "linux-operations-030",
        "name": "Connect",
        "description": "Connect action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "connect"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/terminal/session/connect",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "commandexecution",
        "category": "linux-operations-030",
        "name": "CommandExecution",
        "description": "CommandExecution action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "commandexecution"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/terminal/session/execute",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "sessionId": "{{sessionId}}",
            "command": "{{command}}"
          }
        },
        "properties": {
          "sessionId": "",
          "command": ""
        },
        "propertyConfig": {
          "sessionId": {
            "type": "string",
            "label": "Session Id",
            "required": true,
            "uiType": "input"
          },
          "command": {
            "type": "string",
            "label": "Command",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "mongodb-031",
    "name": "MongoDB",
    "icon": "Database",
    "color": "bg-green-500",
    "description": "Automate MongoDB CRUD operations.",
    "metadata": {
      "tags": [
        "mongodb",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 220,
      "group": "Mongodb Plgun"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "test-connection",
        "category": "mongodb-031",
        "name": "test-connection",
        "description": "test-connection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "test",
          "connection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-documents",
        "category": "mongodb-031",
        "name": "get-documents",
        "description": "get-documents action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "documents"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/get-documents",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "databaseName": "{{databaseName}}",
            "collectionName": "{{collectionName}}",
            "criteriaQuery": "{{criteriaQuery}}",
            "batchSize": "{{batchSize}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "databaseName": "",
          "collectionName": "",
          "criteriaQuery": "",
          "batchSize": 0
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "databaseName": {
            "type": "string",
            "label": "Database Name",
            "required": true,
            "uiType": "input"
          },
          "collectionName": {
            "type": "string",
            "label": "Collection Name",
            "required": true,
            "uiType": "input"
          },
          "criteriaQuery": {
            "type": "string",
            "label": "Criteria Query",
            "required": true,
            "uiType": "input"
          },
          "batchSize": {
            "type": "number",
            "label": "Batch Size",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-document",
        "category": "mongodb-031",
        "name": "create-document",
        "description": "create-document action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "document"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/create-document",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "username": "{{username}}",
            "password": "{{password}}",
            "databaseName": "{{databaseName}}",
            "collectionName": "{{collectionName}}",
            "acceptFieldsAsJson": "{{acceptFieldsAsJson}}",
            "json": "{{json}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "username": "",
          "password": "",
          "databaseName": "",
          "collectionName": "",
          "acceptFieldsAsJson": false,
          "json": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "username": {
            "type": "string",
            "label": "Username",
            "required": true,
            "uiType": "input"
          },
          "password": {
            "type": "string",
            "label": "Password",
            "required": true,
            "uiType": "input"
          },
          "databaseName": {
            "type": "string",
            "label": "Database Name",
            "required": true,
            "uiType": "input"
          },
          "collectionName": {
            "type": "string",
            "label": "Collection Name",
            "required": true,
            "uiType": "input"
          },
          "acceptFieldsAsJson": {
            "type": "boolean",
            "label": "Accept Fields As Json",
            "required": false,
            "uiType": "input"
          },
          "json": {
            "type": "string",
            "label": "Json",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-document",
        "category": "mongodb-031",
        "name": "delete-document",
        "description": "delete-document action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "document"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/delete-document",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "databaseName": "{{databaseName}}",
            "collectionName": "{{collectionName}}",
            "criteriaQuery": "{{criteriaQuery}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "databaseName": "",
          "collectionName": "",
          "criteriaQuery": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "databaseName": {
            "type": "string",
            "label": "Database Name",
            "required": true,
            "uiType": "input"
          },
          "collectionName": {
            "type": "string",
            "label": "Collection Name",
            "required": true,
            "uiType": "input"
          },
          "criteriaQuery": {
            "type": "string",
            "label": "Criteria Query",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "update-document",
        "category": "mongodb-031",
        "name": "update-document",
        "description": "update-document action",
        "icon": "Edit3",
        "color": "bg-violet-500",
        "tags": [
          "update",
          "document"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/update-document",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "databaseName": "{{databaseName}}",
            "collectionName": "{{collectionName}}",
            "criteriaQuery": "{{criteriaQuery}}",
            "updateQuery": "{{updateQuery}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "databaseName": "",
          "collectionName": "",
          "criteriaQuery": "",
          "updateQuery": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "databaseName": {
            "type": "string",
            "label": "Database Name",
            "required": true,
            "uiType": "input"
          },
          "collectionName": {
            "type": "string",
            "label": "Collection Name",
            "required": true,
            "uiType": "input"
          },
          "criteriaQuery": {
            "type": "string",
            "label": "Criteria Query",
            "required": true,
            "uiType": "input"
          },
          "updateQuery": {
            "type": "string",
            "label": "Update Query",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-database-collection",
        "category": "mongodb-031",
        "name": "create-database-collection",
        "description": "create-database-collection action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "database",
          "collection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/mongodb/create-database-collection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "host": "{{host}}",
            "port": "{{port}}",
            "databaseName": "{{databaseName}}",
            "collectionName": "{{collectionName}}"
          }
        },
        "properties": {
          "host": "",
          "port": 0,
          "databaseName": "",
          "collectionName": ""
        },
        "propertyConfig": {
          "host": {
            "type": "string",
            "label": "Host",
            "required": true,
            "uiType": "input"
          },
          "port": {
            "type": "number",
            "label": "Port",
            "required": true,
            "uiType": "input"
          },
          "databaseName": {
            "type": "string",
            "label": "Database Name",
            "required": true,
            "uiType": "input"
          },
          "collectionName": {
            "type": "string",
            "label": "Collection Name",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "jumpcloud-032",
    "name": "JumpCloud",
    "icon": "Cloud",
    "color": "bg-sky-600",
    "description": "Automate JumpCloud identity management.",
    "metadata": {
      "tags": [
        "jumpcloud",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 230,
      "group": "Jump Cloud Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "test-connection",
        "category": "jumpcloud-032",
        "name": "test-connection",
        "description": "test-connection action",
        "icon": "Plug",
        "color": "bg-slate-500",
        "tags": [
          "test",
          "connection"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/test-connection",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "list-user",
        "category": "jumpcloud-032",
        "name": "list-user",
        "description": "list-user action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/list-user",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-user-system",
        "category": "jumpcloud-032",
        "name": "create-user-system",
        "description": "create-user-system action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "user",
          "system"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/create-user-system",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}",
            "isJson": "{{isJson}}",
            "jsonBody": {
              "username": "{{username}}",
              "email": "{{email}}",
              "firstname": "{{firstname}}",
              "lastname": "{{lastname}}"
            }
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": "",
          "isJson": false,
          "jsonBody": {
            "username": "",
            "email": "",
            "firstname": "",
            "lastname": ""
          }
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          },
          "isJson": {
            "type": "boolean",
            "label": "Is Json",
            "required": false,
            "uiType": "input"
          },
          "jsonBody": {
            "type": "object",
            "label": "Json Body",
            "required": true,
            "uiType": "json-editor",
            "username": {
              "type": "string",
              "label": "Username",
              "required": true,
              "uiType": "input"
            },
            "email": {
              "type": "string",
              "label": "Email",
              "required": true,
              "uiType": "input"
            },
            "firstname": {
              "type": "string",
              "label": "Firstname",
              "required": true,
              "uiType": "input"
            },
            "lastname": {
              "type": "string",
              "label": "Lastname",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "create-group",
        "category": "jumpcloud-032",
        "name": "create-group",
        "description": "create-group action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "group"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/create-group",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}",
            "groupName": "{{groupName}}",
            "description": "{{description}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": "",
          "groupName": "",
          "description": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          },
          "groupName": {
            "type": "string",
            "label": "Group Name",
            "required": true,
            "uiType": "input"
          },
          "description": {
            "type": "string",
            "label": "Description",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-group",
        "category": "jumpcloud-032",
        "name": "delete-group",
        "description": "delete-group action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "group"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/delete-group",
          "method": "DELETE",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}",
            "groupName": "{{groupName}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": "",
          "groupName": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          },
          "groupName": {
            "type": "string",
            "label": "Group Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "delete-user",
        "category": "jumpcloud-032",
        "name": "delete-user",
        "description": "delete-user action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8081/engine/api/jumpcloud/delete-user",
          "method": "DELETE",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "baseUrl": "{{baseUrl}}",
            "apiKey": "{{apiKey}}",
            "userId": "{{userId}}"
          }
        },
        "properties": {
          "baseUrl": "",
          "apiKey": "",
          "userId": ""
        },
        "propertyConfig": {
          "baseUrl": {
            "type": "string",
            "label": "Base Url",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "Api Key",
            "required": true,
            "uiType": "input"
          },
          "userId": {
            "type": "string",
            "label": "User Id",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "asana-033",
    "name": "Asana",
    "icon": "CheckSquare",
    "color": "bg-indigo-600",
    "description": "Automate Asana workspace and task operations.",
    "metadata": {
      "tags": [
        "asana",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 240,
      "group": "Asana Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "login",
        "category": "asana-033",
        "name": "login",
        "description": "login action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "login"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/login",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}"
          }
        },
        "properties": {
          "accessToken": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "string",
            "label": "Access Token",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-workspaces",
        "category": "asana-033",
        "name": "get-workspaces",
        "description": "get-workspaces action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "workspaces"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/get-workspaces",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {}
        },
        "properties": {},
        "propertyConfig": {}
      },
      {
        "type": "list-users",
        "category": "asana-033",
        "name": "list-users",
        "description": "list-users action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "list",
          "users"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/list-users",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "workspaceId": "{{workspaceId}}"
          }
        },
        "properties": {
          "workspaceId": ""
        },
        "propertyConfig": {
          "workspaceId": {
            "type": "string",
            "label": "Workspace Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-all-templates",
        "category": "asana-033",
        "name": "Get Project Templates",
        "description": "List Asana project templates for a workspace or team",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "project",
          "templates"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/asana/get-project-templates",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "workspaceId": "{{workspaceId}}",
            "teamId": "{{teamId}}",
            "name": "{{name}}",
            "limit": "{{limit}}",
            "offset": "{{offset}}"
          }
        },
        "properties": {
          "workspaceId": "",
          "teamId": "",
          "name": "",
          "limit": 50,
          "offset": ""
        },
        "propertyConfig": {
          "workspaceId": {
            "type": "string",
            "label": "Workspace Id",
            "required": false,
            "uiType": "input"
          },
          "teamId": {
            "type": "string",
            "label": "Team Id",
            "required": false,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name Contains",
            "required": false,
            "uiType": "input"
          },
          "limit": {
            "type": "number",
            "label": "Limit (1-100)",
            "required": false,
            "uiType": "input"
          },
          "offset": {
            "type": "string",
            "label": "Pagination Offset",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-team",
        "category": "asana-033",
        "name": "create-team",
        "description": "create-team action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "team"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/create-team",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "resourceId": "{{resourceId}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "resourceId": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "resourceId": {
            "type": "string",
            "label": "Resource Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "add-user",
        "category": "asana-033",
        "name": "add-user",
        "description": "add-user action",
        "icon": "Plus",
        "color": "bg-slate-500",
        "tags": [
          "add",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/add-user",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "workspaceId": "{{workspaceId}}"
          }
        },
        "properties": {
          "workspaceId": ""
        },
        "propertyConfig": {
          "workspaceId": {
            "type": "string",
            "label": "Workspace Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "remove-user",
        "category": "asana-033",
        "name": "remove-user",
        "description": "remove-user action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "remove",
          "user"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/remove-user",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "teamId": "{{teamId}}",
            "userId": "{{userId}}"
          }
        },
        "properties": {
          "teamId": "",
          "userId": ""
        },
        "propertyConfig": {
          "teamId": {
            "type": "string",
            "label": "Team Id",
            "required": true,
            "uiType": "input"
          },
          "userId": {
            "type": "string",
            "label": "User Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-project",
        "category": "asana-033",
        "name": "create-project",
        "description": "create-project action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "project"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/create-project",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "teamId": "{{teamId}}",
            "name": "{{name}}",
            "notes": "{{notes}}"
          }
        },
        "properties": {
          "teamId": "",
          "name": "",
          "notes": ""
        },
        "propertyConfig": {
          "teamId": {
            "type": "string",
            "label": "Team Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          },
          "notes": {
            "type": "string",
            "label": "Notes",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-projects",
        "category": "asana-033",
        "name": "get-projects",
        "description": "get-projects action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "projects"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/get-projects",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "workspaceId": "{{workspaceId}}"
          }
        },
        "properties": {
          "workspaceId": ""
        },
        "propertyConfig": {
          "workspaceId": {
            "type": "string",
            "label": "Workspace Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-task",
        "category": "asana-033",
        "name": "create-task",
        "description": "create-task action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "task"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/create-task",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "projectId": "{{projectId}}",
            "name": "{{name}}",
            "notes": "{{notes}}"
          }
        },
        "properties": {
          "projectId": "",
          "name": "",
          "notes": ""
        },
        "propertyConfig": {
          "projectId": {
            "type": "string",
            "label": "Project Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          },
          "notes": {
            "type": "string",
            "label": "Notes",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-subtask",
        "category": "asana-033",
        "name": "create-subtask",
        "description": "create-subtask action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "subtask"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/create-subtask",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "taskId": "{{taskId}}",
            "name": "{{name}}"
          }
        },
        "properties": {
          "taskId": "",
          "name": ""
        },
        "propertyConfig": {
          "taskId": {
            "type": "string",
            "label": "Task Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-tasks",
        "category": "asana-033",
        "name": "get-tasks",
        "description": "get-tasks action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "tasks"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/get-tasks",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "projectId": "{{projectId}}",
            "name": "{{name}}",
            "notes": "{{notes}}"
          }
        },
        "properties": {
          "projectId": "",
          "name": "",
          "notes": ""
        },
        "propertyConfig": {
          "projectId": {
            "type": "string",
            "label": "Project Id",
            "required": true,
            "uiType": "input"
          },
          "name": {
            "type": "string",
            "label": "Name",
            "required": true,
            "uiType": "input"
          },
          "notes": {
            "type": "string",
            "label": "Notes",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-story-comment",
        "category": "asana-033",
        "name": "create-story(Comment)",
        "description": "create-story(Comment) action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "story(comment)"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/create-story",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "taskId": "{{taskId}}",
            "notes": "{{notes}}"
          }
        },
        "properties": {
          "taskId": "",
          "notes": ""
        },
        "propertyConfig": {
          "taskId": {
            "type": "string",
            "label": "Task Id",
            "required": true,
            "uiType": "input"
          },
          "notes": {
            "type": "string",
            "label": "Notes",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "upload-file",
        "category": "asana-033",
        "name": "upload-file",
        "description": "upload-file action",
        "icon": "Upload",
        "color": "bg-emerald-500",
        "tags": [
          "upload",
          "file"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/asana/upload-file",
          "method": "POST",
          "headers": {
            "Content-Type": "multipart/form-data"
          },
          "bodyType": "form-data",
          "body": {
            "Body": "{{Body}}",
            "taskId": "{{taskId}}",
            "file": "{{file}}"
          }
        },
        "properties": {
          "Body": "",
          "taskId": "",
          "file": null
        },
        "propertyConfig": {
          "Body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          },
          "taskId": {
            "type": "string",
            "label": "Task Id",
            "required": true,
            "uiType": "input"
          },
          "file": {
            "type": "file",
            "label": "File",
            "required": true,
            "uiType": "file"
          }
        }
      }
    ]
  },
  {
    "id": "adobe-sign-034",
    "name": "Adobe Sign",
    "icon": "PenTool",
    "color": "bg-purple-600",
    "description": "Automate Adobe Sign document workflows.",
    "metadata": {
      "tags": [
        "adobe-sign",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 250,
      "group": "Adobe Sign Plugin"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": false,
      "version": "1.0.0",
      "availability": {
        "state": "unavailable",
        "code": "BACKEND_CONNECTOR_NOT_INSTALLED",
        "reason": "Backend connector not installed"
      }
    },
    "actions": [
      {
        "type": "creds",
        "category": "adobe-sign-034",
        "name": "Creds",
        "description": "Creds action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "creds"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/api/v1/adobe/auth/exchange?clientId=ats-fa64848f-1b38-42cb-a706-cca56b53f52c&clientSecret=__MOVED_TO_SERVER_CONNECTIONS__&code=__OAUTH_CODE_REMOVED__&redirectUri=https://localhost:8080/adobesignplugin&apiAccessPoint=https://secure.in1.adobesign.com",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "params": "{{params}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "code": "{{code}}",
            "redirectUri": "{{redirectUri}}",
            "apiAccessPoint": "{{apiAccessPoint}}"
          }
        },
        "properties": {
          "params": "",
          "clientId": "",
          "clientSecret": "",
          "code": "",
          "redirectUri": "",
          "apiAccessPoint": ""
        },
        "propertyConfig": {
          "params": {
            "type": "string",
            "label": "Params",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "code": {
            "type": "string",
            "label": "Code",
            "required": true,
            "uiType": "input"
          },
          "redirectUri": {
            "type": "string",
            "label": "Redirect Uri",
            "required": true,
            "uiType": "input"
          },
          "apiAccessPoint": {
            "type": "string",
            "label": "Api Access Point",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "transient-documents",
        "category": "adobe-sign-034",
        "name": "transient-documents",
        "description": "transient-documents action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "transient",
          "documents"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/transient-documents",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "Headers": "{{Headers}}",
            "Authorization": "{{Authorization}}",
            "X-Api-Base-Url": "{{X-Api-Base-Url}}",
            "Body": "{{Body}}"
          }
        },
        "properties": {
          "Headers": "",
          "Authorization": "",
          "X-Api-Base-Url": "",
          "Body": ""
        },
        "propertyConfig": {
          "Headers": {
            "type": "string",
            "label": "Headers",
            "required": true,
            "uiType": "input"
          },
          "Authorization": {
            "type": "textarea",
            "label": "Authorization",
            "required": true,
            "uiType": "textarea"
          },
          "X-Api-Base-Url": {
            "type": "string",
            "label": "X Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "Body": {
            "type": "string",
            "label": "Body",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-templates",
        "category": "adobe-sign-034",
        "name": "Create Templates",
        "description": "Create Templates action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "templates"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/templates/create",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "payload": {
              "name": "{{name}}",
              "sharingMode": "{{sharingMode}}",
              "state": "{{state}}",
              "templateTypes": [
                "{{item}}"
              ],
              "fileInfos": [
                {
                  "transientDocumentId": "{{transientDocumentId}}"
                }
              ]
            }
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "payload": {
            "name": "",
            "sharingMode": "",
            "state": "",
            "templateTypes": [],
            "fileInfos": []
          }
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "payload": {
            "type": "object",
            "label": "Payload",
            "required": true,
            "uiType": "json-editor",
            "name": {
              "type": "string",
              "label": "Name",
              "required": true,
              "uiType": "input"
            },
            "sharingMode": {
              "type": "string",
              "label": "Sharing Mode",
              "required": true,
              "uiType": "input"
            },
            "state": {
              "type": "string",
              "label": "State",
              "required": true,
              "uiType": "input"
            },
            "templateTypes": {
              "type": "array",
              "label": "Template Types",
              "required": true,
              "uiType": "json-editor"
            },
            "fileInfos": {
              "type": "array",
              "label": "File Infos",
              "required": true,
              "uiType": "json-editor"
            }
          }
        }
      },
      {
        "type": "get-all-templates",
        "category": "adobe-sign-034",
        "name": "Get all templates",
        "description": "Get all templates action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "all",
          "templates"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/api/engine/v1/adobe/templates/list",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "templates-download",
        "category": "adobe-sign-034",
        "name": "Templates Download",
        "description": "Templates Download action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "templates",
          "download"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/templates/download",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "resourceId": "{{resourceId}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "resourceId": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "resourceId": {
            "type": "string",
            "label": "Resource Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "create-agreement",
        "category": "adobe-sign-034",
        "name": "Create Agreement",
        "description": "Create Agreement action",
        "icon": "Plus",
        "color": "bg-blue-500",
        "tags": [
          "create",
          "agreement"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/agreements/create",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "payload": {
              "fileInfos": [
                {
                  "libraryDocumentId": "{{libraryDocumentId}}"
                }
              ],
              "name": "{{name}}",
              "participantSetsInfo": [
                {
                  "memberInfos": [
                    {
                      "email": "{{email}}"
                    }
                  ],
                  "order": "{{order}}",
                  "role": "{{role}}"
                }
              ],
              "signatureType": "{{signatureType}}",
              "state": "{{state}}"
            }
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "payload": {
            "fileInfos": [],
            "name": "",
            "participantSetsInfo": [],
            "signatureType": "",
            "state": ""
          }
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "payload": {
            "type": "object",
            "label": "Payload",
            "required": true,
            "uiType": "json-editor",
            "fileInfos": {
              "type": "array",
              "label": "File Infos",
              "required": true,
              "uiType": "json-editor"
            },
            "name": {
              "type": "string",
              "label": "Name",
              "required": true,
              "uiType": "input"
            },
            "participantSetsInfo": {
              "type": "array",
              "label": "Participant Sets Info",
              "required": true,
              "uiType": "json-editor"
            },
            "signatureType": {
              "type": "string",
              "label": "Signature Type",
              "required": true,
              "uiType": "input"
            },
            "state": {
              "type": "string",
              "label": "State",
              "required": true,
              "uiType": "input"
            }
          }
        }
      },
      {
        "type": "get-all-agreements",
        "category": "adobe-sign-034",
        "name": "Get all agreements",
        "description": "Get all agreements action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "all",
          "agreements"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/agreements/list",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "agreement-status",
        "category": "adobe-sign-034",
        "name": "Agreement Status",
        "description": "Agreement Status action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "agreement",
          "status"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/agreements/status",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "resourceId": "{{resourceId}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "resourceId": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "resourceId": {
            "type": "string",
            "label": "Resource Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-agreement-participants",
        "category": "adobe-sign-034",
        "name": "Get Agreement Participants",
        "description": "Get Agreement Participants action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "get",
          "agreement",
          "participants"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/agreements/participants",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "resourceId": "{{resourceId}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "resourceId": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "resourceId": {
            "type": "string",
            "label": "Resource Id",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "download-final-signed-agreement",
        "category": "adobe-sign-034",
        "name": "Download Final Signed Agreement",
        "description": "Download Final Signed Agreement action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "final",
          "signed",
          "agreement"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/adobe/agreements/download",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "accessToken": "{{accessToken}}",
            "apiBaseUrl": "{{apiBaseUrl}}",
            "resourceId": "{{resourceId}}"
          }
        },
        "properties": {
          "accessToken": "",
          "apiBaseUrl": "",
          "resourceId": ""
        },
        "propertyConfig": {
          "accessToken": {
            "type": "textarea",
            "label": "Access Token",
            "required": true,
            "uiType": "textarea"
          },
          "apiBaseUrl": {
            "type": "string",
            "label": "Api Base Url",
            "required": true,
            "uiType": "input"
          },
          "resourceId": {
            "type": "string",
            "label": "Resource Id",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "fast2sms-035",
    "name": "Fast2SMS",
    "icon": "MessageSquare",
    "color": "bg-rose-500",
    "description": "Send SMS and OTP messages.",
    "metadata": {
      "tags": [
        "fast2sms",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 260,
      "group": "Fast2 Sms"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "send-otp",
        "category": "fast2sms-035",
        "name": "send-otp",
        "description": "send-otp action",
        "icon": "Send",
        "color": "bg-indigo-500",
        "tags": [
          "send",
          "otp"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sms/otp/send",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "phoneNumber": "{{phoneNumber}}",
            "otp": "{{otp}}"
          }
        },
        "properties": {
          "phoneNumber": "",
          "otp": ""
        },
        "propertyConfig": {
          "phoneNumber": {
            "type": "string",
            "label": "Phone Number",
            "required": true,
            "uiType": "input"
          },
          "otp": {
            "type": "string",
            "label": "Otp",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "send-sms",
        "category": "fast2sms-035",
        "name": "send-sms",
        "description": "send-sms action",
        "icon": "Send",
        "color": "bg-indigo-500",
        "tags": [
          "send",
          "sms"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/sms/send-sms",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "phoneNumber": "{{phoneNumber}}",
            "message": "{{message}}"
          }
        },
        "properties": {
          "phoneNumber": "",
          "message": ""
        },
        "propertyConfig": {
          "phoneNumber": {
            "type": "string",
            "label": "Phone Number",
            "required": true,
            "uiType": "input"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "statistics-036",
    "name": "Statistics",
    "icon": "BarChart3",
    "color": "bg-cyan-600",
    "description": "Data statistics and analytics operations.",
    "metadata": {
      "tags": [
        "statistics",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 270,
      "group": "Statistics"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "query",
        "category": "statistics-036",
        "name": "query",
        "description": "query action",
        "icon": "BarChart3",
        "color": "bg-cyan-500",
        "tags": [
          "query"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/analytics/analytic-query",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": [
              {
                "name": "{{name}}",
                "city": "{{city}}",
                "salary": "{{salary}}"
              }
            ]
          }
        },
        "properties": {
          "data": []
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Data",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "group-by",
        "category": "statistics-036",
        "name": "group-by",
        "description": "group-by action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "group",
          "by"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/analytics/group-by",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": [
              {
                "name": "{{name}}",
                "city": "{{city}}",
                "salary": "{{salary}}"
              }
            ],
            "groupByFields": [
              "{{item}}"
            ]
          }
        },
        "properties": {
          "data": [],
          "groupByFields": []
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Data",
            "required": true,
            "uiType": "json-editor"
          },
          "groupByFields": {
            "type": "array",
            "label": "Group By Fields",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "memory-group-by",
        "category": "statistics-036",
        "name": "memory-group-by",
        "description": "memory-group-by action",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "memory",
          "group",
          "by"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/analytics/memory-group-by",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": [
              {
                "name": "{{name}}",
                "city": "{{city}}"
              }
            ],
            "groupByFields": [
              "{{item}}"
            ]
          }
        },
        "properties": {
          "data": [],
          "groupByFields": []
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Data",
            "required": true,
            "uiType": "json-editor"
          },
          "groupByFields": {
            "type": "array",
            "label": "Group By Fields",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "metrics",
        "category": "statistics-036",
        "name": "metrics",
        "description": "metrics action",
        "icon": "BarChart3",
        "color": "bg-cyan-500",
        "tags": [
          "metrics"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/analytics/step-metrics",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": [
              {
                "name": "{{name}}",
                "city": "{{city}}",
                "salary": "{{salary}}"
              }
            ]
          }
        },
        "properties": {
          "data": []
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Data",
            "required": true,
            "uiType": "json-editor"
          }
        }
      },
      {
        "type": "sample-row",
        "category": "statistics-036",
        "name": "sample-row",
        "description": "sample-row action",
        "icon": "Circle",
        "color": "bg-cyan-500",
        "tags": [
          "sample",
          "row"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/analytics/sample-rows",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "data": [
              {
                "name": "{{name}}",
                "city": "{{city}}"
              }
            ],
            "sampleSize": "{{sampleSize}}"
          }
        },
        "properties": {
          "data": [],
          "sampleSize": 0
        },
        "propertyConfig": {
          "data": {
            "type": "array",
            "label": "Data",
            "required": true,
            "uiType": "json-editor"
          },
          "sampleSize": {
            "type": "number",
            "label": "Sample Size",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "ai-bridge-037",
    "name": "AI Bridge",
    "icon": "Bot",
    "color": "bg-violet-500",
    "description": "Automate AI chat requests for OpenAI, Gemini, and Claude.",
    "metadata": {
      "tags": [
        "ai",
        "chat",
        "llm"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 37,
      "group": "AI Bridge"
    },
    "ui": {
      "gradient": "from-violet-500/20 to-violet-600/10",
      "iconBg": "bg-violet-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "chat-gpt",
        "category": "ai-bridge-037",
        "name": "ChatGPT",
        "description": "ChatGPT chat action",
        "icon": "MessageSquare",
        "color": "bg-indigo-500",
        "tags": [
          "ai",
          "chat",
          "chat-gpt"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/chat?",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "provider": "{{provider}}",
            "model": "{{model}}",
            "query": "{{query}}",
            "temperature": "{{temperature}}",
            "maxTokens": "{{maxTokens}}",
            "credentials": {
              "apiKey": "{{apiKey}}"
            }
          }
        },
        "properties": {
          "provider": "",
          "model": "",
          "query": "",
          "temperature": "",
          "maxTokens": "",
          "apiKey": ""
        },
        "propertyConfig": {
          "provider": {
            "type": "string",
            "label": "Provider",
            "required": true,
            "uiType": "input"
          },
          "model": {
            "type": "string",
            "label": "Model",
            "required": true,
            "uiType": "input"
          },
          "query": {
            "type": "string",
            "label": "Query",
            "required": true,
            "uiType": "textarea"
          },
          "temperature": {
            "type": "string",
            "label": "Temperature",
            "required": true,
            "uiType": "input"
          },
          "maxTokens": {
            "type": "string",
            "label": "Max Tokens",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "API Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "gemini",
        "category": "ai-bridge-037",
        "name": "Gemini",
        "description": "Gemini chat action",
        "icon": "MessageSquare",
        "color": "bg-indigo-500",
        "tags": [
          "ai",
          "chat",
          "gemini"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/chat?",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "provider": "{{provider}}",
            "model": "{{model}}",
            "query": "{{query}}",
            "temperature": "{{temperature}}",
            "maxTokens": "{{maxTokens}}",
            "credentials": {
              "apiKey": "{{apiKey}}"
            }
          }
        },
        "properties": {
          "provider": "",
          "model": "",
          "query": "",
          "temperature": "",
          "maxTokens": "",
          "apiKey": ""
        },
        "propertyConfig": {
          "provider": {
            "type": "string",
            "label": "Provider",
            "required": true,
            "uiType": "input"
          },
          "model": {
            "type": "string",
            "label": "Model",
            "required": true,
            "uiType": "input"
          },
          "query": {
            "type": "string",
            "label": "Query",
            "required": true,
            "uiType": "textarea"
          },
          "temperature": {
            "type": "string",
            "label": "Temperature",
            "required": true,
            "uiType": "input"
          },
          "maxTokens": {
            "type": "string",
            "label": "Max Tokens",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "API Key",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "claude",
        "category": "ai-bridge-037",
        "name": "Claude",
        "description": "Claude chat action",
        "icon": "MessageSquare",
        "color": "bg-indigo-500",
        "tags": [
          "ai",
          "chat",
          "claude"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/chat?",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "provider": "{{provider}}",
            "model": "{{model}}",
            "query": "{{query}}",
            "temperature": "{{temperature}}",
            "maxTokens": "{{maxTokens}}",
            "credentials": {
              "apiKey": "{{apiKey}}"
            }
          }
        },
        "properties": {
          "provider": "",
          "model": "",
          "query": "",
          "temperature": "",
          "maxTokens": "",
          "apiKey": ""
        },
        "propertyConfig": {
          "provider": {
            "type": "string",
            "label": "Provider",
            "required": true,
            "uiType": "input"
          },
          "model": {
            "type": "string",
            "label": "Model",
            "required": true,
            "uiType": "input"
          },
          "query": {
            "type": "string",
            "label": "Query",
            "required": true,
            "uiType": "textarea"
          },
          "temperature": {
            "type": "string",
            "label": "Temperature",
            "required": true,
            "uiType": "input"
          },
          "maxTokens": {
            "type": "string",
            "label": "Max Tokens",
            "required": true,
            "uiType": "input"
          },
          "apiKey": {
            "type": "string",
            "label": "API Key",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },
  {
    "id": "system-management-038",
    "name": "System Management",
    "icon": "Terminal",
    "color": "bg-slate-700",
    "description": "Automate disk, service, and command management on the host.",
    "metadata": {
      "tags": [
        "system",
        "management"
      ],
      "featured": false,
      "popularityScore": 85,
      "order": 38,
      "group": "System"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      {
        "type": "disk-size-check",
        "category": "system-management-038",
        "name": "Dick size check",
        "description": "Check disk size",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "disk-size-check"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/disk",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "drivePath": "{{drivePath}}",
            "humanReadable": "{{humanReadable}}"
          }
        },
        "properties": {
          "drivePath": "",
          "humanReadable": true
        },
        "propertyConfig": {
          "drivePath": {
            "type": "string",
            "label": "Drive Path",
            "required": true,
            "uiType": "input"
          },
          "humanReadable": {
            "type": "boolean",
            "label": "Human Readable",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "get-service-status",
        "category": "system-management-038",
        "name": "get service status",
        "description": "Get service status",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "get-service-status"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/service/{{serviceName}}",
          "method": "GET",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {}
        },
        "properties": {
          "serviceName": "AnyDesk"
        },
        "propertyConfig": {
          "serviceName": {
            "type": "string",
            "label": "Service Name",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "service-start",
        "category": "system-management-038",
        "name": "system/service",
        "description": "Start a service",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "service-start"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/service",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "serviceName": "{{serviceName}}",
            "action": "{{action}}"
          }
        },
        "properties": {
          "serviceName": "",
          "action": "START"
        },
        "propertyConfig": {
          "serviceName": {
            "type": "string",
            "label": "Service Name",
            "required": true,
            "uiType": "input"
          },
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "service-stop",
        "category": "system-management-038",
        "name": "system/service/stop",
        "description": "Stop a service",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "service-stop"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/service",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "serviceName": "{{serviceName}}",
            "action": "{{action}}"
          }
        },
        "properties": {
          "serviceName": "",
          "action": "STOP"
        },
        "propertyConfig": {
          "serviceName": {
            "type": "string",
            "label": "Service Name",
            "required": true,
            "uiType": "input"
          },
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "schedule-shutdown",
        "category": "system-management-038",
        "name": "Schedule-shutdown",
        "description": "Schedule shutdown",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "schedule-shutdown"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/control",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "action": "{{action}}",
            "delaySeconds": "{{delaySeconds}}",
            "message": "{{message}}",
            "force": "{{force}}"
          }
        },
        "properties": {
          "action": "SHUTDOWN",
          "delaySeconds": "",
          "message": "",
          "force": false
        },
        "propertyConfig": {
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          },
          "delaySeconds": {
            "type": "string",
            "label": "Delay Seconds",
            "required": true,
            "uiType": "input"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "textarea"
          },
          "force": {
            "type": "boolean",
            "label": "Force",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "restart-service",
        "category": "system-management-038",
        "name": "Restart Service",
        "description": "Restart a service",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "restart-service"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/service",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "serviceName": "{{serviceName}}",
            "action": "{{action}}"
          }
        },
        "properties": {
          "serviceName": "",
          "action": "RESTART"
        },
        "propertyConfig": {
          "serviceName": {
            "type": "string",
            "label": "Service Name",
            "required": true,
            "uiType": "input"
          },
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "restart-system",
        "category": "system-management-038",
        "name": "Restart-System",
        "description": "Restart the system",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "restart-system"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/control",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "action": "{{action}}",
            "delaySeconds": "{{delaySeconds}}",
            "message": "{{message}}"
          }
        },
        "properties": {
          "action": "RESTART",
          "delaySeconds": "",
          "message": ""
        },
        "propertyConfig": {
          "action": {
            "type": "string",
            "label": "Action",
            "required": true,
            "uiType": "input"
          },
          "delaySeconds": {
            "type": "string",
            "label": "Delay Seconds",
            "required": true,
            "uiType": "input"
          },
          "message": {
            "type": "string",
            "label": "Message",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "execute-command",
        "category": "system-management-038",
        "name": "Execute Command",
        "description": "Execute a shell command",
        "icon": "Circle",
        "color": "bg-slate-500",
        "tags": [
          "execute-command"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/v1/system/command",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "command": "{{command}}",
            "arguments": [
              "{{item}}"
            ]
          }
        },
        "properties": {
          "command": "",
          "arguments": []
        },
        "propertyConfig": {
          "command": {
            "type": "string",
            "label": "Command",
            "required": true,
            "uiType": "input"
          },
          "arguments": {
            "type": "array",
            "label": "Arguments",
            "required": true,
            "uiType": "json-editor"
          }
        }
      }
    ]
  },

{
    "id": "outlook-018",
    "name": "Outlook Mail",
    "icon": "Mail",
    "color": "bg-blue-500",
    "description": "Automate Outlook email workflows including send, reply, forward, read, search, and attachments.",
    "metadata": {
      "tags": [
        "outlook-mail",
        "automation"
      ],
      "featured": true,
      "popularityScore": 90,
      "order": 90,
      "group": "Outlook"
    },
    "ui": {
      "gradient": "from-slate-500/20 to-slate-600/10",
      "iconBg": "bg-slate-500/10",
      "borderGlow": true,
      "cardStyle": "premium"
    },
    "control": {
      "enabled": true,
      "version": "1.0.0"
    },
    "actions": [
      // {
      //   "type": "send-email",
      //   "category": "outlook-018",
      //   "name": "Send Email",
      //   "description": "Send Email action",
      //   "icon": "Send",
      //   "color": "bg-indigo-500",
      //   "tags": [
      //     "send",
      //     "email"
      //   ],
      //   "complexity": "basic",
      //   "estimatedTime": 1000,
      //   "supportsStreaming": false,
      //   "requiresAuth": false,
      //   "retryable": true,
      //   "timeout": 60000,
      //   "api": {
      //     "url": "http://localhost:8080/engine/api/send_mail",
      //     "method": "POST",
      //     "headers": {
      //       "Content-Type": "application/json"
      //     },
      //     "body": {
      //       "grant_type": "{{grant_type}}",
      //       "tenantId": "{{tenantId}}",
      //       "clientId": "{{clientId}}",
      //       "clientSecret": "{{clientSecret}}",
      //       "refreshToken": "{{refreshToken}}",
      //       "to": "{{to}}",
      //       "cc": "{{cc}}",
      //       "bcc": "{{bcc}}",
      //       "subject": "{{subject}}",
      //       "body": "{{body}}",
      //       "attachments": "{{attachments}}"
      //     }
      //   },
      //   "properties": {
      //     "grant_type": "",
      //     "tenantId": "",
      //     "clientId": "",
      //     "clientSecret": "",
      //     "refreshToken": "",
      //     "to": "",
      //     "cc": "",
      //     "bcc": "",
      //     "subject": "",
      //     "body": "",
      //     "attachments": []
      //   },
      //   "propertyConfig": {
      //     "grant_type": {
      //       "type": "string",
      //       "label": "Grant Type",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "tenantId": {
      //       "type": "string",
      //       "label": "Tenant Id",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "clientId": {
      //       "type": "string",
      //       "label": "Client Id",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "clientSecret": {
      //       "type": "string",
      //       "label": "Client Secret",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "refreshToken": {
      //       "type": "string",
      //       "label": "Refresh Token",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "to": {
      //       "type": "string",
      //       "label": "To",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "cc": {
      //       "type": "string",
      //       "label": "Cc",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "bcc": {
      //       "type": "string",
      //       "label": "Bcc",
      //       "required": false,
      //       "uiType": "input"
      //     },
      //     "subject": {
      //       "type": "string",
      //       "label": "Subject",
      //       "required": true,
      //       "uiType": "input"
      //     },
      //     "body": {
      //       "type": "textarea",
      //       "label": "Body",
      //       "required": true,
      //       "uiType": "textarea",
      //       "rows": 6,
      //       "description": "Supports HTML, e.g. <b>bold</b>."
      //     },
      //     "attachments": {
      //       "type": "array",
      //       "label": "Attachments",
      //       "required": false,
      //       "uiType": "file-list",
      //       "description": "Add one or more files. Use Browse to pick a file from your device, or paste a full file path."
      //     }
      //   }
      // },

      {
  "type": "send-email",
  "category": "outlook-018",
  "name": "Send Email",
  "description": "Send Email action",
  "icon": "Send",
  "color": "bg-indigo-500",
  "tags": [
    "send",
    "email"
  ],
  "complexity": "basic",
  "estimatedTime": 1000,
  "supportsStreaming": false,
  "requiresAuth": false,
  "retryable": true,
  "timeout": 60000,
  "api": {
    "url": "http://localhost:8080/engine/api/send_mail",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "grant_type": "{{grant_type}}",
      "tenantId": "{{tenantId}}",
      "clientId": "{{clientId}}",
      "clientSecret": "{{clientSecret}}",
      "refreshToken": "{{refreshToken}}",
      "to": "{{to}}",
      "cc": "{{cc}}",
      "bcc": "{{bcc}}",
      "subject": "{{subject}}",
      "body": "{{body}}",
      "attachments": "{{attachments}}"
    }
  },
  "properties": {
    "grant_type": "refresh_token",
    "tenantId": "",
    "clientId": "",
    "clientSecret": "",
    "refreshToken": "",
    "to": "",
    "cc": "",
    "bcc": "",
    "subject": "",
    "body": "",
    "attachments": [
      {
        "fileName": "",
        "filePath": ""
      }
    ]
  },
  "propertyConfig": {
    "grant_type": {
      "type": "string",
      "label": "Grant Type",
      "required": true,
      "uiType": "input"
    },
    "tenantId": {
      "type": "string",
      "label": "Tenant Id",
      "required": true,
      "uiType": "input"
    },
    "clientId": {
      "type": "string",
      "label": "Client Id",
      "required": true,
      "uiType": "input"
    },
    "clientSecret": {
      "type": "string",
      "label": "Client Secret",
      "required": true,
      "uiType": "input"
    },
    "refreshToken": {
      "type": "string",
      "label": "Refresh Token",
      "required": true,
      "uiType": "input"
    },
    "to": {
      "type": "string",
      "label": "To",
      "required": true,
      "uiType": "input"
    },
    "cc": {
      "type": "string",
      "label": "Cc",
      "required": false,
      "uiType": "input"
    },
    "bcc": {
      "type": "string",
      "label": "Bcc",
      "required": false,
      "uiType": "input"
    },
    "subject": {
      "type": "string",
      "label": "Subject",
      "required": true,
      "uiType": "input"
    },
    "body": {
      "type": "textarea",
      "label": "Body",
      "required": true,
      "uiType": "textarea",
      "rows": 6,
      "description": "Supports HTML, e.g. <b>bold</b>."
    },
    "attachments": {
      "type": "array",
      "label": "Attachments",
      "required": false,
      "uiType": "file-list",
      "description": "Add one or more attachments. fileName is the display name, filePath must be a backend-accessible path."
    }
  }
},
      {
        "type": "download-attchments",
        "category": "outlook-018",
        "name": "Download Attchments",
        "description": "Download Attchments action",
        "icon": "Download",
        "color": "bg-emerald-500",
        "tags": [
          "download",
          "attchments"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/download_attachment",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "messageId": "{{messageId}}",
            "downloadpath": "{{downloadpath}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "messageId": "",
          "downloadpath": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "messageId": {
            "type": "textarea",
            "label": "Message Id",
            "required": true,
            "uiType": "textarea"
          },
          "downloadpath": {
            "type": "string",
            "label": "Download Path",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "forward-email",
        "category": "outlook-018",
        "name": "Forward Email",
        "description": "Forward Email action",
        "icon": "Mail",
        "color": "bg-slate-500",
        "tags": [
          "forward",
          "email"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/forward_mail",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "messageId": "{{messageId}}",
            "Subject": "{{Subject}}",
            "to": "{{to}}",
            "cc": "{{cc}}",
            "bcc": "{{bcc}}",
            "comment": "{{comment}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "messageId": "",
          "Subject": "",
          "to": "",
          "cc": "",
          "bcc": "",
          "comment": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "messageId": {
            "type": "textarea",
            "label": "Message Id",
            "required": true,
            "uiType": "textarea"
          },
          "Subject": {
            "type": "string",
            "label": "Subject",
            "required": false,
            "uiType": "input"
          },
          "to": {
            "type": "string",
            "label": "To",
            "required": true,
            "uiType": "input"
          },
          "cc": {
            "type": "string",
            "label": "Cc",
            "required": false,
            "uiType": "input"
          },
          "bcc": {
            "type": "string",
            "label": "Bcc",
            "required": false,
            "uiType": "input"
          },
          "comment": {
            "type": "textarea",
            "label": "Comment",
            "required": false,
            "uiType": "textarea",
            "rows": 4
          }
        }
      },
      {
        "type": "reply-mail",
        "category": "outlook-018",
        "name": "reply_mail",
        "description": "reply_mail action",
        "icon": "Mail",
        "color": "bg-slate-500",
        "tags": [
          "reply",
          "mail"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/reply_mail",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "messageId": "{{messageId}}",
            "comment": "{{comment}}",
            "replyAll": "{{replyAll}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "messageId": "",
          "comment": "",
          "replyAll": false
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "messageId": {
            "type": "textarea",
            "label": "Message Id",
            "required": true,
            "uiType": "textarea"
          },
          "comment": {
            "type": "string",
            "label": "Comment",
            "required": true,
            "uiType": "input"
          },
          "replyAll": {
            "type": "boolean",
            "label": "Reply All",
            "required": false,
            "uiType": "input"
          }
        }
      },
      {
        "type": "mail-box-list",
        "category": "outlook-018",
        "name": "Mail_Box_list",
        "description": "Mail_Box_list action",
        "icon": "Search",
        "color": "bg-teal-500",
        "tags": [
          "mail",
          "box",
          "list"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/list_mailbox",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          }
        }
      },
      {
        "type": "email-details",
        "category": "outlook-018",
        "name": "email_details",
        "description": "email_details action",
        "icon": "Mail",
        "color": "bg-slate-500",
        "tags": [
          "email",
          "details"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/email_details",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "messageId": "{{messageId}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "messageId": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "messageId": {
            "type": "textarea",
            "label": "Message Id",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "delete-email",
        "category": "outlook-018",
        "name": "Delete_Email",
        "description": "Delete_Email action",
        "icon": "Trash2",
        "color": "bg-red-500",
        "tags": [
          "delete",
          "email"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/delete_email",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "messageId": "{{messageId}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "messageId": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "messageId": {
            "type": "textarea",
            "label": "Message Id",
            "required": true,
            "uiType": "textarea"
          }
        }
      },
      {
        "type": "search-email",
        "category": "outlook-018",
        "name": "search-email",
        "description": "search-email action",
        "icon": "Mail",
        "color": "bg-sky-500",
        "tags": [
          "search",
          "email"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/search_emails",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "search": "{{search}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "search": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "search": {
            "type": "string",
            "label": "Search",
            "required": true,
            "uiType": "input"
          }
        }
      },

      {
        "type": "email-read",
        "category": "outlook-018",
        "name": "Email Read",
        "description": "Email Read action",
        "icon": "Search",
        "color": "bg-cyan-500",
        "tags": [
          "email",
          "read"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/Email-messageInput",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}",
            "general": {
              "folder": "{{folder}}",
              "retrieve": "{{retrieve}}",
              "top": "{{top}}",
              "reverseOrder": "{{reverseOrder}}",
              "markAsRead": "{{markAsRead}}",
              "charLimit": "{{charLimit}}"
            },
            "batch": {
              "fetchInBatches": "{{fetchInBatches}}",
              "batchSize": "{{batchSize}}"
            },
            "filter": {
              "header": {
                "sender": "{{sender}}",
                "recipient": "{{recipient}}",
                "subject": "{{subject}}",
                "category": "{{category}}",
                "hasAttachment": "{{hasAttachment}}",
                "searchText": "{{searchText}}"
              },
              "receivedDate": {
                "condition": "{{condition}}",
                "date1": "{{date1}}",
                "date2": "{{date2}}"
              }
            },
            "output": {
              "outFileName": "{{outFileName}}",
              "keepHtmlTags": "{{keepHtmlTags}}",
              "outputFields": "{{outputFields}}"
            }
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": "",
          "general": {
            "folder": "inbox",
            "retrieve": "all",
            "top": 10,
            "reverseOrder": true,
            "markAsRead": true,
            "charLimit": 50000
          },
          "batch": {
            "fetchInBatches": false,
            "batchSize": 10
          },
          "filter": {
            "header": {
              "sender": "",
              "recipient": "",
              "subject": "",
              "category": "",
              "hasAttachment": false,
              "searchText": ""
            },
            "receivedDate": {
              "condition": "",
              "date1": "",
              "date2": ""
            }
          },
          "output": {
            "outFileName": "body",
            "keepHtmlTags": false,
            "outputFields": [
              "body",
              "subject",
              "from",
              "toRecipients",
              "ccRecipients",
              "receivedDateTime",
              "hasAttachments",
              "isRead",
              "importance"
            ]
          }
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          },
          "general": {
            "type": "object",
            "label": "General",
            "description": "Core mailbox read settings.",
            "schema": {
              "folder": {
                "type": "select",
                "label": "Folder",
                "required": true,
                "options": [
                  "inbox",
                  "sentitems",
                  "drafts",
                  "archive",
                  "deleteditems",
                  "junkemail"
                ]
              },
              "retrieve": {
                "type": "select",
                "label": "Retrieve",
                "required": true,
                "options": [
                  "all",
                  "latest",
                  "unread"
                ]
              },
              "top": {
                "type": "number",
                "label": "Top",
                "required": false,
                "min": 1,
                "description": "Maximum number of emails to fetch."
              },
              "reverseOrder": {
                "type": "boolean",
                "label": "Reverse Order",
                "required": false,
                "description": "Newest emails first when enabled."
              },
              "markAsRead": {
                "type": "boolean",
                "label": "Mark As Read",
                "required": false
              },
              "charLimit": {
                "type": "number",
                "label": "Char Limit",
                "required": false,
                "min": 0,
                "description": "Trim each email body to this many characters."
              }
            }
          },
          "batch": {
            "type": "object",
            "label": "Batch",
            "description": "Optional batched fetching.",
            "schema": {
              "fetchInBatches": {
                "type": "boolean",
                "label": "Fetch In Batches",
                "required": false
              },
              "batchSize": {
                "type": "number",
                "label": "Batch Size",
                "required": false,
                "min": 1
              }
            }
          },
          "filter": {
            "type": "object",
            "label": "Filter",
            "description": "Narrow results by header fields and date.",
            "schema": {
              "header": {
                "type": "object",
                "label": "Header",
                "schema": {
                  "sender": {
                    "type": "string",
                    "label": "Sender",
                    "required": false,
                    "uiType": "input"
                  },
                  "recipient": {
                    "type": "string",
                    "label": "Recipient",
                    "required": false,
                    "uiType": "input"
                  },
                  "subject": {
                    "type": "string",
                    "label": "Subject",
                    "required": false,
                    "uiType": "input"
                  },
                  "category": {
                    "type": "string",
                    "label": "Category",
                    "required": false,
                    "uiType": "input"
                  },
                  "hasAttachment": {
                    "type": "boolean",
                    "label": "Has Attachment",
                    "required": false
                  },
                  "searchText": {
                    "type": "string",
                    "label": "Search Text",
                    "required": false,
                    "uiType": "input"
                  }
                }
              },
              "receivedDate": {
                "type": "object",
                "label": "Received Date",
                "description": "Filter by received date. Pick \"between\" to use a date range.",
                "schema": {
                  "condition": {
                    "type": "select",
                    "label": "Condition",
                    "required": false,
                    "options": [
                      "",
                      "before",
                      "after",
                      "on",
                      "between"
                    ]
                  },
                  "date1": {
                    "type": "date",
                    "label": "Date 1 (From)",
                    "required": false,
                    "uiType": "date"
                  },
                  "date2": {
                    "type": "date",
                    "label": "Date 2 (To)",
                    "required": false,
                    "uiType": "date",
                    "description": "Only used when condition is \"between\"."
                  }
                }
              }
            }
          },
          "output": {
            "type": "object",
            "label": "Output",
            "schema": {
              "outFileName": {
                "type": "string",
                "label": "Output File Name",
                "required": false,
                "uiType": "input"
              },
              "keepHtmlTags": {
                "type": "boolean",
                "label": "Keep Html Tags",
                "required": false
              },
              "outputFields": {
                "type": "array",
                "label": "Output Fields",
                "required": true,
                "uiType": "multi-select",
                "description": "Select which fields to include in each email result.",
                "options": [
                  "body",
                  "subject",
                  "from",
                  "toRecipients",
                  "ccRecipients",
                  "receivedDateTime",
                  "hasAttachments",
                  "isRead",
                  "importance"
                ]
              }
            }
          }
        }
      },
      {
        "type": "lsit-email-folder",
        "category": "outlook-018",
        "name": "Lsit Email Folder",
        "description": "Lsit Email Folder action",
        "icon": "Folder",
        "color": "bg-slate-500",
        "tags": [
          "lsit",
          "email",
          "folder"
        ],
        "complexity": "basic",
        "estimatedTime": 1000,
        "supportsStreaming": false,
        "requiresAuth": false,
        "retryable": true,
        "timeout": 60000,
        "api": {
          "url": "http://localhost:8080/engine/api/get-emailFolder",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "grant_type": "{{grant_type}}",
            "tenantId": "{{tenantId}}",
            "clientId": "{{clientId}}",
            "clientSecret": "{{clientSecret}}",
            "refreshToken": "{{refreshToken}}"
          }
        },
        "properties": {
          "grant_type": "",
          "tenantId": "",
          "clientId": "",
          "clientSecret": "",
          "refreshToken": ""
        },
        "propertyConfig": {
          "grant_type": {
            "type": "string",
            "label": "Grant Type",
            "required": true,
            "uiType": "input"
          },
          "tenantId": {
            "type": "string",
            "label": "Tenant Id",
            "required": true,
            "uiType": "input"
          },
          "clientId": {
            "type": "string",
            "label": "Client Id",
            "required": true,
            "uiType": "input"
          },
          "clientSecret": {
            "type": "string",
            "label": "Client Secret",
            "required": true,
            "uiType": "input"
          },
          "refreshToken": {
            "type": "string",
            "label": "Refresh Token",
            "required": true,
            "uiType": "input"
          }
        }
      }
    ]
  },

{
  "id": "database-plugins-039",
  "name": "Database Plugins",
  "icon": "Database",
  "color": "bg-emerald-600",
  "description": "Automate SQL database schema, record and query operations across PostgreSQL, MySQL, Oracle, SQL Server and H2.",
  "metadata": {
    "tags": [
      "database",
      "sql",
      "postgresql",
      "mysql",
      "oracle",
      "sqlserver",
      "h2"
    ],
    "featured": true,
    "popularityScore": 85,
    "order": 39,
    "group": "Database"
  },
  "ui": {
    "gradient": "from-emerald-500/20 to-emerald-600/10",
    "iconBg": "bg-emerald-500/10",
    "borderGlow": true,
    "cardStyle": "premium"
  },
  "control": {
    "enabled": true,
    "version": "2.0.0"
  },
  "actions": [
    {
      "type": "db-health-check",
      "category": "database-plugins-039",
      "name": "Health Check",
      "description": "Verify connectivity and read server metadata.",
      "icon": "Activity",
      "color": "bg-emerald-500",
      "tags": [
        "database",
        "connection",
        "health"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/health_check",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        }
      }
    },
    {
      "type": "db-databases",
      "category": "database-plugins-039",
      "name": "List Databases",
      "description": "List catalogs visible to the connected user.",
      "icon": "Database",
      "color": "bg-emerald-500",
      "tags": [
        "database",
        "metadata"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/databases",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        }
      }
    },
    {
      "type": "db-schemas",
      "category": "database-plugins-039",
      "name": "List Schemas",
      "description": "List schemas visible to the connected user.",
      "icon": "Layers",
      "color": "bg-emerald-500",
      "tags": [
        "database",
        "metadata"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/schemas",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        }
      }
    },
    {
      "type": "db-tables",
      "category": "database-plugins-039",
      "name": "List Tables",
      "description": "List tables and views, optionally filtered by name.",
      "icon": "Table2",
      "color": "bg-emerald-500",
      "tags": [
        "database",
        "metadata"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/tables",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "table_types": [
          "TABLE",
          "VIEW"
        ]
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Name Filter",
          "required": false,
          "uiType": "input",
          "group": "Target",
          "placeholder": "cust%",
          "description": "Optional. Leave blank to list everything."
        },
        "table_types": {
          "type": "array",
          "label": "Table Types",
          "required": false,
          "uiType": "multi-select",
          "group": "Target",
          "options": [
            "TABLE",
            "VIEW",
            "SYSTEM TABLE"
          ]
        }
      }
    },
    {
      "type": "db-table-info",
      "category": "database-plugins-039",
      "name": "Table Info",
      "description": "Read columns, keys, indexes and constraints for a table.",
      "icon": "Info",
      "color": "bg-emerald-500",
      "tags": [
        "database",
        "metadata"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/table_info",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": ""
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        }
      }
    },
    {
      "type": "db-create-table",
      "category": "database-plugins-039",
      "name": "Create Table",
      "description": "Create a table with typed columns and constraints.",
      "icon": "TablePropertiesIcon",
      "color": "bg-blue-500",
      "tags": [
        "database",
        "ddl",
        "table"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/create_table",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "if_not_exists": true,
        "columns": []
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "if_not_exists": {
          "type": "boolean",
          "label": "If Not Exists",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Ignored on Oracle and SQL Server, which do not support the clause."
        },
        "columns": {
          "type": "array",
          "label": "Columns",
          "required": true,
          "uiType": "object-grid",
          "group": "Schema",
          "itemSchema": {
            "name": {
              "type": "string",
              "label": "Column Name",
              "required": true,
              "uiType": "input",
              "placeholder": "id",
              "width": "lg"
            },
            "type": {
              "type": "string",
              "label": "Type",
              "required": true,
              "uiType": "select",
              "options": [
                "VARCHAR",
                "TEXT",
                "CHAR",
                "INT",
                "BIGINT",
                "SMALLINT",
                "BOOLEAN",
                "DATE",
                "TIME",
                "TIMESTAMP",
                "DECIMAL",
                "DOUBLE",
                "FLOAT",
                "JSON",
                "UUID",
                "BLOB",
                "CLOB"
              ],
              "width": "md"
            },
            "nullable": {
              "type": "boolean",
              "label": "Nullable",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "primary_key": {
              "type": "boolean",
              "label": "Primary Key",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "unique": {
              "type": "boolean",
              "label": "Unique",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "auto_increment": {
              "type": "boolean",
              "label": "Auto Increment",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "default_value": {
              "type": "string",
              "label": "Default",
              "required": false,
              "uiType": "input",
              "placeholder": "CURRENT_TIMESTAMP",
              "width": "md"
            }
          },
          "addLabel": "Add Column",
          "description": "At least one column is required."
        }
      }
    },
    {
      "type": "db-drop-table",
      "category": "database-plugins-039",
      "name": "Drop Table",
      "description": "Drop a table.",
      "icon": "Trash2",
      "color": "bg-red-500",
      "tags": [
        "database",
        "ddl",
        "table"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/drop_table",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "if_exists": true,
        "cascade": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "if_exists": {
          "type": "boolean",
          "label": "If Exists",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Missing tables are reported as a no-op instead of an error."
        },
        "cascade": {
          "type": "boolean",
          "label": "Cascade",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Also drop dependent objects where the engine supports it."
        }
      }
    },
    {
      "type": "db-rename-table",
      "category": "database-plugins-039",
      "name": "Rename Table",
      "description": "Rename an existing table.",
      "icon": "PenLine",
      "color": "bg-blue-500",
      "tags": [
        "database",
        "ddl",
        "table"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/rename_table",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "new_name": ""
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "new_name": {
          "type": "string",
          "label": "New Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "sales_orders"
        }
      }
    },
    {
      "type": "db-truncate-table",
      "category": "database-plugins-039",
      "name": "Truncate Table",
      "description": "Remove every row while keeping the table.",
      "icon": "Eraser",
      "color": "bg-amber-500",
      "tags": [
        "database",
        "ddl",
        "table"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/truncate_table",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": ""
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        }
      }
    },
    {
      "type": "db-add-column",
      "category": "database-plugins-039",
      "name": "Add Column",
      "description": "Add a column to an existing table.",
      "icon": "Plus",
      "color": "bg-blue-500",
      "tags": [
        "database",
        "ddl",
        "column"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/add_column",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "column": {
          "name": "",
          "type": "VARCHAR",
          "nullable": true,
          "unique": false,
          "default_value": ""
        }
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "column": {
          "type": "object",
          "label": "Column",
          "required": true,
          "uiType": "object-fields",
          "group": "Column",
          "itemSchema": {
            "name": {
              "type": "string",
              "label": "Column Name",
              "required": true,
              "uiType": "input",
              "placeholder": "email"
            },
            "type": {
              "type": "string",
              "label": "Type",
              "required": true,
              "uiType": "select",
              "options": [
                "VARCHAR",
                "TEXT",
                "CHAR",
                "INT",
                "BIGINT",
                "SMALLINT",
                "BOOLEAN",
                "DATE",
                "TIME",
                "TIMESTAMP",
                "DECIMAL",
                "DOUBLE",
                "FLOAT",
                "JSON",
                "UUID",
                "BLOB",
                "CLOB"
              ]
            },
            "nullable": {
              "type": "boolean",
              "label": "Nullable",
              "required": false,
              "uiType": "input"
            },
            "unique": {
              "type": "boolean",
              "label": "Unique",
              "required": false,
              "uiType": "input"
            },
            "default_value": {
              "type": "string",
              "label": "Default Value",
              "required": false,
              "uiType": "input",
              "placeholder": "''",
              "description": "Required when Nullable is off."
            }
          }
        }
      }
    },
    {
      "type": "db-drop-column",
      "category": "database-plugins-039",
      "name": "Drop Column",
      "description": "Drop a column from a table.",
      "icon": "Minus",
      "color": "bg-red-500",
      "tags": [
        "database",
        "ddl",
        "column"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/drop_column",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "column_name": "",
        "if_exists": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "column_name": {
          "type": "string",
          "label": "Column Name",
          "required": true,
          "uiType": "input",
          "group": "Column",
          "placeholder": "email"
        },
        "if_exists": {
          "type": "boolean",
          "label": "If Exists",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Emulated on Oracle and SQL Server, which lack the clause."
        }
      }
    },
    {
      "type": "db-rename-column",
      "category": "database-plugins-039",
      "name": "Rename Column",
      "description": "Rename a column.",
      "icon": "PenLine",
      "color": "bg-blue-500",
      "tags": [
        "database",
        "ddl",
        "column"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/rename_column",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "column_name": "",
        "new_name": ""
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "column_name": {
          "type": "string",
          "label": "Current Name",
          "required": true,
          "uiType": "input",
          "group": "Column",
          "placeholder": "name"
        },
        "new_name": {
          "type": "string",
          "label": "New Name",
          "required": true,
          "uiType": "input",
          "group": "Column",
          "placeholder": "customer_name"
        }
      }
    },
    {
      "type": "db-modify-column",
      "category": "database-plugins-039",
      "name": "Modify Column",
      "description": "Change a column's type or nullability.",
      "icon": "Settings2",
      "color": "bg-blue-500",
      "tags": [
        "database",
        "ddl",
        "column"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/modify_column",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "column_name": "",
        "new_type": "",
        "nullable": true
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "column_name": {
          "type": "string",
          "label": "Column Name",
          "required": true,
          "uiType": "input",
          "group": "Column"
        },
        "new_type": {
          "type": "string",
          "label": "New Type",
          "required": false,
          "uiType": "select",
          "options": [
            "VARCHAR",
            "TEXT",
            "CHAR",
            "INT",
            "BIGINT",
            "SMALLINT",
            "BOOLEAN",
            "DATE",
            "TIME",
            "TIMESTAMP",
            "DECIMAL",
            "DOUBLE",
            "FLOAT",
            "JSON",
            "UUID",
            "BLOB",
            "CLOB"
          ],
          "group": "Column",
          "description": "Leave blank to change only nullability."
        },
        "nullable": {
          "type": "boolean",
          "label": "Nullable",
          "required": false,
          "uiType": "input",
          "group": "Column"
        }
      }
    },
    {
      "type": "db-insert",
      "category": "database-plugins-039",
      "name": "Insert Records",
      "description": "Insert one or more rows in a single batch.",
      "icon": "PlusCircle",
      "color": "bg-indigo-500",
      "tags": [
        "database",
        "dml",
        "insert"
      ],
      "complexity": "basic",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/insert",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "records": [],
        "transactional": true,
        "return_generated_keys": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "records": {
          "type": "array",
          "label": "Records",
          "required": true,
          "uiType": "record-grid",
          "group": "Data",
          "addLabel": "Add Record",
          "description": "Each row becomes one INSERT in the batch."
        },
        "transactional": {
          "type": "boolean",
          "label": "Transactional",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Roll the whole batch back if any row fails."
        },
        "return_generated_keys": {
          "type": "boolean",
          "label": "Return Generated Keys",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Return identity / sequence values for inserted rows."
        }
      }
    },
    {
      "type": "db-update",
      "category": "database-plugins-039",
      "name": "Update Records",
      "description": "Update rows matching the given conditions.",
      "icon": "RefreshCw",
      "color": "bg-indigo-500",
      "tags": [
        "database",
        "dml",
        "update"
      ],
      "complexity": "intermediate",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/update",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "updates": {},
        "conditions": {},
        "filters": []
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "updates": {
          "type": "object",
          "label": "Set Values",
          "required": true,
          "uiType": "key-value",
          "group": "Data",
          "keyLabel": "Column",
          "valueLabel": "New Value",
          "addLabel": "Add Assignment"
        },
        "conditions": {
          "type": "object",
          "label": "Where (equals)",
          "required": false,
          "uiType": "key-value",
          "group": "Filter",
          "keyLabel": "Column",
          "valueLabel": "Equals",
          "addLabel": "Add Condition",
          "description": "Simple equality match. Use Advanced Filters for anything else."
        },
        "filters": {
          "type": "array",
          "label": "Advanced Filters",
          "required": false,
          "uiType": "object-grid",
          "group": "Filter",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "status",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<=",
                "LIKE",
                "NOT LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL"
              ],
              "width": "md"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": false,
              "uiType": "input",
              "placeholder": "PAID",
              "width": "md"
            },
            "values": {
              "type": "array",
              "label": "Values (IN / BETWEEN)",
              "required": false,
              "uiType": "string-list",
              "width": "md",
              "description": "Used by IN, NOT IN and BETWEEN."
            },
            "case_insensitive": {
              "type": "boolean",
              "label": "Ignore Case",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "logic": {
              "type": "string",
              "label": "Join",
              "required": false,
              "uiType": "select",
              "options": [
                "AND",
                "OR"
              ],
              "width": "sm"
            }
          },
          "addLabel": "Add Filter",
          "description": "Takes precedence over Where when present."
        }
      }
    },
    {
      "type": "db-delete",
      "category": "database-plugins-039",
      "name": "Delete Records",
      "description": "Delete rows matching the given conditions.",
      "icon": "Trash2",
      "color": "bg-red-500",
      "tags": [
        "database",
        "dml",
        "delete"
      ],
      "complexity": "intermediate",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/delete",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "conditions": {},
        "filters": []
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "conditions": {
          "type": "object",
          "label": "Where (equals)",
          "required": false,
          "uiType": "key-value",
          "group": "Filter",
          "keyLabel": "Column",
          "valueLabel": "Equals",
          "addLabel": "Add Condition",
          "description": "At least one condition or filter is required."
        },
        "filters": {
          "type": "array",
          "label": "Advanced Filters",
          "required": false,
          "uiType": "object-grid",
          "group": "Filter",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "status",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<=",
                "LIKE",
                "NOT LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL"
              ],
              "width": "md"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": false,
              "uiType": "input",
              "placeholder": "PAID",
              "width": "md"
            },
            "values": {
              "type": "array",
              "label": "Values (IN / BETWEEN)",
              "required": false,
              "uiType": "string-list",
              "width": "md",
              "description": "Used by IN, NOT IN and BETWEEN."
            },
            "case_insensitive": {
              "type": "boolean",
              "label": "Ignore Case",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "logic": {
              "type": "string",
              "label": "Join",
              "required": false,
              "uiType": "select",
              "options": [
                "AND",
                "OR"
              ],
              "width": "sm"
            }
          },
          "addLabel": "Add Filter"
        }
      }
    },
    {
      "type": "db-fetch",
      "category": "database-plugins-039",
      "name": "Fetch Records",
      "description": "Read rows with projection, filtering, sorting and pagination.",
      "icon": "Search",
      "color": "bg-cyan-500",
      "tags": [
        "database",
        "query",
        "fetch"
      ],
      "complexity": "intermediate",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/fetch",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "columns": [],
        "filters": [],
        "sort": [],
        "page": 1,
        "page_size": 100,
        "include_total": true,
        "distinct": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "columns": {
          "type": "array",
          "label": "Select Columns",
          "required": false,
          "uiType": "string-list",
          "group": "Projection",
          "addLabel": "Add Column",
          "description": "Leave empty to select every column."
        },
        "distinct": {
          "type": "boolean",
          "label": "Distinct",
          "required": false,
          "uiType": "input",
          "group": "Projection"
        },
        "filters": {
          "type": "array",
          "label": "Filters",
          "required": false,
          "uiType": "object-grid",
          "group": "Filter",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "status",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<=",
                "LIKE",
                "NOT LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL"
              ],
              "width": "md"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": false,
              "uiType": "input",
              "placeholder": "PAID",
              "width": "md"
            },
            "values": {
              "type": "array",
              "label": "Values (IN / BETWEEN)",
              "required": false,
              "uiType": "string-list",
              "width": "md",
              "description": "Used by IN, NOT IN and BETWEEN."
            },
            "case_insensitive": {
              "type": "boolean",
              "label": "Ignore Case",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "logic": {
              "type": "string",
              "label": "Join",
              "required": false,
              "uiType": "select",
              "options": [
                "AND",
                "OR"
              ],
              "width": "sm"
            }
          },
          "addLabel": "Add Filter"
        },
        "sort": {
          "type": "array",
          "label": "Sorting",
          "required": false,
          "uiType": "object-grid",
          "group": "Sorting",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Order By",
              "required": true,
              "uiType": "input",
              "placeholder": "created_at",
              "width": "lg"
            },
            "direction": {
              "type": "string",
              "label": "Direction",
              "required": false,
              "uiType": "select",
              "options": [
                "ASC",
                "DESC"
              ],
              "width": "md"
            }
          },
          "addLabel": "Add Sort"
        },
        "page": {
          "type": "number",
          "label": "Page",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1
        },
        "page_size": {
          "type": "number",
          "label": "Page Size",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1,
          "max": 1000
        },
        "include_total": {
          "type": "boolean",
          "label": "Include Total Count",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "description": "Runs a COUNT query alongside the page."
        }
      }
    },
    {
      "type": "db-lookup",
      "category": "database-plugins-039",
      "name": "Lookup Records",
      "description": "Find rows by a single field or a set of conditions.",
      "icon": "ScanSearch",
      "color": "bg-cyan-500",
      "tags": [
        "database",
        "query",
        "lookup"
      ],
      "complexity": "intermediate",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/lookup",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "field": "",
        "operator": "=",
        "value": "",
        "values": [],
        "case_insensitive": false,
        "columns": [],
        "filters": [],
        "sort": [],
        "page": 1,
        "page_size": 50,
        "include_total": true
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "field": {
          "type": "string",
          "label": "Search Column",
          "required": true,
          "uiType": "input",
          "group": "Search",
          "placeholder": "name"
        },
        "operator": {
          "type": "string",
          "label": "Search Operator",
          "required": false,
          "uiType": "select",
          "options": [
            "=",
            "!=",
            "<>",
            ">",
            "<",
            ">=",
            "<=",
            "LIKE",
            "NOT LIKE",
            "IN",
            "NOT IN",
            "BETWEEN",
            "IS NULL",
            "IS NOT NULL"
          ],
          "group": "Search"
        },
        "value": {
          "type": "string",
          "label": "Search Value",
          "required": false,
          "uiType": "input",
          "group": "Search",
          "placeholder": "acme%"
        },
        "values": {
          "type": "array",
          "label": "Search Values",
          "required": false,
          "uiType": "string-list",
          "group": "Search",
          "addLabel": "Add Value",
          "description": "Used by IN, NOT IN and BETWEEN instead of Search Value."
        },
        "case_insensitive": {
          "type": "boolean",
          "label": "Ignore Case",
          "required": false,
          "uiType": "input",
          "group": "Search",
          "description": "With LIKE this becomes ILIKE on PostgreSQL."
        },
        "columns": {
          "type": "array",
          "label": "Select Columns",
          "required": false,
          "uiType": "string-list",
          "group": "Projection",
          "addLabel": "Add Column"
        },
        "filters": {
          "type": "array",
          "label": "Advanced Filters",
          "required": false,
          "uiType": "object-grid",
          "group": "Filter",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "status",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<=",
                "LIKE",
                "NOT LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL"
              ],
              "width": "md"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": false,
              "uiType": "input",
              "placeholder": "PAID",
              "width": "md"
            },
            "values": {
              "type": "array",
              "label": "Values (IN / BETWEEN)",
              "required": false,
              "uiType": "string-list",
              "width": "md",
              "description": "Used by IN, NOT IN and BETWEEN."
            },
            "case_insensitive": {
              "type": "boolean",
              "label": "Ignore Case",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "logic": {
              "type": "string",
              "label": "Join",
              "required": false,
              "uiType": "select",
              "options": [
                "AND",
                "OR"
              ],
              "width": "sm"
            }
          },
          "addLabel": "Add Filter",
          "description": "Takes precedence over the single-field search."
        },
        "sort": {
          "type": "array",
          "label": "Sorting",
          "required": false,
          "uiType": "object-grid",
          "group": "Sorting",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Order By",
              "required": true,
              "uiType": "input",
              "placeholder": "created_at",
              "width": "lg"
            },
            "direction": {
              "type": "string",
              "label": "Direction",
              "required": false,
              "uiType": "select",
              "options": [
                "ASC",
                "DESC"
              ],
              "width": "md"
            }
          },
          "addLabel": "Add Sort"
        },
        "page": {
          "type": "number",
          "label": "Page",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1
        },
        "page_size": {
          "type": "number",
          "label": "Page Size",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1,
          "max": 1000
        },
        "include_total": {
          "type": "boolean",
          "label": "Include Total Count",
          "required": false,
          "uiType": "input",
          "group": "Pagination"
        }
      }
    },
    {
      "type": "db-aggregate",
      "category": "database-plugins-039",
      "name": "Aggregate Records",
      "description": "COUNT, SUM, AVG, MIN and MAX with GROUP BY and HAVING.",
      "icon": "BarChart3",
      "color": "bg-violet-500",
      "tags": [
        "database",
        "query",
        "aggregate"
      ],
      "complexity": "advanced",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/aggregate",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "table_name": "",
        "aggregations": [],
        "group_by": [],
        "having": [],
        "filters": [],
        "sort": [],
        "page": 1,
        "page_size": 100
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "table_name": {
          "type": "string",
          "label": "Table Name",
          "required": true,
          "uiType": "input",
          "group": "Target",
          "placeholder": "customers",
          "description": "Bare name, or schema-qualified as schema.table."
        },
        "aggregations": {
          "type": "array",
          "label": "Aggregations",
          "required": true,
          "uiType": "object-grid",
          "group": "Aggregation",
          "itemSchema": {
            "function": {
              "type": "string",
              "label": "Function",
              "required": true,
              "uiType": "select",
              "options": [
                "COUNT",
                "SUM",
                "AVG",
                "MIN",
                "MAX"
              ],
              "width": "md"
            },
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "total  (use * with COUNT)",
              "width": "md"
            },
            "alias": {
              "type": "string",
              "label": "Alias",
              "required": false,
              "uiType": "input",
              "placeholder": "revenue",
              "width": "md"
            },
            "distinct": {
              "type": "boolean",
              "label": "Distinct",
              "required": false,
              "uiType": "input",
              "width": "sm",
              "description": "COUNT + Distinct produces DISTINCT COUNT."
            }
          },
          "addLabel": "Add Aggregation",
          "description": "At least one is required. COUNT + Distinct gives DISTINCT COUNT."
        },
        "group_by": {
          "type": "array",
          "label": "Group By",
          "required": false,
          "uiType": "string-list",
          "group": "Aggregation",
          "addLabel": "Add Group By Column"
        },
        "having": {
          "type": "array",
          "label": "Having",
          "required": false,
          "uiType": "object-grid",
          "group": "Aggregation",
          "itemSchema": {
            "function": {
              "type": "string",
              "label": "Function",
              "required": true,
              "uiType": "select",
              "options": [
                "COUNT",
                "SUM",
                "AVG",
                "MIN",
                "MAX"
              ],
              "width": "md"
            },
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "total",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<="
              ],
              "width": "sm"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": true,
              "uiType": "input",
              "placeholder": "1000",
              "width": "md"
            }
          },
          "addLabel": "Add Having",
          "description": "Requires at least one Group By column."
        },
        "filters": {
          "type": "array",
          "label": "Filters",
          "required": false,
          "uiType": "object-grid",
          "group": "Filter",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Field",
              "required": true,
              "uiType": "input",
              "placeholder": "status",
              "width": "md"
            },
            "operator": {
              "type": "string",
              "label": "Operator",
              "required": true,
              "uiType": "select",
              "options": [
                "=",
                "!=",
                "<>",
                ">",
                "<",
                ">=",
                "<=",
                "LIKE",
                "NOT LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL"
              ],
              "width": "md"
            },
            "value": {
              "type": "string",
              "label": "Value",
              "required": false,
              "uiType": "input",
              "placeholder": "PAID",
              "width": "md"
            },
            "values": {
              "type": "array",
              "label": "Values (IN / BETWEEN)",
              "required": false,
              "uiType": "string-list",
              "width": "md",
              "description": "Used by IN, NOT IN and BETWEEN."
            },
            "case_insensitive": {
              "type": "boolean",
              "label": "Ignore Case",
              "required": false,
              "uiType": "input",
              "width": "sm"
            },
            "logic": {
              "type": "string",
              "label": "Join",
              "required": false,
              "uiType": "select",
              "options": [
                "AND",
                "OR"
              ],
              "width": "sm"
            }
          },
          "addLabel": "Add Filter"
        },
        "sort": {
          "type": "array",
          "label": "Sorting",
          "required": false,
          "uiType": "object-grid",
          "group": "Sorting",
          "itemSchema": {
            "field": {
              "type": "string",
              "label": "Order By",
              "required": true,
              "uiType": "input",
              "placeholder": "created_at",
              "width": "lg"
            },
            "direction": {
              "type": "string",
              "label": "Direction",
              "required": false,
              "uiType": "select",
              "options": [
                "ASC",
                "DESC"
              ],
              "width": "md"
            }
          },
          "addLabel": "Add Sort"
        },
        "page": {
          "type": "number",
          "label": "Page",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1
        },
        "page_size": {
          "type": "number",
          "label": "Page Size",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1,
          "max": 1000
        }
      }
    },
    {
      "type": "db-query",
      "category": "database-plugins-039",
      "name": "Execute Query",
      "description": "Run a SQL statement with bound parameters.",
      "icon": "Terminal",
      "color": "bg-slate-600",
      "tags": [
        "database",
        "query",
        "sql"
      ],
      "complexity": "advanced",
      "estimatedTime": 1000,
      "supportsStreaming": false,
      "requiresAuth": false,
      "retryable": true,
      "timeout": 60000,
      "api": {
        "url": "http://localhost:8080/engine/api/database/query",
        "method": "POST"
      },
      "properties": {
        "database_type": "PostgreSQL",
        "host": "",
        "port": "",
        "DB_Name": "",
        "user_name": "",
        "password": "",
        "schema": "",
        "query_timeout": 30,
        "use_ssl": false,
        "query": "",
        "params": [],
        "limit": undefined,
        "offset": undefined,
        "explain": false
      },
      "propertyConfig": {
        "database_type": {
          "type": "string",
          "label": "Database Type",
          "required": true,
          "uiType": "select",
          "options": [
            "PostgreSQL",
            "MySQL",
            "Oracle",
            "SQL Server",
            "H2"
          ],
          "group": "Connection",
          "description": "Target database engine. Determines the SQL dialect used."
        },
        "host": {
          "type": "string",
          "label": "Host",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "localhost",
          "description": "Hostname or IP address of the database server."
        },
        "port": {
          "type": "string",
          "label": "Port",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "5432",
          "pattern": "^\\d{1,5}$",
          "description": "TCP port. PostgreSQL 5432, MySQL 3306, SQL Server 1433, Oracle 1521."
        },
        "DB_Name": {
          "type": "string",
          "label": "Database Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "automation_db",
          "description": "Catalog / database (Oracle: SID or service name)."
        },
        "user_name": {
          "type": "string",
          "label": "User Name",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "app_user"
        },
        "password": {
          "type": "password",
          "label": "Password",
          "required": true,
          "uiType": "input",
          "group": "Connection",
          "description": "Never stored in plain text in execution logs."
        },
        "schema": {
          "type": "string",
          "label": "Schema",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "placeholder": "public",
          "description": "Optional default schema. Leave blank to use the connection default."
        },
        "query_timeout": {
          "type": "number",
          "label": "Query Timeout (s)",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "min": 1,
          "max": 3600,
          "description": "Statement timeout in seconds. Defaults to 30."
        },
        "use_ssl": {
          "type": "boolean",
          "label": "Use SSL",
          "required": false,
          "uiType": "input",
          "group": "Connection",
          "description": "Encrypt the connection to the database server."
        },
        "query": {
          "type": "textarea",
          "label": "SQL Query",
          "required": true,
          "uiType": "sql-editor",
          "group": "Query",
          "rows": 12,
          "placeholder": "SELECT id, name FROM customers WHERE country = ? ORDER BY id",
          "description": "Use ? placeholders and supply values in Parameters. Never concatenate values into the SQL."
        },
        "params": {
          "type": "array",
          "label": "Parameters",
          "required": false,
          "uiType": "string-list",
          "group": "Query",
          "addLabel": "Add Parameter",
          "description": "Bound in order to the ? placeholders."
        },
        "limit": {
          "type": "number",
          "label": "Limit",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 1,
          "description": "Applied using the engine's own pagination syntax."
        },
        "offset": {
          "type": "number",
          "label": "Offset",
          "required": false,
          "uiType": "input",
          "group": "Pagination",
          "min": 0
        },
        "explain": {
          "type": "boolean",
          "label": "Explain Plan",
          "required": false,
          "uiType": "input",
          "group": "Options",
          "description": "Return the execution plan instead of running the statement."
        }
      }
    }
  ]
},

  // {
  //   "id": "file-operations-040",
  //   "name": "File Operations",
  //   "icon": "FileText",
  //   "color": "bg-orange-500",
  //   "description": "Create, read, move, copy, list, and delete local files and directories.",
  //   "metadata": {
  //     "tags": [
  //       "file",
  //       "operations"
  //     ],
  //     "featured": false,
  //     "popularityScore": 85,
  //     "order": 40,
  //     "group": "File Operations"
  //   },
  //   "ui": {
  //     "gradient": "from-orange-500/20 to-orange-600/10",
  //     "iconBg": "bg-orange-500/10",
  //     "borderGlow": true,
  //     "cardStyle": "premium"
  //   },
  //   "control": {
  //     "enabled": true,
  //     "version": "1.0.0"
  //   },
  //   "actions": [
  //     {
  //       "type": "create-folder",
  //       "category": "file-operations-040",
  //       "name": "CreateFolder",
  //       "description": "Create folder",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "create-folder"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "createdir",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "createdir",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "write-into-file",
  //       "category": "file-operations-040",
  //       "name": "write_into_file",
  //       "description": "Write into file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "write-into-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "write",
  //           "sourcePath": "{{sourcePath}}",
  //           "content": "{{content}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "write",
  //         "sourcePath": "",
  //         "content": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "content": {
  //           "type": "string",
  //           "label": "Content",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "read-file",
  //       "category": "file-operations-040",
  //       "name": "readFile",
  //       "description": "Read file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "read-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "read",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "read",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "create-file",
  //       "category": "file-operations-040",
  //       "name": "createFile",
  //       "description": "Create file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "create-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "create",
  //           "sourcePath": "{{sourcePath}}",
  //           "fileName": "{{fileName}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "create",
  //         "sourcePath": "",
  //         "fileName": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "fileName": {
  //           "type": "string",
  //           "label": "File Name",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "check-file-exists",
  //       "category": "file-operations-040",
  //       "name": "checkFileExists",
  //       "description": "Check file exists",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "check-file-exists"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "exists",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "exists",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "check-file-details",
  //       "category": "file-operations-040",
  //       "name": "checkFileDetails",
  //       "description": "Check file details",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "check-file-details"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "info",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "info",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "list-files",
  //       "category": "file-operations-040",
  //       "name": "ListFiles",
  //       "description": "List files",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "list-files"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "list",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "list",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "move-file",
  //       "category": "file-operations-040",
  //       "name": "Move Fie",
  //       "description": "Move file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "move-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "move",
  //           "sourcePath": "{{sourcePath}}",
  //           "destinationPath": "{{destinationPath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "move",
  //         "sourcePath": "",
  //         "destinationPath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "destinationPath": {
  //           "type": "string",
  //           "label": "Destination Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "check-file-type",
  //       "category": "file-operations-040",
  //       "name": "Check file Type",
  //       "description": "Check file type",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "check-file-type"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "detecttype",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "detecttype",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "get-text-from-file",
  //       "category": "file-operations-040",
  //       "name": "gettext_from_file",
  //       "description": "Get text from file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "get-text-from-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "extracttext",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "extracttext",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "convert-file",
  //       "category": "file-operations-040",
  //       "name": "convertFile",
  //       "description": "Convert file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "convert-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "convert",
  //           "sourcePath": "{{sourcePath}}",
  //           "destinationPath": "{{destinationPath}}",
  //           "content": "{{content}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "convert",
  //         "sourcePath": "",
  //         "destinationPath": "",
  //         "content": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "destinationPath": {
  //           "type": "string",
  //           "label": "Destination Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "content": {
  //           "type": "string",
  //           "label": "Content",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "copy-file",
  //       "category": "file-operations-040",
  //       "name": "Copy File",
  //       "description": "Copy file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "copy-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "copy",
  //           "sourcePath": "{{sourcePath}}",
  //           "destinationPath": "{{destinationPath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "copy",
  //         "sourcePath": "",
  //         "destinationPath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "destinationPath": {
  //           "type": "string",
  //           "label": "Destination Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "delete-file",
  //       "category": "file-operations-040",
  //       "name": "DeleteFile",
  //       "description": "Delete file",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "delete-file"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "delete",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "delete",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     },
  //     {
  //       "type": "delete-directory",
  //       "category": "file-operations-040",
  //       "name": "deleteDirectoy",
  //       "description": "Delete directory",
  //       "icon": "Circle",
  //       "color": "bg-slate-500",
  //       "tags": [
  //         "delete-directory"
  //       ],
  //       "complexity": "basic",
  //       "estimatedTime": 1000,
  //       "supportsStreaming": false,
  //       "requiresAuth": false,
  //       "retryable": true,
  //       "timeout": 60000,
  //       "api": {
  //         "url": "http://localhost:8080/engine/api/files/operate",
  //         "method": "POST",
  //         "headers": {
  //           "Content-Type": "application/json"
  //         },
  //         "body": {
  //           "operationType": "deletedir",
  //           "sourcePath": "{{sourcePath}}"
  //         }
  //       },
  //       "properties": {
  //         "operationType": "deletedir",
  //         "sourcePath": ""
  //       },
  //       "propertyConfig": {
  //         "operationType": {
  //           "type": "string",
  //           "label": "Operation Type",
  //           "required": true,
  //           "uiType": "input"
  //         },
  //         "sourcePath": {
  //           "type": "string",
  //           "label": "Source Path",
  //           "required": true,
  //           "uiType": "input"
  //         }
  //       }
  //     }
  //   ]
  // }
];


type AutomationCategoryWithLogo = AutomationCategory & {
  logo: string;
};

const CATEGORY_LOGO_MAP: Record<string, string> = {
  'workflow-control-001': 'workflow_control.png',
  'microsoft-teams-010': 'teams.png',
  'excel-automation-011': 'excel.png',
  'google-drive-012': 'gdrive.png',
  'onedrive-013': 'onedrive.png',
  'json-automation-014': 'json.png',
  'xml-automation-015': 'xml.png',
  'web-gui-016': 'webgui.png',
  'data-transform-017': 'data_transform.png',
  'outlook-018': 'outlook.png',
  'sftp-019': 'sftp.png',
  'zohodesk-020': 'ZOHODESK.png',
  'sharepoint-021': 'sharepoint.png',
  'amazon-s3-022': 'S3.png',
  'amazon-ec2-023': 'EC2.png',
  'docker-024': 'Docker.png',
  'rest-integration-025': 'api.png',
  'totp-generator-026': 'totp generator.png',
  'text-processing-027': 'text.png',
  'java-filter-flow-028': 'java.png',
  'jenkins-029': 'jenkins.png',
  'linux-operations-030': 'linux.png',
  'mongodb-031': 'mongo-db.png',
  'jumpcloud-032': 'jumpclud.png',
  'asana-033': 'asana.png',
  'adobe-sign-034': 'adobe.png',
  'fast2sms-035': 'Fast2SMS.png',
  'statistics-036': 'sql.png',
  'ai-bridge-037': 'ai.png',
  'system-management-038': 'windows-management.png',
  'database-plugins-039': 'database_plugins.png',
  'file-operations-040': 'file-operations.png',
  'vulnerability-triage-041': 'vulnerability_scanner.png',
  'document-ai-042': 'Document_AI.png',
};

/**
 * Individual action logos for Database Plugins.
 *
 * Every filename is resolved from:
 * public/plugins/<filename>
 */
const DATABASE_ACTION_LOGOS: Record<string, string> = {
  'db-health-check': 'db_health_check.png',
  'db-databases': 'db_list_databases.png',
  'db-schemas': 'db_list_schemas.png',
  'db-tables': 'db_list_tables.png',
  'db-table-info': 'db_table_info.png',

  'db-create-table': 'db_create_table.png',
  'db-drop-table': 'db_drop_table.png',
  'db-rename-table': 'db_rename_table.png',
  'db-truncate-table': 'db_truncate_table.png',

  'db-add-column': 'db_add_column.png',
  'db-drop-column': 'db_drop_column.png',
  'db-rename-column': 'db_rename_column.png',
  'db-modify-column': 'db_modify_column.png',

  'db-insert': 'db_insert_records.png',
  'db-update': 'db_update_records.png',
  'db-delete': 'db_delete_records.png',
  'db-fetch': 'db_fetch_records.png',
  'db-lookup': 'db_lookup_records.png',
  'db-aggregate': 'db_aggregate_records.png',
  'db-query': 'db_execute_query.png',
};

const resolveCategoryLogo = (category: AutomationCategory): string => {
  const corpus = [
    category.id,
    category.name,
    category.description,
    category.metadata?.group,
    ...(category.metadata?.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (corpus.includes('team') || corpus.includes('channel') || corpus.includes('chat')) return 'teams.png';
  if (corpus.includes('excel') || corpus.includes('sheet') || corpus.includes('cell') || corpus.includes('workbook')) return 'excel.png';
  if (corpus.includes('drive')) return 'gdrive.png';
  if (corpus.includes('onedrive')) return 'onedrive.png';
  if (corpus.includes('json')) return 'json.png';
  if (corpus.includes('xml')) return 'xml.png';
  if (corpus.includes('web gui') || corpus.includes('browser') || corpus.includes('playwright') || corpus.includes('selenium')) return 'webgui.png';
  if (corpus.includes('outlook') || corpus.includes('mail') || corpus.includes('email')) return 'outlook.png';
  if (corpus.includes('sftp')) return 'sftp.png';
  if (corpus.includes('zoho desk')) return 'ZOHODESK.png';
  if (corpus.includes('sharepoint')) return 'sharepoint.png';
  if (corpus.includes('amazon s3') || corpus.includes('s3')) return 'S3.png';
  if (corpus.includes('amazon ec2') || corpus.includes('ec2')) return 'EC2.png';
  if (corpus.includes('docker')) return 'Docker.png';
  if (corpus.includes('rest')) return 'api.png';
  if (corpus.includes('totp')) return 'totp generator.png';
  if (corpus.includes('text processing') || corpus.includes('text')) return 'text.png';
  if (corpus.includes('java')) return 'java.png';
  if (corpus.includes('jenkins')) return 'jenkins.png';
  if (corpus.includes('linux')) return 'linux.png';
  if (corpus.includes('mongodb') || corpus.includes('mongo')) return 'mongo-db.png';
  if (corpus.includes('jumpcloud')) return 'jumpclud.png';
  if (corpus.includes('asana')) return 'asana.png';
  if (corpus.includes('adobe')) return 'adobe.png';
  if (corpus.includes('fast2sms') || corpus.includes('sms') || corpus.includes('otp')) return 'Fast2SMS.png';
  if (corpus.includes('statistics')) return 'sql.png';
  if (corpus.includes('ai bridge') || corpus.includes('ai')) return 'ai.png';
  if (corpus.includes('system management') || corpus.includes('windows')) return 'windows-management.png';
  if (corpus.includes('database')) return 'database_plugins.png';
  if (corpus.includes('file operations') || corpus.includes('file')) return 'file-operations.png';

  return 'api.png';
};


/* -------------------------------------------------------------------------- */
/*              DATA TRANSFORMATION + EXCEL DATASET REGISTRATION              */
/* -------------------------------------------------------------------------- */
//
// Applied here rather than by hand-editing the 349 literal entries above.
// Registration must happen BEFORE `automationCategoriesWithLogos` is derived,
// or the new actions land in the array but the logo map never sees them.

import { DATA_TRANSFORM_ACTIONS } from './actions/dataTransformOperations';
import { EXCEL_READ_DATASET_ACTION, EXCEL_OUTPUT_SCHEMAS, applyOutputSchemas } from './actions/excelDataset';
import { EXCEL_VERIFIED_WRITE_ACTIONS } from './actions/excelVerifiedWrites';
import { VULNERABILITY_TRIAGE_CATEGORY } from './actions/vulnerabilityTriage';
import { GOOGLE_SHEETS_CATEGORY } from './actions/googleSheets';
import { DOCUMENT_AI_CATEGORY } from './actions/documentAi';

// Replace, don't append. The six original entries point at deprecated backend
// paths and default `data` to hardcoded sample rows (`Ada`, `Grace`) â€” a demo
// convenience that ships as a workflow silently transforming two fictional
// people. Saved workflows keep running because each node stores its own
// `api.url` and the backend still serves the old paths.
const dataTransformCategory = automationCategories.find((c) => c.id === 'data-transform-017');
if (dataTransformCategory) {
  dataTransformCategory.actions = DATA_TRANSFORM_ACTIONS as unknown as typeof dataTransformCategory.actions;
  dataTransformCategory.description =
    'Filter, join, aggregate, pivot, clean and validate tabular data from any source.';
}

// Excel: preserve every existing action, attach declared output contracts,
// add Read Dataset, then add the six certified JSON/verification variants.
// Existing binary workbook-return actions are intentionally not renamed or
// repointed; saved workflows therefore retain their original behavior.
const excelCategory = automationCategories.find((c) => c.id === 'excel-automation-011');
if (excelCategory) {
  excelCategory.actions = [
    ...applyOutputSchemas(excelCategory.actions as any[], EXCEL_OUTPUT_SCHEMAS),
    EXCEL_READ_DATASET_ACTION,
    ...EXCEL_VERIFIED_WRITE_ACTIONS,
  ] as unknown as typeof excelCategory.actions;
}

// Vulnerability Triage & Analysis: a category appended rather than replacing
// anything. Four pass-through scanner-report intake actions (NESS, Cisco,
// Check Point, Checkmarx) plus one API call that analyses the findings â€” see
// `./actions/vulnerabilityTriage.ts` for why each intake action carries the
// complete request rather than the configuration being split across several
// collector steps. Guarded so a hot reload that re-evaluates this module cannot
// register it twice.
if (!automationCategories.some((c) => c.id === VULNERABILITY_TRIAGE_CATEGORY.id)) {
  automationCategories.push(VULNERABILITY_TRIAGE_CATEGORY);
}

// Google Sheets: seven certified canonical V1 actions. Guarded for hot reload.
if (!automationCategories.some((c) => c.id === GOOGLE_SHEETS_CATEGORY.id)) {
  automationCategories.push(GOOGLE_SHEETS_CATEGORY);
}
// Document AI: OCR is live in Products Engine v11.4. Summarisation and
// transcription remain visible but unavailable until their backend routes are
// actually integrated, so the catalogue never advertises a fake working action.
if (!automationCategories.some((c) => c.id === DOCUMENT_AI_CATEGORY.id)) {
  automationCategories.push(DOCUMENT_AI_CATEGORY);
}


/* -------------------------------------------------------------------------- */
/*                       DATABASE PLUGIN LOGO REGISTRATION                    */
/* -------------------------------------------------------------------------- */

/**
 * Apply individual 48Ã—48 PNG logos to all actions in database-plugins-039.
 *
 * The UI resolves each filename from `public/plugins/<filename>`. The package
 * logo is used as a safe fallback if a future database action is added before
 * its dedicated icon is registered.
 */
const databasePluginsCategory = automationCategories.find(
  (category) => category.id === 'database-plugins-039'
);

if (databasePluginsCategory) {
  databasePluginsCategory.actions = databasePluginsCategory.actions.map(
    (action) => ({
      ...action,
      logo:
        DATABASE_ACTION_LOGOS[action.type] ??
        'database_plugins.png',
    })
  ) as typeof databasePluginsCategory.actions;
}

export const automationCategoriesWithLogos: AutomationCategoryWithLogo[] = automationCategories.map((category) => ({
  ...category,
  logo: CATEGORY_LOGO_MAP[category.id] ?? resolveCategoryLogo(category),
}));