// src/services/serviceSelector.ts

import { ServiceRegistry, ServiceDefinition } from './serviceRegistry';
import { ServiceCache } from './serviceCache';

// ==========================================
// 1. CONFIGURATION & TYPES
// ==========================================

export interface SelectionContext {
  activeCategory?: string;
  selectedNodeId?: string;
  existingNodeTypes?: string[];
  userIntent?: 'create' | 'modify' | 'debug' | 'optimize';
}

export interface SelectionConfig {
  maxServices: number;
  maxPerCategory: number;
  diversityEnabled: boolean;
  minScoreThreshold: number;
}

const DEFAULT_CONFIG: SelectionConfig = {
  maxServices: 10,
  maxPerCategory: 3,
  diversityEnabled: true,
  minScoreThreshold: 10
};

// ==========================================
// 2. STRUCTURED LOGGING
// ==========================================

class Logger {
  static info(msg: string, meta?: any) {
    console.info(`[ServiceSelector] ℹ️ ${msg}`, meta ? meta : '');
  }
  static debug(msg: string, meta?: any) {
    if (!import.meta.env.PROD) {
      console.debug(`[ServiceSelector] 🐛 ${msg}`, meta ? meta : '');
    }
  }
}

// ==========================================
// 3. SMART SELECTION ORCHESTRATOR
// ==========================================

export class ServiceSelector {
  /**
   * Lazily loads and returns the singleton Service Registry.
   */
  private static async getRegistry(): Promise<ServiceRegistry> {
    const registry = ServiceRegistry.getInstance();
    await registry.initialize();
    return registry;
  }

  /**
   * Core public API: Intelligently selects services based on semantic search, 
   * contextual awareness, and diversity constraints.
   */
  static async selectRelevantServices(
    userMessage: string, 
    maxServices: number = DEFAULT_CONFIG.maxServices,
    context?: SelectionContext
  ): Promise<ServiceDefinition[]> {
    const registry = await this.getRegistry();
    Logger.debug(`Selecting services for query: "${userMessage}"`);

    // 1. Base Semantic Search (Fetch 2x needed to allow for filtering)
    let rawResults = await registry.searchRelevantServices(userMessage, maxServices * 2);

    // 2. Context-Aware Boosting
    if (context) {
      rawResults = this.applyContextBoosting(rawResults, context);
    }

    // 3. Apply Diversity Constraints (prevent one category from dominating)
    let finalResults = DEFAULT_CONFIG.diversityEnabled 
      ? this.enforceDiversity(rawResults, DEFAULT_CONFIG.maxPerCategory)
      : rawResults;

    // 4. Truncate to requested limit
    finalResults = finalResults.slice(0, maxServices);

    // 5. Dynamic Fallback Injection (If search yielded too few results)
    if (finalResults.length < Math.min(3, maxServices)) {
      Logger.debug('Insufficient matches found. Injecting dynamic fallbacks.');
      const excludeTypes = new Set(finalResults.map(r => r.type));
      const fallbacks = await this.getDynamicFallbacks(maxServices - finalResults.length, excludeTypes);
      finalResults = [...finalResults, ...fallbacks];
    }

    return finalResults;
  }

  /**
   * Boosts or penalizes services based on the current state of the workflow canvas.
   */
  private static applyContextBoosting(services: ServiceDefinition[], context: SelectionContext): ServiceDefinition[] {
    return services.map(service => {
      let contextualScore = 0;

      // Boost services in the same category as the currently active/selected node
      if (context.activeCategory && service.category === context.activeCategory) {
        contextualScore += 15;
      }

      // Penalize slightly if the node type already exists multiple times (encourages diverse discovery)
      if (context.existingNodeTypes) {
        const usageCount = context.existingNodeTypes.filter(t => t === service.type).length;
        if (usageCount > 0) {
          contextualScore -= (usageCount * 5); 
        }
      }

      return { service, contextualScore };
    })
    .sort((a, b) => b.contextualScore - a.contextualScore)
    .map(wrapper => wrapper.service);
  }

  /**
   * Prevents a single category (e.g., "String Operations") from filling up all suggestions.
   */
  private static enforceDiversity(services: ServiceDefinition[], maxPerCategory: number): ServiceDefinition[] {
    const categoryCounts = new Map<string, number>();
    
    return services.filter(service => {
      const count = categoryCounts.get(service.category) || 0;
      if (count >= maxPerCategory) return false;
      
      categoryCounts.set(service.category, count + 1);
      return true;
    });
  }

  /**
   * Dynamically fetches high-utility fallback services based on Registry metadata 
   * (Popularity, Usage Count) rather than hardcoded lists.
   */
  private static async getDynamicFallbacks(limit: number, excludeTypes: Set<string>): Promise<ServiceDefinition[]> {
    const registry = await this.getRegistry();
    const cacheKey = 'selector:fallbacks:top';
    
    // Use Cache for expensive popularity sorting
    let topServices = ServiceCache.get<ServiceDefinition[]>(cacheKey);
    
    if (!topServices) {
      const allTypes = registry.getAllServiceTypes();
      topServices = allTypes
        .map(type => registry.getService(type)!)
        .filter(Boolean)
        .sort((a, b) => (b.metadata.popularityScore || 0) - (a.metadata.popularityScore || 0));
        
      ServiceCache.set(cacheKey, topServices, 5 * 60 * 1000); // 5 min TTL
    }

    return topServices
      .filter(s => !excludeTypes.has(s.type))
      .slice(0, limit);
  }

  // ==========================================
  // 4. BACKWARD COMPATIBILITY PROXIES
  // ==========================================

  /**
   * Wraps the Registry's exact match lookup for legacy support.
   */
  static async getServiceDefinition(type: string): Promise<ServiceDefinition | undefined> {
    const registry = await this.getRegistry();
    return registry.getService(type);
  }

  /**
   * Wraps the Registry's type collection for legacy support.
   */
  static async getAllServiceTypes(): Promise<string[]> {
    const registry = await this.getRegistry();
    return registry.getAllServiceTypes();
  }
}