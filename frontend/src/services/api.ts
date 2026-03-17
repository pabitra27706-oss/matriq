import axios from "axios";
import type {
  QueryResponse,
  SchemaInfo,
  Suggestion,
  TablesResponse,
  UploadPreview,
} from "@/types";

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 300000,
});

export async function sendQuery(
  query: string,
  conversationHistory: {
    query: string;
    sql: string;
    insight: string;
    chart_config?: unknown;
  }[] = [],
  activeTable?: string
): Promise<QueryResponse> {
  const { data } = await API.post<QueryResponse>("/api/query", {
    query,
    conversation_history: conversationHistory,
    active_table: activeTable || undefined,
  });
  return data;
}

export async function fetchSchema(): Promise<SchemaInfo> {
  const { data } = await API.get("/api/schema");
  return data;
}

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const { data } = await API.get("/api/suggestions");
  return data.suggestions;
}

export async function fetchTables(): Promise<TablesResponse> {
  const { data } = await API.get<TablesResponse>("/api/tables");
  return data;
}

export async function setActiveTable(
  tableName: string
): Promise<{ success: boolean; active_table: string }> {
  const { data } = await API.post("/api/active-table", {
    table_name: tableName,
  });
  return data;
}

export async function deleteTable(
  tableName: string
): Promise<TablesResponse> {
  const { data } = await API.delete<TablesResponse>(
    `/api/tables/${tableName}`
  );
  return data;
}

export async function uploadCSV(
  file: File,
  tableName: string = "custom_data",
  onProgress?: (pct: number) => void
): Promise<{
  success: boolean;
  table_name: string;
  schema_info?: SchemaInfo;
  error?: string;
  suggested_questions?: string[];
}> {
  const form = new FormData();
  form.append("file", file);
  form.append("table_name", tableName);
  const { data } = await API.post("/api/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function uploadPreview(file: File): Promise<UploadPreview> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await API.post<UploadPreview>(
    "/api/upload/preview",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}