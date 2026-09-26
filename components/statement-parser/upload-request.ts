import type { ApiError, UploadResponse } from "@/lib/statement-types";

export type UploadResult =
  | { ok: true; data: UploadResponse }
  | { ok: false; status: number; data: ApiError };

// XHR instead of fetch because fetch can't report upload progress.
// onProgress gets 0-1 while bytes are sending; after that the server is
// extracting, redacting, and calling Gemini.
export function uploadStatement(
  file: File,
  password: string | undefined,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/statements/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.response ?? { error: `Upload failed (${xhr.status}).` };
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true, data });
      else resolve({ ok: false, status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, data: { error: "Network error. Check your connection." } });
    xhr.send(form);
  });
}
