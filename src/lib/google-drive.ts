const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_PROJECT_FOLDER_NAME = "colora-projects";

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

const escapeDriveQueryValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const hasGoogleDriveToken = (token?: string | null) => Boolean(token?.trim());

const ensureToken = (token?: string | null) => {
  if (!token?.trim()) {
    throw new GoogleDriveConfigError("Sign in again to connect Google Drive.");
  }
  return token;
};

const findDriveFile = async (token: string, query: string): Promise<DriveFile | null> => {
  const response = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&pageSize=1`, {
    headers: driveHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not read Google Drive files.");
  const data = await response.json() as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
};

const createDriveFolder = async (token: string, name: string, parentId?: string) => {
  const response = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!response.ok) throw new Error("Could not create Google Drive folder.");
  return await response.json() as DriveFile;
};

export const getDriveProjectFolder = async (token: string | undefined) => {
  const accessToken = ensureToken(token);
  const folder = await findDriveFile(
    accessToken,
    `name='${escapeDriveQueryValue(DRIVE_PROJECT_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  return folder ?? createDriveFolder(accessToken, DRIVE_PROJECT_FOLDER_NAME);
};

const getDriveChildFolder = async (token: string, parentId: string, name: string) => {
  const folder = await findDriveFile(
    token,
    `name='${escapeDriveQueryValue(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  );
  return folder ?? createDriveFolder(token, name, parentId);
};

const dateFolderName = () => new Date().toISOString().slice(0, 10);

export const findDriveProjectFile = async (token: string, name: string, parentId?: string): Promise<DriveFile | null> => {
  const accessToken = ensureToken(token);
  const folder = parentId ? { id: parentId } : await getDriveProjectFolder(accessToken);
  return findDriveFile(
    accessToken,
    `name='${escapeDriveQueryValue(name)}' and '${folder.id}' in parents and trashed=false`
  );
};

export const deleteDriveProjectFile = async (token: string | undefined, name: string) => {
  const accessToken = ensureToken(token);
  const existing = await findDriveProjectFile(accessToken, name);
  if (!existing) return false;
  const response = await fetch(`${DRIVE_API}/files/${existing.id}`, {
    method: "DELETE",
    headers: driveHeaders(accessToken),
  });
  return response.ok;
};

export const saveDriveProjectFile = async (
  token: string | undefined,
  name: string,
  blob: Blob,
  mimeType: string
) => {
  const accessToken = ensureToken(token);
  const projectFolder = await getDriveProjectFolder(accessToken);
  const folder = await getDriveChildFolder(accessToken, projectFolder.id, dateFolderName());
  const existing = await findDriveProjectFile(accessToken, name, folder.id);

  if (existing) {
    const response = await fetch(`${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        ...driveHeaders(accessToken),
        "Content-Type": mimeType,
      },
      body: blob,
    });
    if (!response.ok) throw new Error("Could not update Google Drive file.");
    return existing.id;
  }

  const boundary = `colora-${crypto.randomUUID()}`;
  const metadata = {
    name,
    parents: [folder.id],
    mimeType,
  };
  const multipartBody = new Blob([
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      ...driveHeaders(accessToken),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!response.ok) throw new Error("Could not create Google Drive file.");
  const created = await response.json() as { id: string };
  return created.id;
};
