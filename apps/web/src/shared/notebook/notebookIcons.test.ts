import { Book, Folder, Globe } from "lucide-react";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_NOTEBOOK_ICON,
  FOLDER_ICON_NAMES,
  folderIcon,
  folderIconName,
  NOTEBOOK_ICON_NAMES,
  notebookIcon,
  notebookIconName,
} from "./notebookIcons";

describe("notebook icons (#226)", () => {
  test("the notebook picker never offers the folder icon", () => {
    expect(NOTEBOOK_ICON_NAMES).not.toContain("Folder");
    expect(FOLDER_ICON_NAMES).toContain("Folder");
  });

  test("notebooks default to Book", () => {
    expect(DEFAULT_NOTEBOOK_ICON).toBe("Book");
  });

  test.each([undefined, null, "", "Folder", "NotAnIcon"])(
    "notebook icon %s renders as Book",
    (icon) => {
      expect(notebookIconName(icon)).toBe("Book");
      expect(notebookIcon(icon)).toBe(Book);
    }
  );

  test("a chosen notebook icon is kept", () => {
    expect(notebookIconName("Globe")).toBe("Globe");
    expect(notebookIcon("Globe")).toBe(Globe);
  });

  test("folders keep the folder icon as their default", () => {
    expect(folderIconName(undefined)).toBe("Folder");
    expect(folderIconName("NotAnIcon")).toBe("Folder");
    expect(folderIcon("Folder")).toBe(Folder);
    expect(folderIconName("Globe")).toBe("Globe");
  });
});
