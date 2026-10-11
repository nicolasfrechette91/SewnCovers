import {
  accountApi,
  resolveAssetUrl,
  type CallOptions,
  type CustomUpload,
} from "./account-api";

/**
 * An uploaded pattern and, when `wantsPreview(upload)` says so, a fresh
 * short-lived URL for its tile. Each caller decides what a deleted or
 * unapproved upload means for it; a failed request rejects.
 */
export async function fetchCustomAsset(
  token: string,
  assetId: string,
  wantsPreview: (upload: CustomUpload) => boolean,
  { signal }: CallOptions = {},
): Promise<{
  readonly upload: CustomUpload;
  readonly previewUrl: string | null;
}> {
  const upload = await accountApi.getUpload(token, assetId, { signal });
  if (!wantsPreview(upload)) return { upload, previewUrl: null };
  const access = await accountApi.assetAccess(token, upload.id, "tile", {
    signal,
  });
  return { upload, previewUrl: resolveAssetUrl(access.url) };
}
