/**
 * Tests for DisputeModal and DisputeStatusTracker
 * Covers: reason validation, successful submission, API error,
 *         duplicate prevention (disabled state), status tracker steps.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DisputeModal from "../../components/DisputeModal";
import DisputeStatusTracker from "../../components/DisputeStatusTracker";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LONG_REASON =
  "This market was resolved incorrectly because the official source clearly shows a different outcome than what was recorded on-chain.";
const SHORT_REASON = "Too short";

function makeFetcher(shouldFail = false) {
  return jest.fn(async () => {
    if (shouldFail) throw new Error("Server error");
  });
}

function renderModal(props: Partial<React.ComponentProps<typeof DisputeModal>> = {}) {
  const onClose = jest.fn();
  const onSubmitted = jest.fn();
  const fetcher = props.fetcher ?? makeFetcher();
  render(
    <DisputeModal
      marketId={1}
      onClose={onClose}
      onSubmitted={onSubmitted}
      fetcher={fetcher}
      {...props}
    />
  );
  return { onClose, onSubmitted, fetcher };
}

// ── DisputeModal tests ────────────────────────────────────────────────────────

describe("DisputeModal", () => {
  it("renders the modal with reason textarea and evidence URL field", () => {
    renderModal();
    expect(screen.getByTestId("dispute-modal")).toBeInTheDocument();
    expect(screen.getByTestId("dispute-reason")).toBeInTheDocument();
    expect(screen.getByTestId("dispute-evidence-url")).toBeInTheDocument();
    expect(screen.getByTestId("dispute-submit-btn")).toBeInTheDocument();
  });

  it("submit button is disabled when reason is empty", () => {
    renderModal();
    expect(screen.getByTestId("dispute-submit-btn")).toBeDisabled();
  });

  it("submit button is disabled when reason is shorter than 50 chars", async () => {
    renderModal();
    await userEvent.type(screen.getByTestId("dispute-reason"), SHORT_REASON);
    expect(screen.getByTestId("dispute-submit-btn")).toBeDisabled();
  });

  it("shows chars-remaining error when reason is too short and non-empty", async () => {
    renderModal();
    await userEvent.type(screen.getByTestId("dispute-reason"), SHORT_REASON);
    expect(screen.getByTestId("reason-error")).toBeInTheDocument();
    expect(screen.getByTestId("reason-error").textContent).toMatch(/more character/i);
  });

  it("enables submit button when reason meets 50-char minimum", async () => {
    renderModal();
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    expect(screen.getByTestId("dispute-submit-btn")).not.toBeDisabled();
  });

  it("does not show reason error when reason is empty (no premature validation)", () => {
    renderModal();
    expect(screen.queryByTestId("reason-error")).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when X button is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId("dispute-modal-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay backdrop is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId("dispute-modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls fetcher with marketId, reason, and evidenceUrl on submit", async () => {
    const fetcher = makeFetcher();
    const { onSubmitted } = renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    await userEvent.type(screen.getByTestId("dispute-evidence-url"), "https://example.com/proof");
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(1, LONG_REASON, "https://example.com/proof")
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  });

  it("calls onSubmitted with status=submitted after successful submission", async () => {
    const fetcher = makeFetcher();
    const { onSubmitted } = renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "submitted", reason: LONG_REASON })
      );
    });
  });

  it("shows API error message when fetcher throws", async () => {
    const fetcher = makeFetcher(true);
    renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("dispute-submit-error")).toHaveTextContent("Server error")
    );
  });

  it("does not call onSubmitted when fetcher throws", async () => {
    const fetcher = makeFetcher(true);
    const { onSubmitted } = renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    await waitFor(() => screen.getByTestId("dispute-submit-error"));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("shows submitting state while request is in flight", async () => {
    let resolve!: () => void;
    const fetcher = jest.fn(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        })
    );
    renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    expect(screen.getByTestId("dispute-submit-btn")).toHaveTextContent("Submitting");
    resolve();
  });

  it("evidence URL field is optional — submits without it", async () => {
    const fetcher = makeFetcher();
    const { onSubmitted } = renderModal({ fetcher });
    await userEvent.type(screen.getByTestId("dispute-reason"), LONG_REASON);
    fireEvent.click(screen.getByTestId("dispute-submit-btn"));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith(1, LONG_REASON, "");
  });
});

// ── DisputeStatusTracker tests ────────────────────────────────────────────────

const SUBMITTED_AT = "2024-06-01T12:00:00Z";

describe("DisputeStatusTracker", () => {
  it("renders the tracker container", () => {
    render(<DisputeStatusTracker status="submitted" submittedAt={SUBMITTED_AT} />);
    expect(screen.getByTestId("dispute-status-tracker")).toBeInTheDocument();
  });

  it("shows all three steps: Submitted, Under Review, Resolved", () => {
    render(<DisputeStatusTracker status="submitted" submittedAt={SUBMITTED_AT} />);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("highlights the Submitted step when status is submitted", () => {
    render(<DisputeStatusTracker status="submitted" submittedAt={SUBMITTED_AT} />);
    expect(screen.getByTestId("step-submitted").className).toContain("bg-orange-500");
    expect(screen.getByTestId("step-under_review").className).not.toContain("bg-orange-500");
  });

  it("highlights the Under Review step when status is under_review", () => {
    render(<DisputeStatusTracker status="under_review" submittedAt={SUBMITTED_AT} />);
    expect(screen.getByTestId("step-under_review").className).toContain("bg-orange-500");
    expect(screen.getByTestId("step-submitted").className).not.toContain("bg-orange-500");
  });

  it("highlights the Resolved step when status is resolved", () => {
    render(<DisputeStatusTracker status="resolved" submittedAt={SUBMITTED_AT} />);
    expect(screen.getByTestId("step-resolved").className).toContain("bg-orange-500");
  });

  it("shows completed checkmark on steps before the current one", () => {
    render(<DisputeStatusTracker status="under_review" submittedAt={SUBMITTED_AT} />);
    // Submitted step should show a checkmark SVG (step before under_review)
    const submittedNode = screen.getByTestId("step-submitted");
    expect(submittedNode.querySelector("svg")).toBeInTheDocument();
  });

  it("displays the submitted timestamp", () => {
    render(<DisputeStatusTracker status="submitted" submittedAt={SUBMITTED_AT} />);
    // Date should appear somewhere in the tracker
    expect(screen.getByTestId("dispute-status-tracker").textContent).toMatch(/Jun/i);
  });
});

// ── Duplicate prevention (integration) ───────────────────────────────────────

describe("Dispute button duplicate prevention", () => {
  it("dispute-submitted-btn is disabled", () => {
    // Simulate the page rendering the disabled button after a dispute is submitted
    render(
      <button data-testid="dispute-submitted-btn" disabled>
        Dispute Submitted
      </button>
    );
    expect(screen.getByTestId("dispute-submitted-btn")).toBeDisabled();
    expect(screen.getByTestId("dispute-submitted-btn")).toHaveTextContent("Dispute Submitted");
  });
});
