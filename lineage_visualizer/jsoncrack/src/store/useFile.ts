import debounce from "lodash.debounce";
import { event as gaEvent } from "nextjs-google-analytics";
import { toast } from "react-hot-toast";
import { create } from "zustand";
import exampleJson from "../data/example.json";
import { FileFormat } from "../enums/file.enum";
import useGraph from "../features/editor/views/GraphView/stores/useGraph";
import { isIframe } from "../lib/utils/helpers";
import { contentToJson, jsonToContent } from "../lib/utils/jsonAdapter";
import useConfig from "./useConfig";
import useJson from "./useJson";

const defaultJson = JSON.stringify(exampleJson, null, 2);

type SetContents = {
  contents?: string;
  hasChanges?: boolean;
  skipUpdate?: boolean;
  format?: FileFormat;
};

type Query = string | string[] | undefined;

interface JsonActions {
  getContents: () => string;
  getFormat: () => FileFormat;
  getHasChanges: () => boolean;
  setError: (error: string | null) => void;
  setHasChanges: (hasChanges: boolean) => void;
  setContents: (data: SetContents) => void;
  fetchUrl: (url: string) => void;
  setFormat: (format: FileFormat) => void;
  clear: () => void;
  setFile: (fileData: File) => void;
  setJsonSchema: (jsonSchema: object | null) => void;
  checkEditorSession: (url: Query, widget?: boolean) => void;
}

export type File = {
  id: string;
  views: number;
  owner_email: string;
  name: string;
  content: string;
  private: boolean;
  format: FileFormat;
  created_at: string;
  updated_at: string;
};

const initialStates = {
  fileData: null as File | null,
  format: FileFormat.JSON,
  contents: defaultJson,
  error: null as any,
  hasChanges: false,
  jsonSchema: null as object | null,
};

export type FileStates = typeof initialStates;

const isURL = (value: string) => {
  return /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi.test(
    value
  );
};

const debouncedUpdateJson = debounce((value: unknown) => {
  useGraph.getState().setLoading(true);
  useJson.getState().setJson(JSON.stringify(value, null, 2));
}, 400);

const useFile = create<FileStates & JsonActions>()((set, get) => ({
  ...initialStates,
  clear: () => {
    set({ contents: "" });
    useJson.getState().clear();
  },
  setJsonSchema: jsonSchema => set({ jsonSchema }),
  setFile: fileData => {
    set({ fileData, format: fileData.format || FileFormat.JSON });
    get().setContents({ contents: fileData.content, hasChanges: false });
    gaEvent("set_content", { label: fileData.format });
  },
  getContents: () => get().contents,
  getFormat: () => get().format,
  getHasChanges: () => get().hasChanges,
  setFormat: async format => {
    try {
      const prevFormat = get().format;

      set({ format });
      const contentJson = await contentToJson(get().contents, prevFormat);
      const jsonContent = await jsonToContent(JSON.stringify(contentJson, null, 2), format);

      get().setContents({ contents: jsonContent });
    } catch (error) {
      get().clear();
      console.warn("The content was unable to be converted, so it was cleared instead.");
    }
  },
  setContents: async ({ contents, hasChanges = true, skipUpdate = false, format }) => {
    try {
      set({
        ...(contents && { contents }),
        error: null,
        hasChanges,
        format: format ?? get().format,
      });

      const isFetchURL = window.location.href.includes("?");
      const json = await contentToJson(get().contents, get().format);

      if (!useConfig.getState().liveTransformEnabled && skipUpdate) return;

      if (get().hasChanges && contents && contents.length < 80_000 && !isIframe() && !isFetchURL) {
        sessionStorage.setItem("content", contents);
        sessionStorage.setItem("format", get().format);
        set({ hasChanges: true });
      }

      debouncedUpdateJson(json);
    } catch (error: any) {
      if (error?.mark?.snippet) return set({ error: error.mark.snippet });
      if (error?.message) set({ error: error.message });
      useJson.setState({ loading: false });
      useGraph.setState({ loading: false });
    }
  },
  setError: error => set({ error }),
  setHasChanges: hasChanges => set({ hasChanges }),
  fetchUrl: async url => {
    try {
      const res = await fetch(url);
      const json = await res.json();
      const jsonStr = JSON.stringify(json, null, 2);

      get().setContents({ contents: jsonStr });
      return useJson.setState({ json: jsonStr, loading: false });
    } catch (error) {
      get().clear();
      toast.error("Failed to fetch document from URL!");
    }
  },
  checkEditorSession: (url, widget) => {
    if (url && typeof url === "string") {
      // Check if it's a URL first
      if (isURL(url)) {
        return get().fetchUrl(url);
      }
      
      // Check if it's JSON data (starts with { or [)
      try {
        const decodedUrl = decodeURIComponent(url);
        if ((decodedUrl.trim().startsWith('{') && decodedUrl.trim().endsWith('}')) ||
            (decodedUrl.trim().startsWith('[') && decodedUrl.trim().endsWith(']'))) {
          // Validate that it's valid JSON
          JSON.parse(decodedUrl);
          // If we get here, it's valid JSON
          get().setContents({ contents: decodedUrl, hasChanges: false });
          return;
        }
      } catch (error) {
        // Not valid JSON, continue to default behavior
        console.warn("URL parameter is not a valid URL or JSON:", url);
      }
    }

    let contents = defaultJson;
    const sessionContent = sessionStorage.getItem("content") as string | null;
    const format = sessionStorage.getItem("format") as FileFormat | null;
    if (sessionContent && !widget) contents = sessionContent;

    if (format) set({ format });
    get().setContents({ contents, hasChanges: false });
  },
}));

export default useFile;