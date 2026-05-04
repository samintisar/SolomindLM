import { Source } from "../types";

// Transform Convex Document type to Source UI type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function documentToSource(doc: any): Source {
  let type: Source["type"] = "PDF";

  if (doc.fileType === "paper_record") {
    const pr = doc.paperRecord;
    return {
      id: doc._id,
      title: doc.fileName || "Paper",
      type: "PAPER",
      date: new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      selected: true,
      content: "",
      status: doc.status,
      url: doc.fileUrl as string | undefined,
      paper: pr
        ? {
            doi: pr.doi,
            openAlexId: pr.openAlexId,
            fulltextStatus: doc.fulltextStatus,
            ingestionStatus: doc.ingestionStatus,
          }
        : {
            fulltextStatus: doc.fulltextStatus,
            ingestionStatus: doc.ingestionStatus,
          },
    };
  }

  if (doc.fileType === "youtube") {
    type = "WEB";
  } else if (doc.fileType === "url") {
    type = "WEB";
  } else if (doc.fileType === "text") {
    type = "TXT";
  } else if (doc.fileType === "file") {
    const ext = doc.fileName.split(".").pop()?.toLowerCase() || "";

    switch (ext) {
      case "pdf":
        type = "PDF";
        break;
      case "docx":
        type = "DOCX";
        break;
      case "doc":
        type = "DOC";
        break;
      case "pptx":
        type = "PPTX";
        break;
      case "ppt":
        type = "PPT";
        break;
      case "xlsx":
        type = "XLSX";
        break;
      case "xls":
        type = "XLS";
        break;
      case "txt":
        type = "TXT";
        break;
      case "md":
      case "markdown":
        type = "MD";
        break;
      case "json":
        type = "JSON";
        break;
      case "csv":
        type = "CSV";
        break;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "bmp":
      case "svg":
      case "avif":
        type = "IMG";
        break;
      default: {
        const ct = (doc.contentType || "").toLowerCase();
        if (ct.includes("pdf")) type = "PDF";
        else if (ct.includes("wordprocessingml") || ct.includes("msword"))
          type = ext === "doc" ? "DOC" : "DOCX";
        else if (ct.includes("presentationml") || ct.includes("ms-powerpoint"))
          type = ext === "ppt" ? "PPT" : "PPTX";
        else if (ct.includes("spreadsheetml") || ct.includes("ms-excel"))
          type = ext === "xls" ? "XLS" : "XLSX";
        else if (ct.includes("text/plain") || ct.includes("text/markdown")) type = "TXT";
        else if (ct.includes("image/")) type = "IMG";
        else type = "DOC";
      }
    }
  }

  const displayTitle =
    doc.fileType === "file" && doc.fileName && doc.fileName.includes(".")
      ? doc.fileName.replace(/\.[^/.]+$/, "")
      : doc.fileName;

  const url =
    doc.fileType === "url" || doc.fileType === "youtube"
      ? (doc.fileUrl as string | undefined)
      : undefined;

  let remoteRefreshKind: "url" | "drive" | undefined;
  if (doc.fileType === "url") {
    remoteRefreshKind = "url";
  } else if (doc.fileType === "file" && doc.googleDriveFileId) {
    remoteRefreshKind = "drive";
  }

  return {
    id: doc._id,
    title: displayTitle,
    type,
    date: new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    selected: true,
    content: "",
    status: doc.status,
    url,
    remoteRefreshKind,
  };
}
