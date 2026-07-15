import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// multilingual-e5-base（768次元）— 設計判断6。Xenova/multilingual-e5-base は
// intfloat/multilingual-e5-base の ONNX 変換版。Bun上で実測: コールド約43ms、ウォーム約14ms
const MODEL_ID = "Xenova/multilingual-e5-base";
export const EMBEDDING_MODEL = MODEL_ID;
export const EMBEDDING_DIMENSIONS = 768;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID);
  }
  return extractorPromise;
}

// multilingual-e5 系は用途で "query: " / "passage: " プレフィックスを使い分ける仕様
export async function embedPassage(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(`passage: ${text}`, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(`query: ${text}`, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
