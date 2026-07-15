export type EmotionType =
  | "happy"
  | "sad"
  | "surprised"
  | "moved"
  | "excited"
  | "nostalgic"
  | "curious"
  | "neutral";

export type EvidenceType = "observed" | "inferred" | "remembered" | "heard" | "assumed";

export type LinkType = "caused_by" | "leads_to" | "related" | "similar" | "similar_auto";

export interface Memory {
  id: string;
  content: string;
  timestamp: string;
  emotion: EmotionType;
  importance: number;
  category: string;
  evidenceType: EvidenceType | null;
  accessCount: number;
  lastAccessed: string | null;
  tags: string[];
  noveltyScore: number;
  predictionError: number;
  activationCount: number;
  lastActivated: string | null;
  freshness: number;
  flashKeywords: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchResult {
  memory: Memory;
  distance: number;
}

export interface MemoryLink {
  id: string;
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  weight: number;
  createdAt: string;
  note: string | null;
}

export interface Episode {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  participants: string[];
  locationContext: string | null;
  summary: string;
  emotion: EmotionType;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface RememberOptions {
  emotion?: EmotionType;
  importance?: number;
  category?: string;
  evidenceType?: EvidenceType;
  tags?: string[];
  flashKeywords?: string;
  autoLink?: boolean;
  linkThreshold?: number;
}
