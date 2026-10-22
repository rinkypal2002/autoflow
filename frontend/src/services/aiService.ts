// src/services/aiService.ts
import { ServiceRegistry } from './serviceRegistry';
import { WorkflowAction } from '../types/workflow';
import { SERVICES } from '../config/services';

// ==========================================
// 1. CONFIGURATION & TYPES
// ==========================================

const CONFIG = {
  OLLAMA_HOST: SERVICES.aiHost,
  DEFAULT_MODEL: SERVICES.aiModel,
  MAX_RETRIES: 3,
  TIMEOUT_MS: 45000, // 45 seconds
  // `process.env` is not available in the browser bundle; use Vite's mode flag.
  DEBUG_MODE: import.meta.env.MODE !== 'production',
  MAX_INPUT_LENGTH: 4000,
};

export interface LLMAnalysis {
  understanding: string;
  intent: string;
  entities: Record<string, any>;
  workflowplan: string;
  confidence: number;
}

export interface AIResponse {
  success: boolean;
  type: 'workflow' | 'analysis' | 'error';
  data?: any; // Backward compatibility for ChatsPanel
  workflow?: any;
  analysis?: LLMAnalysis;
  message?: string;
  error?: string;
}

// ==========================================
// 2. CORE UTILITIES
// ==========================================

class Logger {
  static info(msg: string, data?: any) {
    console.log(`ℹ️ [AIService]: ${msg}`, data || '');
  }
  static warn(msg: string, data?: any) {
    console.warn(`⚠️ [AIService]: ${msg}`, data || '');
  }
  static error(msg: string, data?: any) {
    console.error(`🚨 [AIService]: ${msg}`, data || '');
  }
  static debug(msg: string, data?: any) {
    if (CONFIG.DEBUG_MODE) console.debug(`🐛 [AIService]: ${msg}`, data || '');
  }
}

class SecurityContext {
  static sanitizeInput(input: string): string {
    if (!input) return '';
    // Prevent extremely long inputs (DOS protection)
    let sanitized = input.substring(0, CONFIG.MAX_INPUT_LENGTH);
    // Basic sanitization to strip potential HTML/Script tags if mistakenly rendered
    sanitized = sanitized.replace(/<[^>]*>?/gm, '');
    return sanitized.trim();
  }
}

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ==========================================
// 3. LLM CLIENT (NETWORK LAYER)
// ==========================================

