import type { Episode, EvidenceType, LinkType, Memory, MemoryLink } from "./types";

// bun:sql が返す行は snake_case のまま。TS側 camelCase 型へのマッピングをここに集約する。
export function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    content: row.content as string,
    timestamp: new Date(row.timestamp as string).toISOString(),
    emotion: row.emotion as Memory["emotion"],
    importance: row.importance as number,
    category: row.category as string,
    evidenceType: (row.evidence_type as EvidenceType | null) ?? null,
    accessCount: row.access_count as number,
    lastAccessed: row.last_accessed ? new Date(row.last_accessed as string).toISOString() : null,
    tags: (row.tags as string[]) ?? [],
    noveltyScore: Number(row.novelty_score ?? 0),
    predictionError: Number(row.prediction_error ?? 0),
    activationCount: row.activation_count as number,
    lastActivated: row.last_activated ? new Date(row.last_activated as string).toISOString() : null,
    freshness: Number(row.freshness ?? 1.0),
    flashKeywords: (row.flash_keywords as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export function rowToMemoryLink(row: Record<string, unknown>): MemoryLink {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    targetId: row.target_id as string,
    linkType: row.link_type as LinkType,
    weight: Number(row.weight ?? 1.0),
    createdAt: new Date(row.created_at as string).toISOString(),
    note: (row.note as string | null) ?? null,
  };
}

export function rowToEpisode(row: Record<string, unknown>): Episode {
  return {
    id: row.id as string,
    title: row.title as string,
    startTime: new Date(row.start_time as string).toISOString(),
    endTime: row.end_time ? new Date(row.end_time as string).toISOString() : null,
    participants: (row.participants as string[]) ?? [],
    locationContext: (row.location_context as string | null) ?? null,
    summary: (row.summary as string) ?? "",
    emotion: row.emotion as Episode["emotion"],
    importance: row.importance as number,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
