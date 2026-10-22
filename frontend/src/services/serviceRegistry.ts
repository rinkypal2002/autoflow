// src/services/serviceRegistry.ts

import { automationCategories } from '../data/automationCategories';
import { ServiceCache } from './serviceCache';
import { WorkflowAction } from '../types/workflow';

// ==========================================
// 1. STRONG TYPING & CONFIGURATION
// ==========================================

export interface ServiceMetadata {
  version: string;
  tags: string[];
  popularityScore: number;
  usageCount: number;
  author?: string;
  deprecated?: boolean;
}

export interface ServiceDefinition<TProps = Record<string, any>> {
  type: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  api?: Record<string, any>;
  properties: TProps;
  propertyConfig?: Record<string, any>;
  keywords: Set<string>; // Optimized from string[] to Set for O(1) lookups
  schema: any;
  metadata: ServiceMetadata;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ServiceValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  suggestions: string[];
}

export interface SearchConfig {
  weights: {
    exactMatch: number;
    typeMatch: number;
    nameMatch: number;
    keywordMatch: number;
    categoryMatch: number;
    fuzzyMatch: number;
  };
  similarityThreshold: number;
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  weights: {
    exactMatch: 100,
    typeMatch: 40,
    nameMatch: 30,
    keywordMatch: 15,
    categoryMatch: 10,
    fuzzyMatch: 5,
  },
  similarityThreshold: 0.75
};

// ==========================================
// 2. STRUCTURED LOGGING
// ==========================================

class Logger {
  // Vite replaces import.meta.env at build time; `process` is Node-only and
  // is not defined in the browser bundle this file ships in.
  private static isDebug = !import.meta.env.PROD;

  static info(msg: string, meta?: any) {
    console.info(`[ServiceRegistry] ℹ️ ${msg}`, meta ? meta : '');
  }
  static warn(msg: string, meta?: any) {
    console.warn(`[ServiceRegistry] ⚠️ ${msg}`, meta ? meta : '');
  }
  static error(msg: string, meta?: any) {
    console.error(`[ServiceRegistry] 🚨 ${msg}`, meta ? meta : '');
  }
  static debug(msg: string, meta?: any) {
    if (this.isDebug) {
      console.debug(`[ServiceRegistry] 🐛 ${msg}`, meta ? meta : '');
    }
  }
}

// ==========================================
// 3. SEARCH ENGINE
// ==========================================

class SearchEngine {
  private static readonly STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'a', 'an', 'to', 'in', 'on', 'at', 'by']);

  static tokenize(text: string): string[] {
    return (text.toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [])
      .filter(word => !this.STOP_WORDS.has(word));
  }

  static calculateScore(queryTokens: string[], service: ServiceDefinition, config: SearchConfig): number {
    let score = 0;
    const serviceName = service.name.toLowerCase();
    const serviceDesc = service.description.toLowerCase();
    const serviceType = service.type.toLowerCase();
    const serviceCat = service.category.toLowerCase();

    for (const token of queryTokens) {
      // 1. High-value exact matches
      if (serviceType === token) score += config.weights.exactMatch;
      if (serviceType.includes(token)) score += config.weights.typeMatch;
      if (serviceName.includes(token)) score += config.weights.nameMatch;
      
      // 2. Keyword & Category matches
      if (service.keywords.has(token)) score += config.weights.keywordMatch;
      if (serviceCat.includes(token)) score += config.weights.categoryMatch;

      // 3. Fuzzy matching on description or tags
      if (serviceDesc.includes(token)) score += config.weights.fuzzyMatch * 2;
      if (service.metadata.tags.some(tag => tag.toLowerCase().includes(token))) score += config.weights.keywordMatch;

      // 4. Levenshtein Semantic similarity against name (heavy operation, do last)
      const similarity = this.calculateSimilarity(token, serviceName);
      if (similarity > config.similarityThreshold) {
        score += Math.round(config.weights.fuzzyMatch * similarity * 10);
      }
    }

    // Boost score by usage popularity
    if (score > 0) {
      score += (service.metadata.popularityScore * 0.1); 
    }

    return score;
  }

  static calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return (maxLen - this.levenshteinDistance(a, b)) / maxLen;
  }

  private static levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    return matrix[b.length][a.length];
  }
}

// ==========================================
// 4. VALIDATION ENGINE
// ==========================================

class ValidationEngine {
  static validate(data: any, schema: any): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!schema || !schema.properties) return errors;

    // Required fields check
    if (Array.isArray(schema.required)) {
      schema.required.forEach((prop: string) => {
        if (!(prop in data) || data[prop] === null || data[prop] === undefined || data[prop] === '') {
          errors.push({ field: prop, message: `Required property is missing`, severity: 'error' });
        }
      });
    }

    // Constraints check
    Object.entries(schema.properties).forEach(([prop, propSchema]: [string, any]) => {
      const value = data[prop];
      if (value === undefined || value === null) return;

      if (!this.checkType(value, propSchema.type)) {
        errors.push({ field: prop, message: `Expected type ${propSchema.type}`, severity: 'error' });
        return;
      }

      if (propSchema.enum && !propSchema.enum.includes(value)) {
        errors.push({ field: prop, message: `Must be one of: ${propSchema.enum.join(', ')}`, severity: 'error' });
      }

      if (typeof value === 'number') {
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
          errors.push({ field: prop, message: `Must be >= ${propSchema.minimum}`, severity: 'error' });
        }
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
          errors.push({ field: prop, message: `Must be <= ${propSchema.maximum}`, severity: 'error' });
        }
      }
    });

    return errors;
  }

  private static checkType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      default: return true;
    }
  }

  static generateJsonSchema(action: Partial<WorkflowAction>): any {
    const properties: any = {};
    const required: string[] = [];

    if (action.propertyConfig) {
      Object.entries(action.propertyConfig).forEach(([key, config]: [string, any]) => {
        if (config.required) required.push(key);
        properties[key] = {
          type: this.mapUiTypeToJsonType(config.type),
          description: config.label || key,
          ...(config.options && { enum: config.options }),
          ...(config.min !== undefined && { minimum: config.min }),
          ...(config.max !== undefined && { maximum: config.max })
        };
      });
    }

    return { type: 'object', properties, required, additionalProperties: false };
  }

  private static mapUiTypeToJsonType(uiType: string): string {
    const map: Record<string, string> = { 'number': 'number', 'boolean': 'boolean' };
    return map[uiType] || 'string'; // Default all text-based UI inputs to string
  }
}

