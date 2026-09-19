import { readToken, type CreatureRow } from "@/lib/api";

export function creatureImageUrl(row: Pick<CreatureRow, "child_id" | "spec_id">) {
  const token = readToken() ?? "";
  return `/v1/crm/creatures/${encodeURIComponent(row.child_id)}/${encodeURIComponent(row.spec_id)}/image?access_token=${encodeURIComponent(token)}`;
}

export function creatureModelUrl(row: Pick<CreatureRow, "child_id" | "spec_id">) {
  const token = readToken() ?? "";
  return `/v1/crm/creatures/${encodeURIComponent(row.child_id)}/${encodeURIComponent(row.spec_id)}/model?access_token=${encodeURIComponent(token)}`;
}

export function creaturePostcardUrl(row: Pick<CreatureRow, "child_id" | "spec_id">) {
  const token = readToken() ?? "";
  return `/v1/crm/creatures/${encodeURIComponent(row.child_id)}/${encodeURIComponent(row.spec_id)}/postcard?access_token=${encodeURIComponent(token)}`;
}

export function creaturePostcardSrc(
  row: Pick<CreatureRow, "child_id" | "spec_id" | "postcard_url">,
) {
  const hosted = (row.postcard_url ?? "").trim();
  if (hosted.startsWith("https://") && hosted.includes("/postcards/")) return hosted;
  if (hosted.startsWith("/v1/generation/stylize/") && hosted.endsWith("/postcard.png")) {
    return hosted;
  }
  return creaturePostcardUrl(row);
}

export function creatureKey(row: Pick<CreatureRow, "child_id" | "spec_id">) {
  return `${row.child_id}:${row.spec_id}`;
}
