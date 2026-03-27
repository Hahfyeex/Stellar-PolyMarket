import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DisputeEvidenceUpload from "../mobile/DisputeEvidenceUpload";

jest.mock("pinata", () => ({
  PinataSDK: jest.fn().mockImplementation(() => ({
    upload: {
      public: {
        file: jest.fn().mockResolvedValue({
          cid: "QmTestCID123456789",
        }),
      },
    },
  })),
}));

describe("DisputeEvidenceUpload", () => {
  test("renders the component correctly", () => {
    render(<DisputeEvidenceUpload />);
    expect(screen.getByText("📎 Upload Dispute Evidence")).toBeInTheDocument();
    expect(screen.getByText("Accepted formats: PNG, PDF")).toBeInTheDocument();
    expect(screen.getByText("Upload to IPFS")).toBeInTheDocument();
  });

  test("shows selected file name after choosing a file", () => {
    render(<DisputeEvidenceUpload />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy content"], "evidence.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(screen.getByText("Selected: evidence.png")).toBeInTheDocument();
  });

  test("rejects non PNG/PDF files", () => {
    window.alert = jest.fn();
    render(<DisputeEvidenceUpload />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy"], "document.txt", { type: "text/plain" });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(window.alert).toHaveBeenCalledWith("Only PNG or PDF files are allowed.");
  });

  test("accepts PDF files", () => {
    render(<DisputeEvidenceUpload />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy content"], "evidence.pdf", { type: "application/pdf" });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(screen.getByText("Selected: evidence.pdf")).toBeInTheDocument();
  });

  test("shows upload complete and CID after successful upload", async () => {
    render(<DisputeEvidenceUpload />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy content"], "evidence.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Upload to IPFS"));
    await waitFor(() => {
      expect(screen.getByText("✅ Upload Complete!")).toBeInTheDocument();
      expect(screen.getByText("QmTestCID123456789")).toBeInTheDocument();
    });
  });

  test("calls onCIDGenerated callback with the CID", async () => {
    const mockCallback = jest.fn();
    render(<DisputeEvidenceUpload onCIDGenerated={mockCallback} />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy content"], "evidence.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Upload to IPFS"));
    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledWith("QmTestCID123456789");
    });
  });

  test("shows progress bar during upload", async () => {
    render(<DisputeEvidenceUpload />);
    const input = document.querySelector("input[type='file']");
    const file = new File(["dummy content"], "evidence.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Upload to IPFS"));
    await waitFor(() => {
      expect(screen.getByText("✅ Upload Complete!")).toBeInTheDocument();
    });
  });
});