// ==========================================
// 5. MAIN SERVICE REGISTRY
// ==========================================

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  private services: Map<string, ServiceDefinition> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Idempotent, lazy-loaded initialization. Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      Logger.info('Initializing...');
      const startTime = performance.now();

      for (const category of automationCategories) {
        for (const action of category.actions) {
          this.registerService(action, category.id);
        }
      }

      this.initialized = true;
      Logger.info(`Initialized successfully. Loaded ${this.services.size} services in ${(performance.now() - startTime).toFixed(2)}ms`);
    })();

    return this.initPromise;
  }

  /**
   * Registers a service. Exposed publicly to allow dynamic plugin injection.
   */
  public registerService(action: Partial<WorkflowAction>, categoryId: string = 'custom'): void {
    if (!action.type || !action.name) {
      Logger.warn('Attempted to register invalid service', action);
      return;
    }

    const keywords = new Set(SearchEngine.tokenize(`${action.name} ${action.description} ${action.type} ${categoryId}`));
    if (action.properties) {
      Object.keys(action.properties).forEach(k => keywords.add(k.toLowerCase().replace(/_/g, ' ')));
    }

    const service: ServiceDefinition = {
      type: action.type,
      name: action.name,
      description: action.description || '',
      category: categoryId,
      icon: action.icon || 'Box',
      api: action.api,
      properties: action.properties || {},
      propertyConfig: action.propertyConfig,
      schema: ValidationEngine.generateJsonSchema(action),
      keywords: keywords,
      metadata: {
        version: '1.0.0',
        tags: Array.from(keywords).slice(0, 5), // Top 5 keywords as tags
        popularityScore: Math.floor(Math.random() * 100), // Mock popularity
        usageCount: 0,
        deprecated: false
      }
    };

    this.services.set(service.type, service);

    if (!this.categoryIndex.has(categoryId)) {
      this.categoryIndex.set(categoryId, new Set());
    }
    this.categoryIndex.get(categoryId)!.add(service.type);
  }

  /**
   * Intelligent, cached semantic search.
   */
  async searchRelevantServices(query: string, maxResults: number = 10, config: SearchConfig = DEFAULT_SEARCH_CONFIG): Promise<ServiceDefinition[]> {
    await this.initialize();
    
    const cacheKey = `registry:search:${query.toLowerCase().trim()}:${maxResults}`;
    const cached = ServiceCache.get<ServiceDefinition[]>(cacheKey);
    if (cached) return cached;

    const queryTokens = SearchEngine.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scoredServices: { service: ServiceDefinition; score: number }[] = [];

    for (const service of this.services.values()) {
      if (service.metadata.deprecated) continue;
      
      const score = SearchEngine.calculateScore(queryTokens, service, config);
      if (score > 0) {
        scoredServices.push({ service, score });
      }
    }

    const results = scoredServices
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.service);

    ServiceCache.set(cacheKey, results, 60000); // Cache for 1 minute
    Logger.debug(`Search for "${query}" yielded ${results.length} results.`);
    return results;
  }

  /**
   * Validates properties against the service's generated schema.
   */
  validateService(serviceType: string, properties: Record<string, any> = {}): ServiceValidationResult {
    const service = this.services.get(serviceType);
    
    if (!service) {
      const suggestions = Array.from(this.services.values())
        .map(s => ({ type: s.type, sim: SearchEngine.calculateSimilarity(serviceType, s.type) }))
        .filter(s => s.sim > 0.4)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3)
        .map(s => s.type);

      return {
        isValid: false,
        errors: [{ field: 'type', message: `Service '${serviceType}' not found`, severity: 'error' }],
        suggestions: suggestions.length > 0 ? [`Did you mean: ${suggestions.join(', ')}?`] : []
      };
    }

    const errors = ValidationEngine.validate(properties, service.schema);
    
    return {
      isValid: errors.length === 0,
      errors,
      suggestions: []
    };
  }

  // --- Safe Accessors ---

  getService(type: string): ServiceDefinition | undefined {
    return this.services.get(type);
  }

  getAllServiceTypes(): string[] {
    return Array.from(this.services.keys());
  }

  getServicesByCategory(categoryId: string): ServiceDefinition[] {
    const types = this.categoryIndex.get(categoryId);
    if (!types) return [];
    return Array.from(types).map(type => this.services.get(type)!).filter(Boolean);
  }

  recordUsage(type: string): void {
    const service = this.services.get(type);
    if (service) {
      service.metadata.usageCount += 1;
      // Increment popularity slightly
      service.metadata.popularityScore = Math.min(100, service.metadata.popularityScore + 0.1);
    }
  }
}