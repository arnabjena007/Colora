const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export class GoogleDriveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDriveConfigError";
  }
}

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
};

const driveHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

const jsonHeaders = (token: string) => ({
  ...driveHeaders(token),
  "Content-Type": "application/json",
});

export const hasGoogleDriveToken = (token?: string | null) => Boolean(token?.trim());

const ensureToken = (token?: string | null) => {
  if (!token?.trim()) {
    throw new GoogleDriveConfigError("Sign in again to connect Google Drive.");
  }
  return token;
};

export const findDriveAppDataFile = async (token: string, name: string): Promise<DriveFile | null> => {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and 'appDataFolder' in parents and trashed=false`);
  const response = await fetch(`${DRIVE_API}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${q}`, {
    headers: driveHeaders(ensureToken(token)),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not read Google Drive files.");
  const data = await response.json() as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
};

export const saveDriveAppDataJson = async (token: string | undefined, name: string, data: unknown) => {
  const accessToken = ensureToken(token);
  const existing = await findDriveAppDataFile(accessToken, name);
  const body = JSON.stringify(data);

  if (existing) {
    const response = await fetch(`${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: "PATCH",
      headers: jsonHeaders(accessToken),
      body,
    });
    if (!response.ok) throw new Error("Could not update Google Drive save.");
    return existing.id;
  }

  const boundary = `colora-${crypto.randomUUID()}`;
  const metadata = {
    name,
    parents: ["appDataFolder"],
    mimeType: "application/json",
  };
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    body,
    `--${boundary}--`,
  ].join("\r\n");

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      ...driveHeaders(accessToken),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!response.ok) throw new Error("Could not create Google Drive save.");
  const created = await response.json() as { id: string };
  return created.id;
};

export const loadDriveAppDataJson = async <T,>(token: string | undefined, name: string): Promise<T | null> => {
  const accessToken = ensureToken(token);
  const file = await findDriveAppDataFile(accessToken, name);
  if (!file) return null;
  const response = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
    headers: driveHeaders(accessToken),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load Google Drive save.");
  return await response.json() as T;
};
