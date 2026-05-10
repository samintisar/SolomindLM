import { test, expect } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { openAddSourceModal } from "../helpers/navigation";
import { waitForSourceStatus, deleteSource, getSourceCard } from "../helpers/source-assertions";
import path from "path";
import fs from "fs";
import os from "os";

/**
 * Helper to create a temporary test file for upload testing.
 * Cleans up after test via testInfo.attachments or manual cleanup.
 */
function createTempFile(filename: string, content: string): string {
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Helper to cleanup temp files.
 */
function cleanupTempFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup errors
  }
}

test.describe("File Uploads", () => {
  // Cleanup any temp files after each test
  const tempFiles: string[] = [];

  test.afterEach(() => {
    for (const file of tempFiles) {
      cleanupTempFile(file);
    }
    tempFiles.length = 0;
  });

  test("upload a single text file", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-test-${Date.now()}.txt`;
    const fileContent = `E2E Test Content ${Date.now()}: This is a test file for SolomindLM file upload functionality.`;
    const filePath = createTempFile(fileName, fileContent);
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    // Set files on the hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    // Wait for source to appear in the list
    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });

    // Wait for processing to complete
    await waitForSourceStatus(page, fileName, "completed", 60_000);
  });

  test("upload multiple files simultaneously", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName1 = `e2e-multi-a-${Date.now()}.txt`;
    const fileName2 = `e2e-multi-b-${Date.now()}.txt`;
    const filePath1 = createTempFile(fileName1, "First test file content");
    const filePath2 = createTempFile(fileName2, "Second test file content");
    tempFiles.push(filePath1, filePath2);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    // Upload both files at once
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([filePath1, filePath2]);

    // Wait for both sources to appear
    await expect(getSourceCard(page, fileName1)).toBeVisible({ timeout: 10_000 });
    await expect(getSourceCard(page, fileName2)).toBeVisible({ timeout: 10_000 });

    // Wait for both to complete
    await waitForSourceStatus(page, fileName1, "completed", 60_000);
    await waitForSourceStatus(page, fileName2, "completed", 60_000);
  });

  test("drag and drop file upload", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-dragdrop-${Date.now()}.txt`;
    const fileContent = `Drag and drop test file ${Date.now()}`;
    const filePath = createTempFile(fileName, fileContent);
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    // Find the drop zone (the upload area with dashed border)
    const dropZone = page.locator("div[class*='border-dashed']").first();
    await expect(dropZone).toBeVisible();

    // Create a DataTransfer object and dispatch drop event
    const buffer = fs.readFileSync(filePath);
    const dataTransfer = {
      files: [
        {
          name: fileName,
          type: "text/plain",
          data: buffer.toString("base64"),
        },
      ],
    };

    await dropZone.evaluate((el, dt) => {
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt as unknown as DataTransfer,
      });
      // Create a mock DataTransfer with files
      const mockDataTransfer = {
        files: dt.files,
        types: ["Files"],
        getData: () => "",
        setData: () => {},
        clearData: () => {},
      };
      Object.defineProperty(event, "dataTransfer", {
        value: mockDataTransfer,
      });
      el.dispatchEvent(event);
    }, dataTransfer);

    // Wait for source to appear and complete
    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });
    await waitForSourceStatus(page, fileName, "completed", 60_000);
  });

  test("upload a PDF file", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-pdf-${Date.now()}.pdf`;
    // Minimal valid PDF content (PDF header)
    const pdfContent = "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n196\n%%EOF";
    const filePath = createTempFile(fileName, pdfContent);
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });
    await waitForSourceStatus(page, fileName, "completed", 60_000);
  });

  test("unsupported file type is rejected", async ({ notebookPage }) => {
    const page = notebookPage;
    const fileName = `e2e-unsupported-${Date.now()}.exe`;
    const filePath = createTempFile(fileName, "This is not a supported file type");
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    // Set the file on the input - the input's accept attribute may filter it,
    // but we test the drag-and-drop path which should show an info message
    const dropZone = page.locator("div[class*='border-dashed']").first();
    await expect(dropZone).toBeVisible();

    // Try to drop an unsupported file
    const buffer = fs.readFileSync(filePath);
    const dataTransfer = {
      files: [
        {
          name: fileName,
          type: "application/x-msdownload",
          data: buffer.toString("base64"),
        },
      ],
    };

    await dropZone.evaluate((el, dt) => {
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt as unknown as DataTransfer,
      });
      const mockDataTransfer = {
        files: dt.files,
        types: ["Files"],
        getData: () => "",
        setData: () => {},
        clearData: () => {},
      };
      Object.defineProperty(event, "dataTransfer", {
        value: mockDataTransfer,
      });
      el.dispatchEvent(event);
    }, dataTransfer);

    // Should show info about unsupported file types, or simply not create a source
    // The source card should not appear for .exe files
    await expect(getSourceCard(page, fileName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("delete uploaded file source", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-delete-${Date.now()}.txt`;
    const filePath = createTempFile(fileName, "File to be deleted");
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });
    await waitForSourceStatus(page, fileName, "completed", 60_000);

    // Delete the source
    await deleteSource(page, fileName);

    // Verify it's gone
    await expect(getSourceCard(page, fileName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("upload large text file", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-large-${Date.now()}.txt`;
    // Generate a ~50KB text file
    const largeContent = Array.from({ length: 1000 }, (_, i) => 
      `Line ${i}: ${"A".repeat(50)}`
    ).join("\n");
    const filePath = createTempFile(fileName, largeContent);
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });
    await waitForSourceStatus(page, fileName, "completed", 120_000);
  });

  test("upload markdown file", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + file processing");
    const page = notebookPage;
    const fileName = `e2e-markdown-${Date.now()}.md`;
    const mdContent = `# Test Document\n\nThis is a **markdown** test file.\n\n## Section 2\n\n- Item 1\n- Item 2\n- Item 3\n\n> Blockquote here\n`;
    const filePath = createTempFile(fileName, mdContent);
    tempFiles.push(filePath);

    await openAddSourceModal(page);
    await expect(page.getByText("Add sources")).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    await expect(getSourceCard(page, fileName)).toBeVisible({ timeout: 10_000 });
    await waitForSourceStatus(page, fileName, "completed", 60_000);
  });
});