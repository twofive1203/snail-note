export type NotebookNodeType = "directory" | "file";

export interface NotebookNode {
  name: string;
  path: string;
  type: NotebookNodeType;
  updatedAt: string;
  children?: NotebookNode[];
}

export interface NotebookSummary {
  id: string;
  name: string;
  root: string;
}

export interface NotebookListResponse {
  notebooks: NotebookSummary[];
}

export interface CreateNotebookRequest {
  root: string;
  name?: string;
}

export interface NotebookTreeResponse {
  notebook: NotebookSummary;
  root: NotebookNode[];
}

export interface ServerDirectory {
  name: string;
  path: string;
}

export interface DirectoryBrowserResponse {
  path: string | null;
  parent: string | null;
  directories: ServerDirectory[];
}

export interface NoteDocument {
  path: string;
  content: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  path: string;
  content?: string;
}

export interface CreateDirectoryRequest {
  path: string;
}

export interface SaveNoteRequest {
  path: string;
  content: string;
}

export interface MoveEntryRequest {
  path: string;
  newPath: string;
}

export interface SearchMatch {
  path: string;
  title: string;
  snippet: string;
  line: number;
}

export interface SearchResponse {
  query: string;
  matches: SearchMatch[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