class LLMClient {
  static async call(prompt: string, options: Record<string, any> = {}): Promise<string> {
    let attempt = 0;
    
    while (attempt < CONFIG.MAX_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

      try {
        Logger.debug(`LLM Request Attempt ${attempt}/${CONFIG.MAX_RETRIES}`);
        
        const response = await fetch(`${CONFIG.OLLAMA_HOST}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: CONFIG.DEFAULT_MODEL,
            prompt: prompt,
            stream: false,
            options: {
              temperature: options.temperature ?? 0.1,
              top_p: options.top_p ?? 0.9,
              repeat_penalty: options.repeat_penalty ?? 1.1,
              num_predict: options.num_predict ?? 2048,
              ...options
            }
          })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`LLM HTTP Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.response;

      } catch (error: any) {
        clearTimeout(timeoutId);
        
        const isTimeout = error.name === 'AbortError';
        Logger.warn(`LLM Call Failed (Attempt ${attempt}): ${isTimeout ? 'Timeout' : error.message}`);

        if (attempt >= CONFIG.MAX_RETRIES) {
          throw new Error(`LLM call failed after ${CONFIG.MAX_RETRIES} attempts. ${isTimeout ? 'Request timed out.' : ''}`);
        }

        // Exponential backoff: 1s, 2s, 4s...
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
    throw new Error('Unexpected LLM Client Error');
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${CONFIG.OLLAMA_HOST}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ==========================================
// 4. PROMPT MANAGEMENT
// ==========================================

class PromptManager {
  static getAnalysisPrompt(userMessage: string): string {
    return `You are an intelligent enterprise workflow automation architect. Analyze this user request deeply.

USER REQUEST: ${userMessage}

Analyze and provide a JSON response strictly matching this schema:
{
  "understanding": "Deep understanding of the goal",
  "intent": "create | modify | debug | optimize",
  "entities": {
    "data_points": ["files", "folders", "urls", "emails"],
    "systems": ["excel", "api", "database"],
    "sequence": ["ordered list of logical steps"]
  },
  "workflowplan": "Step-by-step technical execution plan",
  "confidence": 0.95
}
Respond ONLY with valid JSON.`;
  }

  static getSelectionPrompt(userMessage: string, analysis: LLMAnalysis, services: any[]): string {
    const serviceList = services.map((s, i) => `${i + 1}. ${s.name} (${s.type}) - ${s.description}`).join('\n');
    return `You are a microservices orchestration expert. Select the exact tools needed for this workflow.

REQUEST: ${userMessage}
ANALYSIS: ${JSON.stringify(analysis)}

AVAILABLE SERVICES:
${serviceList}

Respond strictly with this JSON format:
{
  "selectedservices": [1, 3, 5],
  "reasoning": "Why these specific services are required."
}
Respond ONLY with valid JSON.`;
  }

  static getGenerationPrompt(userMessage: string, analysis: LLMAnalysis, services: any[]): string {
    return `You are an expert workflow generator. Create a complete, valid JSON workflow pipeline.

REQUEST: ${userMessage}
PLAN: ${analysis.workflowplan}

ALLOWED SERVICES ONLY:
${JSON.stringify(services.map(s => ({ type: s.type, name: s.name, properties: s.properties })), null, 2)}

IMPORTANT RULES:
1. Use ONLY the service types provided above.
2. Ensure realistic, usable property values.
3. Link nodes logically if a sequence is required.
4. NO COMMENTS. NO MARKDOWN. ONLY RAW JSON.

Required Output Schema:
{
  "name": "Workflow Name",
  "description": "...",
  "actions": [
    {
      "id": "uuid",
      "type": "exact-service-type",
      "name": "Node Name",
      "properties": { "key": "value" },
      "x": 100, "y": 100
    }
  ]
}`;
  }
}

// ==========================================
// 5. ADVANCED JSON PARSER & VALIDATOR
// ==========================================

class WorkflowParser {
  static parse<T>(response: string, fallback?: T): T {
    try {
      // 1. Direct Parse
      return JSON.parse(response.trim());
    } catch {
      Logger.debug('Direct parse failed, attempting advanced repair...');
    }

    try {
      // 2. Clean & Parse
      const cleaned = this.cleanJson(response);
      return JSON.parse(cleaned);
    } catch {
      Logger.debug('Cleaned parse failed, attempting extraction...');
    }

    try {
      // 3. Extract & Parse
      const extracted = this.extractJson(response);
      if (extracted) return JSON.parse(extracted);
    } catch {
      Logger.debug('Extraction parse failed, attempting aggressive repair...');
    }

    try {
      // 4. Aggressive Repair
      const repaired = this.repairJson(response);
      return JSON.parse(repaired);
    } catch {
      if (fallback !== undefined) {
        Logger.warn('All parsing strategies failed. Using fallback.');
        return fallback;
      }
      throw new Error('LLM Response could not be parsed into valid JSON.');
    }
  }

  private static cleanJson(str: string): string {
    return str.trim()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*$/gm, '');       // Remove single-line comments
  }

  private static extractJson(text: string): string | null {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1);
    }
    return null;
  }

  private static repairJson(str: string): string {
    let result = this.cleanJson(str);
    // Fix unquoted keys
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
    // Fix trailing commas
    result = result.replace(/,\s*([}\]])/g, '$1');
    // Fix missing quotes on string values (risky but sometimes necessary)
    result = result.replace(/:\s*([a-zA-Z][^",}\]]*?)([,}\]])/g, (_match, val, suffix) => {
      const t = val.trim();
      if (t === 'true' || t === 'false' || t === 'null' || /^\d+(\.\d+)?$/.test(t)) return `: ${t}${suffix}`;
      return `: "${t}"${suffix}`;
    });
    return result;
  }

  // Structural Validation ensuring it won't crash the canvas
  static validateWorkflowSchema(workflow: any): boolean {
    if (!workflow || typeof workflow !== 'object') return false;
    if (!Array.isArray(workflow.actions)) return false;
    return true;
  }
}

// ==========================================
// 6. MAIN ORCHESTRATOR SERVICE
// ==========================================

export class AIService {
  private static serviceRegistry: ServiceRegistry | null = null;

  private static async getRegistry(): Promise<ServiceRegistry> {
    if (!this.serviceRegistry) {
      this.serviceRegistry = ServiceRegistry.getInstance();
      await this.serviceRegistry.initialize();
    }
    return this.serviceRegistry;
  }

