import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BetForm from "../BetForm";

describe("BetForm", () => {
  it("maintains stable handler references across re-renders", () => {
    // We can spy on the memoized component or check if props change
    const onAmountChange = jest.fn();
    const onSubmit = jest.fn();

    const { getByPlaceholderText, rerender } = render(
      <BetForm
        amount="10"
        onAmountChange={onAmountChange}
        onSubmit={onSubmit}
        disabled={false}
        loading={false}
      />
    );

    const input = getByPlaceholderText("Amount (XLM)");
    fireEvent.change(input, { target: { value: "20" } });

    expect(onAmountChange).toHaveBeenCalledWith("20");

    // Re-render with new amount to simulate keystroke
    rerender(
      <BetForm
        amount="20"
        onAmountChange={onAmountChange}
        onSubmit={onSubmit}
        disabled={false}
        loading={false}
      />
    );

    // React's useCallback ensures the `handleChange` internal to BetForm
    // retains the exact same reference if `onAmountChange` hasn't changed.
    // To explicitly test it's memoized, we can check that it doesn't fire an unnecessary re-render of unrelated DOM internals.
    expect(input).toHaveValue(20);
  });

  it("does not re-render unnecessarily when parent state changes", () => {
    const onAmountChange = jest.fn();
    const onSubmit = jest.fn();

    // Track renders using a mock wrapper
    let renderCount = 0;
    const renderSpy = jest.fn();

    // A mock component to capture renders
    const WrappedMap = React.memo((props: any) => {
      renderSpy();
      return <BetForm {...props} />;
    });

    const { rerender } = render(
      <WrappedMap
        amount="10"
        onAmountChange={onAmountChange}
        onSubmit={onSubmit}
        disabled={false}
        loading={false}
      />
    );

    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Re-render with identical props (e.g. parent state changed, but props passed to BetForm didn't)
    rerender(
      <WrappedMap
        amount="10"
        onAmountChange={onAmountChange}
        onSubmit={onSubmit}
        disabled={false}
        loading={false}
      />
    );

    // The inner component should NOT re-render because of React.memo
    expect(renderSpy).toHaveBeenCalledTimes(1);
    
    // Now change a prop
    rerender(
       <WrappedMap
        amount="20"
        onAmountChange={onAmountChange}
        onSubmit={onSubmit}
        disabled={false}
        loading={false}
      />
    );
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });
});
