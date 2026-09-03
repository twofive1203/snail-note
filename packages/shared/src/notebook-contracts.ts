export type NotebookNodeType = "directory" | "file";

export interface NotebookNode {
  name: string;
  path: string;
  type: NotebookNodeType;
  updatedAt: string;
  children?: NotebookNode[];
}

export interface NotebookTreeResponse {
  name: string;
  root: NotebookNode[];
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
