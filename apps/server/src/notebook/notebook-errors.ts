export type NotebookErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_PATH"
  | "UNSUPPORTED_FILE_TYPE"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "DIRECTORY_NOT_EMPTY"
  | "INVALID_OPERATION"
  | "IO_ERROR";

export class NotebookError extends Error {
  constructor(
    public readonly code: NotebookErrorCode,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "NotebookError";
  }
}

export function toNotebookError(error: unknown, fallbackMessage = "文件操作失败"): NotebookError {
  if (error instanceof NotebookError) return error;

  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return new NotebookError("NOT_FOUND", "文件或目录不存在", 404);
  if (code === "EEXIST") return new NotebookError("ALREADY_EXISTS", "目标文件或目录已存在", 409);
  if (code === "ENOTEMPTY") return new NotebookError("DIRECTORY_NOT_EMPTY", "目录非空，无法删除", 409);
  if (code === "EACCES" || code === "EPERM") return new NotebookError("IO_ERROR", "没有权限访问笔记目录", 403);

  return new NotebookError("IO_ERROR", fallbackMessage, 500);
}