  static async generateWorkflow(rawUserMessage: string): Promise<AIResponse> {
    const userMessage = SecurityContext.sanitizeInput(rawUserMessage);
    if (!userMessage) return { success: false, type: 'error', message: 'Empty input.' };

    try {
      Logger.info('Starting Orchestration Pipeline', { userMessage });
      const registry = await this.getRegistry();

      // STEP 1: Analysis
      const analysisPrompt = PromptManager.getAnalysisPrompt(userMessage);
      const analysisRaw = await LLMClient.call(analysisPrompt, { temperature: 0.1 });
      const analysis = WorkflowParser.parse<LLMAnalysis>(analysisRaw, {
        understanding: "Generic request", intent: "create", entities: {}, workflowplan: "Generate workflow", confidence: 0.5
      });
      Logger.debug('Analysis Complete', analysis);

      // STEP 2: Service Selection
      const availableServices = await registry.searchRelevantServices(userMessage, 15);
      const selectionPrompt = PromptManager.getSelectionPrompt(userMessage, analysis, availableServices);
      const selectionRaw = await LLMClient.call(selectionPrompt, { temperature: 0.1 });
      const selection = WorkflowParser.parse<any>(selectionRaw, { selectedservices: [1] });
      
      const selectedServices = (selection.selectedservices || [])
        .map((idx: number) => availableServices[idx - 1])
        .filter(Boolean);
      
      // Fallback if LLM fails to select
      const finalServices = selectedServices.length > 0 ? selectedServices : availableServices.slice(0, 3);
      Logger.debug('Services Selected', finalServices.map((s: { type: string }) => s.type));

      // STEP 3: Workflow Generation
      const generationPrompt = PromptManager.getGenerationPrompt(userMessage, analysis, finalServices);
      const workflowRaw = await LLMClient.call(generationPrompt, { temperature: 0.2, top_p: 0.85 });
      const workflowData = WorkflowParser.parse<any>(workflowRaw);

      // Validation
      if (!WorkflowParser.validateWorkflowSchema(workflowData)) {
        throw new Error("LLM generated invalid workflow schema");
      }

      // STEP 4: Post-Processing & Enrichment (Safe Defaults)
      const finalWorkflow = this.enrichAndFormatWorkflow(workflowData, registry);
      Logger.info('Orchestration Pipeline Complete', finalWorkflow.name);

      return {
        success: true,
        type: 'workflow',
        data: finalWorkflow, // For ChatsPanel backwards compatibility
        workflow: finalWorkflow, // Modern standard
        analysis: analysis
      };

    } catch (error: any) {
      Logger.error('Orchestration Pipeline Failed', error);
      
      // Standardized Fallback Analysis Response
      return {
        success: false,
        type: 'analysis',
        message: `I encountered an issue building this workflow: ${error.message || 'Unknown error'}. Please try rephrasing your request or selecting specific actions from the library.`
      };
    }
  }

  // Ensures the workflow has all required fields to render safely on the Canvas
  private static enrichAndFormatWorkflow(workflow: any, registry: ServiceRegistry): any {
    const actions: WorkflowAction[] = (workflow.actions || []).map((action: any, index: number) => {
      const service = registry.getService(action.type);
      const isValidService = !!service;

      return {
        id: action.id || generateUUID(),
        type: isValidService ? service.type : action.type,
        category: isValidService ? service.category : 'custom',
        name: action.name || (isValidService ? service.name : 'Unknown Action'),
        description: action.description || (isValidService ? service.description : ''),
        icon: isValidService ? (service.icon || 'Settings') : 'Box',
        properties: action.properties || {},
        api: isValidService ? service.api : {},
        // Layout algorithm: space nodes out horizontally if coordinates are missing/clumped
        x: action.x ? action.x : 100 + (index * 280),
        y: action.y ? action.y : 150 + ((index % 2) * 50), // Slight stagger
        status: 'idle'
      };
    });

    return {
      id: workflow.id || generateUUID(),
      name: workflow.name || 'AI Generated Workflow',
      description: workflow.description || 'Intelligent workflow created by AI',
      actions: actions,
      connections: workflow.connections || [],
      variables: workflow.variables || [],
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // Health check proxy for UI
  static async isAvailable(): Promise<boolean> {
    return await LLMClient.checkHealth();
  }
}